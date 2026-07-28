// Cloudflare Pages Worker — SSR at the edge.
// Paths are relative to dist/client/, where the build copies core/ and lib/.
//
// This adapter has no node:fs, so it can't read app.config.yml or walk the source
// tree the way core/server/entry-server.js does. Everything it needs that isn't
// per-request comes from _ssr-config.json, emitted by build.js: the supported
// locale list and the discovered tag → directory registry. Locale negotiation
// itself is the shared implementation in core/locale.js, so this target resolves
// the same language as the dev server and the Netlify function.
import { createRenderer } from './core/server/ssr.js';
import { createMatcher, withNotFound } from './core/routes.js';
import { negotiateLocale } from './core/locale.js';
import { dirForTag, baseName } from './core/tags.js';
import store from './lib/store.js';

const STATIC_EXT = ['.js', '.mjs', '.css', '.json', '.svg', '.png', '.jpg', '.webp', '.ico', '.woff', '.woff2', '.otf', '.ttf'];
const FALLBACK_CONFIG = { locales: { supported: ['en'], default: 'en' }, tags: {} };

// Per-isolate memoisation. Promises (not resolved values) so concurrent requests
// share one fetch instead of racing to populate the same cache.
let configPromise, routesPromise, rendererRef;
const localeCache = new Map();

const makeResolvePaths = tags => tag => {
  // The router is structural — the renderer splices the matched page into it.
  if (tag === 'app-router') return null;
  const dir = dirForTag(tag, tags);
  const base = baseName(dir);
  return { tpl: `/${dir}/${base}.html`, css: `/${dir}/${base}.module.css`, plainCss: `/${dir}/${base}.css` };
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const asset = path => env.ASSETS.fetch(new URL(path, request.url));

    // Static assets and component templates come straight from the Pages store.
    const isStaticAsset = STATIC_EXT.some(e => url.pathname.endsWith(e));
    const isTemplateFile = url.pathname.endsWith('.html') && (url.pathname.startsWith('/app/') || url.pathname.startsWith('/components/'));
    if (isStaticAsset || isTemplateFile) return env.ASSETS.fetch(url);

    try {
      configPromise ??= asset('/_ssr-config.json')
        .then(r => (r.ok ? r.json() : FALLBACK_CONFIG))
        .catch(() => FALLBACK_CONFIG);
      const config = await configPromise;

      rendererRef ??= createRenderer({
        loadFile: async path => {
          const res = await asset(path);
          if (!res.ok) throw new Error(`Failed to load ${path}`);
          return res.text();
        },
        resolvePaths: makeResolvePaths(config.tags),
      });

      // routes.json carries no wildcard entry — withNotFound adds the 404 fallback,
      // exactly as the Node SSR entry and the client Router do.
      routesPromise ??= asset('/routes.json')
        .then(r => r.json())
        .then(data => withNotFound(data.map(r => ({ ...r, matcher: r.dynamic ? createMatcher(r.path) : null }))));
      const routes = await routesPromise;

      const { supported, default: fallback } = config.locales;
      const locale = negotiateLocale({
        cookie: request.headers.get('cookie'),
        acceptLanguage: request.headers.get('accept-language'),
        supported,
        fallback,
      });

      const loadLocale = async code => {
        if (!localeCache.has(code)) {
          localeCache.set(code, asset(`/locales/${code}.json`).then(r => (r.ok ? r.json() : {})).catch(() => ({})));
        }
        return localeCache.get(code);
      };

      // Active locale seeds the store (and therefore __INITIAL_STATE__); the rest
      // ride along as __LOCALES__ so a language switch needs no network round-trip.
      const messages = await loadLocale(locale);
      const otherLocales = {};
      await Promise.all(supported.filter(l => l !== locale).map(async l => { otherLocales[l] = await loadLocale(l); }));

      const state = { ...store.defaults, locale, messages };
      const result = await rendererRef(url.pathname + url.search, routes, state, { otherLocales, localeConfig: config.locales });

      if (result.redirect) {
        return new Response(null, { status: 302, headers: { Location: result.redirect } });
      }

      const templateRes = await asset('/_template.html');
      const template = await templateRes.text();

      // Function-form replacers: $-patterns ($&, $`, $', $1) in the inlined bundle
      // or the rendered HTML would otherwise be interpreted and corrupt the output.
      const html = template
        // Match the served locale on the root element so client-side initLocale()
        // doesn't have to flip document.documentElement.lang post-hydrate.
        .replace(/<html\s+lang="[^"]*"/, () => `<html lang="${locale}"`)
        .replace('<!--head-meta-->', () => result.headMeta || '')
        .replace('<!--app-html-->', () => result.appHtml)
        .replace('<!--initial-state-->', () => result.initialStateScript + (result.localesScript || ''));

      return new Response(html, {
        headers: {
          'Content-Type': 'text/html;charset=UTF-8',
          // Response body varies by negotiated language — keep caches honest.
          'Vary': 'Accept-Language, Cookie',
          'Cache-Control': 'no-cache',
        },
      });
    } catch (e) {
      return new Response(`<h1>500</h1><pre>${e.stack}</pre>`, { status: 500, headers: { 'Content-Type': 'text/html' } });
    }
  }
};
