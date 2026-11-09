import { readdir, readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { pathFromFile } from './routes.js';
import { DEFINE_RE } from './tags.js';

export async function scanDir(dir, ext = '.js') {
  const entries = [];
  async function scan(current, base = '') {
    for (const item of await readdir(current, { withFileTypes: true })) {
      const path = join(current, item.name), relative = base ? `${base}/${item.name}` : item.name;
      if (item.isDirectory() && !item.name.startsWith('_') && !item.name.startsWith('.')) await scan(path, relative);
      else if (item.isFile() && extname(item.name) === ext && !item.name.startsWith('_')) entries.push({ path, relative });
    }
  }
  await scan(dir);
  return entries;
}

// Pull the object literal assigned to `static <name> = { … }` out of a class body,
// matching braces so nested objects ({ errors: {} }) survive.
function staticObject(src, name) {
  const m = src.match(new RegExp(`static\\s+${name}\\s*=\\s*\\{`));
  if (!m) return null;
  const start = m.index + m[0].length - 1;
  let depth = 1, i = start + 1;
  while (i < src.length && depth > 0) { if (src[i] === '{') depth++; else if (src[i] === '}') depth--; i++; }
  // The project's own source, evaluated as a literal — never request data.
  try { return (0, eval)(`(${src.slice(start, i)})`); } catch { return null; }
}

/**
 * Discover every custom element by scanning for `define('<tag>', …)` calls.
 * This is the single source of truth consumed by core/tags.js, so a component
 * whose folder or file name doesn't round-trip through the kebab→PascalCase
 * convention (HomeCTA, HomeQuickStart, NotFound, [slug]/Slug) needs no
 * hand-maintained override anywhere.
 *
 *   tags    tag → extension-less source path: { 'home-cta': 'components/HomeCTA/HomeCTA' }
 *           The stem is the declaring file's when a template of that name sits
 *           beside it, otherwise the folder's name (the usual convention).
 *   locals  tag → the component's `static local` literal, for SSR: the server
 *           never imports component modules, so this is how a nested component's
 *           initial state reaches its server-rendered template.
 *
 * Differs from scanDir deliberately: it reads .html too (tags are often defined
 * in an inline <script>), accepts .mjs (dist/server renames sources), and does
 * NOT skip `_`-prefixed entries — app/_Layout/_Layout.js declares <app-layout>.
 */
export async function scanComponents(root, dirs = ['app', 'components']) {
  const tags = {}, locals = {};

  async function walk(current, rel) {
    let entries;
    try { entries = await readdir(current, { withFileTypes: true }); } catch { return; }
    const names = new Set(entries.map(e => e.name));
    for (const item of entries) {
      if (item.name.startsWith('.')) continue;
      const path = join(current, item.name);
      if (item.isDirectory()) { await walk(path, `${rel}/${item.name}`); continue; }
      if (!/\.(js|mjs|html)$/.test(item.name)) continue;
      const src = await readFile(path, 'utf-8').catch(() => '');
      const found = [...src.matchAll(DEFINE_RE)].map(m => m[1]).filter(tag => !(tag in tags));
      if (!found.length) continue;
      const fileStem = item.name.replace(/\.(js|mjs|html)$/, '');
      const stem = names.has(`${fileStem}.html`) ? fileStem : rel.slice(rel.lastIndexOf('/') + 1);
      const local = staticObject(src, 'local');
      for (const tag of found) {
        tags[tag] = `${rel}/${stem}`;
        // One class per file is the norm; with several, `static local` can't be attributed.
        if (local && found.length === 1) locals[tag] = local;
      }
    }
  }

  for (const dir of dirs) await walk(join(root, dir), dir);
  // Sorted so the inlined JSON (and therefore the build's content hashes) is stable.
  const sorted = obj => Object.fromEntries(Object.keys(obj).sort().map(k => [k, obj[k]]));
  return { tags: sorted(tags), locals: sorted(locals) };
}

/** Just the tag → source-path registry (window.__TAGS__). */
export const scanTags = async (root, dirs) => (await scanComponents(root, dirs)).tags;

const SCRIPT_RE = /<script\b[^>]*>([\s\S]*?)<\/script>/i;

/**
 * Everything the framework knows about each page under app/, read once from the
 * source. The dev server, the SSR entry and the build all derive their route
 * tables from this, so they cannot disagree about a page's path, metadata,
 * auth flag or SSR props.
 *
 * @returns {Promise<Array<{ relative, filePath, html, path, component, dynamic,
 *   hasEmbeddedScript, metadata, ssrProps, requiresAuth }>>}
 */
export async function scanPages(appDir) {
  const pages = [];
  for (const { path: filePath, relative } of await scanDir(appDir, '.html')) {
    if (relative.startsWith('_')) continue;
    const routePath = pathFromFile(relative.replace('.html', '.js'), '');
    if (!routePath) continue;

    const html = await readFile(filePath, 'utf-8');
    const embedded = html.match(SCRIPT_RE)?.[1];
    let script = embedded;
    if (!script) {
      for (const ext of ['.mjs', '.js']) {
        try { script = await readFile(filePath.replace(/\.html$/, ext), 'utf-8'); break; } catch {}
      }
    }

    let metadata = null, ssrProps = {}, requiresAuth = false;
    if (script) {
      // `static local` is not folded in here: it reaches SSR through scanComponents'
      // `locals`, like any other component's, and the client already has it.
      ssrProps = { ...staticObject(script, 'ssrProps') };
      metadata = staticObject(script, 'metadata');
      requiresAuth = /static\s+requiresAuth\s*=\s*true\b/.test(script);
    }

    // The tag the page actually registers; the file-name convention is only a
    // fallback ([slug].html would otherwise give the invalid tag `[slug]-page`).
    const stemName = relative.split('/').pop().replace('.html', '').replace(/^\[(.+)\]$/, '$1').toLowerCase();
    const component = (script && [...script.matchAll(DEFINE_RE)][0]?.[1]) || `${stemName}-page`;

    pages.push({
      relative, filePath, html,
      path: routePath,
      component,
      dynamic: routePath.includes(':'),
      hasEmbeddedScript: embedded != null,
      metadata, ssrProps, requiresAuth,
    });
  }
  return pages;
}

/** The serialisable route entry sent to the browser (routes.json / window.__ROUTES__). */
export const clientRoute = (page, module) => ({
  path: page.path,
  component: page.component,
  module,
  dynamic: page.dynamic,
  ...(page.metadata && { metadata: page.metadata }),
  ...(Object.keys(page.ssrProps).length && { ssrProps: page.ssrProps }),
  ...(page.requiresAuth && { requiresAuth: true }),
});

/** Dev route table: page scripts are served on demand from `<page>.html?script`. */
export async function scanRoutes(appDir) {
  return (await scanPages(appDir)).map(page => clientRoute(page, `/app/${page.relative}?script`));
}
