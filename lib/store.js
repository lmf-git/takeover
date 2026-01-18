// App-specific store - customize per implementation
import { Store } from '../core/context.js';

const isBrowser = typeof window !== 'undefined';

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
  counter: 0,
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
