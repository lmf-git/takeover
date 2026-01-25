export class Store extends EventTarget {
  #state; #proxy; #defaults;

  constructor(initial = {}, defaults = null) {
    super();
    this.#defaults = defaults ?? { ...initial };
    this.#state = initial;
    this.#proxy = this.#wrap(this.#state);
  }

  get defaults() { return { ...this.#defaults }; }

  #wrap(obj, path = '') {
    return new Proxy(obj, {
      get: (t, p) => typeof p === 'symbol' ? t[p] : t[p] && typeof t[p] === 'object' && !Array.isArray(t[p]) ? this.#wrap(t[p], path ? `${path}.${p}` : p) : t[p],
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
  reset(key) { key ? this.#proxy[key] = this.#defaults[key] : Object.keys(this.#defaults).forEach(k => this.#proxy[k] = this.#defaults[k]); }
  toggle(key) { this.#proxy[key] = !this.#state[key]; return this.#state[key]; }
  update(key, fn) { this.#proxy[key] = fn(this.#state[key]); return this.#state[key]; }

  on(pathOrCb, cb) {
    const [evt, h] = typeof pathOrCb === 'function'
      ? ['change', e => pathOrCb(this.get(), e.detail)]
      : [`change:${pathOrCb}`, e => cb(e.detail.value, e.detail.old)];
    this.addEventListener(evt, h);
    return () => this.removeEventListener(evt, h);
  }
}
