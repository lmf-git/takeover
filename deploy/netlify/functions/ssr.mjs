import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const serverRoot = join(root, 'dist/server');
process.env.SSR_ROOT = serverRoot;
process.env.NODE_ENV = 'production';

// Locale negotiation list comes from app.config.yml (copied into dist/server at
// build). Loaded once via the built config module — same runtime-resolution
// pattern as entry-server below, so the Netlify bundler doesn't need the path.
let localeCfgPromise;
const getLocaleConfig = async () => {
  localeCfgPromise ??= import(pathToFileURL(join(serverRoot, 'core/config.mjs')).href)
    .then(m => m.loadConfig(serverRoot).locales);
  return localeCfgPromise;
};

function pickLocale(acceptLanguage, supported) {
  if (!acceptLanguage) return null;
  const ranked = acceptLanguage
    .split(',')
    .map(part => {
      const [tag, ...params] = part.trim().split(';');
      const q = params.find(p => p.trim().startsWith('q='));
      return { code: tag.split(/[-_]/)[0].toLowerCase(), q: q ? parseFloat(q.split('=')[1]) || 0 : 1 };
    })
    .filter(e => e.code)
    .sort((a, b) => b.q - a.q);
  for (const { code } of ranked) if (supported.includes(code)) return code;
  return null;
}

function cookieLocale(cookieHeader, supported) {
  if (!cookieHeader) return null;
  const m = cookieHeader.match(/(?:^|;\s*)locale=([^;]+)/);
  if (!m) return null;
  const code = decodeURIComponent(m[1]).split(/[-_]/)[0].toLowerCase();
  return supported.includes(code) ? code : null;
}

export async function handler(event) {
  const template = readFileSync(join(root, 'dist/client/_template.html'), 'utf-8');
  const { render } = await import(pathToFileURL(join(root, 'dist/server/core/server/entry-server.mjs')).href);
  const { supported: SUPPORTED, default: FALLBACK } = await getLocaleConfig();
  const headers = event.headers || {};
  // Cookie wins so explicit user choices override the browser's Accept-Language.
  const locale = cookieLocale(headers['cookie'] || headers['Cookie'], SUPPORTED)
    || pickLocale(headers['accept-language'] || headers['Accept-Language'], SUPPORTED)
    || FALLBACK;
  const result = await render(event.path + (event.rawQuery ? `?${event.rawQuery}` : ''), { locale });

  if (result.redirect) return { statusCode: 302, headers: { Location: result.redirect } };

  // Function-form replacers avoid $-pattern interpretation in replacement strings.
  // The inlined bundle and SSR appHtml may legitimately contain $ characters.
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'text/html', 'Vary': 'Accept-Language' },
    body: template
      // Match the served locale on the root element so the client-side
      // initLocale() doesn't have to flip `document.documentElement.lang`
      // post-hydrate (which invalidates style for the whole document).
      .replace(/<html\s+lang="[^"]*"/, () => `<html lang="${locale}"`)
      .replace('<!--head-meta-->', () => (result.headMeta || '') + (result.scopedStyles || ''))
      .replace('<!--app-html-->', () => result.appHtml)
      .replace('<!--initial-state-->', () => result.initialStateScript + (result.localesScript || ''))
  };
}
