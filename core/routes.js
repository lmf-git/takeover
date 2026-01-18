// File-based routing - no dependencies

// Configurable - override in your app
export let protectedRoutes = new Set(['/dashboard']);
export const setProtectedRoutes = routes => protectedRoutes = new Set(routes);

function createMatcher(pattern) {
  const params = [];
  const regex = new RegExp(
    '^' + pattern.replace(/:([^/]+)/g, (_, name) => (params.push(name), '([^/]+)')).replace(/\//g, '\\/') + '$'
  );
  return { regex, params };
}

export function filePathToRoute(filePath, basePath = '') {
  const segments = filePath.replace(basePath, '').replace(/\.html$/, '').split('/').filter(Boolean);
  if (!segments.length) return null;

  const routePath = '/' + segments.map(s => {
    const match = s.match(/^\[(.+)\]$/);
    return match ? `:${match[1]}` : s.toLowerCase();
  }).join('/');

  // Normalize home route
  const path = routePath.replace(/^\/(home\/)?home$/, '/');
  const dynamic = path.includes(':');

  return {
    path,
    component: segments.at(-1).toLowerCase().replace(/\[.*?\]/, '') + '-page',
    templatePath: filePath,
    requiresAuth: protectedRoutes.has(path),
    dynamic,
    matcher: dynamic ? createMatcher(path) : null
  };
}

export function matchRoute(routes, pathname) {
  const path = pathname === '/' ? '/' : pathname.replace(/\/$/, '');

  // Static first (faster)
  const exact = routes.find(r => !r.dynamic && r.path === path);
  if (exact) return { route: exact, params: {} };

  // Dynamic routes
  for (const route of routes) {
    if (!route.dynamic || !route.matcher) continue;
    const match = path.match(route.matcher.regex);
    if (match) {
      const params = Object.fromEntries(
        route.matcher.params.map((name, i) => [name, decodeURIComponent(match[i + 1])])
      );
      return { route, params };
    }
  }

  // 404
  const fallback = routes.find(r => r.path === '*' || r.path === '/404');
  return fallback ? { route: fallback, params: {} } : null;
}

export function buildRoutesFromGlob(glob, basePath) {
  const routes = Object.entries(glob)
    .filter(([p]) => !p.includes('/_'))
    .map(([p, loader]) => {
      const route = filePathToRoute(p, basePath);
      return route ? { ...route, loader, loaded: false } : null;
    })
    .filter(Boolean);

  // Add wildcard for 404
  const notFound = routes.find(r => r.component === 'notfound-page');
  if (notFound) routes.push({ ...notFound, path: '*', dynamic: false, matcher: null });

  return routes;
}
