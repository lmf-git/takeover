import template from './Router.html?raw';
import { store, matchRoute, createMatcher } from '../../core/index.js';

class Router extends HTMLElement {
  routes = [];
  currentPath = null;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  async connectedCallback() {
    this.shadowRoot.innerHTML = template;
    this.outlet = this.shadowRoot.querySelector('#outlet');

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

    this.navigate();
  }

  go(path) {
    if (this.currentPath !== path) {
      history.pushState(null, '', path);
      this.navigate();
    }
  }

  async navigate() {
    const path = location.pathname;
    const result = matchRoute(this.routes, path);

    if (!result) {
      this.outlet.innerHTML = '<h1>404</h1>';
      return;
    }

    const { route, params } = result;

    // Dynamically import the page module
    const mod = await import(route.module);
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

customElements.define('app-router', Router);
