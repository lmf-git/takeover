// File-based routing - no dependencies

export function createMatcher(pattern) {
  const params = [];
  const regex = new RegExp(
    '^' + pattern.replace(/:([^/]+)/g, (_, name) => (params.push(name), '([^/]+)')).replace(/\//g, '\\/') + '$'
  );
  return { regex, params };
}

export function pathFromFile(filePath, basePath = '') {
  const segments = filePath.replace(basePath, '').replace(/\.(html|js)$/, '').split('/').filter(Boolean);
  if (!segments.length) return null;

  const routePath = '/' + segments.map(s => {
    const match = s.match(/^\[(.+)\]$/);
    return match ? `:${match[1]}` : s.toLowerCase();
  }).join('/');

  return routePath.replace(/^\/(home\/)?home$/, '/');
}

export function matchRoute(routes, pathname) {
  const path = pathname === '/' ? '/' : pathname.replace(/\/$/, '');

  // Static first
  const exact = routes.find(r => !r.dynamic && r.path === path);
  if (exact) return { route: exact, params: {} };

  // Dynamic
  for (const route of routes.filter(r => r.dynamic && r.matcher)) {
    const match = path.match(route.matcher.regex);
    if (match) {
      return {
        route,
        params: Object.fromEntries(route.matcher.params.map((name, i) => [name, decodeURIComponent(match[i + 1])]))
      };
    }
  }

  // 404
  const fallback = routes.find(r => r.path === '*');
  return fallback ? { route: fallback, params: {} } : null;
}
