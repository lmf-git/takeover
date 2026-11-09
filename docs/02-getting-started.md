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
| `yarn preview`, `yarn start` | `NODE_ENV=production node core/server/index.js` | SSR from the build in `dist/`: hashed modules, the inlined bundle, no watcher. Run `yarn build` first; without one it warns and falls back to the source tree |
| `yarn test` | `node --test` | Unit tests for the template engine, minifier, routing and server helpers (`test/`) |
| `yarn preview:csr` | `node core/server/static.js` | Static server over `dist/client` with an SPA fallback, port 4399 |
| `yarn clean` | an inline `rm` of `dist/` | Delete build output |
| `yarn deploy:cloudflare` | `yarn build && wrangler pages deploy` | Build and upload to Cloudflare Pages (run `wrangler login` first) |

## Environment variables

| Variable | Read by | Default | Effect |
| --- | --- | --- | --- |
| `PORT` | `core/server/index.js`, `core/server/static.js` | 3000, 4399 | Listen port |
| `NODE_ENV=production` | `core/server/index.js`, `core/server/entry-server.js` | unset | No watcher or WebSocket; serves `dist/` when a build exists; `immutable` caching for hashed files and fonts, `no-cache` for everything else; no stack traces in error pages |
| `SSR_ROOT` | `core/server/entry-server.js` | repo root | Where SSR reads `app/`, `components/`, `locales/` and the config. The Netlify function sets it to `dist/server` |
| `CSR_ROOT` | `core/server/static.js` | `dist/client` | Folder the CSR preview serves |

## The dev loop

- **Saving a file under `app/`, `components/`, `core/`, `lib/` or `locales/` reloads the page**, and the reload is server-rendered from the new source: rendering runs in a worker thread that the watcher replaces after every change, so template, CSS and framework edits all show up immediately.
- **Saving `globals.css` swaps the stylesheet in place**, without a reload.
- **New pages and components need no restart**: route and tag tables are rebuilt on every change.
- **Config edits need a restart**: `app.config.yml` is read once per process. So do edits to the dev server itself (`core/server/index.js`, `http.js`, `ws.js`).

The dev server serves only `app/`, `components/`, `core/`, `lib/`, `locales/`, `globals.css` and `public/`; nothing else in the checkout is reachable by URL.

## Seeing real production output locally

To run what you deploy:

1. `yarn build`.
2. SSR on Node: `yarn start`, then open `http://localhost:3000`.
3. CSR target: `yarn preview:csr`, then open `http://localhost:4399`.
4. SSR on Cloudflare's runtime: `wrangler pages dev dist/client`.
5. SSR on Netlify's runtime: the Netlify CLI's `netlify serve`.

Steps 3 and 4 use the platforms' own CLIs and were not run for this guide.

---

[← Architecture](01-architecture.md) · [Index](README.md#contents) · [Project layout →](03-project-layout.md)
