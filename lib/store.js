import { Store } from '../core/context.js';

const defaults = { theme: 'light', user: null, isAuthenticated: false, counter: 0, meta: {} };

const isBrowser = typeof window !== 'undefined';
const getTheme = () => isBrowser ? localStorage.getItem('theme') ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : defaults.theme;
const getUser = () => { try { return isBrowser ? JSON.parse(localStorage.getItem('user')) : null; } catch { return null; } };

const store = new Store({ ...defaults, theme: getTheme(), user: getUser(), isAuthenticated: !!getUser() }, defaults);

Object.assign(store, {
  toggleTheme() {
    const theme = store.get('theme') === 'dark' ? 'light' : 'dark';
    store.state.theme = theme;
    isBrowser && (localStorage.setItem('theme', theme), document.documentElement.dataset.theme = theme);
  },
  login(creds = {}) {
    const user = { id: crypto.randomUUID?.() ?? Math.random().toString(36).slice(2), username: creds.username || `user_${Math.random() * 1000 | 0}`, email: creds.email || `user${Math.random() * 1000 | 0}@example.com`, avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${Math.random()}`, role: Math.random() > 0.7 ? 'admin' : 'user' };
    store.set({ user, isAuthenticated: true });
    isBrowser && localStorage.setItem('user', JSON.stringify(user));
    return user;
  },
  logout() { store.set({ user: null, isAuthenticated: false }); isBrowser && localStorage.removeItem('user'); },
  setMeta: meta => store.set({ meta: { ...store.get('meta'), ...meta } })
});

isBrowser && (document.documentElement.dataset.theme = getTheme());

export default store;
