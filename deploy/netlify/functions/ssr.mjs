import { readFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const serverRoot = join(root, 'dist/server');
process.env.SSR_ROOT = serverRoot;
process.env.NODE_ENV = 'production';

// Locale negotiation list comes from app.config.yml (copied into dist/server at
// build); the negotiation itself is core/locale.js, shared with the dev server and
// the Cloudflare worker so all three resolve the same language. Both modules are
// loaded at runtime via pathToFileURL — same pattern as entry-server, so the
// Netlify bundler doesn't need to trace the paths.
let runtimePromise;
const getRuntime = async () => {
  runtimePromise ??= Promise.all([
    import(pathToFileURL(join(serverRoot, 'core/config.mjs')).href),
    import(pathToFileURL(join(serverRoot, 'core/locale.mjs')).href),
    import(pathToFileURL(join(serverRoot, 'core/server/entry-server.mjs')).href),
  ]).then(([cfg, loc, entry]) => ({
    locales: cfg.loadConfig(serverRoot).locales,
    negotiateLocale: loc.negotiateLocale,
    render: entry.render,
    // Read once per function instance, not once per request.
    template: readFileSync(join(root, 'dist/client/_template.html'), 'utf-8'),
  }))
    // A failed load must not be memoised — the next request tries again.
    .catch(e => { runtimePromise = undefined; throw e; });
  return runtimePromise;
};

export async function handler(event) {
  // The catch-all rewrite isn't forced, so Netlify only lands here when no static file
  // matched — a file-like path (/llms.txt, /favicon.ico, /.well-known/ard.json) is
  // missing. Plain 404, same rule as the dev server, instead of rendering the app.
  const ext = extname(event.path);
  if (ext && ext !== '.html') return { statusCode: 404, headers: { 'Content-Type': 'text/plain' }, body: 'Not found' };

  const { locales, negotiateLocale, render, template } = await getRuntime();
  const headers = event.headers || {};
  const cookie = headers['cookie'] || headers['Cookie'] || '';
  const locale = negotiateLocale({
    cookie,
    acceptLanguage: headers['accept-language'] || headers['Accept-Language'],
    supported: locales.supported,
    fallback: locales.default,
  });
  const result = await render(event.path + (event.rawQuery ? `?${event.rawQuery}` : ''), { locale, cookie });

  if (result.redirect) return { statusCode: 302, headers: { Location: result.redirect } };

  // Function-form replacers avoid $-pattern interpretation in replacement strings.
  // The inlined bundle and SSR appHtml may legitimately contain $ characters.
  return {
    statusCode: result.status || 200,
    headers: { 'Content-Type': 'text/html', 'Vary': 'Accept-Language, Cookie' },
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
