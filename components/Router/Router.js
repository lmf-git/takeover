import { store, define, loadTemplate } from '../../core/component.js';
import { matchRoute, createMatcher } from '../../core/routes.js';

const getClass = mod => mod.default || Object.values(mod).find(v => typeof v === 'function');

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
    document.addEventListener('pointerenter', e => {
      const a = e.target.closest?.('a[route]');
      if (a) this.preload(a.getAttribute('href'));
    }, true);

    const page = this.outlet.firstElementChild;
    if (page?.shadowRoot) {
      const route = matchRoute(this.routes, location.pathname);
      if (route) {
        const Cls = getClass(await import(route.route.module));
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

  go(path) { if (this.currentPath !== path) { history.pushState(null, '', path); this.navigate(); } }

  async preload(path) {
    const r = matchRoute(this.routes, path);
    if (!r) return;
    const Cls = getClass(await import(r.route.module));
    if (Cls?.templateUrl) loadTemplate(Cls.templateUrl);
  }

  async navigate() {
    const path = location.pathname, result = matchRoute(this.routes, path);
    if (!result) return this.outlet.innerHTML = '<h1>404</h1>';

    const { route, params } = result;
    const Cls = getClass(await import(route.module));

    if (Cls?.requiresAuth && !store.get('isAuthenticated')) {
      history.replaceState(null, '', `/login?from=${encodeURIComponent(path)}`);
      return this.navigate();
    }

    if (Cls?.templateUrl) await loadTemplate(Cls.templateUrl);

    const el = document.createElement(route.component);
    el.pageProps = { path, params, query: Object.fromEntries(new URLSearchParams(location.search)) };

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
    const getPending = el => el.shadowRoot ? [...el.shadowRoot.querySelectorAll('*')].flatMap(getPending) : el.tagName?.includes('-') ? [el] : [];
    while (getPending(root).length && Date.now() - start < timeout) await new Promise(r => setTimeout(r, 10));
  }
}

define('app-router', Router);
