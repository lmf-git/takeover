import { renderWithExpressions, filePathToRoute, matchRoute } from '../core/index.js';
import store from '../core/context.js';

const pages = import.meta.glob('../app/**/*.html', { query: '?raw', import: 'default', eager: true });

const routes = Object.entries(pages)
  .filter(([p]) => !p.includes('/_'))
  .map(([path, html]) => {
    const route = filePathToRoute(path, '../app/');
    return route ? { ...route, html } : null;
  })
  .filter(Boolean);

const notFound = routes.find(r => r.component === 'notfound-page');
if (notFound) routes.push({ ...notFound, path: '*', dynamic: false });

const esc = s => String(s).replace(/[&"'<>]/g, c => ({ '&': '&amp;', '"': '&quot;', "'": '&#39;', '<': '&lt;', '>': '&gt;' })[c]);

export async function render(url) {
  const [pathname, search] = url.split('?');
  const path = pathname === '/' ? '/' : pathname.replace(/\/$/, '');

  const result = matchRoute(routes, path);
  if (!result) return { appHtml: '<h1>404</h1>', initialStateScript: '', headMeta: '' };

  const { route, params } = result;

  if (route.requiresAuth && !store.get('isAuthenticated')) {
    return { redirect: `/login?from=${encodeURIComponent(path)}` };
  }

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
