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

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.otf': 'font/otf', '.ttf': 'font/ttf' };

let routesCache = null;
const getRoutes = async () => routesCache || (routesCache = await scanRoutes(join(root, 'app')));

const SUPPORTED_LOCALES = ['en', 'es'];

function detectLocale(req) {
  const cookies = req.headers.cookie || '';
  const cookie = cookies.match(/(?:^|;\s*)locale=([^;]+)/)?.[1];
  if (cookie) {
    const c = cookie.split(/[-_]/)[0].toLowerCase();
    if (SUPPORTED_LOCALES.includes(c)) return c;
  }
  const accept = req.headers['accept-language'] || '';
  const lang = accept.split(',')[0]?.split(';')[0]?.split(/[-_]/)[0]?.trim().toLowerCase();
  return SUPPORTED_LOCALES.includes(lang) ? lang : 'es';
}

let wss;
const clients = new Set();
const broadcast = (type, data = {}) => clients.forEach(ws => ws.readyState === 1 && ws.send(JSON.stringify({ type, ...data })));

// Debounce map: file → timer
const hmrTimers = new Map();

function setupWatcher() {
  ['app', 'components', 'core', 'lib'].map(d => join(root, d)).filter(existsSync).forEach(dir => {
    watch(dir, { recursive: true }, (_, file) => {
      if (!file) return;
      const ext = extname(file);
      if (!['.js', '.html', '.css'].includes(ext)) return;

      // Debounce rapid saves (e.g. editor writing temp files)
      clearTimeout(hmrTimers.get(file));
      hmrTimers.set(file, setTimeout(() => {
        hmrTimers.delete(file);
        routesCache = null;
        // Derive a root-relative URL for the changed file
        // file is relative to the watched dir — but we only know dir, not which watch triggered,
        // so reconstruct by scanning dir prefix from root
        const url = '/' + file.replace(/\\/g, '/');
        const isCSS = ext === '.css';
        const isCore = url.startsWith('/core/') || url.startsWith('/lib/');

        console.log(`[HMR] ${url}`);

        if (isCSS) {
          // CSS changes: inject new styles without reload
          broadcast('css', { url });
        } else if (isCore) {
          // Core framework changed: full reload required (modules cached by browser)
          broadcast('reload', { url });
        } else {
          // Component/app file: try module-level swap, fall back to reload
          broadcast('update', { url });
        }
      }, 50));
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

async function renderSSR(url, res, req) {
  try {
    let template = await readFile(join(root, 'index.html'), 'utf-8');
    const { render } = await import(`./entry-server.js${isProd ? '' : `?t=${Date.now()}`}`);
    const locale = detectLocale(req);
    const result = await render(url, { locale });

    if (result.redirect) return res.writeHead(302, { Location: result.redirect }).end();

    const globalsCss = await readFile(join(root, 'globals.css'), 'utf-8').catch(() => '');
    const modulePreloads = [
      '/core/server/entry-client.js',
      '/core/loader.js',
      '/components/Router/Router.js',
      '/lib/store.js',
      '/core/component.js',
      '/core/template.js',
      '/core/context.js',
      '/core/routes.js',
      '/lib/nav.js'
    ].map(p => `<link rel="modulepreload" href="${p}">`).join('\n  ');
    
    // Inline routes so the Router can read them synchronously instead of fetching /routes.json,
    // matching the production behaviour and avoiding the "preload not used" warning.
    const routesScript = `<script>window.__ROUTES__=${JSON.stringify(await getRoutes())}</script>`;

    let html = template
      .replace('<!--inline-css-->', `<style>${globalsCss}</style>`)
      .replace('<!--preload-links-->', modulePreloads + routesScript)
      .replace('<!--head-meta-->', (result.headMeta || '') + (result.scopedStyles || ''))
      .replace('<!--app-html-->', result.appHtml)
      .replace('<!--initial-state-->', result.initialStateScript + result.localesScript);

    if (!isProd) html = html.replace('</body>', `<script type="module">
(function(){
  let ws,reconnect;
  function connect(){
    ws=new WebSocket('ws://'+location.host);
    ws.onopen=()=>clearTimeout(reconnect);
    ws.onclose=()=>{ reconnect=setTimeout(connect,1000); };
    ws.onmessage=e=>{
      const msg=JSON.parse(e.data);
      if(msg.type==='reload'){
        location.reload();
      } else if(msg.type==='css'){
        // Hot-swap CSS: refetch and replace <style> / <link> for the changed file
        document.querySelectorAll('link[rel=stylesheet],style[data-hmr]').forEach(el=>{
          if(el.href && el.href.includes(msg.url.split('/').pop())) {
            el.href=el.href.replace(/[?#].*/,'')+'?t='+Date.now();
          }
        });
        // Also patch inline <style> by fetching fresh globals
        if(msg.url.endsWith('globals.css')){
          fetch('/globals.css?t='+Date.now()).then(r=>r.text()).then(css=>{
            let el=document.querySelector('style[data-hmr=globals]');
            if(!el){el=document.createElement('style');el.dataset.hmr='globals';document.head.appendChild(el);}
            el.textContent=css;
          });
        }
      } else if(msg.type==='update'){
        // Component changed: re-import with cache-bust, then re-mount affected elements
        const url=msg.url.endsWith('.html')
          ? msg.url.replace('.html','.js')
          : msg.url;
        const abs=url[0]==='/'?url:'/'+url;
        import(abs+'?t='+Date.now()).then(mod=>{
          // Find all instances of this custom element in DOM and reconnect them
          const tag=url.split('/').pop().replace(/\.(js|html)$/,'').toLowerCase();
          const tagWithSuffix=tag.includes('-')?tag:null;
          const candidates=tagWithSuffix
            ?[...document.querySelectorAll(tagWithSuffix)]
            :[];
          candidates.forEach(el=>{
            if(el.disconnectedCallback) el.disconnectedCallback();
            if(el.connectedCallback) el.connectedCallback();
          });
          if(!candidates.length) location.reload();
        }).catch(()=>location.reload());
      }
    };
  }
  connect();
})();
</script></body>`);

    res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-cache' }).end(html);
  } catch (e) {
    console.error('[SSR]', e);
    res.writeHead(500).end(`<h1>500</h1><pre>${e.stack}</pre>`);
  }
}

async function handler(req, res) {
  const [pathname, query] = req.url.split('?');
  const url = decodeURIComponent(pathname);

  if (url === '/api/routes' || url === '/routes.json') return res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(await getRoutes()));
  if (query === 'raw') { const c = await readFile(join(root, url), 'utf-8').catch(() => ''); return res.writeHead(200, { 'Content-Type': 'text/javascript' }).end(`export default ${JSON.stringify(c)}`); }
  if (query === 'script') return serveScript(join(root, url), res);

  const ext = extname(url);
  if (url !== '/' && !url.endsWith('/')) {
    if (await serveStatic(join(root, url), res)) return;
    // Serve public/ assets at root path (e.g. /fonts/... → public/fonts/...)
    if (await serveStatic(join(root, 'public', url), res)) return;
    if (ext && ext !== '.html') return res.writeHead(404).end('Not found');
  }

  await renderSSR(req.url, res, req);
}

const server = createServer(handler);

if (!isProd) {
  wss = new WebSocketServer(server);
  wss.on('connection', ws => { clients.add(ws); ws.on('close', () => clients.delete(ws)); });
  setupWatcher();
}

server.listen(port, () => console.log(`http://localhost:${port}`));
