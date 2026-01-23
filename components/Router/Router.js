import { store, matchRoute, createMatcher, define, loadTemplate } from '../../core/index.js';

export default class Router extends HTMLElement {
  routes = [];
  currentPath = null;

  async connectedCallback() {
    this.outlet = this.querySelector('#outlet') || (this.innerHTML = '<div id="outlet"></div>', this.querySelector('#outlet'));

    let res = await fetch('/routes.json');
    if (!res.ok) res = await fetch('/api/routes');
    this.routes = (await res.json()).map(r => ({ ...r, matcher: r.dynamic ? createMatcher(r.path) : null }));

    const notFound = this.routes.find(r => r.component === 'notfound-page');
    if (notFound) this.routes.push({ ...notFound, path: '*' });

    addEventListener('popstate', () => this.navigate());
    addEventListener('navigate', e => this.go(e.detail.path));
    document.addEventListener('click', e => {
      const a = e.composedPath().find(el => el.tagName === 'A' && el.hasAttribute?.('route'));
      if (a) { e.preventDefault(); this.go(a.getAttribute('href')); }
    });

    const page = this.outlet.firstElementChild;
    if (page?.shadowRoot) {
      const route = matchRoute(this.routes, location.pathname);
      if (route) {
        const mod = await import(route.route.module);
        const Cls = mod.default || Object.values(mod).find(v => typeof v === 'function');
        if (Cls?.requiresAuth && !store.get('isAuthenticated')) {
          history.replaceState(null, '', `/login?from=${encodeURIComponent(location.pathname)}`);
          return this.navigate();
        }
      }
      this.currentPath = location.pathname;
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
    const result = matchRoute(this.routes, path);
    if (!result) return this.outlet.innerHTML = '<h1>404</h1>';

    const { route, params } = result;
    const mod = await import(route.module);
    const Cls = mod.default || Object.values(mod).find(v => typeof v === 'function');

    if (Cls?.requiresAuth && !store.get('isAuthenticated')) {
      history.replaceState(null, '', `/login?from=${encodeURIComponent(path)}`);
      return this.navigate();
    }

    if (Cls?.templateUrl) await loadTemplate(Cls.templateUrl);

    const el = document.createElement(route.component);
    el.pageProps = { path, params, query: Object.fromEntries(new URLSearchParams(location.search)) };

    // Render offscreen, wait for nested components, then show
    const staging = document.createElement('div');
    staging.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none';
    document.body.appendChild(staging);
    staging.appendChild(el);
    await this.waitForComponents(el);
    staging.remove();

    this.currentPath = path;
    scrollTo(0, 0);
    this.outlet.replaceChildren(el);
  }

  async waitForComponents(root, timeout = 3000) {
    const start = Date.now();
    const getPending = el => {
      const all = [el, ...(el.shadowRoot?.querySelectorAll('*') || [])];
      const nested = all.filter(e => e.shadowRoot).flatMap(e => getPending(e));
      return [...all.filter(e => e.tagName?.includes('-') && !e.shadowRoot), ...nested];
    };
    while (getPending(root).length && Date.now() - start < timeout)
      await new Promise(r => setTimeout(r, 10));
  }
}

define('app-router', Router);
