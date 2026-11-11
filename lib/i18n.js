import store from './store.js';

const isBrowser = typeof window !== 'undefined';
const cache = new Map();

// Locale config is injected by the server (entry-server.js) as window.__LOCALE_CONFIG__,
// sourced from app.config.yml. No locale list is hardcoded here. Defaults keep the
// module usable before injection / outside the browser.
const DEFAULT_LOCALE_CONFIG = { supported: ['en'], default: 'en' };
const localeConfig = () => (isBrowser && window.__LOCALE_CONFIG__) || DEFAULT_LOCALE_CONFIG;
const SUPPORTED = () => localeConfig().supported;
const FALLBACK = () => localeConfig().default;

function normalize(lang) {
  const code = (lang || FALLBACK()).split(/[-_]/)[0].toLowerCase();
  return SUPPORTED().includes(code) ? code : FALLBACK();
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

/**
 * Settle the locale on startup. In order: the `locale` cookie (an explicit choice),
 * the locale the server rendered this document in, the browser's language list,
 * the configured default.
 *
 * A server-rendered document is never second-guessed. The server already
 * negotiated from the cookie and Accept-Language (core/locale.js), and
 * navigator.language can legitimately disagree with it — a client that sends no
 * Accept-Language (headless Chrome, so every Lighthouse run), or a list like
 * [de, en] where the server falls through to `en`. Switching then would re-render
 * every translated component right after first paint, and a re-rendered page
 * recreates its children without their declarative shadow roots, so every
 * loading="lazy" section is imported at once instead of on scroll.
 */
export async function initLocale() {
  let code = FALLBACK();
  if (isBrowser) {
    const primary = tag => (tag || '').split(/[-_]/)[0].toLowerCase();
    const cookieLang = document.cookie.match(/(?:^|;\s*)locale=([^;]+)/)?.[1];
    // Only the CSR shell (no `served`) decides from the browser, and it ranks the
    // whole list the way the server ranks Accept-Language.
    const candidates = [cookieLang, localeConfig().served, ...(navigator.languages || [navigator.language])];
    code = candidates.map(primary).find(c => SUPPORTED().includes(c)) || FALLBACK();
  }
  // Fast path 1: the store already holds this locale (always true after SSR) — no re-set, no fetch.
  // Guard on *non-empty* messages: in CSR there's no __INITIAL_STATE__, so the
  // store seeds with its defaults (locale === default, messages === {}). An empty
  // {} is truthy, so a bare `store.get('messages')` check would short-circuit here
  // for the default locale and never fetch its catalogue — leaving every {{t.*}}
  // unresolved. Requiring keys lets the default locale fall through to the fetch.
  const hydrated = isBrowser && store.get('locale') === code ? store.get('messages') : null;
  if (hydrated && Object.keys(hydrated).length) {
    if (!cache.has(code)) cache.set(code, hydrated);
    if (document.documentElement.lang !== code) document.documentElement.lang = code;
    return code;
  }
  // Fast path 2 (CSR shell): the browser wants a locale other than the baked-in
  // default, and the shell inlined it into __LOCALES__. Switch synchronously so no
  // network round-trip enters the critical chain.
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

export const getLocale = () => store.get('locale') || FALLBACK();
export const getSupportedLocales = () => [...SUPPORTED()];
