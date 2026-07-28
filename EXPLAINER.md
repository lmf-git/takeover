# EXPLAINER — how Takeover works

This document explains the machinery in this repository: what each piece does, how the
pieces fit together, and *why* several non-obvious decisions were made. `README.md` is the
user-facing manual ("how do I use it"); this file is the internals guide ("what actually
happens when a request arrives").

Everything here was derived from the source in this repo as it currently stands.

---

## 0. Two things live in this repo

1. **The framework** — `core/` plus `lib/`. Zero dependencies, no `node_modules`, no build
   tool. It implements SSR, a bundler, a minifier, a WebSocket server, HMR, a file watcher,
   a router, a reactive store, a template engine, and i18n, all on Node built-ins and native
   browser APIs.
2. **A site built with it** — `app/`, `components/`, `locales/`, `globals.css`,
   `app.config.yml`. That site happens to be the framework's own marketing page (hero,
   quick-start, live demos, performance, feature grid, an interactive file-tree, CTA).

`core/` deliberately contains no project-specific values. Anything a given site tunes lives
outside it. That separation is the reason `app.config.yml` and `core/config.js` exist.

---

## 1. The 60-second mental model

A page is a **custom element**. Its markup lives in a `.html` file, its behaviour in a
class extending `Component`. The server renders that element's shadow DOM to a string
using **Declarative Shadow DOM** (`<template shadowrootmode="open">`), so the browser
attaches real shadow roots *before any JavaScript runs*. Hydration is therefore not a
re-render — it is just "import the class so `customElements.define()` upgrades the element,
then bind events."

State is a `Proxy`-wrapped `EventTarget`. Components declare which keys they care about;
changes to those keys re-render the component by reassigning `shadowRoot.innerHTML`. There
is no virtual DOM and no diffing — focus and selection are preserved manually across the
re-render instead.

Routing is derived from the `app/` directory at scan time. In production the route table,
the asset hash map, and the whole framework bundle are **inlined into the HTML**, so first
paint costs exactly one network round-trip.

---

## 2. Repository map

```
core/                    the framework (drop-in, project-agnostic)
  component.js           Component base class: lifecycle, rendering, CSS, helpers
  template.js            {{ }} engine: expressions, #if, #each, prop bindings
  context.js             Store class (EventTarget + Proxy)
  routes.js              path↔file mapping, dynamic-segment matcher, 404 fallback
  scan.js                filesystem walker → route table + tag registry
  tags.js                tag → source-directory resolution (shared by all hosts)
  locale.js              locale negotiation (shared by all SSR hosts)
  config.js              app.config.yml loader + zero-dep YAML parser
  loader.js              MutationObserver/IntersectionObserver component auto-loader
  server/
    index.js             dev + prod HTTP server, SSR host, HMR broadcaster
    ssr.js               platform-agnostic render core (used by every adapter)
    entry-server.js      Node SSR entry: builds routes, negotiates locale
    entry-client.js      browser entry: eager imports, scroll restore, locale init
    build.js             production build pipeline
    bundle.js            zero-dep ESM bundler
    minify.js            zero-dep JS tokenizer-minifier + CSS minifier
    ws.js                RFC 6455 WebSocket server (framing done by hand)
    static.js            zero-dep static server with SPA catch-all (CSR preview)

components/Footer/       the CSS Module example (Footer.module.css, no <style> block)

lib/                     app-level utilities (importable, not framework-internal)
  store.js               the singleton Store instance + SSR seeding
  i18n.js                locale negotiation, message loading, t()
  nav.js                 navigate/replace/query helpers + shadow-piercing hash scroll
  meta.js                <head> manipulation, OG/Twitter, JSON-LD
  validate.js            schema validation
  async.js               debounce/throttle/retry/memoize…
  index.js               barrel re-export

app/                     file-system-routed pages
  _Layout/               <app-layout> — the root shell (underscore = not a route)
  Home/                  → /
  NotFound/              → /notfound and the "*" fallback

components/              shared custom elements
  Router/                <app-router> — client-side navigation + outlet
  Navigation/ Logo/ Footer/ HeroCounter/ TriangleSeam/
  Home{QuickStart,Demos,Performance,Features,Structure,Architecture,CTA}/

locales/ en.json es.json fr.json
deploy/  cloudflare/_worker.js, netlify/functions/ssr.mjs
index.html               the shell template with SSR placeholder comments
globals.css              design tokens (oklch), @font-face, reset
app.config.yml           locales + critical-path preloads
```

---

## 3. What runs where

| Concern | Server (Node / Worker) | Browser |
|---|---|---|
| Route table | built by scanning `app/` | inlined as `window.__ROUTES__` |
| Tag → directory registry | built by scanning for `define()` calls | inlined as `window.__TAGS__` |
| Templates | read from disk, rendered to strings | fetched (dev) or inlined by build (prod) |
| Stylesheets | read from disk, scoped, embedded in the DSD | fetched (dev) or inlined by build (prod) |
| Components | **never instantiated** — only their `.html` is rendered | instantiated as custom elements |
| Static config (`metadata`, `ssrProps`, `requiresAuth`) | extracted from source text by regex + `eval` | read off the class |
| Locale negotiation | `core/locale.js`, per request | `lib/i18n.js`, from the inlined globals |
| Store | one module-level instance per process, reset per render | one instance, seeded from `__INITIAL_STATE__` |

