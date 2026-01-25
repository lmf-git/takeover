import store from '../lib/store.js';
import { renderWithExpressions } from './template.js';

const isBrowser = typeof window !== 'undefined';
const cache = { templates: new Map(), css: new Map() };

export const define = (name, ctor) => isBrowser && customElements.define(name, ctor);

export const navigate = path => isBrowser && dispatchEvent(new CustomEvent('navigate', { detail: { path } }));

const fetchText = async url => {
  const res = await fetch(url).catch(() => null);
  return res?.ok ? res.text() : '';
};

export const loadTemplate = async url => {
  if (!cache.templates.has(url)) cache.templates.set(url, (await fetchText(url)).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').trim());
  return cache.templates.get(url);
};

const loadCSS = async (url, scope) => {
  const key = `${url}:${scope}`;
  if (!cache.css.has(key)) {
    const raw = await fetchText(url);
    const classes = {};
    const styles = raw.replace(/\.([a-zA-Z_][\w-]*)/g, (_, n) => (classes[n] = `${n}_${scope}`, `.${classes[n]}`));
    cache.css.set(key, { styles, classes });
  }
  return cache.css.get(key);
};

const extractStyles = html => {
  let styles = '';
  return { content: html.replace(/<style>([\s\S]*?)<\/style>/gi, (_, css) => (styles += css, '')), styles };
};

/**
 * Base component class for web components with reactive state
 * @extends HTMLElement
 *
 * @example
 * class MyComponent extends Component {
 *   static templateUrl = '/components/My/My.html';
 *   static cssModule = '/components/My/My.module.css';
 *   static store = ['user', 'theme'];  // Subscribe to store keys
 *   static local = { count: 0 };        // Initial local state
 *   static metadata = { title: 'My Page' };
 *   static requiresAuth = false;
 *
 *   bind() {
 *     this.on('#btn', 'click', () => this.local.count++);
 *   }
 * }
 */
export class Component extends (isBrowser ? HTMLElement : class {}) {
  /** @type {string} Inline template HTML */
  static template = '';
  /** @type {string} URL to load template from */
  static templateUrl = '';
  /** @type {string} URL to CSS module */
  static cssModule = '';
  /** @type {string[]} Store keys to subscribe to */
  static store = [];
  /** @type {{title?: string, description?: string}|null} Page metadata */
  static metadata = null;
  /** @type {boolean} Require authentication to access */
  static requiresAuth = false;
  /** @type {Object|null} Initial local state - auto-cloned per instance */
  static local = null;
  /** @type {boolean} Auto-update on local state changes (default: true) */
  static reactive = true;

  #subs = []; #ac = null; #local = {}; #tpl = ''; #css = { classes: {}, styles: '' }; #hydrating = false; #batching = false;

  constructor() {
    super();
    this.state = store.get();
    // Initialize from static local if defined
    if (this.constructor.local) Object.assign(this.#local, JSON.parse(JSON.stringify(this.constructor.local)));
    this.local = new Proxy(this.#local, {
      set: (t, k, v) => {
        if (t[k] === v) return true;
        t[k] = v;
        this.onLocalChange?.(k, v);
        // Auto-update if reactive (default), not batching, and onLocalChange didn't handle it
        if (this.constructor.reactive && !this.#batching && !this.onLocalChange) this.update();
        return true;
      },
      get: (t, k) => t[k]
    });
  }

  get signal() { return this.#ac?.signal; }

  async connectedCallback() {
    this.#ac = new AbortController();
    const { template, templateUrl, cssModule, metadata } = this.constructor;

    this.#tpl = template || (templateUrl ? await loadTemplate(templateUrl) : '');
    if (cssModule) this.#css = await loadCSS(cssModule, this.tagName.toLowerCase());

    this.state = store.get();
    if (metadata) store.setMeta(metadata);

    const hadSSR = !!this.shadowRoot;
    if (hadSSR) { this.#hydrating = true; this.#bind(); }
    else { this.attachShadow({ mode: 'open' }); this.update(); }

    this.constructor.store.forEach(p => this.#subs.push(store.on(p, () => (this.state = store.get(), this.update()))));
    this.mount?.();
    this.#hydrating = false;
    // Only update after hydration if not SSR'd (SSR content is already correct)
    if (!hadSSR && Object.keys(this.#local).length) this.update();
  }

  disconnectedCallback() { this.#ac?.abort(); this.#subs.forEach(fn => fn()); this.unmount?.(); }

  update() {
    if (!this.shadowRoot || this.#hydrating || !this.#tpl) return;
    const active = this.shadowRoot.activeElement;
    const focus = active ? { sel: active.id ? `#${active.id}` : `${active.tagName}[name="${active.name}"]`, start: active.selectionStart, end: active.selectionEnd } : null;
    this.#ac?.abort();
    this.#ac = new AbortController();
    const { content, styles } = extractStyles(renderWithExpressions(this.#tpl, this.props));
    this.shadowRoot.innerHTML = (this.#css.styles || styles ? `<style>${this.#css.styles}${styles}</style>` : '') + content;
    this.#bind();
    if (focus) { const el = this.$(focus.sel); el?.focus(); focus.start != null && el?.setSelectionRange?.(focus.start, focus.end); }
  }

  #bind() {
    if (!isBrowser) return;
    this.shadowRoot.querySelectorAll('[\\@click],[\\@submit],[\\@input],[\\@change],[\\@keydown],[\\@keyup]').forEach(el => {
      ['click', 'submit', 'input', 'change', 'keydown', 'keyup'].forEach(evt => {
        const h = el.getAttribute(`@${evt}`);
        if (h) el.addEventListener(evt, e => h.startsWith('store.') ? store[h.slice(6).replace(/\(\)$/, '')]?.() : this[h.replace(/\(\)$/, '')]?.(e), { signal: this.signal });
      });
    });
    this.bind?.();
  }

  get props() {
    const c = this.#css.classes;
    return { ...this.state, ...this.#local, ...this.pageProps, path: isBrowser ? location.pathname : '', $css: c, $c: (...names) => names.map(n => c[n] || n).join(' ') };
  }

  $(sel) { return this.shadowRoot?.querySelector(sel); }
  $$(sel) { return [...(this.shadowRoot?.querySelectorAll(sel) || [])]; }
  on(target, evt, fn, opts = {}) { (typeof target === 'string' ? this.$(target) : target)?.addEventListener(evt, fn, { ...opts, signal: this.signal }); }
  emit(name, detail) { this.dispatchEvent(new CustomEvent(name, { bubbles: true, composed: true, detail })); }

  // Event delegation: handle events on dynamic children matching selector
  delegate(evt, sel, fn) { this.on(this.shadowRoot, evt, e => { const t = e.target.closest(sel); t && fn(t, e); }); }

  // CSS class helper: cx('base', { active: isActive }, isDisabled && 'disabled') => 'base active disabled'
  cx(...args) {
    const c = this.#css.classes;
    return args.flatMap(a => !a ? [] : typeof a === 'string' ? (c[a] || a) : Array.isArray(a) ? a.map(x => c[x] || x) : Object.entries(a).filter(([, v]) => v).map(([k]) => c[k] || k)).join(' ');
  }

  // Form helpers

  /** Bind form fields to local state: bindForm({ username: '#username', email: '#email' }) */
  bindForm(fields) {
    for (const [key, sel] of Object.entries(fields)) {
      this.on(sel, 'input', e => this.local[key] = e.target.value);
      this.on(sel, 'change', e => this.local[key] = e.target.type === 'checkbox' ? e.target.checked : e.target.value);
    }
  }

  /** Get form data from selectors or form element */
  getFormData(selOrForm = 'form') {
    const form = typeof selOrForm === 'string' ? this.$(selOrForm) : selOrForm;
    return form ? Object.fromEntries(new FormData(form)) : {};
  }

  /** Reset form fields */
  resetForm(selOrForm = 'form') {
    const form = typeof selOrForm === 'string' ? this.$(selOrForm) : selOrForm;
    form?.reset?.();
  }

  /** Set loading state with automatic UI feedback */
  async withLoading(fn, key = 'isLoading') {
    this.local[key] = true;
    try { return await fn(); }
    finally { this.local[key] = false; }
  }

  /** Batch multiple local state changes into a single update */
  batch(fn) {
    this.#batching = true;
    try { fn(); }
    finally { this.#batching = false; this.update(); }
  }
}

export { store };
