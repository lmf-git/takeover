# Gotchas

What is left is behaviour to know about rather than bugs to work around. The two deployment rows describe fixes that are in the repo but could not be exercised here, because they depend on the hosting platform.

## Development

| Symptom | Cause | Fix |
| --- | --- | --- |
| An edit to `app.config.yml`, or to the dev server's own files (`core/server/index.js`, `http.js`, `ws.js`), changes nothing | Both are loaded once by the server process. Everything the renderer imports — `app/`, `components/`, `core/`, `lib/`, `locales/` — is picked up live | Restart `yarn dev` |

## Rendering

| Symptom | Cause | Fix |
| --- | --- | --- |
| Literal `{{…}}` in the page | By design: an expression that evaluates to `undefined` is left as written, so a missing key or message is visible instead of silently blank | Check the [props table](06-templates-and-styling.md#what-a-template-can-see); give optional values a default, as in `{{subtitle \|\| ''}}` |
| Handlers fire twice after a re-render | `mount()` runs after every `update()`, so raw `addEventListener` calls on long-lived targets (the shadow root, `window`) pile up | Register listeners with `this.on()` or `this.delegate()`, which are dropped with the render that added them |
| A nested component shows a page's `local` value on first paint, then loses it | On the server a nested component inherits the page's props; on the client it sees only the store and its own `local` | Pass data down through the store or a `:prop` binding |
| A `requiresAuth` page always redirects on a direct load | No `auth.cookie` is configured, so SSR has no way to tell a signed-in visitor | Set `auth.cookie` in `app.config.yml` ([Hooks and guards](08-routing-and-navigation.md#hooks-and-guards)) |

## Deployment

| Symptom | Cause | Fix |
| --- | --- | --- |
| Netlify serves `/` client-rendered | `dist/client/index.html` is the CSR shell, and Netlify serves an existing file before a non-forced rewrite. `netlify.toml` now forces `/` through the SSR function, but that rule has not been run on Netlify from here | After a deploy, check the HTML of `/` for `shadowrootmode` |
| Cloudflare serves hashed files without long-lived caching | The worker (`deploy/cloudflare/_worker.js`) sets `immutable` on hashed modules and fonts it passes through from `env.ASSETS`; not run on Cloudflare from here | After a deploy, check the `Cache-Control` of a file under `/app/` |

---

[← Recipes](10-recipes.md) · [Index](README.md#contents) · [Reference →](12-reference.md)
