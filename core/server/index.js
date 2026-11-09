import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { watch, existsSync } from 'node:fs';
import { join, extname, dirname, resolve, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Worker } from 'node:worker_threads';
import { WebSocketServer } from './ws.js';
import { parseUrl, resolveInside, cacheControl, sendFile } from './http.js';
import { loadConfig } from '../config.js';
import { negotiateLocale } from '../locale.js';
import { jsonForScript, escapeHtml } from '../template.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '../..');
const isProd = process.env.NODE_ENV === 'production';
const port = process.env.PORT || 3000;
const config = loadConfig(root);

// Production serves the output of `yarn build` — the same files the Netlify and
// Cloudflare adapters deploy: hashed modules, the inlined bundle, minified CSS.
// Without a build it falls back to the source tree (and says so).
const distClient = join(root, 'dist/client');
const distServer = join(root, 'dist/server');
const builtEntry = join(distServer, 'core/server/entry-server.mjs');
const useBuild = isProd && existsSync(join(distClient, '_template.html')) && existsSync(builtEntry);
if (isProd && !useBuild) console.warn('[server] No build in dist/ — serving the source tree. Run `yarn build` first.');
if (useBuild) process.env.SSR_ROOT = distServer;

// Source-tree mode exposes only what the browser needs — never package.json,
// app.config.yml, .git/ or anything else that happens to sit in the checkout.
const SOURCE_DIRS = ['app', 'components', 'core', 'lib', 'locales'];
const SOURCE_FILES = ['globals.css'];
const sourceFile = url => {
  const top = url.split('/').filter(Boolean)[0];
  return SOURCE_DIRS.includes(top) || SOURCE_FILES.includes(url.slice(1)) ? resolveInside(root, url) : null;
};
// dist/client holds build internals next to the public files (`_template.html`,
// `_worker.js`, `_ssr-config.json`); only `/_assets/` is meant to be fetched.
const builtFile = url =>
  url.startsWith('/_') && !url.startsWith('/_assets/') ? null : resolveInside(distClient, url);

// Framework-owned modulepreloads (always present). Project modules that the
// first paint depends on are appended from app.config.yml (preload.modules).
const CORE_MODULE_PRELOADS = ['/core/server/entry-client.js', '/core/loader.js', '/core/component.js', '/core/template.js', '/core/context.js', '/core/routes.js'];

const detectLocale = req => negotiateLocale({
  cookie: req.headers.cookie,
  acceptLanguage: req.headers['accept-language'],
  supported: config.locales.supported,
  fallback: config.locales.default,
});

// ─── SSR host ────────────────────────────────────────────────────────────────
// Production imports the SSR entry once. Dev runs it in a worker thread and
// swaps the thread after any source change (see ssr-worker.js): a fresh thread
// has an empty module cache, so edits to app/, components/, core/ and lib/ all
// reach the next server render without restarting `yarn dev`.
let sourceVersion = 0;
let host = null; // { version, call(method, ...args), close() }

function workerHost() {
  const worker = new Worker(new URL('./ssr-worker.js', import.meta.url));
  const pending = new Map();
  let seq = 0;
  const failAll = error => { for (const p of pending.values()) p.reject(error); pending.clear(); };
  worker.on('message', ({ id, result, error }) => {
    const p = pending.get(id);
    if (!p) return;
    pending.delete(id);
    error ? p.reject(Object.assign(new Error(error.message), { stack: error.stack })) : p.resolve(result);
  });
  worker.on('error', failAll);
  worker.on('exit', () => failAll(new Error('SSR worker exited')));
  return {
    call: (method, ...args) => new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject });
      worker.postMessage({ id, method, args });
    }),
    // Let in-flight renders finish on the old code before the thread goes away.
    close: () => { const stop = () => (pending.size ? setTimeout(stop, 20) : worker.terminate()); stop(); },
  };
}

function moduleHost() {
  const module = import(useBuild ? pathToFileURL(builtEntry).href : new URL('./entry-server.js', import.meta.url).href);
  return { call: async (method, ...args) => (await module)[method](...args), close() {} };
}

function ssr(method, ...args) {
  if (!host || host.version !== sourceVersion) {
    host?.close();
    host = { version: sourceVersion, ...(isProd ? moduleHost() : workerHost()) };
  }
  return host.call(method, ...args);
}

// Route table + tag registry for the browser, per source version.
let clientData = { version: -1, value: null };
function getClientData() {
  if (clientData.version !== sourceVersion) clientData = { version: sourceVersion, value: ssr('getClientData') };
  return clientData.value;
}

