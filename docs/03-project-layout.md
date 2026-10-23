# Project layout

You work in `app/`, `components/` and `locales/`, tune the framework through `app.config.yml` and `globals.css`, and leave `core/` alone so it can be dropped into the next project unchanged.

| Path | What it holds | Edit it? |
| --- | --- | --- |
| `app/` | Pages. A folder `Name/` holding `Name.html` (plus an optional `Name.js`) is a route | Yes |
| `app/_Layout/` | `<app-layout>`, the shell around every page; the `_` keeps it out of routing | Yes |
| `app/NotFound/` | `<notfound-page>`, rendered with status 404 for unmatched URLs | Yes |
| `components/` | Shared custom elements, one folder each | Yes |
| `components/Router/` | `<app-router>`: client navigation and the `#outlet` pages render into | Rarely |
| `locales/*.json` | One message catalogue per language (`en`, `es`, `fr`) | Yes |
| `public/` | Files served from the site root: `/fonts/*`, `/logo.svg`, `robots.txt`, `sitemap.xml` | Yes |
| `globals.css` | Design tokens, `@font-face`, reset; inlined into every HTML response | Yes |
| `index.html` | HTML shell with five placeholder comments the server fills | Occasionally |
| `app.config.yml` | Supported locales, default locale, critical-path preloads | Yes |
| `lib/` | App-level modules: store instance, i18n, navigation, head meta, validation, async helpers | Add to it |
| `core/` | Framework: `Component`, templates, `Store`, routing, tags, loader, scanner, config | Avoid |
| `core/server/` | Dev server, SSR renderer, entries, build, bundler, minifier, WebSocket, static server | Avoid |
| `core/server/entry-client.js` | Browser entry; lists the components bundled for first paint | When changing what loads first |
| `deploy/` | Netlify function and Cloudflare worker | Rarely |
| `dist/` | Build output, git-ignored | Never by hand |
| `README.md`, `EXPLAINER.md` | The older manual and internals notes | Keep in sync |

`core/server/entry-client.js` is the one file in `core/` that names project components, and `lib/store.js` hardcodes `es` as the store's default locale. Everything else project-specific is discovered or read from config.

## Naming rules the code relies on

- **File stem = folder name.** `components/Footer/Footer.html`, never `components/Footer/index.html`. SSR and the loader build file names from the folder.
- **Tags are lowercase letters and hyphens.** Discovery accepts digits, but the SSR and prop-binding regexes match `[a-z]+-[a-z-]+`, so `<x-2col>` is never server-rendered.
- **A page's tag is its lowercased file stem plus `-page`**, with no hyphenation: `app/AboutUs/AboutUs.html` must call `define('aboutus-page', …)`. The Router creates exactly that tag.
- **Only the Router loads `*-page` tags**; the component loader skips them.
- **A leading `_` hides a folder or file from routing**, but not from tag discovery (that is how `app/_Layout` still registers `<app-layout>`).

---

[← Getting started](02-getting-started.md) · [Index](README.md#contents) · [Lifecycle →](04-lifecycle.md)
