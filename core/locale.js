// Locale negotiation, shared by every SSR entry point — the dev/prod Node server,
// the Netlify function and the Cloudflare worker — so they cannot disagree about
// which language a given request is served in.
//
// Pure: no I/O, no platform globals, no config loading. Callers supply the
// supported list and default (both from app.config.yml) plus the raw headers.

/** Reduce a language tag to its primary subtag: 'en-GB' → 'en'. */
const primary = tag => (tag || '').split(/[-_]/)[0].trim().toLowerCase();

/** Parse Accept-Language into primary subtags ordered by descending q-value. */
export function rankLanguages(header) {
  if (!header) return [];
  return header
    .split(',')
    .map(part => {
      const [tag, ...params] = part.trim().split(';');
      const q = params.find(p => p.trim().startsWith('q='));
      return { code: primary(tag), q: q ? (parseFloat(q.split('=')[1]) || 0) : 1 };
    })
    .filter(e => e.code)
    .sort((a, b) => b.q - a.q)
    .map(e => e.code);
}

/** Read the `locale` cookie out of a Cookie header. Returns a primary subtag or null. */
export function localeFromCookie(cookieHeader) {
  const m = (cookieHeader || '').match(/(?:^|;\s*)locale=([^;]+)/);
  if (!m) return null;
  let raw = m[1];
  try { raw = decodeURIComponent(raw); } catch {}
  return primary(raw) || null;
}

/**
 * Pick the locale for a request. An explicit cookie choice beats the browser's
 * Accept-Language (it's what the user last selected, and what the previous SSR
 * response rendered); anything unsupported falls back to the configured default.
 */
export function negotiateLocale({ cookie, acceptLanguage, supported = [], fallback } = {}) {
  const def = fallback || supported[0] || 'en';
  const fromCookie = localeFromCookie(cookie);
  if (fromCookie && supported.includes(fromCookie)) return fromCookie;
  for (const code of rankLanguages(acceptLanguage)) if (supported.includes(code)) return code;
  return def;
}
