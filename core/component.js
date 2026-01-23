import store from '../lib/store.js';
import { renderWithExpressions } from './template.js';

const isBrowser = typeof window !== 'undefined';
const templates = new Map();
const cssModules = new Map();

export const navigate = path => isBrowser && dispatchEvent(new CustomEvent('navigate', { detail: { path } }));

export async function loadTemplate(url) {
  if (!templates.has(url)) {
    const res = await fetch(url).catch(() => null);
    const html = res?.ok ? await res.text() : '';
    templates.set(url, html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').trim());
  }
  return templates.get(url);
}

async function loadCSS(url, scope) {
  const key = `${url}:${scope}`;
  if (!cssModules.has(key)) {
    const res = await fetch(url).catch(() => null);
    const raw = res?.ok ? await res.text() : '';
    const classes = {};
    const css = raw.replace(/\.([a-zA-Z_][\w-]*)/g, (_, name) => {
      classes[name] = `${name}_${scope}`;
      return `.${classes[name]}`;
    });
    cssModules.set(key, { styles: css, classes });
  }
  return cssModules.get(key);
}

function extractStyles(html) {
  let styles = '';
  const content = html.replace(/<style>([\s\S]*?)<\/style>/gi, (_, css) => (styles += css, ''));
  return { content, styles };
}

export class Component extends (isBrowser ? HTMLElement : class {}) {
  static template = '';
  static templateUrl = '';
  static cssModule = '';
  static store = [];
  static metadata = null;
  static requiresAuth = false;

  #subs = [];
  #ac = null;
  #local = {};
  #tpl = '';
  #css = { classes: {}, styles: '' };
  #hydrating = false;

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

    if (this.shadowRoot) {
      this.#hydrating = true;
      this.#bind();
    } else {
      this.attachShadow({ mode: 'open' });
      this.update();
    }

    this.constructor.store.forEach(path => {
      this.#subs.push(store.on(path, () => (this.state = store.get(), this.update())));
    });

    this.mount?.();
    this.#hydrating = false;

    if (Object.keys(this.#local).length) this.update();
  }

  disconnectedCallback() {
    this.#ac?.abort();
    this.#subs.forEach(fn => fn());
    this.unmount?.();
  }

  update() {
    if (!this.shadowRoot || this.#hydrating || !this.#tpl) return;
    const { content, styles } = extractStyles(renderWithExpressions(this.#tpl, this.props));
    const allStyles = this.#css.styles + styles;
    this.shadowRoot.innerHTML = (allStyles ? `<style>${allStyles}</style>` : '') + content;
    this.#bind();
  }

  #bind() {
    if (!isBrowser) return;
    ['click', 'submit', 'input', 'change', 'keydown', 'keyup'].forEach(evt => {
      this.shadowRoot.querySelectorAll(`[\\@${evt}]`).forEach(el => {
        const h = el.getAttribute(`@${evt}`);
        el.addEventListener(evt, e => {
          if (h.startsWith('store.')) store[h.slice(6).replace(/\(\)$/, '')]?.();
          else this[h.replace(/\(\)$/, '')]?.(e);
        }, { signal: this.signal });
      });
    });
    this.bind?.();
  }

  get props() {
    return { ...this.state, ...this.#local, ...this.pageProps, path: isBrowser ? location.pathname : '', $css: this.#css.classes };
  }

  $(sel) { return this.shadowRoot?.querySelector(sel); }
  $$(sel) { return [...(this.shadowRoot?.querySelectorAll(sel) || [])]; }
  on(target, evt, fn, opts = {}) { (typeof target === 'string' ? this.$(target) : target)?.addEventListener(evt, fn, { ...opts, signal: this.signal }); }
  emit(name, detail) { this.dispatchEvent(new CustomEvent(name, { bubbles: true, composed: true, detail })); }
}

export { store };