// ─── Live reload (dev) ───────────────────────────────────────────────────────
const clients = new Set();
const broadcast = (type, data = {}) => clients.forEach(ws => ws.readyState === 1 && ws.send(JSON.stringify({ type, ...data })));

const WATCHED_EXT = ['.js', '.html', '.css', '.json'];
const hmrTimers = new Map();

function onSourceChange(url) {
  // Debounce rapid saves (editors fire several events per write)
  clearTimeout(hmrTimers.get(url));
  hmrTimers.set(url, setTimeout(() => {
    hmrTimers.delete(url);
    sourceVersion++;
    console.log(`[HMR] ${url}`);
    // globals.css is inlined in a single <style>, so it can be swapped in place.
    // Everything else reloads: custom elements can't be redefined, and component
    // templates/styles live inside shadow roots built by the module that owns them.
    broadcast(url === '/globals.css' ? 'css' : 'reload', { url });
  }, 50));
}

function setupWatcher() {
  for (const dir of SOURCE_DIRS) {
    const abs = join(root, dir);
    if (!existsSync(abs)) continue;
    watch(abs, { recursive: true }, (_, file) => {
      if (!file) return;
      // Editors save through dot-prefixed temp files (`.!1365!Footer.html`) — not sources.
      if (basename(file).startsWith('.') || !WATCHED_EXT.includes(extname(file))) return;
      // `file` is relative to the watched directory; the URL needs that directory back.
      onSourceChange(`/${dir}/${file.replace(/\\/g, '/')}`);
    });
  }
  // Root-level sources. Watching the directory (not the files) survives editors
  // that replace a file on save instead of writing into it.
  watch(root, (_, file) => {
    if (file === 'globals.css' || file === 'index.html') onSourceChange(`/${file}`);
  });
}

const HMR_CLIENT = `<script type="module">
(function(){
  let reconnect;
  function connect(){
    const ws=new WebSocket((location.protocol==='https:'?'wss://':'ws://')+location.host);
    ws.onopen=()=>clearTimeout(reconnect);
    ws.onclose=()=>{ reconnect=setTimeout(connect,1000); };
    ws.onmessage=e=>{
      const msg=JSON.parse(e.data);
      if(msg.type==='css'){
        const el=document.querySelector('style[data-hmr=globals]');
        if(!el) return location.reload();
        fetch('/globals.css?t='+Date.now()).then(r=>r.text()).then(css=>{ el.textContent=css; }).catch(()=>location.reload());
      } else location.reload();
    };
  }
  connect();
})();
</script>`;

// ─── Request handling ────────────────────────────────────────────────────────
const SCRIPT_RE = /<script\b[^>]*>([\s\S]*?)<\/script>/i;
const sendJS = (res, body) => res.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-cache' }).end(body);
const sendText = (res, status, body) => res.writeHead(status, { 'Content-Type': 'text/plain' }).end(body);

/** Inline <script> of a template, or its sibling .js — the page/component module. */
async function scriptFor(htmlPath) {
  const html = await readFile(htmlPath, 'utf-8').catch(() => null);
  const inline = html?.match(SCRIPT_RE)?.[1];
  if (inline != null) return inline;
  return readFile(htmlPath.replace(/\.html$/, '.js'), 'utf-8').catch(() => null);
}

// Read once in production; re-read per request in dev so edits show up.
const fileCache = new Map();
async function readCached(path, fallback) {
  if (isProd && fileCache.has(path)) return fileCache.get(path);
  const text = await readFile(path, 'utf-8').catch(e => { if (fallback === undefined) throw e; return fallback; });
  if (isProd) fileCache.set(path, text);
  return text;
}

async function sourceTemplate() {
  const [template, globalsCss, { routes, tags }] = await Promise.all([
    readCached(join(root, 'index.html')),
    readCached(join(root, 'globals.css'), ''),
    getClientData(),
  ]);
  const modulePreloads = [...CORE_MODULE_PRELOADS, ...config.preload.modules]
    .map(p => `<link rel="modulepreload" href="${p}">`).join('\n  ');
  // Font preloads from app.config.yml — mirror build.js so the source server matches
  // the deployed _template.html (fonts fetched in parallel with HTML parse).
  const fontPreloads = config.preload.fonts
    .map(p => `<link rel="preload" href="${p}" as="font" type="font/woff2" crossorigin>`).join('');
  // Inline routes so the Router reads them synchronously instead of fetching
  // /routes.json, and the tag registry so core/loader.js resolves component
  // directories the kebab→PascalCase convention can't reproduce (HomeCTA, …).
  const routesScript = `<script>window.__ROUTES__=${jsonForScript(routes)}</script>`;
  const tagsScript = `<script>window.__TAGS__=${jsonForScript(tags)}</script>`;
  return template
    .replace('<!--inline-css-->', () => `<style data-hmr="globals">${globalsCss}</style>`)
    .replace('<!--preload-links-->', () => fontPreloads + modulePreloads + tagsScript + routesScript);
}

