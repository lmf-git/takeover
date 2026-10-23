# Gotchas

The most urgent item is a path-traversal hole in the Node server; everything else is a correctness or developer-experience trap. Each row was reproduced on a scratch copy of the repo at `e35311b`, except rows marked "from the code", which follow directly from reading it, and the Netlify row, which depends on platform behaviour.

## Security

| Issue | Detail | Fix |
| --- | --- | --- |
| **Path traversal in the Node server** | `core/server/index.js` joins the decoded URL onto the repo root without a containment check. `curl --path-as-is http://localhost:3000/../secret.txt` and `/..%2fsecret.txt` both returned a file outside the project, in dev and production mode; `?raw` does the same. Every file in the checkout is public as well: `/package.json`, `/core/server/build.js`, `/.git/config` if present | Never expose `yarn dev` or `yarn start` beyond localhost. Reject resolved paths outside the root, as `core/server/static.js` already does |
| `{{#each}}` output is unescaped | Item fields are inserted raw, so user-supplied strings in a list are an XSS vector | Escape before storing, or render such lists in JS |

## Dev server

| Symptom | Cause | Fix |
| --- | --- | --- |
| Template and CSS edits don't show after a reload | `core/server/ssr.js` caches templates and CSS per tag at module level, and only `entry-server.js` is re-imported per request. An edited `.html` reached SSR output only after a restart | Restart `yarn dev`. Framework fix: clear that cache from the watcher |
| Every save is a full reload, never a hot swap | Watcher URLs lose their top folder (`/Footer/Footer.html` instead of `/components/Footer/Footer.html`), so the client's re-import 404s and falls back to `location.reload()` | Treat it as live reload. Framework fix: prefix the watched folder |
| Editing `*.module.css` or `globals.css` does nothing | The `css` message targets `<link>` tags the page doesn't have, and `globals.css` sits outside the watched folders | Reload by hand, and restart for SSR |
| `core/` and `lib/` edits never send `reload` | The same URL bug drops `/core/` and `/lib/` from the path | The failed re-import still reloads |
| `yarn preview` isn't the build | It serves source with `NODE_ENV=production`, and its page modulepreload (`/app/Home/Home.script.js`) 404s | Use `yarn preview:csr` or the platform CLIs |
| `requiresAuth` isn't enforced on client navigation in dev | The dev route table from `scanRoutes()` omits `requiresAuth` (from the code) | Test guards against a build |

## Production build

| Symptom | Cause | Fix |
| --- | --- | --- |
| `Module not found: /lib/validate.js` from a lazy component | Static imports in `app/` and `components/` become `globalThis.__r(…)`, which knows only the 17 bundled modules; `/lib/validate.js` and `/lib/async.js` aren't among them | `await import('/lib/validate.js')`, or import it from an eager module |
| `Module not found: ../../core/component.js` from a page | Imports in inline page scripts are rewritten without resolving relative paths | Use root-absolute imports (`/core/component.js`) in `.html` scripts |

## Rendering

| Symptom | Cause | Fix |
| --- | --- | --- |
| Raw `{{name}}` in server HTML for a nested component | SSR renders nested components with the page's props and ignores their own `local` | Use store keys or the page's `local` |
| A component with children isn't server-rendered | SSR expands only elements written empty: `<x-y …></x-y>` | Keep custom elements empty in templates |
| `$$5` renders as `$5`, and `$&` nested a component 50 levels deep | SSR splices components with a string-pattern `replace()`, which interprets `$` sequences | Avoid `$$`, `$&` and `$'` in templates. Framework fix: function-form replace in `ssr.js` |
| `{{params.id}}` or an `ssrProps` value turns raw after a language switch | Hydrated pages get no `pageProps`, and `ssrProps` never reach the client (from the code) | Keep render data in `local` or the store; re-derive params with `parseParams()` |
| Literal `{{…}}` in the page | The expression evaluated to `undefined` | Check the [props table](06-templates-and-styling.md#what-a-template-can-see) |
| The 11th `{{#if}}` prints as text | The resolver makes 10 passes, one block each | Split the template into components |
| `{{$c('a', 'b')}}` prints as written | The evaluator can't call top-level functions | Use `{{$css.a}}`, or build class strings in JS |
| A page has no `<title>` | Pages without `static metadata` emit none, and `index.html` has no default | Give every page `metadata` |
| `/items/abc` shows "Page not found" with status 200 | A route ending in a parameter: `[slug]/[slug].html` yields `/items/:slug/:slug` and tag `[slug]-page`; `[slug]/Slug.html` routes correctly, but SSR looks for `[slug].html`, so the client renders the page after a flash | Give the route a static last segment, or make `resolvePaths` use the page's file stem |
| Handlers fire twice after a re-render | `mount()` runs after every `update()`, so raw `addEventListener` calls on long-lived targets pile up. `HomeStructure` does this on its shadow root, so after a language switch each click toggles twice and folders stop opening (from the code) | Register listeners with `this.on()` or `this.delegate()` in `bind()` |
| A CSS Module breaks `url(img.png)` | The scoping regex rewrites `.png` as a class name | Keep `url()` out of module sheets |

## Routing and deployment

| Symptom | Cause | Fix |
| --- | --- | --- |
| Hover preloading never fires | The `pointerover` handler uses `e.target.closest()`, which can't see into shadow roots, and every link here lives in one (from the code) | Use `composedPath()`, as the click handler does |
| `beforeEach` returning `false` still changes the address bar | `go()` pushes the history entry before the hook runs (from the code) | Redirect instead of cancelling |
| A `requiresAuth` page always redirects on a direct load | SSR state never contains `isAuthenticated` | Read a session cookie in the adapters, or guard only on the client |
| Netlify may serve `/` client-rendered | `dist/client/index.html` is the CSR shell, and Netlify serves existing files before non-forced rewrites (platform behaviour, not tested here) | Check the live `/` for `shadowrootmode`; if it's missing, force the rewrite for `/` or rename the CSR shell |
| Cloudflare serves hashed files without long-lived caching | The build emits no `_headers` file, and `netlify.toml` headers don't apply there | Add `public/_headers` with `immutable` rules |
| A cold Node server can render a request in another request's language | `render()` awaits locale file reads between `store.set()` and `store.get()` on a shared store (from the code) | Build per-request state instead of using the singleton |

---

[← Recipes](10-recipes.md) · [Index](README.md#contents) · [Reference →](12-reference.md)
