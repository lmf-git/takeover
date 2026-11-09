// Zero-dependency static file server for the CSR build (dist/client).
//
// SSR uses index.js (renders per request). This serves the pre-built static
// shell instead — for previewing the CSR target locally, or as a reference for
// the kind of host (S3, GitHub Pages, any CDN bucket) the CSR build targets.
//
// Key behaviour: a SPA catch-all. Any request without a file extension that
// doesn't map to a real file falls back to /index.html, so client-side routes
// like /about resolve to the shell and the Router renders them in the browser.
// Real hosts express the same rule via a rewrite (Netlify `/* /index.html 200`,
// Cloudflare `_redirects`, nginx `try_files ... /index.html`).
import { createServer } from 'node:http';
import { stat } from 'node:fs/promises';
import { join, extname, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseUrl, resolveInside, cacheControl, sendFile } from './http.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(process.env.CSR_ROOT || join(__dirname, '../../dist/client'));
const port = process.env.PORT || 4399;

const send = (res, status, body, type = 'text/html') =>
  res.writeHead(status, { 'Content-Type': type }).end(body);

async function handler(req, res) {
  const parsed = parseUrl(req.url);
  if (!parsed) return send(res, 400, '400 Bad Request');
  const path = parsed.pathname;
  // Resolve within root; rejects path traversal and dotfiles.
  let file = resolveInside(root, path);
  if (!file) return send(res, 403, '403 Forbidden');

  let fallback = false;
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
  } catch {
    // No such file: SPA catch-all for extension-less paths → index.html.
    if (extname(path)) return send(res, 404, '404 Not Found');
    file = join(root, 'index.html');
    fallback = true;
  }

  // Hashed assets are immutable; HTML (and anything unhashed) must revalidate so
  // the shell stays current.
  const cache = fallback || extname(file) === '.html' ? 'no-cache' : cacheControl(path);
  if (!await sendFile(req, res, file, { cache })) send(res, 404, '404 Not Found');
}

const server = createServer((req, res) => {
  handler(req, res).catch(e => {
    console.error('[csr]', e);
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Internal Server Error');
  });
});

server.listen(port, () => {
  console.log(`[csr] Serving ${root}`);
  console.log(`[csr] http://localhost:${port}`);
});
