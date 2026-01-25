// Paths relative to dist/client/ after copy
import { createRenderer } from './core/server/ssr.js';
import store from './lib/store.js';
import { createMatcher } from './core/routes.js';

let renderer, routesCache;

const resolvePaths = tag => {
  if (tag === 'app-layout') return { tpl: '/app/_Layout/_Layout.html', css: '/app/_Layout/_Layout.module.css' };
  if (tag === 'app-router') return null;
  const isPage = tag.endsWith('-page');
  const name = isPage ? tag.replace('-page', '') : tag.replace(/^app-/, '');
  const pascal = name.split('-').map(p => p[0].toUpperCase() + p.slice(1)).join('');
  const dir = isPage ? '/app' : '/components';
  return { tpl: `${dir}/${pascal}/${pascal}.html`, css: `${dir}/${pascal}/${pascal}.module.css` };
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Serve static assets (including component templates in /app/ and /components/)
    const isStaticAsset = ['.js', '.mjs', '.css', '.json', '.svg', '.png', '.jpg', '.ico', '.woff', '.woff2'].some(e => url.pathname.endsWith(e));
    const isTemplateFile = url.pathname.endsWith('.html') && (url.pathname.startsWith('/app/') || url.pathname.startsWith('/components/'));
    if (isStaticAsset || isTemplateFile) {
      return env.ASSETS.fetch(url);
    }

    if (!renderer) {
      const loadFile = async path => {
        const res = await env.ASSETS.fetch(new URL(path, request.url));
        if (!res.ok) throw new Error(`Failed to load ${path}`);
        return res.text();
      };
      renderer = createRenderer({ loadFile, resolvePaths });
    }

    if (!routesCache) {
      const res = await env.ASSETS.fetch(new URL('/routes.json', request.url));
      routesCache = (await res.json()).map(r => ({
        ...r,
        matcher: r.dynamic ? createMatcher(r.path) : null
      }));
    }

    try {
      const templateRes = await env.ASSETS.fetch(new URL('/_template.html', request.url));
      const template = await templateRes.text();
      const result = await renderer(url.pathname + url.search, routesCache, store.defaults);

      if (result.redirect) {
        return new Response(null, { status: 302, headers: { Location: result.redirect } });
      }

      const html = template
        .replace('<!--head-meta-->', result.headMeta || '')
        .replace('<!--app-html-->', result.appHtml)
        .replace('<!--initial-state-->', result.initialStateScript);

      return new Response(html, { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
    } catch (e) {
      return new Response(`<h1>500</h1><pre>${e.stack}</pre>`, { status: 500, headers: { 'Content-Type': 'text/html' } });
    }
  }
};
