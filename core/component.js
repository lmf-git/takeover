// Reactive Component - Proxy, EventTarget, AbortController
import store from './context.js';
import { renderWithExpressions } from './template.js';

const isBrowser = typeof window !== 'undefined';

export const navigate = path => isBrowser && dispatchEvent(new CustomEvent('navigate', { detail: { path } }));

// Server-side: provide a stub base class
const BaseElement = isBrowser ? HTMLElement : class {};

export class Component extends BaseElement {
  static template = '';
  static styles = '';
  static store = [];

  #unsubs = [];
  #ac = null;
  #local = {};

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.state = store.get();

    // Reactive local state
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

  // AbortSignal for automatic cleanup
  get signal() { return this.#ac?.signal; }

  connectedCallback() {
    this.#ac = new AbortController();
    const paths = this.constructor.store;

    // Subscribe to store
    if (paths.length) {
      paths.forEach(path => {
        this.#unsubs.push(store.on(path, () => {
          this.state = store.get();
          this.update();
        }));
      });
    }

    this.state = store.get();
    this.update();
    this.mount?.();
  }

  disconnectedCallback() {
    this.#ac?.abort();
    this.#unsubs.forEach(fn => fn());
    this.#unsubs = [];
    this.unmount?.();
  }

  update() {
    const { template, styles } = this.constructor;
    const html = template ? renderWithExpressions(template, this.props) : '';
    this.shadowRoot.innerHTML = (styles ? `<style>${styles}</style>` : '') + html;

    if (isBrowser) {
      // Auto-handle route links with delegation
      this.shadowRoot.addEventListener('click', e => {
        const a = e.target.closest('a[route]');
        if (a) { e.preventDefault(); navigate(a.getAttribute('href')); }
      }, { signal: this.signal });

      this.bind?.();
    }
  }

  get props() {
    return { ...this.state, ...this.#local, ...this.pageProps, path: isBrowser ? location.pathname : '' };
  }

  // DOM helpers
  $(sel) { return this.shadowRoot.querySelector(sel); }
  $$(sel) { return [...this.shadowRoot.querySelectorAll(sel)]; }

  // Event helper with auto-cleanup
  on(target, event, handler, opts = {}) {
    const el = typeof target === 'string' ? this.$(target) : target;
    el?.addEventListener(event, handler, { ...opts, signal: this.signal });
    return this;
  }

  // Metadata
  setMeta(meta) { store.setMeta(meta); }

  // Emit bubbling event
  emit(name, detail) {
    this.dispatchEvent(new CustomEvent(name, { bubbles: true, composed: true, detail }));
  }
}

export { store };
