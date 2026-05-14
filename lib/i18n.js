import store from './store.js';

const SUPPORTED = ['en', 'es'];
const FALLBACK = 'es';
const isBrowser = typeof window !== 'undefined';
const cache = new Map();

function normalize(lang) {
  const code = (lang || FALLBACK).split(/[-_]/)[0].toLowerCase();
  return SUPPORTED.includes(code) ? code : FALLBACK;
}

async function loadMessages(lang) {
  if (cache.has(lang)) return cache.get(lang);
  // Reuse SSR-hydrated messages for the active locale instead of refetching.
  const hydrated = isBrowser && store.get('locale') === lang ? store.get('messages') : null;
  if (hydrated && Object.keys(hydrated).length) {
    cache.set(lang, hydrated);
    return hydrated;
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

/** Switch the active locale for the current session. */
export async function setLocale(lang) {
  const code = normalize(lang);
  const messages = await loadMessages(code);
  store.set({ locale: code, messages });
  if (isBrowser) document.documentElement.lang = code;
}

/** Detect browser locale on startup, fall back to Spanish if unsupported. */
export async function initLocale() {
  const lang = isBrowser ? (navigator.language || '').split(/[-_]/)[0].toLowerCase() : FALLBACK;
  const code = SUPPORTED.includes(lang) ? lang : FALLBACK;
  // Fast path: SSR already hydrated the matching locale into the store via
  // __INITIAL_STATE__. No re-set, no fetch — just sync <html lang>.
  if (isBrowser && store.get('locale') === code && store.get('messages')) {
    if (!cache.has(code)) cache.set(code, store.get('messages'));
    document.documentElement.lang = code;
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