The third row is the load-bearing trick: **SSR never imports page/component modules.**
`core/server/entry-server.js:57` (`buildRoutes`) reads each page's `.html`, pulls out the
`<script>` block (or the sibling `.js`), and extracts `static local`, `static ssrProps`,
`static metadata` and `static requiresAuth` with a brace-balancing scanner + `eval`. That
avoids ever executing browser code (`HTMLElement`, `customElements`, `window`) on the
server, which is why `Component` can safely `extends (isBrowser ? HTMLElement : class {})`
(`core/component.js:63`).

The trade-off: those statics must be **literal object expressions** in the source. A
computed `static metadata = buildMeta()` will not be seen by SSR.

---

## 4. Request lifecycle — dev server (`yarn dev`)

`core/server/index.js` is a plain `node:http` server. For `GET /`:

1. **Static-file shortcut.** Any URL with an extension is tried against the repo root, then
   `public/`. Misses fall through (`handler`, `index.js:193`).
   - `?script` → extract the inline `<script>` from a `.html` and serve it as JS. This is
     how a page module is loaded in dev: `route.module` is `/app/Home/Home.html?script`.
   - `?raw` → serve any file as `export default "<file contents>"`.
   - A missing `.js` falls back to the sibling `.html`'s inline script.
   - A missing `.css` / `.module.css` returns an **empty 200**, not a 404. Components
     auto-probe for adjacent stylesheets, and this keeps the dev console clean.
2. **Locale negotiation** — delegated to `negotiateLocale` in `core/locale.js`, the same
   function the Netlify function and the Cloudflare worker call. The `locale` cookie (an
   explicit user choice, and what the previous response rendered) wins; otherwise
   `Accept-Language` is ranked by q-value; unsupported codes fall back to
   `config.locales.default`. Only codes in `app.config.yml`'s supported list are accepted.
3. **Render** (`renderSSR`, `index.js:104`): imports `entry-server.js` with a `?t=` cache
   bust (so edits to SSR code take effect without restarting), calls `render(url, {locale})`.
4. **Assemble the HTML** by substituting into `index.html`'s placeholder comments:

   | Placeholder | Filled with |
   |---|---|
   | `<!--inline-css-->` | all of `globals.css`, inline |
   | `<!--preload-links-->` | font preloads + modulepreloads + `window.__TAGS__` + `window.__ROUTES__` |
   | `<!--head-meta-->` | `<title>` / `<meta description>` from the route + a modulepreload for the page module |
   | `<!--app-html-->` | the rendered `<template shadowrootmode="open">…` for `<app-layout>` |
   | `<!--initial-state-->` | `window.__INITIAL_STATE__`, `window.__LOCALES__`, `window.__LOCALE_CONFIG__` |

   `<html lang>` is rewritten to the negotiated locale.
5. **HMR client** is appended before `</body>` (dev only).

> Every `.replace()` for these placeholders uses a **function replacement**. A string
> replacement would let `$&`, `` $` ``, `$'` and `$1` inside the bundle or the rendered HTML
> corrupt the output. This appears in `index.js`, `build.js`, `_worker.js` and `ssr.mjs`,
> and it is deliberate everywhere.

### The render core (`core/server/ssr.js`)

`createRenderer({ loadFile, resolvePaths })` is the platform-agnostic heart. Node passes
`fs.readFile` + absolute paths; the Cloudflare Worker passes `env.ASSETS.fetch` + URLs.
The returned `render(url, routes, state)`:

1. `matchRoute` the pathname (exact → dynamic → `*` fallback). The `*` entry is a clone of
   the NotFound page appended by `withNotFound` (`core/routes.js`) — every route-table
   consumer calls it, so the Node entry, the client Router and the edge adapters all fall
   back identically instead of each host inventing its own 404.
2. Enforce `requiresAuth` by returning `{ redirect: '/login?from=…' }`.
3. Build `props`: `state` + `ssrProps` + `{ path, params, query, timestamp, year, t }`.
   `t` is `state.messages` — that's how `{{t.nav.docs}}` resolves server-side.
4. Load and render `app-layout`'s template.
5. Render the page component, then **recursively expand nested custom elements**
   (`renderComponents`, up to 50 passes): every `<some-tag …></some-tag>` in the output is
   replaced by its own rendered DSD block, so a component tree several levels deep is
   emitted fully-formed. `<app-router>` is skipped — it gets the page injected instead.
6. Splice the page into the layout: `<app-router><div id="outlet">…page…</div></app-router>`.
7. Wrap everything in `<template shadowrootmode="open">` and return `appHtml`, plus
   `initialStateScript` and `headMeta`.

CSS handling mirrors the client exactly: `Foo.module.css` gets every `.class` rewritten to
`.class_<tag>` (`processCSS`, `ssr.js:12`) and the resulting map is exposed to the template
as `$css`; a plain `Foo.css` is concatenated unscoped. `<style>` blocks inside the template
are hoisted into the shadow root's `<style>`. See §6a for the full CSS story.

---

## 5. Client boot and hydration

`core/server/entry-client.js` runs (as a module in dev, inlined in prod):

1. **Eager imports** of everything above the fold: `_Layout`, `Router`, `Navigation`,
   `Logo`, `HeroCounter`, `TriangleSeam`, plus `core/loader.js`. Footer and the `home-*`
   sections are *not* imported — they are marked `loading="lazy"` and picked up by the
   loader's IntersectionObserver.
