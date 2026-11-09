// Cloudflare Pages Worker — SSR at the edge.
// Paths are relative to dist/client/, where the build copies core/ and lib/.
//
// This adapter has no node:fs, so it can't read app.config.yml or walk the source
// tree the way core/server/entry-server.js does. Everything it needs that isn't
// per-request comes from _ssr-config.json, emitted by build.js: the supported
// locale list, site defaults, the discovered tag → source-file registry and each
// component's `static local`. Locale negotiation and request state are the shared
// implementations in core/locale.js, so this target renders the same page as the
// dev server and the Netlify function.
import { createRenderer } from './core/server/ssr.js';
import { createMatcher, withNotFound } from './core/routes.js';
import { negotiateLocale, requestState } from './core/locale.js';
import { pathsForTag } from './core/tags.js';
import { cacheControl, IMMUTABLE } from './core/cache.js';
import store from './lib/store.js';

const FALLBACK_CONFIG = { locales: { supported: ['en'], default: 'en' }, site: {}, auth: {}, tags: {}, locals: {} };

// Per-isolate memoisation. Promises (not resolved values) so concurrent requests
// share one fetch instead of racing to populate the same cache.
let configPromise, routesPromise, rendererRef;
const localeCache = new Map();

const makeResolvePaths = tags => tag => {
  // The router is structural — the renderer splices the matched page into it.
  if (tag === 'app-router') return null;
  const paths = pathsForTag(tag, tags);
  return { tpl: paths.html, css: paths.moduleCss, plainCss: paths.css };
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const asset = path => env.ASSETS.fetch(new URL(path, request.url));

    // Files and component templates come straight from the Pages store. Any extension
    // but .html marks a file — the same rule as the dev server and the Netlify adapter.
    const ext = url.pathname.match(/\.[^/.]+$/)?.[0];
    const isTemplateFile = url.pathname.endsWith('.html') && (url.pathname.startsWith('/app/') || url.pathname.startsWith('/components/'));
    if ((ext && ext !== '.html') || isTemplateFile) {
      const res = await env.ASSETS.fetch(request);
      // Content-hashed modules and fonts never change under the same URL. The
      // policy is set here (shared with the Node server via core/cache.js) rather
      // than in a _headers file, so it holds whatever the platform does for
      // responses that pass through a worker.
      if (!res.ok || cacheControl(url.pathname) !== IMMUTABLE) return res;
      const cached = new Response(res.body, res);
      cached.headers.set('Cache-Control', IMMUTABLE);
      return cached;
    }

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
        locals: config.locals,
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

      const state = requestState(store.defaults, { locale, messages, cookie: request.headers.get('cookie'), config });
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
        status: result.status || 200,
        headers: {
          'Content-Type': 'text/html;charset=UTF-8',
          // Response body varies by negotiated language — keep caches honest.
          'Vary': 'Accept-Language, Cookie',
          'Cache-Control': 'no-cache',
        },
      });
    } catch (e) {
      // The stack goes to the worker log (wrangler tail), not to the visitor.
      console.error('[SSR]', e);
      return new Response('<h1>500</h1><p>Internal Server Error</p>', { status: 500, headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
    }
  }
};
