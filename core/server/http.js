// Shared HTTP plumbing for the two Node servers (index.js — SSR, static.js — CSR
// preview): MIME types, safe URL → file resolution, cache policy, file sending.
import { stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { extname, resolve, sep } from 'node:path';

export { cacheControl } from '../cache.js';

export const mime = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.xml': 'application/xml',
  '.txt': 'text/plain', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.avif': 'image/avif', '.gif': 'image/gif', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.otf': 'font/otf', '.ttf': 'font/ttf',
};

/**
 * Split a raw request URL into a decoded pathname and its query string.
 * Returns null for a malformed escape (`/%`, `/%zz`) — the caller answers 400
 * instead of letting decodeURIComponent throw out of an async handler, which
 * would take the whole process down.
 */
export function parseUrl(rawUrl) {
  const q = rawUrl.indexOf('?');
  const rawPath = q === -1 ? rawUrl : rawUrl.slice(0, q);
  try {
    return { pathname: decodeURIComponent(rawPath), query: q === -1 ? '' : rawUrl.slice(q + 1) };
  } catch { return null; }
}

/**
 * Map a decoded URL path onto a file inside `base`, or null if it must not be
 * served: anything that resolves outside `base` (`../`, encoded or not), and any
 * dot-segment or dotfile (`.git/config`, `.env`) other than `.well-known`.
 */
export function resolveInside(base, urlPath) {
  if (urlPath.includes('\0')) return null;
  const segments = urlPath.split(/[\\/]+/).filter(Boolean);
  if (segments.some(s => s.startsWith('.') && s !== '.well-known')) return null;
  const file = resolve(base, ...segments);
  return file === base || file.startsWith(base + sep) ? file : null;
}

/**
 * Stream a file with Content-Type, Last-Modified and 304 handling.
 * Resolves false (nothing written) when the path is missing or not a file.
 */
export async function sendFile(req, res, file, { cache = 'no-cache' } = {}) {
  let stats;
  try { stats = await stat(file); } catch { return false; }
  if (!stats.isFile()) return false;

  const modified = new Date(Math.floor(stats.mtimeMs / 1000) * 1000);
  const headers = {
    'Content-Type': mime[extname(file)] || 'application/octet-stream',
    'Cache-Control': cache,
    'Last-Modified': modified.toUTCString(),
  };
  const since = Date.parse(req.headers['if-modified-since'] || '');
  if (!Number.isNaN(since) && modified.getTime() <= since) {
    res.writeHead(304, headers).end();
    return true;
  }
  res.writeHead(200, { ...headers, 'Content-Length': stats.size });
  if (req.method === 'HEAD') { res.end(); return true; }
  createReadStream(file).on('error', () => res.destroy()).pipe(res);
  return true;
}
