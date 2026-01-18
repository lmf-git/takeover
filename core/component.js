// Reactive Component - Proxy, EventTarget, AbortController
// Uses scoped styles with data attributes (like Vue) instead of Shadow DOM
import store from '../lib/store.js';
import { renderWithExpressions } from './template.js';

const isBrowser = typeof window !== 'undefined';
const templateCache = new Map();
const styleCache = new Map();
let scopeId = 0;

export const navigate = path => isBrowser && dispatchEvent(new CustomEvent('navigate', { detail: { path } }));

const BaseElement = isBrowser ? HTMLElement : class {};

async function loadTemplate(url) {
  if (templateCache.has(url)) return templateCache.get(url);
  try {
    const res = await fetch(url);
    if (!res.ok) return '';
    const html = await res.text();
    templateCache.set(url, html);
    return html;
  } catch {
    return '';
  }
}

// Extract <style> from template and scope it
function extractAndScopeStyles(html, scope) {
  const styleRegex = /<style>([\s\S]*?)<\/style>/gi;
  let styles = '';
  const content = html.replace(styleRegex, (_, css) => {
    styles += scopeCSS(css, scope);
    return '';
  });
  return { content, styles };
}

// Add scope attribute to CSS selectors (Vue-style: selector[data-v-scope])
function scopeCSS(css, scope) {
  const attr = `[data-v-${scope}]`;
  return css.replace(/([^{}]+)(\{[^}]*\})/g, (_, selectors, rules) => {
    const scoped = selectors.split(',').map(sel => {
      sel = sel.trim();
      if (!sel || sel.startsWith('@') || sel.startsWith('from') || sel.startsWith('to') || /^\d/.test(sel)) return sel;
      if (sel.includes(':host')) return sel.replace(/:host/g, attr);
      // Append scope to selector (handles tags, classes, ids, etc.)
      // For "div .class" -> "div .class[data-v-scope]"
      return sel + attr;
    }).join(', ');
    return scoped + rules;
  });
}

// Inject scoped styles into document head (once per scope)
function injectStyles(styles, scope) {
  if (!isBrowser || styleCache.has(scope)) return;
  // Check if SSR already injected this style
  if (document.querySelector(`style[data-v-style="${scope}"]`)) {
    styleCache.set(scope, true);
    return;
  }
  styleCache.set(scope, true);
  const style = document.createElement('style');
  style.setAttribute('data-v-style', scope);
  style.textContent = styles;
  document.head.appendChild(style);
}

// Add scope attribute to all elements
function addScopeToElements(container, scope) {
  container.querySelectorAll('*').forEach(el => el.setAttribute(`data-v-${scope}`, ''));
}

export class Component extends BaseElement {
  static template = '';
  static templateUrl = '';
  static store = [];
  static metadata = null;
  static requiresAuth = false;
  static _scope = null;

  #unsubs = [];
  #ac = null;
  #local = {};
  #template = '';
  #scope = '';

  constructor() {
    super();
    this.state = store.get();
    // Use class-level scope (shared across instances of same component)
    if (!this.constructor._scope) {
      this.constructor._scope = this.tagName.toLowerCase();
    }
    this.#scope = this.constructor._scope;

    this.local = new Proxy(this.#local, {
      set: (target, prop, value) => {
        if (target[prop] === value) return true;
        target[prop] = value;
        this.onLocalChange?.(prop, value);
        return true;
      },
      get: (target, prop) => target[prop]
    });
  }

  get signal() { return this.#ac?.signal; }

  async connectedCallback() {
    this.#ac = new AbortController();
    this.setAttribute(`data-v-${this.#scope}`, '');

    const { template, templateUrl } = this.constructor;
    this.#template = template || (templateUrl ? await loadTemplate(templateUrl) : '');

    if (this.constructor.store.length) {
      this.constructor.store.forEach(path => {
        this.#unsubs.push(store.on(path, () => {
          this.state = store.get();
          this.update();
        }));
      });
    }

    this.state = store.get();
    if (this.constructor.metadata) this.setMeta(this.constructor.metadata);

    // Skip initial render if SSR content exists (has data-ssr attribute)
    if (!this.hasAttribute('data-ssr')) {
      this.update();
    } else {
      // Just add scope attributes to existing SSR content and bind events
      this.removeAttribute('data-ssr');
      addScopeToElements(this, this.#scope);
      if (isBrowser) {
        this.addEventListener('click', e => {
          const a = e.target.closest('a[route]');
          if (a) { e.preventDefault(); navigate(a.getAttribute('href')); }
        }, { signal: this.signal });
        this.bind?.();
      }
    }
    this.mount?.();
  }

  disconnectedCallback() {
    this.#ac?.abort();
    this.#unsubs.forEach(fn => fn());
    this.#unsubs = [];
    this.unmount?.();
  }

  update() {
    if (!this.#template) {
      this.innerHTML = '';
      return;
    }

    console.log(`[Component] ${this.tagName} update() props:`, Object.keys(this.props));
    const rendered = renderWithExpressions(this.#template, this.props);
    console.log(`[Component] ${this.tagName} rendered contains {{:`, rendered.includes('{{'));
    const { content, styles } = extractAndScopeStyles(rendered, this.#scope);

    injectStyles(styles, this.#scope);
    this.innerHTML = content;
    addScopeToElements(this, this.#scope);

    if (isBrowser) {
      this.addEventListener('click', e => {
        const a = e.target.closest('a[route]');
        if (a) { e.preventDefault(); navigate(a.getAttribute('href')); }
      }, { signal: this.signal });

      this.bind?.();
    }
  }

  get props() {
    return { ...this.state, ...this.#local, ...this.pageProps, path: isBrowser ? location.pathname : '' };
  }

  $(sel) { return this.querySelector(sel); }
  $$(sel) { return [...this.querySelectorAll(sel)]; }

  on(target, event, handler, opts = {}) {
    const el = typeof target === 'string' ? this.$(target) : target;
    el?.addEventListener(event, handler, { ...opts, signal: this.signal });
    return this;
  }

  setMeta(meta) { store.setMeta(meta); }

  emit(name, detail) {
    this.dispatchEvent(new CustomEvent(name, { bubbles: true, composed: true, detail }));
  }
}

export { store };
