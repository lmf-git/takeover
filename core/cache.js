// Cache policy by URL — pure, so the Node servers and the edge worker share it.

// build.js content-hashes lazy modules (Home.script.<hash>.js) and the core bundle.
const HASHED_RE = /\.[0-9a-f]{8}\.js$/;

export const IMMUTABLE = 'public, max-age=31536000, immutable';

/**
 * Only content-addressed files (and fonts, which are versioned by filename) may
 * be cached forever; everything else revalidates, so a redeploy is picked up on
 * the next request.
 */
export const cacheControl = urlPath =>
  HASHED_RE.test(urlPath) || urlPath.startsWith('/_assets/') || urlPath.startsWith('/fonts/')
    ? IMMUTABLE
    : 'no-cache';
