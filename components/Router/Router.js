import template from './Router.html?raw';
import { store, renderWithExpressions, buildRoutesFromGlob, matchRoute } from '../../core/index.js';

class Router extends HTMLElement {
  routes = [];
  currentPath = null;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this.shadowRoot.innerHTML = template;
    this.outlet = this.shadowRoot.querySelector('#outlet');

    this.routes = buildRoutesFromGlob(
      import.meta.glob('../../app/**/*.html', { query: '?raw', import: 'default' }),
      '../../app/'
    );

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

    if (route.requiresAuth && !store.get('isAuthenticated')) {
      history.replaceState(null, '', `/login?from=${encodeURIComponent(path)}`);
      return this.navigate();
    }

    this.currentPath = path;
    scrollTo(0, 0);
    store.set({ lastRoute: path });

    if (!route.loaded && route.loader) {
      await this.loadDynamic(route);
    }

    const el = document.createElement(route.component);
    el.pageProps = {
      path,
      params,
      query: Object.fromEntries(new URLSearchParams(location.search)),
      ...store.get()
    };

    this.outlet.replaceChildren(el);
  }

  async loadDynamic(route) {
    if (customElements.get(route.component)) {
      route.loaded = true;
      return;
    }

    const html = await route.loader();

    customElements.define(route.component, class extends HTMLElement {
      pageProps = {};

      constructor() {
        super();
        this.attachShadow({ mode: 'open' });
      }

      connectedCallback() {
        this.shadowRoot.innerHTML = renderWithExpressions(html, this.pageProps);
        this.shadowRoot.addEventListener('click', e => {
          const a = e.target.closest('a[route]');
          if (a) { e.preventDefault(); dispatchEvent(new CustomEvent('navigate', { detail: { path: a.getAttribute('href') } })); }
        });
      }
    });

    route.loaded = true;
  }
}

customElements.define('app-router', Router);
