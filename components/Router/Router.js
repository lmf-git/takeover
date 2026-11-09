import { store, define, loadTemplate } from '../../core/component.js';
import { matchRoute, createMatcher, withNotFound } from '../../core/routes.js';
import { scrollToHash } from '../../lib/nav.js';

const getClass = mod => mod.default || Object.values(mod).find(v => typeof v === 'function');

/** Check auth and redirect to login if needed. Returns true if redirected. */
const checkAuth = (requiresAuth, path) => {
  if (requiresAuth && !store.get('isAuthenticated')) {
    history.replaceState(null, '', `/login?from=${encodeURIComponent(path)}`);
    return true;
  }
  return false;
};

// What a page's template sees beyond the store and its own `local`: where it is,
// plus the route's `static ssrProps` (in routes data, so the client renders the
// same values the server did). Set on SSR-hydrated pages too — without it a
// re-render after hydration (a locale switch) would print {{params.id}} raw.
const pagePropsFor = (route, params, url) => ({
  ...route.ssrProps,
  path: url.pathname,
  params,
  query: Object.fromEntries(url.searchParams),
});

export default class Router extends HTMLElement {
  routes = [];
  currentPath = null;
  loading = false;
  #preloaded = new Set();
  #url = null; // pathname + search last routed — a popstate that keeps it is a #fragment move
  #nav = 0;    // id of the newest navigate() call; older ones stop when they see it change

  /** Route lifecycle hooks - set these to intercept navigation */
  static beforeEach = null; // async (to, from) => true | '/redirect' | false
  static afterEach = null;  // (to, from) => void
  static onError = null;    // (error, to) => void

  async connectedCallback() {
    this.outlet = this.querySelector('#outlet') || (this.innerHTML = '<div id="outlet"></div>', this.querySelector('#outlet'));

    try {
      const inlined = globalThis.__ROUTES__;
      const data = inlined || await (await fetch('/routes.json').then(r => r.ok ? r : fetch('/api/routes'))).json();
      this.routes = withNotFound(data.map(r => ({ ...r, matcher: r.dynamic ? createMatcher(r.path) : null })));
    } catch (e) {
      console.error('Failed to load routes:', e);
      this.outlet.innerHTML = '<h1>Failed to load app</h1>';
      return;
    }

    addEventListener('popstate', () => {
      // Same page, new #fragment (back/forward across in-page anchors, or a native
      // fragment jump): scroll to it instead of rebuilding the page from scratch.
      if (location.pathname + location.search === this.#url) return location.hash ? scrollToHash(location.hash) : scrollTo(0, 0);
      this.navigate();
    });
    addEventListener('navigate', e => this.go(e.detail.path));
    document.addEventListener('click', e => {
      // Leave the browser's own gestures alone: cmd/ctrl-click (new tab), shift-click
      // (new window), alt-click (download), middle click, and anything already handled.
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const path = e.composedPath();
      const a = path.find(el => el.tagName === 'A' && el.hasAttribute?.('route'));
      if (a) {
        if (a.target && a.target !== '_self') return;
        e.preventDefault();
        this.go(a.getAttribute('href'));
        return;
      }
      // In-page #anchors: section ids live inside component shadow roots, out of
      // reach of native fragment navigation — resolve across the boundary instead.
      const hash = path.find(el => el.tagName === 'A' && el.getAttribute('href')?.startsWith('#'))?.getAttribute('href');
      if (hash && scrollToHash(hash)) { e.preventDefault(); history.pushState(null, '', hash); }
    });
    document.addEventListener('pointerover', e => {
      // composedPath(), not e.target.closest(): at the document, the target of an
      // event from inside a shadow root is the host element, never the link itself.
      const a = e.composedPath().find(el => el.tagName === 'A' && el.hasAttribute?.('route'));
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
        // Before the import: defining the element upgrades it on the spot.
        page.pageProps = pagePropsFor(route.route, route.params, new URL(location.href));
        await import(route.route.module);
      }
      this.currentPath = location.pathname;
      this.#url = location.pathname + location.search;
      this.hydrated = true;
    } else {
      this.navigate();
    }

  }

  go(path) { if (this.currentPath !== path) this.navigate(path, 'push'); }

  async preload(path) {
    const r = matchRoute(this.routes, path);
    if (!r) return;
    const Cls = getClass(await import(r.route.module));
    if (Cls?.templateUrl) loadTemplate(Cls.templateUrl);
  }

  /**
   * Render the page for `to` (default: the current address).
   * @param {string} [to] Target path, with optional query/hash.
   * @param {'push'|'replace'|'none'} [history] What to do to the address bar once
   *   the navigation is allowed — after beforeEach, so a hook that returns false
   *   cancels it without leaving a new history entry behind.
   */
  async navigate(to = null, mode = 'none') {
    const from = this.currentPath;
    // Every await below can be overtaken by a newer navigation (a second click
    // while this page's module is still loading). The newest call owns the outlet.
    const nav = ++this.#nav;
    const stale = () => nav !== this.#nav;

    let url = new URL(to ?? location.href, location.href);
    if (Router.beforeEach) {
      // A hook may redirect, and the redirect target is checked again; ten hops
      // is a loop, not a route.
      for (let hop = 0; ; hop++) {
        const result = await Router.beforeEach({ path: url.pathname, query: Object.fromEntries(url.searchParams) }, from ? { path: from } : null);
        if (stale() || result === false) return;
        if (typeof result !== 'string' || hop === 10) break;
        url = new URL(result, location.href);
        if (mode === 'none') mode = 'replace';
      }
    }
    if (mode !== 'none') history[mode === 'push' ? 'pushState' : 'replaceState'](null, '', url.pathname + url.search + url.hash);

    const path = url.pathname;
    this.#url = path + url.search;

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
      if (stale()) return;

      const el = document.createElement(route.component);
      el.pageProps = pagePropsFor(route, params, url);
      // Start the <head> from the site defaults (app.config.yml site.title /
      // description), so a page without `static metadata` doesn't keep the
      // previous page's title. The page's own metadata is merged in as it connects.
      store.set({ meta: { ...store.get('site'), ...route.metadata } });

      // Mount first — connectedCallback fires, shadow DOM is set up
      this.currentPath = path;
      scrollTo(0, 0);
      this.outlet.replaceChildren(el);

      // Yield one timer tick so connectedCallback's async template fetch
      // resolves through attachShadow + update(), populating the shadow DOM
      await new Promise(r => setTimeout(r, 0));

      // Now the shadow tree exists; wait for any nested custom elements to be defined
      await this.waitForComponents(el);
      if (stale()) return;

      // afterEach hook
      Router.afterEach?.({ path, params, query: Object.fromEntries(url.searchParams) }, from ? { path: from } : null);
    } catch (e) {
      if (stale()) return;
      console.error('Navigation error:', e);
      Router.onError?.(e, { path });
      this.outlet.innerHTML = '<div class="error-page"><h1>Error</h1><p>Failed to load page</p><a href="/" route>Go home</a></div>';
    } finally {
      // A superseded navigation leaves the loading state to the one that replaced it.
      if (!stale()) {
        this.loading = false;
        this.dispatchEvent(new CustomEvent('loading', { detail: { loading: false, path } }));
      }
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
