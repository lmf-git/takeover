// Directory scanner for routes and components - Node.js only
import { readdir, readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { createMatcher, pathFromFile } from './routes.js';

export async function scanDir(dir, ext = '.js') {
  const entries = [];

  async function scan(current, base = '') {
    const items = await readdir(current, { withFileTypes: true });
    for (const item of items) {
      const path = join(current, item.name);
      const relative = base ? `${base}/${item.name}` : item.name;

      if (item.isDirectory() && !item.name.startsWith('_') && !item.name.startsWith('.')) {
        await scan(path, relative);
      } else if (item.isFile() && extname(item.name) === ext && !item.name.startsWith('_')) {
        entries.push({ path, relative });
      }
    }
  }

  await scan(dir);
  return entries;
}

export async function scanRoutes(appDir) {
  const files = await scanDir(appDir, '.js');

  return files
    .filter(f => !f.relative.startsWith('_'))
    .map(({ relative }) => {
      const path = pathFromFile(relative, '');
      if (!path) return null;

      const dynamic = path.includes(':');
      const component = relative.split('/').pop().replace('.js', '').toLowerCase() + '-page';

      return {
        path,
        component,
        module: `/app/${relative}`,
        dynamic,
        matcher: dynamic ? createMatcher(path) : null
      };
    })
    .filter(Boolean);
}

export async function scanTemplates(appDir) {
  const files = await scanDir(appDir, '.html');
  const templates = {};

  for (const { path, relative } of files) {
    if (!relative.startsWith('_')) {
      const routePath = pathFromFile(relative.replace('.html', '.js'), '');
      if (routePath) {
        templates[routePath] = await readFile(path, 'utf-8');
      }
    }
  }

  return templates;
}

export async function scanComponents(componentsDir) {
  const files = await scanDir(componentsDir, '.js');
  return files.map(({ relative }) => `/components/${relative}`);
}
