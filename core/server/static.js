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
import { readFile, stat } from 'node:fs/promises';
import { join, extname, resolve, dirname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(process.env.CSR_ROOT || join(__dirname, '../../dist/client'));
const port = process.env.PORT || 4399;

const mime = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.otf': 'font/otf', '.ttf': 'font/ttf',
};

const send = (res, status, body, type = 'text/html') =>
  res.writeHead(status, { 'Content-Type': type }).end(body);

const server = createServer(async (req, res) => {
  const path = decodeURIComponent(req.url.split('?')[0]);
  // Resolve within root and reject path traversal.
  let file = normalize(join(root, path));
  if (file !== root && !file.startsWith(root + (process.platform === 'win32' ? '\\' : '/')))
    return send(res, 403, '403 Forbidden');

  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
  } catch {
    // No such file: SPA catch-all for extension-less paths → index.html.
    if (extname(path)) return send(res, 404, '404 Not Found');
    file = join(root, 'index.html');
  }

  try {
    const buf = await readFile(file);
    const ext = extname(file);
    res.writeHead(200, {
      'Content-Type': mime[ext] || 'application/octet-stream',
      // Hashed assets are immutable; HTML must revalidate so the shell stays current.
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000',
    });
    res.end(buf);
  } catch {
    send(res, 404, '404 Not Found');
  }
});

server.listen(port, () => {
  console.log(`[csr] Serving ${root}`);
  console.log(`[csr] http://localhost:${port}`);
});
