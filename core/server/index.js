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

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2' };

let routesCache = null;
const getRoutes = async () => routesCache || (routesCache = await scanRoutes(join(root, 'app')));

let wss;
const clients = new Set();
const broadcast = (type, data = {}) => clients.forEach(ws => ws.readyState === 1 && ws.send(JSON.stringify({ type, ...data })));

function setupWatcher() {
  ['app', 'components', 'core', 'lib'].map(d => join(root, d)).filter(existsSync).forEach(dir => {
    watch(dir, { recursive: true }, (_, file) => {
      if (file && ['.js', '.html', '.css'].includes(extname(file))) {
        routesCache = null;
        console.log(`[HMR] ${file}`);
        broadcast('reload', { file });
      }
    });
  });
}

async function serveScript(filePath, res) {
  try {
    const content = await readFile(filePath, 'utf-8');
    const match = content.match(/<script\b[^>]*>([\s\S]*?)<\/script>/i);
    if (match) return res.writeHead(200, { 'Content-Type': 'text/javascript' }).end(match[1]);
    const jsContent = await readFile(filePath.replace('.html', '.js'), 'utf-8').catch(() => null);
    if (jsContent) return res.writeHead(200, { 'Content-Type': 'text/javascript' }).end(jsContent);
    res.writeHead(404).end('No script found');
  } catch { res.writeHead(404).end('Not found'); }
}

async function serveStatic(filePath, res) {
  try {
    const stats = await stat(filePath);
    if (!stats.isFile()) return false;
    const ext = extname(filePath);
    res.writeHead(200, { 'Content-Type': mime[ext] || 'application/octet-stream', 'Content-Length': stats.size, 'Cache-Control': isProd && ext !== '.html' ? 'public, max-age=31536000' : 'no-cache' });
    createReadStream(filePath).pipe(res);
    return true;
  } catch { return false; }
}

async function renderSSR(url, res) {
  try {
    let template = await readFile(join(root, 'index.html'), 'utf-8');
    const { render } = await import(`./entry-server.js${isProd ? '' : `?t=${Date.now()}`}`);
    const result = await render(url);

    if (result.redirect) return res.writeHead(302, { Location: result.redirect }).end();

    let html = template
      .replace('<!--head-meta-->', (result.headMeta || '') + (result.scopedStyles || ''))
      .replace('<!--app-html-->', result.appHtml)
      .replace('<!--initial-state-->', result.initialStateScript);

    if (!isProd) html = html.replace('</body>', `<script type="module">const ws=new WebSocket('ws://'+location.host);ws.onmessage=e=>{if(JSON.parse(e.data).type==='reload')location.reload()}</script></body>`);

    res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-cache' }).end(html);
  } catch (e) {
    console.error('[SSR]', e);
    res.writeHead(500).end(`<h1>500</h1><pre>${e.stack}</pre>`);
  }
}

async function handler(req, res) {
  const [pathname, query] = req.url.split('?');
  const url = decodeURIComponent(pathname);

  if (url === '/api/routes') return res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(await getRoutes()));
  if (query === 'raw') { const c = await readFile(join(root, url), 'utf-8').catch(() => ''); return res.writeHead(200, { 'Content-Type': 'text/javascript' }).end(`export default ${JSON.stringify(c)}`); }
  if (query === 'script') return serveScript(join(root, url), res);

  const ext = extname(url);
  if (url !== '/' && !url.endsWith('/')) {
    if (await serveStatic(join(root, url), res)) return;
    if (ext && ext !== '.html') return res.writeHead(404).end('Not found');
  }

  await renderSSR(req.url, res);
}

const server = createServer(handler);

if (!isProd) {
  wss = new WebSocketServer(server);
  wss.on('connection', ws => { clients.add(ws); ws.on('close', () => clients.delete(ws)); });
  setupWatcher();
}

server.listen(port, () => console.log(`http://localhost:${port}`));
