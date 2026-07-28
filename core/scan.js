import { readdir, readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { createMatcher, pathFromFile } from './routes.js';
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

/**
 * Discover the custom-element tag → source-directory registry by scanning for
 * `define('<tag>', …)` calls. This is the single source of truth consumed by
 * core/tags.js, so a component folder whose name doesn't round-trip through the
 * kebab→PascalCase convention (HomeCTA, HomeQuickStart, NotFound) needs no
 * hand-maintained override anywhere.
 *
 * Differs from scanDir deliberately: it reads .html too (tags are often defined
 * in an inline <script>), accepts .mjs (dist/server renames sources), and does
 * NOT skip `_`-prefixed entries — app/_Layout/_Layout.js declares <app-layout>.
 *
 * @returns {Promise<Object<string,string>>} e.g. { 'home-cta': 'components/HomeCTA' }
 */
export async function scanTags(root, dirs = ['app', 'components']) {
  const registry = {};

  async function walk(current, rel) {
    let entries;
    try { entries = await readdir(current, { withFileTypes: true }); } catch { return; }
    for (const item of entries) {
      if (item.name.startsWith('.')) continue;
      const path = join(current, item.name);
      if (item.isDirectory()) { await walk(path, `${rel}/${item.name}`); continue; }
      if (!/\.(js|mjs|html)$/.test(item.name)) continue;
      const src = await readFile(path, 'utf-8').catch(() => '');
      for (const m of src.matchAll(DEFINE_RE)) registry[m[1]] ??= rel;
    }
  }

  for (const dir of dirs) await walk(join(root, dir), dir);
  // Sorted so the inlined JSON (and therefore the build's content hashes) is stable.
  return Object.fromEntries(Object.keys(registry).sort().map(k => [k, registry[k]]));
}

export async function scanRoutes(appDir) {
  return (await scanDir(appDir, '.html'))
    .filter(f => !f.relative.startsWith('_'))
    .map(({ relative }) => {
      const routePath = pathFromFile(relative.replace('.html', '.js'), '');
      if (!routePath) return null;
      const dynamic = routePath.includes(':');
      return { path: routePath, component: relative.split('/').pop().replace('.html', '').toLowerCase() + '-page', module: `/app/${relative}?script`, dynamic, matcher: dynamic ? createMatcher(routePath) : null };
    })
    .filter(Boolean);
}