2. **Scroll restoration**: `index.html` saves scroll position on `beforeunload`; the entry
   waits for all pending custom elements to be defined, then restores it in a rAF.
3. `store.set(window.__INITIAL_STATE__)`.
4. **Head sync**: subscribing to the `meta` store key and calling `setPageMeta` on change.
   Components call `store.setMeta()` in `connectedCallback`, but that only writes state —
   without this subscription the `<title>` would freeze at the first-painted route.
5. `initLocale()`.

There is a subtle ordering hazard here, and `lib/store.js:12` is the fix: custom elements
upgrade **synchronously** the moment `customElements.define()` runs inside the bundle —
which is *before* the entry's tail reaches `store.set(__INITIAL_STATE__)`. So the store
module seeds itself from `window.__INITIAL_STATE__` at module-evaluation time. The very
first `connectedCallback` therefore already sees the right locale and messages: no
post-hydration re-render, no reflow.

### `Component.connectedCallback` (`core/component.js:103`)

```
AbortController created (this.signal — every listener is registered with it)
load template  ← static template (inlined in prod) or fetch(templateUrl)
extract :prop bindings from the template
resolve CSS (first match wins):
   static cssModuleText / cssText  → inline source, scoped in-process, no fetch (prod)
   static cssModule                → fetch + scope
   static css                      → fetch, plain
   else auto-probe                 → <name>.module.css, then <name>.css
snapshot store, apply static metadata
if (this.shadowRoot)  →  SSR path: set #hydrating, bind events only  ← no innerHTML write
else                  →  attachShadow({mode:'open'}) + update()
subscribe to static store keys (+ 'messages' if the template mentions t.*)
if SSR: mount()
if SSR: compare __INITIAL_STATE__ against the live store; re-render only if drifted
```

That last step handles the locale race: by the time an async `connectedCallback` resolves,
`initLocale()` may already have switched locales. Rather than always re-rendering, the
component compares the SSR snapshot to current state for the keys it actually depends on,
and only calls `update()` if something changed.

### `update()` (`core/component.js:168`)

1. Record `shadowRoot.activeElement` — selector, `selectionStart`, `selectionEnd`.
2. Abort the previous `AbortController` (drops all listeners) and make a new one.
3. `renderWithExpressions(template, this.props)`, hoist `<style>`, assign `innerHTML`.
4. Apply `:prop` bindings by setting JS properties on the matched child elements.
5. Re-bind `@click`-style attributes and call `bind()`.
6. Restore focus + selection.
7. Call `mount()`.

Because listeners are `AbortController`-scoped, a full innerHTML replacement can't leak
handlers. Because focus is captured and restored, typing in an input across a re-render
survives — that's the compensation for having no virtual DOM.

`this.props` (`component.js:206`) is the merge order that templates see:

```
store state  →  local state  →  pageProps  →  { path, $css, $c(), t }
```

### Reactivity in a component

`this.local` is a Proxy: assigning a key calls `onLocalChange` if defined, otherwise
triggers `update()` — unless `static reactive = false` or we're inside `batch()`.
`HeroCounter` opts out of reactive re-rendering entirely (`static reactive = false`) and
patches individual text nodes by hand, because re-rendering the whole hero panel on every
click would be wasteful.

---

## 6. Template engine (`core/template.js`)

Not a compiler — a set of ordered regex passes over the template string, plus a small
recursive-descent-ish `evaluate()` for expressions.

**Syntax**

| Form | Meaning |
|---|---|
| `{{expr}}` | evaluate, HTML-escape |
| `{{{expr}}}` | evaluate, raw |
| `{{#if cond}}…{{else}}…{{/if}}` | conditional (loop-resolved, max 10 nesting passes) |
| `{{#each items}}…{{/each}}` | iteration; `{{this}}`, `{{this.key}}`, `{{@index}}` |
| `{{$css.card}}` / `{{$c('a','b')}}` | scoped CSS-module class names |
| `{{t.nav.docs}}` | translation lookup |
| `:prop="expr"` on a child element | pass a **JS value** (not a string) as a property |

**Expression grammar** (`evaluate`, `template.js:6`), tried in order: literals →
negation → ternary → comparison → `&&` / `||` → arithmetic → whitelisted method calls →
index access → string literal → number → `.length` → dotted path lookup.

Method calls are restricted to a safelist: `split, join, slice, toUpperCase, toLowerCase,
trim, charAt, substring, replace` (`template.js:2`). There is no `new Function`, no `with`,
no arbitrary property invocation — a deliberate containment boundary, since templates are
also evaluated server-side.

**Deliberate limitations to know about**

- An unresolvable expression renders **as literal text** (`{{foo.bar}}` stays visible).
  That's why a missing locale catalogue shows raw mustaches rather than blanks, and why the
  CSR shell bakes in the message catalogues (§8).
- `{{#each}}` only accepts a bare identifier, not a path.
- `{{#if}}` inside `{{#each}}` is handled by a separate, more restrictive regex that can't
  contain nested `{{`.
- `{{#if}}` nesting is bounded at 10 resolution passes.

