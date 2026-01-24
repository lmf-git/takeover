import { readFile, writeFile, readdir, mkdir, rm } from 'node:fs/promises';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathFromFile } from '../routes.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '../..');
const dist = join(root, 'dist');

const ensureDir = dir => mkdir(dir, { recursive: true }).catch(() => {});
const cleanDir = dir => rm(dir, { recursive: true, force: true }).catch(() => {});

async function copyDir(src, dest, transform, renameJsToMjs = false) {
  await ensureDir(dest);
  for (const entry of await readdir(src, { withFileTypes: true })) {
    const srcPath = join(src, entry.name);
    let destPath = join(dest, entry.name);

    if (entry.isDirectory()) {
      if (!entry.name.startsWith('.') && !['node_modules', 'dist'].includes(entry.name))
        await copyDir(srcPath, destPath, transform, renameJsToMjs);
    } else if (entry.isFile()) {
      const ext = extname(entry.name);
      let content = await readFile(srcPath);

      if (['.js', '.html'].includes(ext) && transform)
        content = await transform(content.toString(), srcPath, ext);

      if (renameJsToMjs && ext === '.js') {
        destPath = destPath.replace(/\.js$/, '.mjs');
        if (typeof content === 'string')
          content = content.replace(/from\s+['"]([^'"]+)\.js['"]/g, "from '$1.mjs'").replace(/import\s+['"]([^'"]+)\.js['"]/g, "import '$1.mjs'");
      }

      await ensureDir(dirname(destPath));
      await writeFile(destPath, content);
    }
  }
}

async function transformJS(content, filePath) {
  let result = content;
  for (const [full, varName, importPath] of content.matchAll(/import\s+(\w+)\s+from\s+['"](.+)\?raw['"]/g)) {
    try {
      const rawContent = await readFile(join(dirname(filePath), importPath), 'utf-8');
      result = result.replace(full, `const ${varName} = ${JSON.stringify(rawContent)}`);
    } catch {}
  }
  return result;
}

async function extractScripts(srcDir, destDir) {
  for (const entry of await readdir(srcDir, { withFileTypes: true })) {
    const srcPath = join(srcDir, entry.name), destPath = join(destDir, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith('.')) {
      await extractScripts(srcPath, destPath);
    } else if (entry.name.endsWith('.html')) {
      const match = (await readFile(srcPath, 'utf-8')).match(/<script\b[^>]*>([\s\S]*?)<\/script>/i);
      if (match) { await ensureDir(dirname(destPath)); await writeFile(destPath.replace('.html', '.script.js'), match[1].trim()); }
    }
  }
}

async function generateRoutesJson() {
  const appPath = join(root, 'app');
  const routes = [];

  async function scan(dir, base = '') {
    for (const item of await readdir(dir, { withFileTypes: true })) {
      const itemPath = join(dir, item.name);
      const relative = base ? `${base}/${item.name}` : item.name;

      if (item.isDirectory() && !item.name.startsWith('_') && !item.name.startsWith('.')) {
        await scan(itemPath, relative);
      } else if (item.isFile() && item.name.endsWith('.html') && !item.name.startsWith('_')) {
        const routePath = pathFromFile(relative.replace('.html', '.js'), '');
        if (routePath) {
          const html = await readFile(itemPath, 'utf-8');
          const hasEmbedded = /<script\b[^>]*>[\s\S]*?<\/script>/i.test(html);
          routes.push({
            path: routePath,
            component: relative.split('/').pop().replace('.html', '').toLowerCase() + '-page',
            module: `/app/${relative.replace('.html', hasEmbedded ? '.script.js' : '.js')}`,
            dynamic: routePath.includes(':')
          });
        }
      }
    }
  }
  await scan(appPath);
  return routes;
}

async function build() {
  console.log('Building...');
  const clientDist = join(dist, 'client'), serverDist = join(dist, 'server');

  await cleanDir(dist);
  await ensureDir(clientDist);
  await ensureDir(serverDist);

  const transform = (content, path, ext) => ext === '.js' ? transformJS(content, path) : content;

  await Promise.all([
    copyDir(join(root, 'app'), join(clientDist, 'app'), transform),
    copyDir(join(root, 'components'), join(clientDist, 'components'), transform),
    copyDir(join(root, 'core'), join(clientDist, 'core'), transform),
    copyDir(join(root, 'lib'), join(clientDist, 'lib'), transform),
  ]);

  await extractScripts(join(root, 'app'), join(clientDist, 'app'));
  await extractScripts(join(root, 'components'), join(clientDist, 'components'));

  await writeFile(join(clientDist, '_template.html'), await readFile(join(root, 'index.html'), 'utf-8'));
  await copyDir(join(root, 'public'), join(clientDist, 'public')).catch(() => {});

  await Promise.all([
    copyDir(join(root, 'core'), join(serverDist, 'core'), transform, true),
    copyDir(join(root, 'lib'), join(serverDist, 'lib'), transform, true),
    copyDir(join(root, 'app'), join(serverDist, 'app'), transform, true),
    copyDir(join(root, 'components'), join(serverDist, 'components'), transform, true),
  ]);

  const routes = await generateRoutesJson();
  await writeFile(join(clientDist, 'routes.json'), JSON.stringify(routes, null, 2));
  console.log('Build complete:', routes.map(r => r.path).join(', '));
}

build().catch(console.error);
