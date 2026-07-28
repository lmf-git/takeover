export const createMatcher = pattern => {
  const params = [];
  const regex = new RegExp('^' + pattern.replace(/:([^/]+)/g, (_, n) => (params.push(n), '([^/]+)')).replace(/\//g, '\\/') + '$');
  return { regex, params };
};

export function pathFromFile(filePath, basePath = '') {
  const segs = filePath.replace(basePath, '').replace(/\.(html|js)$/, '').split('/').filter(Boolean);
  if (!segs.length) return null;
  if (segs.length >= 2 && segs.at(-1).toLowerCase() === segs.at(-2).toLowerCase().replace(/^\[(.+)\]$/, '$1'))
    segs.pop();
  const route = '/' + segs.map(s => { const m = s.match(/^\[(.+)\]$/); return m ? `:${m[1]}` : s.toLowerCase(); }).join('/');
  return route.replace(/^\/home$/, '/');
}

/**
 * Append a wildcard clone of the NotFound page so unmatched paths render it
 * instead of the renderer's bare <h1>404</h1>. Every consumer of a route table
 * needs this — the Node SSR entry, the client Router, and the edge adapters
 * reading routes.json — so it lives here rather than being repeated per host.
 */
export function withNotFound(routes) {
  const notFound = routes.find(r => r.component === 'notfound-page');
  if (!notFound || routes.some(r => r.path === '*')) return routes;
  return [...routes, { ...notFound, path: '*', dynamic: false, matcher: null }];
}

export function matchRoute(routes, pathname) {
  const path = pathname === '/' ? '/' : pathname.replace(/\/$/, '');
  const exact = routes.find(r => !r.dynamic && r.path === path);
  if (exact) return { route: exact, params: {} };

  for (const r of routes.filter(r => r.dynamic && r.matcher)) {
    const m = path.match(r.matcher.regex);
    if (m) return { route: r, params: Object.fromEntries(r.matcher.params.map((n, i) => [n, decodeURIComponent(m[i + 1])])) };
  }

  const fallback = routes.find(r => r.path === '*');
  return fallback ? { route: fallback, params: {} } : null;
}
