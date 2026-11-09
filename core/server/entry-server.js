import { readFile } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMatcher, withNotFound } from '../routes.js';
import { scanPages, scanRoutes, scanComponents } from '../scan.js';
import { pathsForTag } from '../tags.js';
import { requestState } from '../locale.js';
import { createRenderer } from './ssr.js';
import { loadConfig } from '../config.js';
import store from '../../lib/store.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const localesDir = resolve(__dirname, '../../locales');
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

// Tag → source-file registry and each component's `static local`, discovered by
// scanning for define() calls rather than hand-maintained. Resolved at module
// load so resolvePaths stays sync.
const components = await scanComponents(root);

const resolvePaths = tag => {
  // The router is structural — it has no template of its own; the renderer
  // splices the matched page into it.
  if (tag === 'app-router') return null;
  const paths = pathsForTag(tag, components.tags);
  return { tpl: join(root, paths.html), css: join(root, paths.moduleCss), plainCss: join(root, paths.css) };
};

const loadFile = path => readFile(path, 'utf-8');

const renderPage = createRenderer({ loadFile, resolvePaths, locals: components.locals });

async function buildRoutes() {
  const isProd = process.env.NODE_ENV === 'production';
  const routes = (await scanPages(appDir)).map(page => {
    // Module path the browser will dynamically import. Matches what build.js / scan.js
    // emit in routes data so the modulepreload hint actually preloads the right URL.
    const built = `/app/${page.relative.replace('.html', page.hasEmbeddedScript ? '.script.js' : '.js')}`;
    return {
      path: page.path,
      component: page.component,
      module: isProd ? (assetManifest[built] || built) : `/app/${page.relative}?script`,
      dynamic: page.dynamic,
      matcher: page.dynamic ? createMatcher(page.path) : null,
      ssrProps: page.ssrProps,
      metadata: page.metadata,
      requiresAuth: page.requiresAuth,
    };
  });
  return withNotFound(routes);
}

const routesPromise = buildRoutes();

const SUPPORTED_LOCALES = config.locales.supported;

/**
 * @param {string} url Path + query of the request.
 * @param {Object} [request]
 * @param {string} [request.locale] Negotiated locale (core/locale.js).
 * @param {string} [request.cookie] Raw Cookie header — read only for the
 *   `auth.cookie` session check, when one is configured.
 */
export async function render(url, { locale = config.locales.default, cookie = '' } = {}) {
  const routes = await routesPromise;
  // Per-request state. The shared store must not carry it: the awaits below yield
  // to other requests, and a second render() would overwrite locale/messages
  // before this one read them back (a French page with English state).
  const messages = await loadServerLocale(locale);
  // Non-active supported locales ride along inline (see ssr.js render options) so
  // a client/server mismatch — Lighthouse running en-US against an es-default
  // response — resolves synchronously instead of adding a fetch to the critical chain.
  const otherLocales = {};
  await Promise.all(
    SUPPORTED_LOCALES.filter(l => l !== locale)
      .map(async l => { otherLocales[l] = await loadServerLocale(l); })
  );
  const state = requestState(store.defaults, { locale, messages, cookie, config });
  return renderPage(url, routes, state, { otherLocales, localeConfig: config.locales });
}

/** What the dev server inlines for the browser: the route table and the tag registry. */
export const getClientData = async () => ({ routes: await scanRoutes(appDir), tags: components.tags });
