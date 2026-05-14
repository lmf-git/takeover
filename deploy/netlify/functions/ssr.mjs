import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
process.env.SSR_ROOT = join(root, 'dist/server');
process.env.NODE_ENV = 'production';

const SUPPORTED = ['en', 'es'];
const FALLBACK = 'es';

function pickLocale(acceptLanguage) {
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
  for (const { code } of ranked) if (SUPPORTED.includes(code)) return code;
  return null;
}

function cookieLocale(cookieHeader) {
  if (!cookieHeader) return null;
  const m = cookieHeader.match(/(?:^|;\s*)locale=([^;]+)/);
  if (!m) return null;
  const code = decodeURIComponent(m[1]).split(/[-_]/)[0].toLowerCase();
  return SUPPORTED.includes(code) ? code : null;
}

export async function handler(event) {
  const template = readFileSync(join(root, 'dist/client/_template.html'), 'utf-8');
  const { render } = await import(pathToFileURL(join(root, 'dist/server/core/server/entry-server.mjs')).href);
  const headers = event.headers || {};
  // Cookie wins so explicit user choices override the browser's Accept-Language.
  const locale = cookieLocale(headers['cookie'] || headers['Cookie'])
    || pickLocale(headers['accept-language'] || headers['Accept-Language'])
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
