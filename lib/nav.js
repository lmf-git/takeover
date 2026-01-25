/**
 * Navigation utilities
 * @module lib/nav
 */

const isBrowser = typeof window !== 'undefined';

/**
 * Navigate to a path (pushes to history)
 * @param {string} path - Target path
 * @param {Object} [state] - Optional state to pass
 */
export function navigate(path, state = null) {
  if (!isBrowser) return;
  dispatchEvent(new CustomEvent('navigate', { detail: { path, state } }));
}

/**
 * Replace current path (no history entry)
 * @param {string} path - Target path
 * @param {Object} [state] - Optional state to pass
 */
export function replace(path, state = null) {
  if (!isBrowser) return;
  history.replaceState(state, '', path);
  dispatchEvent(new PopStateEvent('popstate'));
}

/**
 * Go back in history
 * @param {number} [steps=1] - Number of steps to go back
 */
export function back(steps = 1) {
  if (!isBrowser) return;
  history.go(-steps);
}

/**
 * Go forward in history
 * @param {number} [steps=1] - Number of steps to go forward
 */
export function forward(steps = 1) {
  if (!isBrowser) return;
  history.go(steps);
}

/**
 * Redirect to login with return path
 * @param {string} [returnPath] - Path to return to after login (defaults to current)
 */
export function redirectToLogin(returnPath) {
  const from = returnPath ?? (isBrowser ? location.pathname + location.search : '/');
  replace(`/login?from=${encodeURIComponent(from)}`);
}

/**
 * Get query parameters as object
 * @param {string} [search] - Query string (defaults to current)
 * @returns {Object}
 */
export function getQuery(search) {
  const s = search ?? (isBrowser ? location.search : '');
  return Object.fromEntries(new URLSearchParams(s));
}

/**
 * Get a single query parameter
 * @param {string} key - Parameter name
 * @returns {string|null}
 */
export function getQueryParam(key) {
  if (!isBrowser) return null;
  return new URLSearchParams(location.search).get(key);
}

/**
 * Update query parameters (merges with existing)
 * @param {Object} params - Parameters to set/update
 * @param {Object} [options] - { replace: false }
 */
export function setQuery(params, { replace: doReplace = false } = {}) {
  if (!isBrowser) return;
  const current = new URLSearchParams(location.search);
  for (const [k, v] of Object.entries(params)) {
    if (v == null) current.delete(k);
    else current.set(k, v);
  }
  const path = location.pathname + (current.toString() ? `?${current}` : '');
  doReplace ? replace(path) : navigate(path);
}

/**
 * Build a URL with query parameters
 * @param {string} path - Base path
 * @param {Object} [params] - Query parameters
 * @returns {string}
 */
export function buildUrl(path, params = {}) {
  const query = new URLSearchParams(params).toString();
  return query ? `${path}?${query}` : path;
}

/**
 * Check if current path matches a pattern
 * @param {string|RegExp} pattern - Path or pattern to match
 * @returns {boolean}
 */
export function isActive(pattern) {
  if (!isBrowser) return false;
  const path = location.pathname;
  if (typeof pattern === 'string') return path === pattern || path.startsWith(pattern + '/');
  return pattern.test(path);
}

/**
 * Parse path parameters from a route pattern
 * @param {string} pattern - Route pattern like '/users/:id'
 * @param {string} path - Actual path like '/users/123'
 * @returns {Object|null} - Parsed params or null if no match
 */
export function parseParams(pattern, path) {
  const patternParts = pattern.split('/');
  const pathParts = path.split('/');
  if (patternParts.length !== pathParts.length) return null;
  const params = {};
  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i].startsWith(':')) {
      params[patternParts[i].slice(1)] = pathParts[i];
    } else if (patternParts[i] !== pathParts[i]) {
      return null;
    }
  }
  return params;
}

export default { navigate, replace, back, forward, redirectToLogin, getQuery, getQueryParam, setQuery, buildUrl, isActive, parseParams };