**Prop bindings** are a two-step dance. `extractPropBindings` strips `:count="localCount"`
off the child tag, stashes the expression, and stamps `data-prop-bind="__bind_0"` on the
element. After `innerHTML` is written, `#applyPropBindings` evaluates each expression and
assigns the result as a real JS property on the child. SSR does the same thing more
simply — it evaluates a dotted path and merges the value into the child's props, then
strips the `:attr` from the emitted HTML (`ssr.js:54`) so it never reaches the DOM.

---

## 6a. Styling: inline `<style>` vs. CSS Modules

Two routes to the same place — a `<style>` element inside the component's shadow root.

**Inline `<style>` in the template** is what most components here use. `extractStyles`
pulls the block out of the rendered HTML and re-emits it at the top of the shadow root.
Nothing is scoped, because nothing needs to be: the shadow boundary already isolates it.

**A CSS Module file** — `components/Footer/` is the worked example, and the only component
in the repo without an inline `<style>`. `Footer.module.css` sits next to `Footer.html` and
is discovered without any declaration. `scopeCSS` (`core/component.js`) rewrites every
class selector to `.name_<tag>` and returns the original→scoped map, which becomes `$css`
in templates and drives `cx()` / `$c()` in JS. The identical transform runs server-side in
`ssr.js`, so SSR markup and client re-renders agree on the class names.

The three environments differ only in where the CSS text comes from:

| | Source | Cost |
|---|---|---|
| Dev server | `fetch('/components/Footer/Footer.module.css')` | one request, cached per URL+scope |
| Production client | `static cssModuleText`, folded into the class by the build | none |
| SSR (any adapter) | read off disk / the asset store, minified at build | none (embedded in the response) |

Inlining the source at build time rather than referencing the URL is deliberate: a
referenced sheet would cost a request per component *and* would be an unhashed asset living
under the `immutable` cache rules for `/app/*` and `/components/*`, so an edit would be
invisible to returning visitors for a year. The template gets the same treatment for the
same reason.

Sharp edge: the scoping pass is a regex over the file and does **not** skip comments, so a
dotted name in a comment (`Foo.html`, `.card`) registers as a class. Harmless to rendering
— it only adds an unused entry to the map — but worth avoiding.

---

## 7. State (`core/context.js` + `lib/store.js`)

`Store extends EventTarget`. The state object is wrapped in a recursive `Proxy`; any `set`
dispatches two events:

- `change` with `{ key, value, old }`
- `change:<dot.path>` with `{ value, old }`

Nested objects get wrapped lazily on access with a path prefix, so `store.state.user.name = 'x'`
fires `change:user.name`. `store.on(key, cb)` returns an unsubscribe function; components
collect those and call them all in `disconnectedCallback`.

API: `get(path?)`, `set(obj)`, `update(key, fn)`, `toggle(key)`, `reset(key?)`, `on(…)`,
plus `defaults`.

`lib/store.js` is the singleton. Defaults are `{ meta: {}, locale: 'es', messages: {} }`,
and the only action it adds is `setMeta`. In the browser it's memoised on `window.__store__`
so a duplicate module instance (bundled copy vs. lazily-fetched copy) can't produce two
stores.

There are deliberately **no** built-in auth/theme actions. Theme toggling writes
`document.documentElement.dataset.theme` directly in
`components/Navigation/Navigation.js` (with the anti-FOUC read in `index.html`'s head
script), and the login/form/router/async panels on the home page are self-contained demos
in `components/HomeDemos/HomeDemos.js` — they illustrate the APIs without the framework
shipping a domain model.

---

## 8. Routing

### File → route (`core/routes.js:7`)

```
app/Home/Home.html          → /            (special-cased: /home → /)
app/NotFound/NotFound.html  → /notfound    (+ cloned as path '*')
app/About/About.html        → /about
app/Users/[id]/User/…       → /users/:id/user
```

Rules: a trailing segment that repeats its parent folder is dropped (`Home/Home` → `Home`);
`[param]` becomes `:param`; everything is lowercased; folders and files starting with `_`
are skipped (that's what keeps `_Layout` out of the route table).

### Matching (`core/routes.js:16`)

Exact non-dynamic match first, then each dynamic route's regex (built by `createMatcher`,
which turns `:name` into `([^/]+)` and records param names), then the `*` fallback. Params
are `decodeURIComponent`'d.

The `*` entry isn't in `routes.json` — it's appended by `withNotFound(routes)`, which
clones the `notfound-page` route. Every consumer of a route table calls it: the Node SSR
entry, the client Router, and the Cloudflare worker. Without it a host falls through to the
renderer's bare `<h1>404</h1>` instead of the real NotFound page.

### The Router element (`components/Router/Router.js`)

On connect:

1. Grab `#outlet` (SSR provides it; otherwise create it).
2. Read routes from `window.__ROUTES__`, falling back to `fetch('/routes.json')` then
   `/api/routes`.
3. Wire three global listeners: `popstate`, a custom `navigate` event, and a **document
   click handler** that uses `e.composedPath()` to find `<a route>` anchors — necessary
   because the anchor lives inside a shadow root and wouldn't be visible to a normal
   `e.target` check.
4. Wire `pointerover` on `a[route]` to **preload** the target route's module and template on
   hover (once per href).
5. **Hydrate or navigate**: if the outlet's first child already has a `shadowRoot`, the page
   was server-rendered — import its module (so `customElements.define` upgrades the existing
   element) and stop. Otherwise, run a full client navigation.

