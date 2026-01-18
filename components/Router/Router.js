import { store, matchRoute, createMatcher, define } from '../../core/index.js';

export default class Router extends HTMLElement {
  routes = [];
  currentPath = null;

  async connectedCallback() {
    // Check for SSR content
    const existingOutlet = this.querySelector('#outlet');
    if (existingOutlet) {
      this.outlet = existingOutlet;
    } else {
      this.innerHTML = '<div id="outlet"></div>';
      this.outlet = this.querySelector('#outlet');
    }

    // Fetch routes from server
    const routes = await fetch('/api/routes').then(r => r.json());
    this.routes = routes.map(r => ({
      ...r,
      matcher: r.dynamic ? createMatcher(r.path) : null
    }));

    // Add 404 wildcard
    const notFound = this.routes.find(r => r.component === 'notfound-page');
    if (notFound) this.routes.push({ ...notFound, path: '*', dynamic: false, matcher: null });

    addEventListener('popstate', () => this.navigate());
    addEventListener('navigate', e => this.go(e.detail.path));
    document.addEventListener('click', e => {
      const a = e.composedPath().find(el => el.tagName === 'A' && el.hasAttribute?.('route'));
      if (a) { e.preventDefault(); this.go(a.getAttribute('href')); }
    });

    // Skip initial navigation if SSR page already exists (has shadow root from DSD)
    const existingPage = this.outlet.firstElementChild;
    if (existingPage?.shadowRoot) {
      this.currentPath = location.pathname;
      console.log('[Router] SSR page detected, skipping initial navigation');
    } else {
      this.navigate();
    }
  }

  go(path) {
    if (this.currentPath !== path) {
      history.pushState(null, '', path);
      this.navigate();
    }
  }

  async navigate() {
    const path = location.pathname;
    console.log(`[Router] Navigating to: ${path}`);
    const result = matchRoute(this.routes, path);

    if (!result) {
      console.log(`[Router] No route match for: ${path}`);
      this.outlet.innerHTML = '<h1>404</h1>';
      return;
    }

    const { route, params } = result;
    console.log(`[Router] Matched route:`, route.path, route.module);

    // Dynamically import the page module
    const mod = await import(route.module);
    console.log(`[Router] Page module loaded:`, route.component);
    const ComponentClass = mod.default || Object.values(mod).find(v => typeof v === 'function');

    // Check auth
    if (ComponentClass?.requiresAuth && !store.get('isAuthenticated')) {
      history.replaceState(null, '', `/login?from=${encodeURIComponent(path)}`);
      return this.navigate();
    }

    this.currentPath = path;
    scrollTo(0, 0);

    const el = document.createElement(route.component);
    el.pageProps = { path, params, query: Object.fromEntries(new URLSearchParams(location.search)) };
    this.outlet.replaceChildren(el);
  }
}

define('app-router', Router);
