# Recipes

Each recipe lists every file to touch, in order; none needs a configuration change unless it says so.

## Add a page

1. Create `app/Pricing/Pricing.html` with markup, a `<style>` block and an inline `<script>` that imports from `/core/component.js`, sets `static templateUrl = '/app/Pricing/Pricing.html'` and a literal `static metadata`, and ends with `define('pricing-page', PricingPage)`. The full file is in [Routing and navigation](08-routing-and-navigation.md#a-page-file).
2. Link to it with `<a href="/pricing" route>Pricing</a>`.
3. For a sitemap, set `site.url` in `app.config.yml`: the build then writes `sitemap.xml` with every static route, this one included.

## Add a component

1. Create `components/PriceTable/PriceTable.html` and `PriceTable.js` ending in `define('price-table', PriceTable)`.
2. Use `<price-table></price-table>` in a template, written empty.
3. Choose how its JS loads: do nothing (after `load`), add `loading="lazy"` (below the fold), or import it in `core/server/entry-client.js` (above the fold and interactive at once).
4. Keep its static imports to modules in the core bundle: `/core/component.js`, `/core/template.js`, `/core/context.js`, `/core/routes.js`, `/core/tags.js`, `/lib/store.js`, `/lib/i18n.js`, `/lib/nav.js`, `/lib/meta.js` and the eager components. For anything else, use `await import('/lib/validate.js')` or import it from an eager module.

## Show data in a server-rendered component

SSR renders nested components with the page's props, so put the data in the store or in the page's `local` and reference it by name in the component's template. For per-instance values, render that markup in the parent template, or fill it in client-side from `mount()`.

## Style with a CSS Module

1. Create `components/PriceTable/PriceTable.module.css` with `.row { … }`.
2. Write `class="{{$css.row}}"` in the template and `this.cx('row', { active: on })` in JS.
3. Keep the sheet's comments free of dotted words and keep `url()` out of it.

## Add a dynamic route

1. Create `app/Users/[id]/Profile/Profile.html` defining `profile-page`; the route is `/users/:id/profile`.
2. Read `{{params.id}}` in the template for SSR, and `this.pageProps?.params.id` in JS after a client navigation.
3. A hydrated page has no `pageProps`; recover values with `parseParams('/users/:id/profile', location.pathname)` and keep them in `local` so re-renders don't lose them.

## Protect a route

1. Keep auth in the store: `store.set({ isAuthenticated: true, user })` after login.
2. Add `static requiresAuth = true` to the page, or set `Router.beforeEach` in an eagerly loaded module such as `app/_Layout/_Layout.js`.
3. Create `app/Login/Login.html` (`login-page`); guards send users to `/login?from=…`, readable as `{{redirectFrom}}` in SSR or `getQueryParam('from')` in JS.
4. Expect SSR to redirect every direct load of a protected page until the adapters learn to read a session cookie.

## Add shared actions

1. Create `lib/session.js` exporting functions that call `store.set(…)`.
2. Import it from an eager module, for example `components/Navigation/Navigation.js`, so it lands in the core bundle and lazy components may import it statically.
3. Subscribe components with `static store = ['user']`.

## Change what loads first

Edit the imports at the top of `core/server/entry-client.js`. Whatever is imported there ships inline in every HTML response; whatever you remove is imported by the loader after `load`. For the dev server you can also list modulepreloads under `preload.modules` in `app.config.yml`.

## Preload a font

Put the `woff2` in `public/fonts/`, declare it with `@font-face` and `font-display: swap` in `globals.css`, and list it under `preload.fonts` in `app.config.yml`. Preload only faces used above the fold.


## Deploy

- **Netlify**: connect the repository; `netlify.toml` already sets the build command, `dist/client` and the function.
- **Cloudflare Pages**: run `wrangler login` once, then `yarn deploy:cloudflare`.
- **Static host**: run `yarn build`, upload `dist/client`, and rewrite unknown paths to `/index.html`.

---

[← Build and deployment](09-build-and-deploy.md) · [Index](README.md#contents) · [Gotchas →](11-gotchas.md)
