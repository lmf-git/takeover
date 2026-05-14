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
  // Reuse SSR-hydrated messages for the active locale instead of refetching.
  const hydrated = isBrowser && store.get('locale') === lang ? store.get('messages') : null;
  if (hydrated && Object.keys(hydrated).length) {
    cache.set(lang, hydrated);
    return hydrated;
  }
  // SSR inlines non-active supported locales into window.__LOCALES__ so a
  // navigator.language mismatch doesn't trigger a network round-trip.
  const inlined = isBrowser && window.__LOCALES__?.[lang];
  if (inlined) {
    cache.set(lang, inlined);
    return inlined;
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
  if (isBrowser) {
    if (document.documentElement.lang !== code) document.documentElement.lang = code;
    // Persist so the next SSR request matches this preference and avoids the
    // navigator/server-mismatch re-render on the next page load.
    document.cookie = `locale=${code};path=/;max-age=31536000;samesite=lax`;
  }
}

/** Detect browser locale on startup, fall back to Spanish if unsupported. */
export async function initLocale() {
  // Cookie wins over navigator.language: if the user has explicitly chosen a
  // locale, that's what SSR rendered, so this avoids a needless re-render.
  let lang = FALLBACK;
  if (isBrowser) {
    const cookieLang = document.cookie.match(/(?:^|;\s*)locale=([^;]+)/)?.[1];
    lang = (cookieLang || navigator.language || '').split(/[-_]/)[0].toLowerCase();
  }
  const code = SUPPORTED.includes(lang) ? lang : FALLBACK;
  // Fast path 1: SSR-hydrated locale matches navigator — no re-set, no fetch.
  if (isBrowser && store.get('locale') === code && store.get('messages')) {
    if (!cache.has(code)) cache.set(code, store.get('messages'));
    if (document.documentElement.lang !== code) document.documentElement.lang = code;
    return code;
  }
  // Fast path 2: navigator differs from SSR locale, but SSR inlined this locale
  // into __LOCALES__. Switch synchronously so no network round-trip enters the
  // critical chain.
  const inlined = isBrowser && window.__LOCALES__?.[code];
  if (inlined) {
    cache.set(code, inlined);
    store.set({ locale: code, messages: inlined });
    if (document.documentElement.lang !== code) document.documentElement.lang = code;
    return code;
  }
  const messages = await loadMessages(code);
  store.set({ locale: code, messages });
  if (isBrowser) if (document.documentElement.lang !== code) document.documentElement.lang = code;
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
