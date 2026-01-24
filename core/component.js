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

export class Component extends (isBrowser ? HTMLElement : class {}) {
  static template = ''; static templateUrl = ''; static cssModule = '';
  static store = []; static metadata = null; static requiresAuth = false;

  #subs = []; #ac = null; #local = {}; #tpl = ''; #css = { classes: {}, styles: '' }; #hydrating = false;

  constructor() {
    super();
    this.state = store.get();
    this.local = new Proxy(this.#local, {
      set: (t, k, v) => (t[k] !== v && (t[k] = v, this.onLocalChange?.(k, v)), true),
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

    if (this.shadowRoot) { this.#hydrating = true; this.#bind(); }
    else { this.attachShadow({ mode: 'open' }); this.update(); }

    this.constructor.store.forEach(p => this.#subs.push(store.on(p, () => (this.state = store.get(), this.update()))));
    this.mount?.();
    this.#hydrating = false;
    if (Object.keys(this.#local).length) this.update();
  }

  disconnectedCallback() { this.#ac?.abort(); this.#subs.forEach(fn => fn()); this.unmount?.(); }

  update() {
    if (!this.shadowRoot || this.#hydrating || !this.#tpl) return;
    const active = this.shadowRoot.activeElement;
    const focus = active ? { sel: active.id ? `#${active.id}` : `${active.tagName}[name="${active.name}"]`, start: active.selectionStart, end: active.selectionEnd } : null;
    this.#ac?.abort();
    this.#ac = new AbortController();
    const { content, styles } = extractStyles(renderWithExpressions(this.#tpl, this.props));
    this.shadowRoot.innerHTML = (this.#css.styles + styles ? `<style>${this.#css.styles}${styles}</style>` : '') + content;
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

  get props() { return { ...this.state, ...this.#local, ...this.pageProps, path: isBrowser ? location.pathname : '', $css: this.#css.classes }; }

  $(sel) { return this.shadowRoot?.querySelector(sel); }
  $$(sel) { return [...(this.shadowRoot?.querySelectorAll(sel) || [])]; }
  on(target, evt, fn, opts = {}) { (typeof target === 'string' ? this.$(target) : target)?.addEventListener(evt, fn, { ...opts, signal: this.signal }); }
  emit(name, detail) { this.dispatchEvent(new CustomEvent(name, { bubbles: true, composed: true, detail })); }
}

export { store };
