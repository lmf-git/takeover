# Takeover

A zero-dependency web component framework with SSR, HMR, bundling, and i18n — built entirely on Node.js built-ins and native browser APIs.

No Vite. No Webpack. No React. No npm dependencies at all.

---

## What it is

Takeover is a full-stack web application framework built around the [Web Components](https://developer.mozilla.org/en-US/docs/Web/API/Web_components) standard (Custom Elements + Shadow DOM). It handles the full lifecycle:

- **Dev server** — native ESM serving with WebSocket-based HMR
- **SSR** — server-side rendering with Declarative Shadow DOM, client hydration
- **Bundler** — traces static `import` graphs and emits a single hashed bundle
- **Minifier** — token-aware JS minifier + CSS minifier, both pure Node.js
- **i18n** — reactive locale switching (EN / ES / FR) with SSR-first locale detection
- **Routing** — file-system routing from the `app/` directory
- **State** — reactive `EventTarget`-based store with per-key subscriptions

Everything runs on `node --version` ≥ 18. There is no `node_modules`.

---

## Quick start

```bash
# Dev server with HMR
yarn dev          # or: node core/server/index.js

# Production build (bundle + minify + hash assets)
yarn build        # or: node core/server/build.js

# Serve the production build locally
yarn preview      # or: NODE_ENV=production node core/server/index.js

# Remove dist/
yarn clean
```

Dev server starts at `http://localhost:3000`. Set `PORT=xxxx` to change it.

---

## Directory structure

```
takeover/
├── app/                    # Pages (file-system routed)
│   ├── _Layout/            # Root layout (app-layout element)
│   ├── Home/               # → /
│   ├── About/              # → /about
│   ├── Contact/            # → /contact
│   ├── Dashboard/          # → /dashboard
│   ├── Login/              # → /login
│   ├── NotFound/           # → /notfound (also used as 404)
│   └── Users/[id]/User/    # → /users/:id/user  (dynamic segment)
├── components/             # Shared components
│   ├── Counter/
│   ├── LanguageSwitch/
│   ├── LocalStateDisplay/
│   ├── Navigation/
│   ├── Router/
│   └── ThemeToggle/
├── core/
│   ├── component.js        # Base Component class
│   ├── context.js          # Store (EventTarget Proxy)
│   ├── loader.js           # Auto-loader (MutationObserver-based)
│   ├── routes.js           # Route matching + path helpers
│   ├── scan.js             # Directory scanner for routes
│   ├── template.js         # Template engine (expressions, each, if)
│   └── server/
│       ├── index.js        # Dev/prod HTTP server + HMR
│       ├── build.js        # Production build pipeline
│       ├── bundle.js       # Zero-dep ESM bundler
│       ├── minify.js       # Zero-dep JS + CSS minifier
│       ├── entry-client.js # Browser entry point
│       ├── entry-server.js # SSR entry point
│       ├── ssr.js          # Shared rendering logic
│       └── ws.js           # WebSocket server (no ws package)
├── lib/
│   ├── async.js            # Async helpers
│   ├── i18n.js             # Locale loading + t() helper
│   ├── index.js            # Public API barrel
│   ├── meta.js             # Head metadata utilities
│   ├── nav.js              # Navigation helpers (navigate, replace, getQuery…)
│   ├── store.js            # App-level store instance
│   └── validate.js         # Validation helpers
├── locales/
│   ├── en.json             # English
│   ├── es.json             # Spanish
│   └── fr.json             # French
├── deploy/
│   ├── cloudflare/_worker.js   # Cloudflare Pages Worker (SSR)
│   └── netlify/                # Netlify Functions (SSR)
├── globals.css             # Global CSS custom properties + reset
└── index.html              # Shell HTML (comment placeholders for SSR)
```

---

## Pages and routing

Pages live in `app/`. The directory name maps directly to the route:

| Directory | Route |
|---|---|
| `app/Home/` | `/` |
| `app/About/` | `/about` |
| `app/Users/[id]/User/` | `/users/:id/user` |
| `app/NotFound/` | `/notfound` + wildcard 404 |

Each page is a folder with two files:

```
app/About/
  About.html   ← template (Shadow DOM content + optional <script> block)
  About.js     ← component class (optional if script is embedded in .html)
```

The script can live inside a `<script>` tag at the bottom of the `.html` file (extracted at build time) or in a separate `.js` file alongside it.

### Example page

```html
<!-- app/About/About.html -->
<style>
  :host { display: block; }
  h1 { color: var(--primary-color); }
</style>

<h1>{{t.nav.about}}</h1>
<p>{{description}}</p>

<script>
import { Component, define } from '/core/component.js';

export default class AboutPage extends Component {
  static templateUrl = '/app/About/About.html';
  static store = ['user'];
  static metadata = { title: 'About' };
  static ssrProps = { description: 'We build things.' };
}

define('about-page', AboutPage);
</script>
```

---

## Components

Shared components live in `components/`. They follow the same two-file pattern as pages but are loaded lazily by `core/loader.js` via `MutationObserver` — as soon as a custom element tag appears in the DOM, the corresponding JS is fetched and registered.

Tag → file mapping (automatic):
- `<app-counter>` → `components/Counter/Counter.js`
- `<theme-toggle>` → `components/ThemeToggle/ThemeToggle.js`
- `<lang-switch>` → `components/LanguageSwitch/LanguageSwitch.js`

### Component API

```js
import { Component, define, store } from '/core/component.js';

export default class MyWidget extends Component {
  // URL of the HTML template (Shadow DOM content)
  static templateUrl = '/components/MyWidget/MyWidget.html';

  // CSS Module — class names are scoped to this element's tag
  static cssModule = '/components/MyWidget/MyWidget.module.css';

  // Store keys to subscribe to — re-renders on change
  static store = ['user', 'theme'];

  // Initial local (per-instance) state — cloned for each instance
  static local = { count: 0, open: false };

  // Called after Shadow DOM is ready and template is rendered
  bind() {
    this.on('#btn', 'click', () => this.local.count++);
    this.on('form', 'submit', e => this.handleSubmit(e));
    this.delegate('click', '.item', (el, e) => console.log(el));
  }

  // Called when element connects to DOM
  mount() {}

  // Called when element disconnects
  unmount() {}

  handleSubmit(e) {
    e.preventDefault();
    const data = this.getFormData();
    this.withLoading(() => submitData(data));
  }
}

define('my-widget', MyWidget);
```

#### Helpers

| Method | Description |
|---|---|
| `this.$(sel)` | `shadowRoot.querySelector` |
| `this.$$(sel)` | `shadowRoot.querySelectorAll` → Array |
| `this.on(target, event, fn)` | Adds event listener, auto-removed on disconnect |
| `this.emit(name, detail)` | Dispatches a composed CustomEvent |
| `this.delegate(evt, sel, fn)` | Event delegation on shadow root |
| `this.cx(...args)` | CSS class helper: strings, objects, arrays → scoped class string |
| `this.batch(fn)` | Run multiple `local` mutations with a single re-render |
| `this.withLoading(fn, key?)` | Sets `local[key]` true while async fn runs |
| `this.bindForm(fields)` | Bind `<input>` elements to `local` state keys |
| `this.getFormData(sel?)` | Read form as plain object via `FormData` |

---

## Template engine

Templates use `{{ }}` expressions evaluated against `props` (store state + local state + pageProps + `t` for translations):

```html
<!-- Interpolation (HTML-escaped) -->
<p>{{user.name}}</p>

<!-- Unescaped -->
<p>{{{rawHtml}}}</p>

<!-- Conditionals -->
{{#if isAuthenticated}}
  <span>{{user.username}}</span>
{{else}}
  <a href="/login" route>Login</a>
{{/if}}

<!-- Loops -->
{{#each items}}
  <li>{{this.name}} — {{@index}}</li>
{{/each}}

<!-- Ternary -->
<span>{{theme === 'dark' ? '☀️' : '🌙'}}</span>

<!-- CSS Modules -->
<div class="{{$css.card}}">
<div class="{{$c('card', 'active')}}">

<!-- Translation -->
<span>{{t.nav.home}}</span>
```

Prop bindings pass JavaScript values (not strings) to child custom elements:

```html
<my-widget :count="localCount" :user="user"></my-widget>
```

---

## State management

The store is a `Proxy`-wrapped `EventTarget`. Changes fire `change` and `change:<key>` events.

```js
import store from '/lib/store.js';

// Read
store.get()           // full state snapshot
store.get('user')     // single key

// Write
store.set({ counter: 5, user: { name: 'Alice' } });
store.update('counter', n => n + 1);
store.toggle('sidebarOpen');
store.reset('counter');   // back to default
store.reset();            // all keys to defaults

// Subscribe (returns unsubscribe fn)
const unsub = store.on('counter', (value, oldValue) => {
  console.log('counter changed', value);
});
unsub();

// Built-in actions
store.toggleTheme();
store.login({ username: 'alice', email: 'alice@example.com' });
store.logout();
store.setMeta({ title: 'My Page' });
```

Components subscribe declaratively via `static store = ['key1', 'key2']` and re-render automatically when any subscribed key changes.

---

## i18n

Three locales are included: **English**, **Spanish**, **French**.

### In templates

`t` is the messages object for the current locale, injected into every component's props automatically:

```html
<a href="/" route>{{t.nav.home}}</a>
<button>{{t.auth.login}}</button>
<span>{{theme === 'dark' ? t.theme.light : t.theme.dark}}</span>
```

### In JavaScript

```js
import { t, setLocale, getLocale, initLocale } from '/lib/i18n.js';

t('nav.home')                         // → 'Home'
t('footer.copyright', { year: 2026 }) // → '© 2026 Web Components App'
setLocale('es');                       // async — fetches + updates store
getLocale();                           // → 'es'
```

### Adding a locale

1. Create `locales/de.json` following the same shape as `en.json`
2. Add `'de'` to the `SUPPORTED` array in `lib/i18n.js`
3. Add an `<option>` to `components/LanguageSwitch/LanguageSwitch.html`

### SSR locale detection

The dev/prod server reads `Accept-Language` headers and the `locale` cookie. The detected locale is used to pre-render the page in the correct language. The locale and messages are embedded in `window.__INITIAL_STATE__` so the client hydrates without a flash.

---

## Production build

```bash
yarn build
```

Output in `dist/client/`:

```
dist/client/
├── _assets/
│   ├── core.[hash].js      # Bundled framework (entry + all static imports)
│   └── globals.[hash].css  # Minified global CSS
├── _template.html           # SSR HTML shell
├── _manifest.json           # Build manifest
├── _worker.js               # Cloudflare Pages Worker
├── app/                     # Minified page components
├── components/              # Minified shared components
├── core/                    # Minified framework files
├── lib/                     # Minified utilities
├── locales/                 # Locale JSON files
└── routes.json
```

The **bundler** (`core/server/bundle.js`) traces all static `import` chains from `entry-client.js` and emits a single IIFE with a minimal module registry — eliminating 9+ separate module requests on the critical path. Dynamic `import()` calls (used by the router for route-level code splitting) are left intact with resolved paths.

The **minifier** (`core/server/minify.js`) uses a character-level tokenizer that correctly handles template literals, strings, regex literals, and comments. It produces ~35–50% size reductions without identifier mangling.

Assets get content-addressed filenames (`core.d6d6fad4.js`) for long-lived caching.

---

## HMR (Hot Module Replacement)

The dev server watches `app/`, `components/`, `core/`, and `lib/` with `fs.watch` (recursive). On change it sends a WebSocket message to all connected browsers with three possible strategies:

| Change | Strategy |
|---|---|
| `.css` file | Hot-swap — refetches stylesheet/globals without reload |
| `core/` or `lib/` file | Full reload (browser already cached the module) |
| Component or app file | Re-imports with `?t=` cache-bust, reconnects element; falls back to reload |

A 50ms debounce prevents duplicate triggers from editor temp-file writes.

---

## Navigation

Use the `route` attribute on `<a>` tags for client-side navigation (the Router intercepts clicks):

```html
<a href="/about" route>About</a>
```

From JavaScript:

```js
import { navigate, replace, back, getQuery, setQuery } from '/lib/nav.js';

navigate('/dashboard');
replace('/login?from=/dashboard');
back();
getQuery();                          // → { from: '/dashboard' }
setQuery({ tab: 'profile' });
```

Route lifecycle hooks on the Router:

```js
import Router from '/components/Router/Router.js';

Router.beforeEach = async (to, from) => {
  if (needsAuth(to.path) && !isLoggedIn()) return '/login';
};

Router.afterEach = (to, from) => analytics.track(to.path);
Router.onError = (err, to) => console.error(err);
```

---

## Deployment

### Cloudflare Pages

```bash
yarn deploy:cloudflare   # runs build then wrangler pages deploy
```

The Cloudflare Worker (`deploy/cloudflare/_worker.js`) handles SSR at the edge and delegates static assets to the Pages asset store.

### Netlify

Configure via `netlify.toml`. Static assets are served directly; all other requests hit the SSR Netlify Function in `deploy/netlify/`.

---

## Architecture notes

- **No virtual DOM.** Components re-render their shadow root's `innerHTML` directly. Focus state is preserved across re-renders by tracking `activeElement` before and restoring it after.
- **No hydration mismatch.** SSR uses [Declarative Shadow DOM](https://developer.chrome.com/docs/css-ui/declarative-shadow-dom) (`<template shadowrootmode="open">`). The browser attaches shadow roots before JS runs, so hydration is just event binding — the DOM is never replaced.
- **No build tool dependencies.** The bundler, minifier, WebSocket server, file watcher, and HTTP server are all implemented against Node.js built-ins (`node:fs`, `node:http`, `node:crypto`, `node:path`).
- **CSS Modules without PostCSS.** Class names are scoped by appending the element's tag name as a suffix (`.card` → `.card_my-widget`) via a regex pass at load time. The same transform runs server-side for SSR.
