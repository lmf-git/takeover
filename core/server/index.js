import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { createReadStream, watch, existsSync } from 'node:fs';
import { join, extname, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from './ws.js';
import { scanRoutes } from '../scan.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '../..');
const isProd = process.env.NODE_ENV === 'production';
const port = process.env.PORT || 3000;

const mime = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2'
};

// Cache for scanned routes
let routesCache = null;

async function getRoutes() {
  if (!routesCache) routesCache = await scanRoutes(join(root, 'app'));
  return routesCache;
}

// WebSocket for HMR
let wss;
const clients = new Set();

function broadcast(type, data = {}) {
  const msg = JSON.stringify({ type, ...data });
  clients.forEach(ws => ws.readyState === 1 && ws.send(msg));
}

function setupWatcher() {
  const dirs = ['app', 'components', 'core', 'lib'].map(d => join(root, d)).filter(existsSync);
  dirs.forEach(dir => {
    watch(dir, { recursive: true }, (event, filename) => {
      if (!filename) return;
      const ext = extname(filename);
      if (['.js', '.html', '.css'].includes(ext)) {
        routesCache = null;
        console.log(`[HMR] ${filename}`);
        broadcast('reload', { file: filename });
      }
    });
  });
}

async function serveRaw(filePath, res) {
  try {
    const content = await readFile(filePath, 'utf-8');
    res.writeHead(200, { 'Content-Type': 'text/javascript' });
    res.end(`export default ${JSON.stringify(content)}`);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
}

// Extract <script> from HTML and serve as JS module
// Falls back to separate .js file if no embedded script
async function serveScript(filePath, res) {
  try {
    const content = await readFile(filePath, 'utf-8');
    const scriptMatch = content.match(/<script\b[^>]*>([\s\S]*?)<\/script>/i);
    if (scriptMatch) {
      res.writeHead(200, { 'Content-Type': 'text/javascript' });
      res.end(scriptMatch[1]);
    } else {
      // Fall back to separate .js file
      const jsPath = filePath.replace('.html', '.js');
      try {
        const jsContent = await readFile(jsPath, 'utf-8');
        res.writeHead(200, { 'Content-Type': 'text/javascript' });
        res.end(jsContent);
      } catch {
        res.writeHead(404);
        res.end('No script found in HTML and no .js file exists');
      }
    }
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
}

async function serveStatic(filePath, res) {
  try {
    const stats = await stat(filePath);
    if (!stats.isFile()) return false;

    const ext = extname(filePath);
    res.writeHead(200, {
      'Content-Type': mime[ext] || 'application/octet-stream',
      'Content-Length': stats.size,
      'Cache-Control': isProd && ext !== '.html' ? 'public, max-age=31536000' : 'no-cache'
    });
    createReadStream(filePath).pipe(res);
    return true;
  } catch {
    return false;
  }
}

function injectHMR(html) {
  const script = `<script type="module">
const ws = new WebSocket('ws://' + location.host);
ws.onmessage = e => { if (JSON.parse(e.data).type === 'reload') location.reload(); };
ws.onopen = () => console.log('[HMR] Connected');
</script>`;
  return html.replace('</body>', `${script}</body>`);
}

async function renderSSR(url, res) {
  try {
    console.log('[SSR] renderSSR called for:', url);
    let template = await readFile(join(root, 'index.html'), 'utf-8');

    // In dev, bust ESM cache with query param
    const cacheBuster = isProd ? '' : `?t=${Date.now()}`;
    console.log('[SSR] Importing entry-server.js...');
    const { render } = await import(`./entry-server.js${cacheBuster}`);
    console.log('[SSR] render function loaded');
    const result = await render(url);

    // Handle redirects (e.g., auth required)
    if (result.redirect) {
      res.writeHead(302, { 'Location': result.redirect });
      res.end();
      return;
    }

    const { appHtml, initialStateScript, headMeta, scopedStyles } = result;

    let html = template
      .replace('<!--head-meta-->', (headMeta || '') + (scopedStyles || ''))
      .replace('<!--app-html-->', appHtml)
      .replace('<!--initial-state-->', initialStateScript);

    if (!isProd) html = injectHMR(html);

    res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-cache' });
    res.end(html);
  } catch (e) {
    console.error('[SSR]', e);
    res.writeHead(500);
    res.end(`<h1>500</h1><pre>${e.stack}</pre>`);
  }
}

function json(res, data) {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

async function handler(req, res) {
  const [pathname, query] = req.url.split('?');
  const url = decodeURIComponent(pathname);

  // API endpoints
  if (url === '/api/routes') return json(res, await getRoutes());

  // ?raw imports
  if (query === 'raw') return serveRaw(join(root, url), res);

  // ?script - extract script from HTML as JS module
  if (query === 'script') return serveScript(join(root, url), res);

  // Check if this looks like a static file request (has extension)
  const ext = extname(url);
  const isStaticFileRequest = ext && ext !== '.html';

  // Static files
  if (url !== '/' && !url.endsWith('/')) {
    if (await serveStatic(join(root, url), res)) return;

    // If it was a static file request but file not found, return 404
    if (isStaticFileRequest) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
  }

  // SSR (only for HTML routes)
  await renderSSR(req.url, res);
}

const server = createServer(handler);

if (!isProd) {
  wss = new WebSocketServer(server);
  wss.on('connection', ws => {
    clients.add(ws);
    ws.on('close', () => clients.delete(ws));
  });
  setupWatcher();
}

server.listen(port, () => console.log(`http://localhost:${port}`));