async function renderSSR(url, res, req) {
  try {
    // The built template already carries CSS, bundle, routes and manifest.
    const template = useBuild ? await readCached(join(distClient, '_template.html')) : await sourceTemplate();
    const locale = detectLocale(req);
    const result = await ssr('render', url, { locale, cookie: req.headers.cookie || '' });

    if (result.redirect) return res.writeHead(302, { Location: result.redirect }).end();

    let html = template
      .replace(/<html\s+lang="[^"]*"/, () => `<html lang="${locale}"`)
      .replace('<!--head-meta-->', () => (result.headMeta || '') + (result.scopedStyles || ''))
      .replace('<!--app-html-->', () => result.appHtml)
      .replace('<!--initial-state-->', () => result.initialStateScript + result.localesScript);

    if (!isProd) html = html.replace('</body>', () => `${HMR_CLIENT}</body>`);

    res.writeHead(result.status || 200, {
      'Content-Type': 'text/html;charset=UTF-8',
      'Cache-Control': 'no-cache',
      // Response body varies by negotiated language — keep caches honest.
      'Vary': 'Accept-Language, Cookie',
    }).end(html);
  } catch (e) {
    console.error('[SSR]', e);
    // The stack is for the developer's terminal and dev browser, not for visitors.
    const body = isProd ? '<h1>500</h1><p>Internal Server Error</p>' : `<h1>500</h1><pre>${escapeHtml(e.stack)}</pre>`;
    res.writeHead(500, { 'Content-Type': 'text/html;charset=UTF-8' }).end(body);
  }
}

async function handler(req, res) {
  const parsed = parseUrl(req.url);
  if (!parsed) return sendText(res, 400, 'Bad request');
  const { pathname: url, query } = parsed;
  const ext = extname(url);

  if (useBuild) {
    // routes.json and everything else public is a plain file in dist/client.
    if (url !== '/' && ext && ext !== '.html') {
      const file = builtFile(url);
      if (file && await sendFile(req, res, file, { cache: cacheControl(url) })) return;
      return sendText(res, 404, 'Not found');
    }
    return renderSSR(req.url, res, req);
  }

  if (url === '/api/routes' || url === '/routes.json')
    return res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' }).end(JSON.stringify((await getClientData()).routes));

  if (query === 'raw' || query === 'script') {
    const file = sourceFile(url);
    if (!file) return sendText(res, 404, 'Not found');
    if (query === 'raw') return sendJS(res, `export default ${JSON.stringify(await readFile(file, 'utf-8').catch(() => ''))}`);
    const script = await scriptFor(file);
    return script != null ? sendJS(res, script) : sendText(res, 404, 'No script found');
  }

  if (url !== '/' && !url.endsWith('/')) {
    const file = sourceFile(url);
    if (file && await sendFile(req, res, file)) return;
    // Serve public/ assets at root path (e.g. /fonts/... → public/fonts/...)
    const pub = resolveInside(join(root, 'public'), url);
    if (pub && await sendFile(req, res, pub, { cache: isProd ? cacheControl(url) : 'no-cache' })) return;
    // Component/app .js not found → extract inline <script> from the sibling .html
    if (file && ext === '.js') {
      const script = await scriptFor(file.replace(/\.js$/, '.html'));
      if (script != null) return sendJS(res, script);
    }
    // Optional component stylesheets that don't exist: empty 200 instead of 404.
    // Auto-discovery probes both <Name>.module.css and <Name>.css and uses whichever
    // is there; answering the miss quietly keeps the dev console clean.
    if (file && ext === '.css') return res.writeHead(200, { 'Content-Type': 'text/css', 'Cache-Control': 'no-cache' }).end('');
    if (ext && ext !== '.html') return sendText(res, 404, 'Not found');
  }

  await renderSSR(req.url, res, req);
}

const server = createServer((req, res) => {
  // A rejected handler must never become an unhandled rejection — that exits Node.
  handler(req, res).catch(e => {
    console.error('[server]', e);
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Internal Server Error');
  });
});

if (!isProd) {
  const wss = new WebSocketServer(server);
  wss.on('connection', ws => { clients.add(ws); ws.on('close', () => clients.delete(ws)); });
  setupWatcher();
}

server.listen(port, () => console.log(`http://localhost:${port}${useBuild ? ' (serving dist/)' : ''}`));
