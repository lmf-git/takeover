// Reactive store - Proxy + EventTarget
const isBrowser = typeof window !== 'undefined';

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

// App store instance - extend with actions in lib/store.js
const getTheme = () => isBrowser
  ? localStorage.getItem('theme') ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
  : 'light';

const getUser = () => {
  if (!isBrowser) return null;
  try { return JSON.parse(localStorage.getItem('user')); }
  catch { return null; }
};

const store = new Store({
  theme: getTheme(),
  user: getUser(),
  isAuthenticated: !!getUser(),
  meta: {}
});

// Actions
Object.assign(store, {
  toggleTheme() {
    const theme = store.get('theme') === 'dark' ? 'light' : 'dark';
    store.state.theme = theme;
    if (isBrowser) {
      localStorage.setItem('theme', theme);
      document.documentElement.dataset.theme = theme;
    }
  },

  login(creds = {}) {
    const user = {
      id: crypto.randomUUID?.() ?? Math.random().toString(36).slice(2),
      username: creds.username || `user_${(Math.random() * 1000) | 0}`,
      email: creds.email || `user${(Math.random() * 1000) | 0}@example.com`,
      avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${Math.random()}`,
      role: Math.random() > 0.7 ? 'admin' : 'user'
    };
    store.set({ user, isAuthenticated: true });
    if (isBrowser) localStorage.setItem('user', JSON.stringify(user));
    return user;
  },

  logout() {
    store.set({ user: null, isAuthenticated: false });
    if (isBrowser) localStorage.removeItem('user');
  },

  setMeta: meta => store.set({ meta: { ...store.get('meta'), ...meta } })
});

if (isBrowser) {
  document.documentElement.dataset.theme = getTheme();
}

export default store;
