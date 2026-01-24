import { readdir } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { createMatcher, pathFromFile } from './routes.js';

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
