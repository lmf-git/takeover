import { readFile } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMatcher, pathFromFile, withNotFound } from '../routes.js';
import { scanDir, scanTags } from '../scan.js';
import { dirForTag, baseName } from '../tags.js';
import { createRenderer } from './ssr.js';
import { loadConfig } from '../config.js';
import store from '../../lib/store.js';

const __dirname_ssr = dirname(fileURLToPath(import.meta.url));
const localesDir = resolve(__dirname_ssr, '../../locales');
const localeCache = new Map();

async function loadServerLocale(lang) {
  if (localeCache.has(lang)) return localeCache.get(lang);
  try {
    const messages = JSON.parse(await readFile(join(localesDir, `${lang}.json`), 'utf-8'));
    localeCache.set(lang, messages);
    return messages;
  } catch {
    return {};
  }
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = process.env.SSR_ROOT || resolve(__dirname, '../..');
const config = loadConfig(root);
const appDir = resolve(root, 'app');

// Asset manifest (original path → content-hashed path) emitted by build.js.
// Production-only; dev server serves un-hashed sources directly. The manifest
// is already inlined into _template.html at build time — this copy is used to
// rewrite route.module so the modulepreload <link> matches the hashed URL.
let assetManifest = {};
try {
  assetManifest = JSON.parse(await readFile(resolve(root, '_assets-manifest.json'), 'utf-8'));
} catch {}

// Tag → directory registry, discovered by scanning for define() calls rather
// than hand-maintained. Resolved at module load so resolvePaths stays sync.
const tagRegistry = await scanTags(root);

const resolvePaths = tag => {
  // The router is structural — it has no template of its own; the renderer
  // splices the matched page into it.
  if (tag === 'app-router') return null;
  const dir = dirForTag(tag, tagRegistry);
  const base = baseName(dir);
  return {
    tpl: join(root, dir, `${base}.html`),
    css: join(root, dir, `${base}.module.css`),
    plainCss: join(root, dir, `${base}.css`),
  };
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
    // Module path the browser will dynamically import. Matches what build.js / scan.js emit
    // in routes data so the modulepreload hint actually preloads the right URL.
    const isProd = process.env.NODE_ENV === 'production';
    const hasEmbedded = !!html.match(/<script\b[^>]*>[\s\S]*?<\/script>/i);
    const originalModule = `/app/${relative.replace('.html', hasEmbedded ? '.script.js' : '.js')}`;
    const module = isProd
      ? (assetManifest[originalModule] || originalModule)
      : `/app/${relative}?script`;
    routes.push({ path: routePath, component: relative.split('/').pop().replace('.html', '').toLowerCase() + '-page', module, html: template, dynamic, matcher: dynamic ? createMatcher(routePath) : null, ssrProps, metadata, requiresAuth });
  }
  return withNotFound(routes);
}

const routesPromise = buildRoutes();

const SUPPORTED_LOCALES = config.locales.supported;

export async function render(url, { locale = config.locales.default } = {}) {
  const routes = await routesPromise;
  const messages = await loadServerLocale(locale);
  store.set({ locale, messages });
  // Non-active supported locales ride along inline (see ssr.js render options) so
  // a client/server mismatch — Lighthouse running en-US against an es-default
  // response — resolves synchronously instead of adding a fetch to the critical chain.
  const otherLocales = {};
  await Promise.all(
    SUPPORTED_LOCALES.filter(l => l !== locale)
      .map(async l => { otherLocales[l] = await loadServerLocale(l); })
  );
  return renderPage(url, routes, store.get(), { otherLocales, localeConfig: config.locales });
}

export async function getClientRoutes() {
  const { scanRoutes } = await import('../scan.js');
  return scanRoutes(appDir);
}
