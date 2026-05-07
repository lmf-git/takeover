import { Store } from '../core/context.js';

const defaults = { theme: 'light', user: null, isAuthenticated: false, counter: 0, meta: {}, locale: 'en', messages: {} };

const isBrowser = typeof window !== 'undefined';
const getLang = () => isBrowser ? localStorage.getItem('lang') ?? 'es' : defaults.lang;
const getTheme = () => isBrowser ? localStorage.getItem('theme') ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : defaults.theme;

const store = new Store({ ...defaults, lang: getLang(), theme: getTheme() }, defaults);

Object.assign(store, {
  setLang(lang) {
    store.state.lang = lang;
    isBrowser && (localStorage.setItem('lang', lang), document.documentElement.lang = lang);
    store.update('lang', () => lang);
  },
  toggleTheme() {
    const theme = store.get('theme') === 'dark' ? 'light' : 'dark';
    store.state.theme = theme;
    isBrowser && (localStorage.setItem('theme', theme), document.documentElement.dataset.theme = theme);
  },
  setMeta: meta => store.set({ meta: { ...store.get('meta'), ...meta } })
});

isBrowser && (document.documentElement.dataset.theme = getTheme());

export default store;
