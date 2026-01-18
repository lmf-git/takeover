// Directory scanner for routes - Node.js only
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
  // Scan for HTML files (single-file components)
  const htmlFiles = await scanDir(appDir, '.html');

  return htmlFiles
    .filter(f => !f.relative.startsWith('_'))
    .map(({ path: filePath, relative }) => {
      const routePath = pathFromFile(relative.replace('.html', '.js'), '');
      if (!routePath) return null;

      const dynamic = routePath.includes(':');
      const component = relative.split('/').pop().replace('.html', '').toLowerCase() + '-page';

      return {
        path: routePath,
        component,
        // Use ?script to extract JS from HTML, or fall back to .js file
        module: `/app/${relative}?script`,
        dynamic,
        matcher: dynamic ? createMatcher(routePath) : null
      };
    })
    .filter(Boolean);
}