A client navigation: `beforeEach` hook → `matchRoute` → auth check → dynamic-import the
route module → preload its template → create the element, attach `pageProps` → `scrollTo(0,0)`
→ `outlet.replaceChildren(el)` → yield one timer tick so the async `connectedCallback`
completes → `waitForComponents()` walks the composed tree (including shadow roots) awaiting
`customElements.whenDefined` for every not-yet-defined tag, with a 3s cap → `afterEach`.

`lib/nav.js` provides the imperative API (`navigate`, `replace`, `back`, `getQuery`,
`setQuery`, `buildUrl`, `isActive`, `parseParams`). `navigate()` just dispatches the
`navigate` CustomEvent the Router listens for, so `lib/nav.js` has no dependency on the
Router.

`scrollToHash` (`lib/nav.js:63`) exists because every section id on the home page lives
inside a different component's shadow root — native `#hash` navigation cannot see them. It
recursively descends shadow roots to find the target, then `scrollIntoView`s it. Both
`Navigation` and `HomePage` delegate `a[href^="#"]` clicks to it.

---

## 9. Component auto-loading (`core/loader.js`)

Anything that is not eagerly imported by the entry gets loaded on demand:

- **Tag → path** goes through `window.__TAGS__`, the discovered registry (§9a).
  `pathsForTag` (`core/tags.js`) turns `home-cta` → `components/HomeCTA` →
  `/components/HomeCTA/HomeCTA.js`. Tags absent from the registry fall back to the
  `kebab-case` → `PascalCase` convention.
- In production the resolved path is run through `window.__M__`, the build's
  original-URL → content-hashed-URL map.
- Tags ending in `-page` are skipped — pages are the Router's job.
- `loading="lazy"` elements are registered with an `IntersectionObserver` (200px root
  margin) and only imported when they approach the viewport. The SSR'd DSD content is
  visible the whole time; only the JS upgrade is deferred.
- A `MutationObserver` on `document.documentElement` catches dynamically added elements, and
  `Element.prototype.attachShadow` is monkey-patched so every newly created shadow root is
  also scanned and observed. That's how components nested inside other components' shadow
  DOM get found.
- The initial scan is deliberately postponed to `load` + `requestIdleCallback`. Firing those
  dynamic imports inside the critical-path window made Lighthouse attribute them to LCP even
  though the elements were off-screen.

---

## 9a. The tag registry

