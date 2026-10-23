# Routing and navigation

URLs map to folders under `app/`, and `<app-router>` swaps pages into its `#outlet` on the client using the same route table the server used.

## Folder to route

| File | Route | Page tag |
| --- | --- | --- |
| `app/Home/Home.html` | `/` | `home-page` |
| `app/About/About.html` | `/about` | `about-page` |
| `app/Blog/Post/Post.html` | `/blog/post` | `post-page` |
| `app/Users/[id]/User/User.html` | `/users/:id/user` | `user-page` |
| `app/NotFound/NotFound.html` | `/notfound`, plus `*` with status 404 | `notfound-page` |
| `app/_Layout/_Layout.html` | none: the root shell | `app-layout` |

The rules live in `pathFromFile()` (`core/routes.js`): segments are lowercased, a last segment that repeats its folder is dropped, `[name]` becomes `:name`, `/home` becomes `/`, and anything starting with `_` is skipped. Routes whose **last** segment is a parameter don't fit: `app/Items/[slug]/[slug].html` yields `/items/:slug/:slug` and an invalid tag. Give dynamic routes a static last segment, as in `/users/:id/user` (details in [Gotchas](11-gotchas.md#rendering)).

`matchRoute()` strips a trailing slash, tries exact static paths, then dynamic patterns in scan order (each `:param` matches `[^/]+`, URI-decoded), then the `*` route that `withNotFound()` clones from `notfound-page`. Every host and the client call `withNotFound()`, so a 404 renders the same page everywhere.

## A page file

```html
<!-- app/Pricing/Pricing.html -->
<style>:host { display: block; }</style>
<h1>Pricing</h1>
<p>{{tagline}}</p>

<script>
import { Component, define } from '/core/component.js';  // root-absolute: required in production

export default class PricingPage extends Component {
  static templateUrl = '/app/Pricing/Pricing.html';
  static metadata = { title: 'Pricing', description: 'Plans and prices.' };
  static local = { tagline: 'Simple plans' };  // seen by SSR and by the client
}

define('pricing-page', PricingPage);
</script>
```

In dev the inline script is served as `/app/Pricing/Pricing.html?script`; the build emits it as `Pricing.script.<hash>.js`. A separate `Pricing.js` works too, which is how `NotFound` is written. Page statics must be literal object expressions, because SSR finds them with a regex and `eval`s the braces.

## The Router element

`<app-router>` sits inside `<main>` in `app/_Layout/_Layout.html`. On connect it:

1. Reads routes from `window.__ROUTES__` (falling back to `/routes.json`, then `/api/routes`) and adds the NotFound fallback.
2. Listens for `popstate`, the window `navigate` event, and document clicks. Clicks are resolved through `composedPath()`, so `<a href="/x" route>` works inside any shadow root.
3. Hydrates: if `#outlet` already holds a server-rendered page, it imports that page's module and stops; otherwise it navigates.

A client navigation runs `beforeEach`, matches the route, checks `requiresAuth`, imports the page module, creates the page element with `pageProps = { path, params, query }`, scrolls to the top, replaces the outlet's children, waits up to 3 s for nested custom elements to be defined, then calls `afterEach`. The router element dispatches `loading` events (`detail: { loading, path }`) around each navigation.

## Navigating from code

```js
import { navigate, replace, setQuery, getQueryParam, buildUrl, isActive, parseParams } from '/lib/nav.js';

navigate('/pricing');              // pushState and render, via a window 'navigate' event
replace('/login?from=/pricing');   // replaceState and render
setQuery({ plan: 'annual' });      // merge into the query string; null deletes a key
getQueryParam('plan');             // 'annual'
buildUrl('/search', { q: 'dsd' }); // '/search?q=dsd'
isActive('/blog');                 // true on /blog and /blog/*
parseParams('/users/:id/user', location.pathname);   // { id: '42' }
```

Links use `<a href="/pricing" route>`; a link without `route` does a full page load. `lib/nav.js` never imports the Router: `navigate()` only dispatches the event the Router listens for.

## Hooks and guards

```js
import Router from '/components/Router/Router.js';
import store from '/lib/store.js';

Router.beforeEach = async (to, from) => {   // to = { path, query }
  if (to.path.startsWith('/admin') && !store.get('isAuthenticated')) return '/login';
  // false cancels, a string redirects, anything else continues
};
Router.afterEach = (to, from) => {};        // to = { path, params, query }
Router.onError = (error, to) => {};
```

Set hooks in a module that loads before the first navigation, such as `app/_Layout/_Layout.js`. `static requiresAuth = true` on a page redirects to `/login?from=<path>` when `store.get('isAuthenticated')` is falsy, both in the Router and in SSR. The repo has no login page and no auth state, so you supply both; SSR cannot see client-side auth, so a protected page always redirects on a direct load.

## In-page anchors

Section ids live inside shadow roots, where the browser's native `#hash` jump can't reach them. The Router intercepts clicks on `a[href^="#"]` and calls `scrollToHash()`, which searches every shadow root, smooth-scrolls, and re-aims up to twice if lazy sections above the target grow meanwhile. Back and forward between fragments of the same page scroll instead of re-rendering.

---

[← State and i18n](07-state-and-i18n.md) · [Index](README.md#contents) · [Build and deployment →](09-build-and-deploy.md)
