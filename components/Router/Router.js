import { store, define, loadTemplate } from '../../core/component.js';
import { matchRoute, createMatcher } from '../../core/routes.js';
import { getQuery } from '../../lib/nav.js';

const getClass = mod => mod.default || Object.values(mod).find(v => typeof v === 'function');

/** Check auth and redirect to login if needed. Returns true if redirected. */
const checkAuth = (requiresAuth, path) => {
  if (requiresAuth && !store.get('isAuthenticated')) {
    history.replaceState(null, '', `/login?from=${encodeURIComponent(path)}`);
    return true;
  }
  return false;
};

export default class Router extends HTMLElement {
  routes = [];
  currentPath = null;
  loading = false;
  #preloaded = new Set();

  /** Route lifecycle hooks - set these to intercept navigation */
  static beforeEach = null; // async (to, from) => true | '/redirect' | false
  static afterEach = null;  // (to, from) => void
  static onError = null;    // (error, to) => void

  async connectedCallback() {
    this.outlet = this.querySelector('#outlet') || (this.innerHTML = '<div id="outlet"></div>', this.querySelector('#outlet'));

    try {
      const inlined = globalThis.__ROUTES__;
      const data = inlined || await (await fetch('/routes.json').then(r => r.ok ? r : fetch('/api/routes'))).json();
      this.routes = data.map(r => ({ ...r, matcher: r.dynamic ? createMatcher(r.path) : null }));
    } catch (e) {
      console.error('Failed to load routes:', e);
      this.outlet.innerHTML = '<h1>Failed to load app</h1>';
      return;
    }

    const notFound = this.routes.find(r => r.component === 'notfound-page');
    if (notFound) this.routes.push({ ...notFound, path: '*' });

    addEventListener('popstate', () => this.navigate());
    addEventListener('navigate', e => this.go(e.detail.path));
    document.addEventListener('click', e => {
      const a = e.composedPath().find(el => el.tagName === 'A' && el.hasAttribute?.('route'));
      if (a) { e.preventDefault(); this.go(a.getAttribute('href')); }
    });
    document.addEventListener('pointerover', e => {
      const a = e.target.closest?.('a[route]');
      if (!a) return;
      const href = a.getAttribute('href');
      if (this.#preloaded.has(href)) return;
      this.#preloaded.add(href);
      this.preload(href);
    });

    const page = this.outlet.firstElementChild;
    if (page?.shadowRoot) {
      // SSR content detected — hydrate without re-render or scroll reset.
      // We still must import the page module so customElements.define() runs
      // and upgrades the SSR'd element, otherwise mount()/bind() never fire.
      const route = matchRoute(this.routes, location.pathname);
      if (route) {
        if (checkAuth(route.route.requiresAuth, location.pathname)) return this.navigate();
        await import(route.route.module);
      }
      this.currentPath = location.pathname;
      this.hydrated = true;
    } else {
      this.navigate();
    }

  }

  go(path) { if (this.currentPath !== path) { history.pushState(null, '', path); this.navigate(); } }

  async preload(path) {
    const r = matchRoute(this.routes, path);
    if (!r) return;
    const Cls = getClass(await import(r.route.module));
    if (Cls?.templateUrl) loadTemplate(Cls.templateUrl);
  }

  async navigate() {
    const path = location.pathname;
    const from = this.currentPath;

    // beforeEach hook
    if (Router.beforeEach) {
      const result = await Router.beforeEach({ path, query: getQuery() }, from ? { path: from } : null);
      if (result === false) return;
      if (typeof result === 'string') {
        history.replaceState(null, '', result);
        return this.navigate();
      }
    }

    const result = matchRoute(this.routes, path);
    if (!result) {
      Router.onError?.(new Error('Route not found'), { path });
      return this.outlet.innerHTML = '<div class="error-page"><h1>404</h1><p>Page not found</p><a href="/" route>Go home</a></div>';
    }

    const { route, params } = result;
    this.loading = true;
    this.dispatchEvent(new CustomEvent('loading', { detail: { loading: true, path } }));

    try {
      if (checkAuth(route.requiresAuth, path)) return this.navigate();
      const Cls = getClass(await import(route.module));
      if (Cls?.templateUrl) await loadTemplate(Cls.templateUrl);

      const el = document.createElement(route.component);
      el.pageProps = { path, params, query: getQuery() };

      // Mount first — connectedCallback fires, shadow DOM is set up
      this.currentPath = path;
      scrollTo(0, 0);
      this.outlet.replaceChildren(el);

      // Yield one timer tick so connectedCallback's async template fetch
      // resolves through attachShadow + update(), populating the shadow DOM
      await new Promise(r => setTimeout(r, 0));

      // Now the shadow tree exists; wait for any nested custom elements to be defined
      await this.waitForComponents(el);

      // afterEach hook
      Router.afterEach?.({ path, params, query: getQuery() }, from ? { path: from } : null);
    } catch (e) {
      console.error('Navigation error:', e);
      Router.onError?.(e, { path });
      this.outlet.innerHTML = '<div class="error-page"><h1>Error</h1><p>Failed to load page</p><a href="/" route>Go home</a></div>';
    } finally {
      this.loading = false;
      this.dispatchEvent(new CustomEvent('loading', { detail: { loading: false, path } }));
    }
  }

  async waitForComponents(root, timeout = 3000) {
    const start = Date.now();
    const getPending = node => {
      const tags = [];
      if (node.tagName?.includes('-') && !customElements.get(node.tagName.toLowerCase())) {
        tags.push(node.tagName.toLowerCase());
      }
      if (node.shadowRoot) {
        let child = node.shadowRoot.firstChild;
        while (child) {
          if (child.nodeType === 1) tags.push(...getPending(child));
          child = child.nextSibling;
        }
      }
      let child = node.firstElementChild;
      while (child) {
        tags.push(...getPending(child));
        child = child.nextElementSibling;
      }
      return tags;
    };
    
    const check = async () => {
      const pending = [...new Set(getPending(root))];
      if (pending.length && Date.now() - start < timeout) {
        await Promise.all(pending.map(tag => customElements.whenDefined(tag)));
        return check();
      }
    };
    await check();
  }
}

define('app-router', Router);
