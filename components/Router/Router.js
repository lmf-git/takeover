import { store, define, loadTemplate } from '../../core/component.js';
import { matchRoute, createMatcher } from '../../core/routes.js';
import { getQuery } from '../../lib/nav.js';

const getClass = mod => mod.default || Object.values(mod).find(v => typeof v === 'function');

/** Check auth and redirect to login if needed. Returns true if redirected. */
const checkAuth = (Cls, path) => {
  if (Cls?.requiresAuth && !store.get('isAuthenticated')) {
    history.replaceState(null, '', `/login?from=${encodeURIComponent(path)}`);
    return true;
  }
  return false;
};

export default class Router extends HTMLElement {
  routes = [];
  currentPath = null;
  loading = false;

  /** Route lifecycle hooks - set these to intercept navigation */
  static beforeEach = null; // async (to, from) => true | '/redirect' | false
  static afterEach = null;  // (to, from) => void
  static onError = null;    // (error, to) => void

  async connectedCallback() {
    this.outlet = this.querySelector('#outlet') || (this.innerHTML = '<div id="outlet"></div>', this.querySelector('#outlet'));

    try {
      let res = await fetch('/routes.json');
      if (!res.ok) res = await fetch('/api/routes');
      this.routes = (await res.json()).map(r => ({ ...r, matcher: r.dynamic ? createMatcher(r.path) : null }));
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
    document.addEventListener('pointerenter', e => {
      const a = e.target.closest?.('a[route]');
      if (a) this.preload(a.getAttribute('href'));
    }, true);

    const page = this.outlet.firstElementChild;
    if (page?.shadowRoot) {
      // SSR content detected - hydrate without re-render or scroll reset
      const route = matchRoute(this.routes, location.pathname);
      if (route) {
        const Cls = getClass(await import(route.route.module));
        if (checkAuth(Cls, location.pathname)) return this.navigate();
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
      const Cls = getClass(await import(route.module));
      if (checkAuth(Cls, path)) return this.navigate();
      if (Cls?.templateUrl) await loadTemplate(Cls.templateUrl);

      const el = document.createElement(route.component);
      el.pageProps = { path, params, query: getQuery() };

      const staging = document.createElement('div');
      staging.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none';
      document.body.appendChild(staging);
      staging.appendChild(el);
      await this.waitForComponents(el);
      staging.remove();

      this.currentPath = path;
      scrollTo(0, 0);
      this.outlet.replaceChildren(el);

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
    const getPending = el => el.shadowRoot ? [...el.shadowRoot.querySelectorAll('*')].flatMap(getPending) : el.tagName?.includes('-') ? [el] : [];
    while (getPending(root).length && Date.now() - start < timeout) await new Promise(r => setTimeout(r, 10));
  }
}

define('app-router', Router);
