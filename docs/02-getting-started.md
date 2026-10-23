# Getting started

You need Node and nothing else: there are no packages to install, so `yarn dev` serves the site at `http://localhost:3000` straight from source.

```bash
git clone <your-remote> takeover && cd takeover
yarn dev        # or: npm run dev, or: node core/server/index.js
```

The README asks for Node 18 or newer. On Linux use Node 20+, because the dev server relies on recursive `fs.watch`, which older Linux builds of Node reject. Yarn (configured by `.yarnrc.yml`) is only a script runner here.

## Commands

| Command | Runs | Use it for |
| --- | --- | --- |
| `yarn dev` | `node core/server/index.js` | SSR from source, file watcher, WebSocket live reload, port 3000 |
| `yarn build` | `node core/server/build.js` | Production build into `dist/client` and `dist/server` |
| `yarn preview`, `yarn start` | `NODE_ENV=production node core/server/index.js` | The same server without the watcher and with year-long cache headers. It serves the **source tree**, not `dist/` |
| `yarn preview:csr` | `node core/server/static.js` | Static server over `dist/client` with an SPA fallback, port 4399 |
| `yarn clean` | an inline `rm` of `dist/` | Delete build output |
| `yarn deploy:cloudflare` | `yarn build && wrangler pages deploy` | Build and upload to Cloudflare Pages (run `wrangler login` first) |

## Environment variables

| Variable | Read by | Default | Effect |
| --- | --- | --- | --- |
| `PORT` | `core/server/index.js`, `core/server/static.js` | 3000, 4399 | Listen port |
| `NODE_ENV=production` | `core/server/index.js`, `core/server/entry-server.js` | unset | No watcher or WebSocket; `Cache-Control: public, max-age=31536000` on every non-HTML file; page module URLs looked up in `_assets-manifest.json` |
| `SSR_ROOT` | `core/server/entry-server.js` | repo root | Where SSR reads `app/`, `components/`, `locales/` and the config. The Netlify function sets it to `dist/server` |
| `CSR_ROOT` | `core/server/static.js` | `dist/client` | Folder the CSR preview serves |

## The dev loop, as it actually behaves

- **Saving a `.js` or `.html` file reloads the page.** The watcher sends an `update` message, the client's hot re-import fails, and it falls back to `location.reload()` (details in [Gotchas](11-gotchas.md#dev-server)).
- **The reloaded page can still show old markup.** `core/server/ssr.js` caches templates and CSS per tag for the life of the process, so template and CSS edits reach server-rendered HTML only after you restart `yarn dev`.
- **Saving `*.module.css` or `globals.css` does nothing.** Restart and reload.
- **New pages and components need no restart**: route and tag tables are rebuilt on every change.
- **Config edits need a restart**: `app.config.yml` is read once per process.

Practical rule: keep `yarn dev` running for logic changes; restart it after template, CSS or config edits.

## Seeing real production output locally

`yarn preview` does not serve the build. To run what you deploy:

1. `yarn build`.
2. CSR target: `yarn preview:csr`, then open `http://localhost:4399`.
3. SSR on Cloudflare's runtime: `wrangler pages dev dist/client`.
4. SSR on Netlify's runtime: the Netlify CLI's `netlify serve`.

Steps 3 and 4 use the platforms' own CLIs and were not run for this guide.

---

[← Architecture](01-architecture.md) · [Index](README.md#contents) · [Project layout →](03-project-layout.md)
