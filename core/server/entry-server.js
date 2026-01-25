import { readFile } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMatcher, pathFromFile } from '../routes.js';
import { scanDir } from '../scan.js';
import { createRenderer } from './ssr.js';
import store from '../../lib/store.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = process.env.SSR_ROOT || resolve(__dirname, '../..');
const appDir = resolve(root, 'app');
const componentsDir = resolve(root, 'components');

const resolvePaths = tag => {
  if (tag === 'app-layout') return { tpl: join(appDir, '_Layout/_Layout.html'), css: join(appDir, '_Layout/_Layout.module.css') };
  if (tag === 'app-router') return null;
  const isPage = tag.endsWith('-page');
  const name = isPage ? tag.replace('-page', '') : tag.replace(/^app-/, '');
  const pascal = name.split('-').map(p => p[0].toUpperCase() + p.slice(1)).join('');
  const dir = isPage ? appDir : componentsDir;
  return { tpl: join(dir, `${pascal}/${pascal}.html`), css: join(dir, `${pascal}/${pascal}.module.css`) };
};

const loadFile = path => readFile(path, 'utf-8');

const renderPage = createRenderer({ loadFile, resolvePaths });

async function buildRoutes() {
  const files = await scanDir(appDir, '.html');
  const routes = [];
  for (const { path: filePath, relative } of files) {
    if (relative.startsWith('_')) continue;
    const routePath = pathFromFile(relative.replace('.html', '.js'), '');
    if (!routePath) continue;

    const html = await readFile(filePath, 'utf-8');
    const template = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').trim();
    const dynamic = routePath.includes(':');

    let ssrProps = {}, metadata = null, requiresAuth = false;
    let script = html.match(/<script\b[^>]*>([\s\S]*?)<\/script>/i)?.[1];
    if (!script) {
      for (const ext of ['.mjs', '.js']) {
        try { script = await readFile(filePath.replace('.html', ext), 'utf-8'); break; } catch {}
      }
    }
    if (script) {
      try {
        // Extract balanced braces to handle nested objects like { errors: {} }
        const extractObj = (src, prefix) => {
          const match = src.match(new RegExp(`static\\s+${prefix}\\s*=\\s*\\{`));
          if (!match) return null;
          let start = match.index + match[0].length - 1, depth = 1, i = start + 1;
          while (i < src.length && depth > 0) { if (src[i] === '{') depth++; else if (src[i] === '}') depth--; i++; }
          return src.slice(start, i);
        };
        const localObj = extractObj(script, 'local');
        const ssrObj = extractObj(script, 'ssrProps');
        const obj2 = extractObj(script, 'metadata');
        const m3 = script.match(/static\s+requiresAuth\s*=\s*(true|false)/);
        // Merge local into ssrProps (local provides defaults, ssrProps can override)
        if (localObj) ssrProps = { ...ssrProps, ...eval(`(${localObj})`) };
        if (ssrObj) ssrProps = { ...ssrProps, ...eval(`(${ssrObj})`) };
        if (obj2) metadata = eval(`(${obj2})`);
        if (m3) requiresAuth = m3[1] === 'true';
      } catch {}
    }
    routes.push({ path: routePath, component: relative.split('/').pop().replace('.html', '').toLowerCase() + '-page', html: template, dynamic, matcher: dynamic ? createMatcher(routePath) : null, ssrProps, metadata, requiresAuth });
  }
  const notFound = routes.find(r => r.component === 'notfound-page');
  if (notFound) routes.push({ ...notFound, path: '*', dynamic: false, matcher: null });
  return routes;
}

const routesPromise = buildRoutes();

export async function render(url) {
  const routes = await routesPromise;
  return renderPage(url, routes, store.get());
}

export async function getClientRoutes() {
  const { scanRoutes } = await import('../scan.js');
  return scanRoutes(appDir);
}
