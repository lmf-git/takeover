import { readFile } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderWithExpressions, matchRoute, createMatcher, pathFromFile } from '../index.js';
import { scanDir } from '../scan.js';
import store from '../context.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(__dirname, '../../app');

// Build routes from HTML templates
async function buildRoutes() {
  const files = await scanDir(appDir, '.html');
  const routes = [];

  for (const { path: filePath, relative } of files) {
    if (relative.startsWith('_')) continue;

    const routePath = pathFromFile(relative.replace('.html', '.js'), '');
    if (!routePath) continue;

    const html = await readFile(filePath, 'utf-8');
    const dynamic = routePath.includes(':');

    routes.push({
      path: routePath,
      component: relative.split('/').pop().replace('.html', '').toLowerCase() + '-page',
      html,
      dynamic,
      matcher: dynamic ? createMatcher(routePath) : null
    });
  }

  // Add 404 wildcard
  const notFound = routes.find(r => r.component === 'notfound-page');
  if (notFound) routes.push({ ...notFound, path: '*', dynamic: false, matcher: null });

  return routes;
}

const routesPromise = buildRoutes();

const esc = s => String(s).replace(/[&"'<>]/g, c => ({ '&': '&amp;', '"': '&quot;', "'": '&#39;', '<': '&lt;', '>': '&gt;' })[c]);

export async function render(url) {
  const routes = await routesPromise;
  const [pathname, search] = url.split('?');
  const path = pathname === '/' ? '/' : pathname.replace(/\/$/, '');

  const result = matchRoute(routes, path);
  if (!result) return { appHtml: '<h1>404</h1>', initialStateScript: '', headMeta: '' };

  const { route, params } = result;
  const state = store.get();
  const props = { ...state, path: url, params, query: Object.fromEntries(new URLSearchParams(search || '')) };
  const appHtml = renderWithExpressions(route.html, props);

  const meta = state.meta || {};
  const headMeta = [
    meta.title && `<title>${esc(meta.title)}</title>`,
    meta.description && `<meta name="description" content="${esc(meta.description)}">`
  ].filter(Boolean).join('');

  return {
    appHtml,
    initialStateScript: `<script>window.__INITIAL_STATE__=${JSON.stringify(state)}</script>`,
    headMeta
  };
}
