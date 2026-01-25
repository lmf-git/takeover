/**
 * Reactive state store with event-based subscriptions
 * @extends EventTarget
 *
 * @example
 * const store = new Store({ count: 0, user: null });
 *
 * // Subscribe to changes
 * store.on('count', (value, old) => console.log('Count:', value));
 *
 * // Update state
 * store.set({ count: 1 });
 * store.update('count', c => c + 1);
 * store.toggle('isActive');
 * store.reset('count');
 */
export class Store extends EventTarget {
  #state; #proxy; #defaults;

  /**
   * Create a new store
   * @param {Object} initial - Initial state
   * @param {Object} [defaults] - Default values for reset (defaults to initial)
   */
  constructor(initial = {}, defaults = null) {
    super();
    this.#defaults = defaults ?? { ...initial };
    this.#state = initial;
    this.#proxy = this.#wrap(this.#state);
  }

  /** @returns {Object} Copy of default values */
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

  /** @returns {Proxy} Reactive state proxy */
  get state() { return this.#proxy; }

  /**
   * Get state value at path
   * @param {string} [path] - Dot-notation path (e.g., 'user.name')
   * @returns {*} Value at path or full state copy if no path
   */
  get(path) { return path ? path.split('.').reduce((o, k) => o?.[k], this.#state) : { ...this.#state }; }

  /**
   * Set multiple state values
   * @param {Object} updates - Key-value pairs to update
   * @returns {Object} Current state
   */
  set(updates) { Object.entries(updates).forEach(([k, v]) => this.#proxy[k] = v); return this.#state; }

  /**
   * Reset state to defaults
   * @param {string} [key] - Specific key to reset, or all if omitted
   */
  reset(key) { key ? this.#proxy[key] = this.#defaults[key] : Object.keys(this.#defaults).forEach(k => this.#proxy[k] = this.#defaults[k]); }

  /**
   * Toggle a boolean value
   * @param {string} key - Key to toggle
   * @returns {boolean} New value
   */
  toggle(key) { this.#proxy[key] = !this.#state[key]; return this.#state[key]; }

  /**
   * Update a value using a function
   * @param {string} key - Key to update
   * @param {Function} fn - Update function (currentValue) => newValue
   * @returns {*} New value
   */
  update(key, fn) { this.#proxy[key] = fn(this.#state[key]); return this.#state[key]; }

  /**
   * Subscribe to state changes
   * @param {string|Function} pathOrCb - Path to watch or callback for all changes
   * @param {Function} [cb] - Callback (value, oldValue) => void
   * @returns {Function} Unsubscribe function
   */
  on(pathOrCb, cb) {
    const [evt, h] = typeof pathOrCb === 'function'
      ? ['change', e => pathOrCb(this.get(), e.detail)]
      : [`change:${pathOrCb}`, e => cb(e.detail.value, e.detail.old)];
    this.addEventListener(evt, h);
    return () => this.removeEventListener(evt, h);
  }
}
