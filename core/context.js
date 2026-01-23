export class Store extends EventTarget {
  #state; #proxy;

  constructor(initial = {}) {
    super();
    this.#state = initial;
    this.#proxy = this.#wrap(this.#state);
  }

  #wrap(obj, path = '') {
    return new Proxy(obj, {
      get: (t, p) => {
        if (typeof p === 'symbol') return t[p];
        const v = t[p];
        return v && typeof v === 'object' && !Array.isArray(v) ? this.#wrap(v, path ? `${path}.${p}` : p) : v;
      },
      set: (t, p, v) => {
        if (t[p] === v) return true;
        const old = t[p]; t[p] = v;
        const key = path ? `${path}.${p}` : String(p);
        this.dispatchEvent(new CustomEvent('change', { detail: { key, value: v, old } }));
        this.dispatchEvent(new CustomEvent(`change:${key}`, { detail: { value: v, old } }));
        return true;
      }
    });
  }

  get state() { return this.#proxy; }
  get(path) { return path ? path.split('.').reduce((o, k) => o?.[k], this.#state) : { ...this.#state }; }
  set(updates) { Object.entries(updates).forEach(([k, v]) => this.#proxy[k] = v); return this.#state; }

  on(pathOrCb, cb) {
    const evt = typeof pathOrCb === 'function' ? 'change' : `change:${pathOrCb}`;
    const h = typeof pathOrCb === 'function'
      ? e => pathOrCb(this.get(), e.detail)
      : e => cb(e.detail.value, e.detail.old);
    this.addEventListener(evt, h);
    return () => this.removeEventListener(evt, h);
  }
}
