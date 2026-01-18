// Generic reactive store - Proxy + EventTarget

export class Store extends EventTarget {
  #state;
  #proxy;

  constructor(initial = {}) {
    super();
    this.#state = initial;
    this.#proxy = this.#createProxy(this.#state);
  }

  #createProxy(obj, path = '') {
    return new Proxy(obj, {
      get: (target, prop) => {
        if (typeof prop === 'symbol') return target[prop];
        const value = target[prop];
        return value && typeof value === 'object' && !Array.isArray(value)
          ? this.#createProxy(value, path ? `${path}.${prop}` : String(prop))
          : value;
      },
      set: (target, prop, value) => {
        if (target[prop] === value) return true;
        const old = target[prop];
        target[prop] = value;
        const key = path ? `${path}.${prop}` : String(prop);
        this.dispatchEvent(new CustomEvent('change', { detail: { key, value, old } }));
        this.dispatchEvent(new CustomEvent(`change:${key}`, { detail: { value, old } }));
        return true;
      }
    });
  }

  get state() { return this.#proxy; }

  get(path) {
    return path ? path.split('.').reduce((o, k) => o?.[k], this.#state) : { ...this.#state };
  }

  set(updates) {
    for (const [k, v] of Object.entries(updates)) this.#proxy[k] = v;
    return this.#state;
  }

  on(pathOrCb, cb) {
    if (typeof pathOrCb === 'function') {
      const handler = e => pathOrCb(this.get(), e.detail);
      this.addEventListener('change', handler);
      return () => this.removeEventListener('change', handler);
    }
    const handler = e => cb(e.detail.value, e.detail.old);
    this.addEventListener(`change:${pathOrCb}`, handler);
    return () => this.removeEventListener(`change:${pathOrCb}`, handler);
  }
}
