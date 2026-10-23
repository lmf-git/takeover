# Reference

Lookup tables for configuration, globals, exports, dev endpoints and the numbers that shape behaviour; commands and environment variables are in [Getting started](02-getting-started.md).

## `app.config.yml`

| Key | When omitted | Notes |
| --- | --- | --- |
| `locales.supported` | Every `locales/*.json`, sorted | Any non-list value, such as `auto`, also discovers |
| `locales.default` | The first supported locale | Ignored unless it is in `supported` |
| `preload.fonts` | None | A list of URLs, or `auto` for every `public/fonts/*.woff2` |
| `preload.modules` | None | Extra `modulepreload` links, dev server only |

`core/config.js` parses a YAML subset (nested maps, block and inline lists, scalars, comments) and caches the result per process. `app.config.yaml` also works; with neither file, everything is discovered.

## Window globals

| Global | Set by | Holds |
| --- | --- | --- |
| `__INITIAL_STATE__` | SSR per request; the CSR shell at build | Store snapshot: `meta`, `locale`, `messages` |
| `__LOCALES__` | Same | Every supported catalogue except the active one |
| `__LOCALE_CONFIG__` | Same | `{ supported, default }` |
| `__ROUTES__` | Dev server; build | The route table |
| `__TAGS__` | Dev server; build | Tag-to-folder registry |
| `__M__` | Build | Original module URL to hashed URL |
| `__r`, `__m` | Core bundle | The bundle's `require` and module map |
| `__store__` | `lib/store.js` | The store instance |

A route entry is `{ path, component, module, dynamic, matcher }`, plus `metadata`, `ssrProps` and `requiresAuth` in the build's `routes.json`. In dev, `module` is `/app/<Name>/<Name>.html?script`; in production it is the hashed `.script.<hash>.js` or `.<hash>.js` file.

## `lib/` exports

| Module | Exports |
| --- | --- |
| `lib/store.js` | `default` store, with `store.setMeta()` |
| `lib/i18n.js` | `setLocale`, `initLocale`, `t`, `getLocale`, `getSupportedLocales` |
| `lib/nav.js` | `navigate`, `replace`, `back`, `forward`, `redirectToLogin`, `scrollToHash`, `getQuery`, `getQueryParam`, `setQuery`, `buildUrl`, `isActive`, `parseParams`, and a default object of all of them |
| `lib/meta.js` | `setTitle`, `setMeta`, `setMetas`, `setCanonical`, `setPageMeta`, `setStructuredData`, `createBreadcrumb` |
| `lib/validate.js` | `validate`, `validateAll`, `createValidator`, `addValidator`, `patterns`; rules `required`, `email`, `url`, `phone`, `min`, `max`, `minValue`, `maxValue`, `pattern`, `match`, `oneOf` |
| `lib/async.js` | `debounce`, `throttle`, `delay`, `retry`, `timeout`, `parallel`, `deferred`, `once`, `memoize` |
| `lib/index.js` | Re-exports all of the above except `scrollToHash` and the i18n functions |

Only `store`, `i18n`, `nav` and `meta` are in the core bundle; see [Gotchas](11-gotchas.md#production-build) before importing the others statically from lazy modules.

## `core/` exports

| Module | Exports |
| --- | --- |
| `core/component.js` | `Component`, `define`, `navigate`, `loadTemplate`, `scopeCSS`, `store` |
| `core/template.js` | `renderWithExpressions`, `render`, `extractPropBindings`, `evaluatePropBindings`, `escapeHtml` |
| `core/context.js` | `Store` |
| `core/routes.js` | `createMatcher`, `pathFromFile`, `withNotFound`, `matchRoute` |
| `core/tags.js` | `DEFINE_RE`, `pascalFor`, `fallbackDir`, `dirForTag`, `baseName`, `pathsForTag` |
| `core/locale.js` | `rankLanguages`, `localeFromCookie`, `negotiateLocale` |
| `core/scan.js` (Node) | `scanDir`, `scanTags`, `scanRoutes` |
| `core/config.js` (Node) | `loadConfig` |
| `core/server/ssr.js` | `createRenderer({ loadFile, resolvePaths })` |
| `core/server/entry-server.js` (Node) | `render(url, { locale })`, `getClientRoutes()` |
| `core/server/bundle.js` | `bundle(entry, root, { minify, transform })`, `getDeps` |
| `core/server/minify.js` | `minifyJS`, `minifyCSS` |
| `core/server/ws.js` | `WebSocketServer` |

## Dev server endpoints

| Request | Response |
| --- | --- |
| `/routes.json`, `/api/routes` | The scanned route table |
| `<file>.html?script` | The file's inline `<script>`, or its sibling `.js`, as JavaScript |
| `<file>?raw` | `export default "<file contents>"` |
| A missing `<name>.js` | The sibling `<name>.html`'s inline script |
| A missing `.css` | An empty 200 |
| Any other path with an extension | The file from the repo root, then `public/`, else 404 |
| Everything else | SSR |

## Numbers

| Thing | Value |
| --- | --- |
| Core bundle | 17 modules, 59.9 KB minified, inline in every HTML response |
| SSR HTML for `/` (dev, unminified) | 172 KB |
| `_template.html`, CSR `index.html` | 68 KB, 76 KB |
| Production build time | 0.1 to 0.3 s |
| Nested render passes | 50 at most |
| `{{#if}}` blocks per render | 10 at most |
| Router wait for nested elements | 3 s |
| Lazy-load root margin | 200 px |
| Loader start | After `load`, in an idle callback with a 500 ms timeout |
| Watcher debounce | 50 ms per file |
| Locale cookie | `locale`, one year, `SameSite=Lax` |

---

[← Gotchas](11-gotchas.md) · [Index](README.md#contents)
