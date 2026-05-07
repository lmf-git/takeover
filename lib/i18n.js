import store from './store.js';

const SUPPORTED = ['en', 'es', 'fr'];
const FALLBACK = 'en';
const isBrowser = typeof window !== 'undefined';
const cache = new Map();

function normalize(lang) {
  const code = (lang || FALLBACK).split(/[-_]/)[0].toLowerCase();
  return SUPPORTED.includes(code) ? code : FALLBACK;
}

async function loadMessages(lang) {
  if (cache.has(lang)) return cache.get(lang);
  // Use pre-bundled locale data when available (production + dev-SSR injection)
  const bundled = isBrowser && window.__LOCALES__?.[lang];
  if (bundled) {
    cache.set(lang, bundled);
    return bundled;
  }
  try {
    const res = await fetch(`/locales/${lang}.json`);
    const messages = res.ok ? await res.json() : {};
    cache.set(lang, messages);
    return messages;
  } catch {
    return {};
  }
}

/** Switch the active locale, persist to localStorage + cookie, update store. */
export async function setLocale(lang) {
  const code = normalize(lang);
  const messages = await loadMessages(code);
  store.set({ locale: code, messages });
  if (isBrowser) {
    localStorage.setItem('locale', code);
    document.cookie = `locale=${code};path=/;max-age=31536000`;
    document.documentElement.lang = code;
  }
}

/** Detect and load locale on startup (client-side). */
export async function initLocale() {
  const saved = isBrowser ? localStorage.getItem('locale') : null;
  const current = store.get('locale');
  // Prefer explicit localStorage choice; fall back to SSR-detected locale (already in store)
  const code = saved ? normalize(saved) : (current || FALLBACK);
  // SSR already loaded the correct locale and messages — nothing to do
  if (current === code && Object.keys(store.get('messages') || {}).length) {
    if (isBrowser) document.documentElement.lang = code;
    return code;
  }
  const messages = await loadMessages(code);
  store.set({ locale: code, messages });
  if (isBrowser) document.documentElement.lang = code;
  return code;
}

/**
 * Translate a dot-notation key with optional variable interpolation.
 * Falls back to the key itself if not found.
 *
 * @example t('nav.home')           → 'Home'
 * @example t('footer.copyright', { year: 2026 })  → '© 2026 Web Components App'
 */
export function t(key, vars = {}) {
  const messages = store.get('messages') || {};
  const val = key.split('.').reduce((o, k) => o?.[k], messages);
  if (typeof val !== 'string') return key;
  return Object.keys(vars).length
    ? val.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`))
    : val;
}

export const getLocale = () => store.get('locale') || FALLBACK;
export const getSupportedLocales = () => [...SUPPORTED];