Turning `<home-cta>` into a file path is needed in three unrelated runtimes: the browser
loader, the Node SSR renderer, and the edge adapters. The naming convention
(`kebab-case` ↔ `PascalCase`) covers most tags but breaks on acronyms (`HomeCTA`), compound
words (`HomeQuickStart`) and internal capitals (`NotFound` — `notfound-page` lowercases to
`Notfound`, which only resolves on a case-insensitive filesystem like macOS's).

Rather than three hand-maintained override tables, the mapping is **discovered**.
`scanTags` (`core/scan.js`) walks `app/` and `components/` for `define('<tag>', …)` calls
and records the directory that declares each one:

```json
{ "app-footer": "components/Footer", "home-cta": "components/HomeCTA",
  "notfound-page": "app/NotFound", "app-layout": "app/_Layout", … }
```

It differs from `scanDir` deliberately: it reads `.html` too (tags are often defined in an
inline `<script>`), accepts `.mjs` (the `dist/server` copy is renamed), and does *not* skip
`_`-prefixed entries — `app/_Layout/_Layout.js` declares `<app-layout>`. Keys are sorted so
the inlined JSON, and therefore the build's content hashes, stay stable.

Distribution:

| Consumer | Gets the registry via |
|---|---|
| `core/loader.js` (browser) | `window.__TAGS__`, inlined by the dev server and the build |
| `core/server/entry-server.js` | `await scanTags(root)` at module load, so `resolvePaths` stays sync |
| `deploy/cloudflare/_worker.js` | `_ssr-config.json`, emitted by the build (no `node:fs` at the edge) |

All three resolve through the same `dirForTag` / `baseName` helpers in `core/tags.js`.
Adding a component with an awkward folder name now requires no configuration anywhere.

---

## 10. i18n

Three catalogues (`locales/{en,es,fr}.json`), nested objects of message strings. The
supported list and default come from `app.config.yml` — nothing is hardcoded in `lib/i18n.js`
(`DEFAULT_LOCALE_CONFIG` is only a pre-injection fallback).

**Server**: negotiates the locale with the shared `negotiateLocale` (`core/locale.js` —
cookie beats q-ranked `Accept-Language` beats the configured default), loads that catalogue,
puts `{ locale, messages }` into the store before rendering, and emits three globals. The
script tags themselves are built in `ssr.js` from the renderer's `options` argument, so
every adapter emits them identically rather than assembling its own:

- `__INITIAL_STATE__` — the active locale + its messages
- `__LOCALES__` — **the other supported catalogues**, inlined
- `__LOCALE_CONFIG__` — the supported/default list

**Client** (`initLocale`, `lib/i18n.js:58`) resolves in this order:

1. Cookie, else `navigator.language`, normalised and validated against the supported list.
2. *Fast path 1* — SSR already rendered that locale and the store has a non-empty catalogue:
   do nothing.
3. *Fast path 2* — a different locale, but it's in `__LOCALES__`: switch **synchronously**.
4. Otherwise `fetch('/locales/<code>.json')`.

Paths 2 and 3 are why a Lighthouse run (which sends `en-US`) against an `es`-default
response doesn't add a network hop to the critical chain, and why switching language is
instant. `setLocale()` also writes a year-long `locale` cookie so the *next* SSR request
renders the right language directly.

The `messages` store key is special-cased in `Component.connectedCallback`: if a component
doesn't list it in `static store` but its template mentions `t.something`, the component
auto-subscribes. So a language switch re-renders exactly the components that display text.

`t(key, vars)` (`lib/i18n.js:102`) does dot-path lookup with `{var}` interpolation and falls
back to returning the key itself.

---

## 11. The production build (`core/server/build.js`)

`yarn build` → `dist/client/` (served) and `dist/server/` (SSR runtime), in this order:

1. **Bundle** `core/server/entry-client.js` and its entire static import graph into one
   IIFE (`bundle.js`). Written to `_assets/core.<hash>.js` *and* inlined into the HTML.
2. **Copy + transform + minify** `app/`, `components/`, `core/`, `lib/` into `dist/client/`.
   - `app/` and `components/` get their static imports **rewritten to `globalThis.__r(…)`**,
     the bundle's module registry. When the loader lazily imports `HomeFooter.js`, it
     reuses the already-loaded `/core/component.js` from the registry instead of fetching it
     again. This is what removes the "critical request chain" warning for lazy modules.
   - Every `static templateUrl = '/x.html'` is replaced by `static template = "<html>"`
     (`inlineTemplate`), and any sibling or explicitly-declared `.module.css` / `.css` is
     folded in as `static cssModuleText` / `static cssText` — **the minified source, not a
     URL**. So in production a component performs zero template and zero CSS fetches, and
     no unhashed stylesheet ends up under the `immutable` cache rules.
   - Only `.js` and (when minifying) `.css` are read as text; everything else is
     `copyFile`'d byte-for-byte. Reading a `.woff2` as UTF-8 corrupts it.
3. **Extract inline `<script>` blocks** from `.html` files. Pages emit `Foo.script.js`;
   components emit `Foo.js` (so the loader's natural tag→path rule still resolves) unless an
   explicit `.js` source already exists.
4. **Content-hash** every emitted `app/**` and `components/**` JS file, and write the
   original→hashed map to `_assets-manifest.json`. That map is inlined as `window.__M__`,
   which is what makes `Cache-Control: max-age=31536000, immutable` safe for those paths
   (see `netlify.toml`).
5. **Build `_template.html`** — the SSR shell: minified `globals.css` inline, font preloads,
   `__M__`, `__TAGS__`, `__ROUTES__`, and the bundle inlined into `<script type="module">`
   replacing the `entry-client.js` tag. The three per-request placeholders stay empty for
   the SSR adapter to fill.
6. **Build `index.html`** — the CSR shell (§12).
7. Copy locales (client + server), `public/` (flattened to the client root, so `/fonts/…`
   works), `app.config.yml` to both roots, and `deploy/cloudflare/_worker.js` → `_worker.js`.
8. Emit `routes.json`, `_manifest.json`, and `_ssr-config.json` — the latter carrying the
   normalized locale config plus the tag registry, for adapters that can't read
   `app.config.yml` or walk the source tree.
9. Copy `core/`, `lib/`, `app/`, `components/` to `dist/server/` with `.js` → `.mjs`
   renaming (and import specifiers rewritten to match) for the Netlify/Cloudflare runtime.
   CSS is minified in this copy too (`minifyCss`), because SSR embeds it verbatim into the
   shadow root of every response even though the server JS is left readable.

**Why the bundle is inlined rather than linked**: a `<script src>` makes the critical
request chain two deep (HTML → JS). The HTML is already dynamic (per-locale SSR), so it
can't be cached anyway — inlining costs nothing and drops the chain to one hop.

### Bundler (`core/server/bundle.js`)

A regex-driven ESM→registry transform, ~240 lines. It walks the graph depth-first from the
entry, transforms each module, and emits:

```js
(function(){ "use strict";
  const __m={}, __r=id=>{ if(__m[id]) return __m[id]; throw new Error(...) };
  const __d=(id,fn)=>{ const e={__esModule:true}; __m[id]=e; fn(e,__r); return e; };
  globalThis.__r=__r; globalThis.__m=__m;
  __d("/lib/store.js",(exports,__r)=>{ … });
  …
  __r("/core/server/entry-client.js");
})();
```

Handled: default/named/namespace/side-effect imports, `export default` (expression,
function, class, named or anonymous), `export const/let/var/function/class`,
`export { a as b }`, `export … from`, `export *`. `node:*` and bare specifiers are left
alone. **Dynamic `import()` is preserved** but its specifier is rewritten to the resolved
root-relative key — that's what keeps route-level code splitting working.

Because modules are executed in dependency order and `__m[id]` is populated *before* the
factory body runs, circular imports resolve to a partially-filled exports object rather than
throwing — same semantics as a naive CommonJS interop, not true ESM live bindings.

`globalThis.__r` being exposed is the hinge for step 2 above: lazily-fetched modules call it
instead of re-importing.

### Minifier (`core/server/minify.js`)

A character-level tokenizer, not a parser. It walks the source emitting tokens while
correctly consuming strings (with escapes), template literals (**including nested `${}` with
nested templates and strings**), regex literals, and both comment forms. Whitespace is
dropped except between two word characters. `/*! … */` license blocks are kept.

Regex-vs-division disambiguation uses `REGEX_AFTER`, a set of tokens after which a `/` must
start a regex. No identifier mangling, no dead-code elimination — roughly 35–50% size
reduction, and the output stays readable enough to debug.

`minifyCSS` is a straightforward comment-strip + whitespace-collapse.

---

## 12. The CSR target

`yarn build` also emits `dist/client/index.html`: `_template.html` with the three
per-request placeholders **pre-filled at build time**.

- `<!--app-html-->` → empty. The Router finds an empty outlet and client-renders the route —
  the exact code path an SSR page takes after hydration, since `Component` falls back to
  `attachShadow()` + `update()` when no DSD is present.
- `<!--head-meta-->` → the **home route's** metadata, baked in, so crawlers and first paint
  get a real title/description.
- `<!--initial-state-->` → `__INITIAL_STATE__` (default locale + its catalogue),
  `__LOCALES__` (the rest), `__LOCALE_CONFIG__`.

That locale baking is not optional: without a catalogue in the store, every `{{t.*}}` paints
as literal mustaches until the first fetch resolves (§6).

`yarn preview:csr` (`core/server/static.js`, port 4399) serves `dist/client/` with a **SPA
catch-all**: any extension-less path that isn't a real file falls back to `/index.html`. It
also rejects path traversal and sends `immutable` caching for everything except HTML. Real
hosts express the same rule as a rewrite (`/* /index.html 200`, `try_files $uri /index.html`).

What you give up vs. SSR: blank first paint until the bundle runs, no server locale
negotiation, and no-JS crawlers see an empty shell.

---

## 13. HMR

`setupWatcher` (`index.js:46`) puts a recursive `fs.watch` on `app/`, `components/`,
`core/`, `lib/`, filtered to `.js` / `.html` / `.css`, with a 50 ms per-file debounce
(editors write temp files and fire several events per save). The route cache is invalidated
on every change. Then one of three messages is broadcast over the hand-rolled WebSocket:

| Changed | Message | Client behaviour |
|---|---|---|
| `.css` | `css` | cache-bust matching `<link>`s; refetch and swap the inline `globals.css` `<style>` |
| `core/**`, `lib/**` | `reload` | `location.reload()` — those modules are already cached by the browser |
| anything else | `update` | re-import with `?t=<now>`, then call `disconnectedCallback()`/`connectedCallback()` on every matching element; reload if none found or the import fails |

The HMR client script is injected into the SSR response in dev only, and reconnects on a
1 s timer if the socket closes.

`core/server/ws.js` implements RFC 6455 by hand: the `sha1(key + GUID)` handshake, frame
parsing (opcode, mask, the 7/16/64-bit payload length cases), unmasking, and frame writing
for text/pong/close. ~140 lines, no `ws` package.

---

## 14. Configuration (`app.config.yml` + `core/config.js`)

Every key is optional; delete the file and the framework still runs.

```yaml
locales:
  supported: [en, es, fr]   # omit or `auto` → discover from locales/*.json
  default: es               # omit → first supported
preload:
  fonts: [ /fonts/geist-latin.woff2, … ]   # omit → none; `auto` → every public/fonts/*.woff2
  modules: [ /components/Router/Router.js, … ]  # dev-only extra modulepreloads
```

`core/config.js` contains a ~60-line YAML subset parser: indentation-based nested maps,
block lists, inline `[a, b]` lists, quote-aware comment stripping, and
string/number/boolean/null scalars. Results are cached per root.

Font and module preloads default to **empty** on purpose: preloading every font hurts LCP,
so the list is a curated decision rather than an autodiscovered one.

The build copies `app.config.yml` into both `dist/` roots so the SSR adapters negotiate
locales from the same source the dev server used.

---

## 15. Deployment

| Target | Mechanism |
|---|---|
| **Node** | `NODE_ENV=production node core/server/index.js` — same server as dev, no HMR, `immutable` caching for non-HTML |
| **Cloudflare Pages** | `dist/client/_worker.js`. Static extensions and `/app\|/components` `.html` go to `env.ASSETS`; everything else builds a renderer whose `loadFile` is `env.ASSETS.fetch`, then fills `_template.html`. Reads `_ssr-config.json` for locales + tag registry (no `node:fs` at the edge), negotiates via `core/locale.js`, loads catalogues from `/locales/*.json`, and memoises config/routes/locales per isolate as **promises** so concurrent requests share one fetch. `wrangler.toml` sets `nodejs_compat`. |
| **Netlify** | `netlify.toml` serves static paths directly and rewrites `/*` to `deploy/netlify/functions/ssr.mjs`, which sets `SSR_ROOT=dist/server`, negotiates via the built `core/locale.mjs`, and imports the built `entry-server.mjs`. |

Both SSR adapters send `Vary: Accept-Language, Cookie`, rewrite `<html lang>` to the
negotiated locale, and use function-form `.replace()` so `$`-patterns in the inlined bundle
can't corrupt the output.
| **Static / CDN** | `dist/client/index.html` + a SPA rewrite (§12) |

---

## 16. Invariants and sharp edges

Things that will bite if you don't know them:

1. **SSR reads statics from source text.** `static metadata` / `ssrProps` / `local` /
   `requiresAuth` must be literal object expressions. A computed
   `static metadata = buildMeta()` is invisible to SSR, because the server never imports
   the module — it regex-scans the source and `eval`s the extracted literal.
2. **`eval` runs at build/SSR time** on those extracted statics. Fine for first-party code;
   it is not a sandbox for untrusted input.
3. **Unresolved template expressions render as visible text.** A missing prop shows up in
   the page as `{{prop}}` rather than silently disappearing. This is why the CSR shell bakes
   in the message catalogues (§12) and why a locale gap is loud rather than blank.
4. **The CSS scoping pass is comment-blind.** It rewrites every `.identifier` in the file,
   including inside comments, so a dotted filename in a comment registers a phantom class.
   Harmless to rendering, but keep comments prose-only.
5. **The `-page` suffix is structural.** `loader.js` skips those tags on purpose so pages
   load only through the Router; a component named `something-page` would never auto-load.
6. **Everything is a full-subtree re-render.** No diffing. Components that update
   frequently or hold expensive DOM should set `static reactive = false` and patch by hand
   (see `HeroCounter`).
7. **Registry-dependent behaviour needs the registry present.** `window.__TAGS__` is
   inlined by the dev server and the build; if you serve `dist/client` through some other
   pipeline that strips it, resolution silently degrades to the naming convention and
   irregular folders (`HomeCTA`, `NotFound`) stop resolving.

### Previously documented here, now fixed

The first version of this document listed four defects. They were addressed in the same
pass that produced this section, and the notes are kept because the *shape* of each is
worth recognising — three of the four were the same failure mode: **one concern
implemented once per host**.

| Was | Now |
|---|---|
| Tag→folder resolution hand-maintained in 3 places; the Cloudflare copy had no irregular table, so `home-quickstart` / `home-cta` never SSR'd there | Discovered once by `scanTags`, shared via `core/tags.js` (§9a). Also fixed `notfound-page` → `Notfound`, which only resolved on case-insensitive filesystems |
| Cloudflare worker rendered with `store.defaults` — empty `messages`, raw `{{t.*}}` in the HTML, no `__LOCALES__` / `__LOCALE_CONFIG__`, no `lang` rewrite | Full negotiation via `core/locale.js` + `_ssr-config.json`; locale scripts emitted by `ssr.js` for every adapter |
| `routes.json` carries no `*` entry, so the worker 404'd to a bare `<h1>404</h1>` | `withNotFound` in `core/routes.js`, called by all three route-table consumers |
| `README.md` listed pages/components that no longer existed and `store.login/logout/toggleTheme`, which were never in `lib/store.js` | README reconciled with the tree; store documented as intentionally bare |

---

## 17. Adding things

**A page** — create `app/Pricing/Pricing.html` with a `<style>` block, markup, and a
`<script>` exporting a `Component` subclass with `static templateUrl` (+ optional
`metadata`, `ssrProps`, `requiresAuth`), ending in `define('pricing-page', PricingPage)`.
The route `/pricing` and the `<title>` come for free. Restart isn't needed — the watcher
invalidates the route cache.

**A component** — create `components/Foo/Foo.html` (+ optional `Foo.js`, `Foo.module.css`,
`Foo.css`) and use `<app-foo>` or `<foo-bar>` anywhere. The folder name needs no
relationship to the tag beyond what `define()` declares — the registry is discovered (§9a).
Add `loading="lazy"` for below-the-fold sections; add an eager `import` to
`entry-client.js` only for above-the-fold ones.

**Styles for it** — either an inline `<style>` in the template, or a sibling
`Foo.module.css` referenced as `{{$css.name}}` (§6a). No declaration needed for either.

**A locale** — drop `locales/de.json` in; autodiscovery picks it up, or add `de` to
`app.config.yml`. Then add a switch control in `components/Navigation/Navigation.html` +
`.js` (currently three hardcoded `#lang-*` buttons).

**A route guard** — `static requiresAuth = true` on the page (enforced both in `ssr.js:91`
and `Router.checkAuth`), or set `Router.beforeEach`.

---

## 18. Why the performance choices look the way they do

Most of the odd-looking code in this repo is one of these decisions:

| Decision | Reason |
|---|---|
| Bundle inlined into HTML | critical request chain 2 → 1 |
| `__ROUTES__` / `__M__` / `__TAGS__` inlined | no `routes.json` round-trip before the first navigation, no registry fetch before the first lazy import |
| Templates + CSS inlined into component classes at build | zero fetches per component; also keeps unhashed CSS out of `immutable` caching |
| Lazy modules rewritten to `globalThis.__r` | lazy imports don't re-fetch core |
| Initial loader scan deferred to `requestIdleCallback` | off-screen imports stop counting against LCP |
| `IntersectionObserver` for `loading="lazy"` | below-fold JS never runs until needed |
| Non-active locales inlined as `__LOCALES__` | language mismatch/switch costs no network hop |
| Store seeded at module-eval time | first `connectedCallback` sees final state — no hydration reflow |
| SSR-drift check instead of unconditional re-render | hydration usually writes zero DOM |
| Declarative Shadow DOM | shadow roots exist before JS; hydration never replaces DOM |
| Content-hashed lazy modules + `__M__` | `immutable` 1-year caching on `/app/*` and `/components/*` |
| Font preloads curated, not automatic | preloading every face regresses LCP |
| `font-display: swap` + variable woff2 | text paints immediately; one file per family |
