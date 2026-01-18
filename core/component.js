// Reactive Component with Declarative Shadow DOM
// Supports CSS modules and inline <style> blocks
import store from '../lib/store.js';
import { renderWithExpressions } from './template.js';

const isBrowser = typeof window !== 'undefined';
const templateCache = new Map();
const moduleCache = new Map();

export const navigate = path => isBrowser && dispatchEvent(new CustomEvent('navigate', { detail: { path } }));

const BaseElement = isBrowser ? HTMLElement : class {};

async function loadTemplate(url) {
  if (templateCache.has(url)) return templateCache.get(url);
  try {
    const res = await fetch(url);
    if (!res.ok) return '';
    const html = await res.text();
    // Strip <script> tags - template only needs HTML/CSS
    const template = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').trim();
    templateCache.set(url, template);
    return template;
  } catch {
    return '';
  }
}

// Load and process CSS module - returns { css, classes }
async function loadCSSModule(url, scope) {
  const cacheKey = `${url}:${scope}`;
  if (moduleCache.has(cacheKey)) return moduleCache.get(cacheKey);

  try {
    const res = await fetch(url);
    if (!res.ok) return { css: '', classes: {} };
    const rawCss = await res.text();
    const { css, classes } = processCSSModule(rawCss, scope);
    const result = { css, classes };
    moduleCache.set(cacheKey, result);
    return result;
  } catch {
    return { css: '', classes: {} };
  }
}

// Process CSS module: extract class names and scope them
function processCSSModule(css, scope) {
  const classes = {};
  // Generate scoped class names
  const processed = css.replace(/\.([a-zA-Z_][\w-]*)/g, (match, className) => {
    const scopedName = `${className}_${scope}`;
    classes[className] = scopedName;
    return `.${scopedName}`;
  });
  return { css: processed, classes };
}

// Extract <style> from template (returns raw CSS, no scoping needed for shadow DOM)
function extractStyles(html) {
  const styleRegex = /<style>([\s\S]*?)<\/style>/gi;
  let styles = '';
  const content = html.replace(styleRegex, (_, css) => {
    styles += css;
    return '';
  });
  return { content, styles };
}

export class Component extends BaseElement {
  static template = '';
  static templateUrl = '';
  static cssModule = '';
  static store = [];
  static metadata = null;
  static requiresAuth = false;
  static _cssClasses = null;
  static _moduleCss = null;

  #unsubs = [];
  #ac = null;
  #local = {};
  #template = '';
  #cssClasses = {};
  #moduleCss = '';
  #hydrated = false;

  constructor() {
    super();
    this.state = store.get();
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

    const { template, templateUrl, cssModule } = this.constructor;
    this.#template = template || (templateUrl ? await loadTemplate(templateUrl) : '');

    // Load CSS module only if explicitly specified
    if (cssModule && this.constructor._cssClasses === null) {
      const { css, classes } = await loadCSSModule(cssModule, this.tagName.toLowerCase());
      this.constructor._cssClasses = classes;
      this.constructor._moduleCss = css;
    }
    this.#cssClasses = this.constructor._cssClasses || {};
    this.#moduleCss = this.constructor._moduleCss || '';

    this.state = store.get();
    if (this.constructor.metadata) this.setMeta(this.constructor.metadata);

    // Check if Declarative Shadow DOM already exists (from SSR)
    const hasSSRContent = !!this.shadowRoot;
    if (hasSSRContent) {
      // Hydration: shadow root exists from DSD, just bind events
      this.#hydrated = true;
      this.#bindEvents();
      this.bind?.();
    } else {
      // Client-side only: create shadow root and render
      this.attachShadow({ mode: 'open' });
      this.update();
    }

    // Set up store subscriptions AFTER hydration check
    if (this.constructor.store.length) {
      this.constructor.store.forEach(path => {
        this.#unsubs.push(store.on(path, () => {
          this.state = store.get();
          this.update();
        }));
      });
    }

    this.mount?.();

    // Exit hydration mode AFTER mount completes
    this.#hydrated = false;

    // If local state was initialized during mount, re-render to apply it
    // (SSR doesn't know about local state, so we need a client render)
    if (Object.keys(this.#local).length > 0) {
      this.update();
    }
  }

  disconnectedCallback() {
    this.#ac?.abort();
    this.#unsubs.forEach(fn => fn());
    this.#unsubs = [];
    this.unmount?.();
  }

  update() {
    if (!this.shadowRoot) return;

    // In hydration mode, skip updates to preserve DSD content
    // Hydration mode ends after mount() completes in connectedCallback
    if (this.#hydrated) return;

    // Don't render if template isn't loaded yet
    if (!this.#template) {
      this.shadowRoot.innerHTML = '';
      return;
    }

    const rendered = renderWithExpressions(this.#template, this.props);
    const { content, styles } = extractStyles(rendered);

    // Build combined styles: CSS module + inline styles
    const allStyles = (this.#moduleCss || '') + (styles || '');

    this.shadowRoot.innerHTML = (allStyles ? `<style>${allStyles}</style>` : '') + content;
    this.#bindEvents();
    this.bind?.();
  }

  #bindEvents() {
    if (!isBrowser || !this.shadowRoot) return;

    // Route link handling
    this.shadowRoot.addEventListener('click', e => {
      const a = e.target.closest('a[route]');
      if (a) {
        e.preventDefault();
        navigate(a.getAttribute('href'));
      }
    }, { signal: this.signal });

    // Declarative event binding: @click="methodName" or @click="store.method()"
    const eventAttrs = ['click', 'submit', 'input', 'change', 'keydown', 'keyup'];
    eventAttrs.forEach(eventName => {
      this.shadowRoot.querySelectorAll(`[\\@${eventName}]`).forEach(el => {
        const handler = el.getAttribute(`@${eventName}`);
        if (!handler) return;

        el.addEventListener(eventName, e => {
          // Handle store.method() calls
          if (handler.startsWith('store.')) {
            const method = handler.slice(6).replace(/\(\)$/, '');
            if (typeof store[method] === 'function') {
              store[method]();
            }
          }
          // Handle this.method() or just method
          else {
            const methodName = handler.replace(/\(\)$/, '');
            if (typeof this[methodName] === 'function') {
              this[methodName](e);
            }
          }
        }, { signal: this.signal });
      });
    });
  }

  get props() {
    return {
      ...this.state,
      ...this.#local,
      ...this.pageProps,
      path: isBrowser ? location.pathname : '',
      $css: this.#cssClasses
    };
  }

  $(sel) { return this.shadowRoot?.querySelector(sel); }
  $$(sel) { return [...(this.shadowRoot?.querySelectorAll(sel) || [])]; }

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
