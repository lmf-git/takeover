// Production build script - no dependencies
import { readFile, writeFile, readdir, mkdir, rm } from 'node:fs/promises';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '../..');
const dist = join(root, 'dist');

async function cleanDir(dir) {
  try { await rm(dir, { recursive: true, force: true }); } catch {}
}

async function ensureDir(dir) {
  try { await mkdir(dir, { recursive: true }); } catch {}
}

async function copyDir(src, dest, transform, renameJsToMjs = false) {
  await ensureDir(dest);
  const entries = await readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    let destPath = join(dest, entry.name);

    if (entry.isDirectory()) {
      if (!entry.name.startsWith('.') && entry.name !== 'node_modules' && entry.name !== 'dist') {
        await copyDir(srcPath, destPath, transform, renameJsToMjs);
      }
    } else if (entry.isFile()) {
      const ext = extname(entry.name);
      let content = await readFile(srcPath);

      if (['.js', '.html'].includes(ext) && transform) {
        content = await transform(content.toString(), srcPath, ext);
      }

      // Rename .js to .mjs for server files (ES modules)
      if (renameJsToMjs && ext === '.js') {
        destPath = destPath.replace(/\.js$/, '.mjs');
        // Also update imports in the content to use .mjs
        if (typeof content === 'string') {
          content = content.replace(/from\s+['"]([^'"]+)\.js['"]/g, "from '$1.mjs'");
          content = content.replace(/import\s+['"]([^'"]+)\.js['"]/g, "import '$1.mjs'");
        }
      }

      await ensureDir(dirname(destPath));
      await writeFile(destPath, content);
    }
  }
}

// Transform ?raw imports to inline strings
async function transformJS(content, filePath) {
  const rawImportRegex = /import\s+(\w+)\s+from\s+['"](.+)\?raw['"]/g;
  let result = content;
  let match;

  while ((match = rawImportRegex.exec(content)) !== null) {
    const [full, varName, importPath] = match;
    const absPath = join(dirname(filePath), importPath);

    try {
      const rawContent = await readFile(absPath, 'utf-8');
      const escaped = JSON.stringify(rawContent);
      result = result.replace(full, `const ${varName} = ${escaped}`);
    } catch (e) {
      console.warn(`Warning: Could not inline ${importPath}`);
    }
  }

  return result;
}

// Extract script from HTML and write as separate .js file
async function extractScripts(srcDir, destDir) {
  const entries = await readdir(srcDir, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = join(srcDir, entry.name);
    const destPath = join(destDir, entry.name);

    if (entry.isDirectory() && !entry.name.startsWith('.')) {
      await extractScripts(srcPath, destPath);
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      const html = await readFile(srcPath, 'utf-8');
      const scriptMatch = html.match(/<script\b[^>]*>([\s\S]*?)<\/script>/i);

      if (scriptMatch) {
        // Write extracted script as .script.js
        const scriptPath = destPath.replace('.html', '.script.js');
        await ensureDir(dirname(scriptPath));
        await writeFile(scriptPath, scriptMatch[1].trim());
      }
    }
  }
}

// Generate routes.json from app directory
async function generateRoutesJson() {
  const appPath = join(root, 'app');
  const routes = [];

  async function scanForRoutes(dir, base = '') {
    const items = await readdir(dir, { withFileTypes: true });
    for (const item of items) {
      const itemPath = join(dir, item.name);
      const relative = base ? `${base}/${item.name}` : item.name;

      if (item.isDirectory() && !item.name.startsWith('_') && !item.name.startsWith('.')) {
        await scanForRoutes(itemPath, relative);
      } else if (item.isFile() && item.name.endsWith('.html') && !item.name.startsWith('_')) {
        // Convert file path to route path
        const routePath = fileToRoutePath(relative.replace('.html', '.js'));
        if (routePath) {
          const dynamic = routePath.includes(':');
          const component = relative.split('/').pop().replace('.html', '').toLowerCase() + '-page';

          // Check if HTML has embedded script or separate .js file
          const html = await readFile(itemPath, 'utf-8');
          const hasEmbeddedScript = /<script\b[^>]*>[\s\S]*?<\/script>/i.test(html);

          routes.push({
            path: routePath,
            component,
            // Use .script.js for embedded scripts, .js for separate files
            module: hasEmbeddedScript
              ? `/app/${relative.replace('.html', '.script.js')}`
              : `/app/${relative.replace('.html', '.js')}`,
            dynamic
          });
        }
      }
    }
  }

  await scanForRoutes(appPath);
  return routes;
}

// Convert file path to route path (same logic as pathFromFile)
function fileToRoutePath(file) {
  // file is like "Home/Home.js", "About/About.js", "Users/[id]/User.js"
  const parts = file.split('/');
  const fileName = parts.pop().replace('.js', ''); // e.g., "Home", "About", "User"

  // parts now contains the directories, e.g., ["Home"], ["About"], ["Users", "[id]"]
  // For normal pages like "Home/Home.js", the directory name matches the file name
  // For nested routes like "Users/[id]/User.js", we need to build the path from directories

  // Build route path from all directory parts
  const routeSegments = parts.map(p => {
    if (p.startsWith('[') && p.endsWith(']')) {
      return ':' + p.slice(1, -1);
    }
    return p.toLowerCase();
  });

  // Check if the filename matches the last directory (standard pattern like Home/Home.js)
  const lastDir = parts[parts.length - 1];
  const fileMatchesDir = lastDir && fileName.toLowerCase() === lastDir.toLowerCase();

  // For User.html in [id] folder, fileName doesn't match directory but we should still skip it
  // Validate: only accept if filename matches directory, or if last dir is a param folder
  const lastDirIsParam = lastDir?.startsWith('[') && lastDir?.endsWith(']');
  if (!fileMatchesDir && !lastDirIsParam) return null;

  // Handle special case for Home -> root route "/"
  if (fileName.toLowerCase() === 'home' && routeSegments.length === 1 && routeSegments[0] === 'home') {
    return '/';
  }

  const routePath = '/' + routeSegments.join('/');
  return routePath || '/';
}

async function build() {
  console.log('Building...');

  const clientDist = join(dist, 'client');
  const serverDist = join(dist, 'server');

  // Clean and recreate dist directories
  await cleanDir(dist);
  await ensureDir(clientDist);
  await ensureDir(serverDist);

  // Copy and transform source files
  const transform = async (content, path, ext) => {
    if (ext === '.js') return transformJS(content, path);
    return content;
  };

  // Copy client files (app, components, core, lib)
  await copyDir(join(root, 'app'), join(clientDist, 'app'), transform);
  await copyDir(join(root, 'components'), join(clientDist, 'components'), transform);
  await copyDir(join(root, 'core'), join(clientDist, 'core'), transform);
  await copyDir(join(root, 'lib'), join(clientDist, 'lib'), transform);

  // Extract scripts from HTML files for static serving
  await extractScripts(join(root, 'app'), join(clientDist, 'app'));
  await extractScripts(join(root, 'components'), join(clientDist, 'components'));

  // Copy and process index.html
  let indexHtml = await readFile(join(root, 'index.html'), 'utf-8');
  await writeFile(join(clientDist, 'index.html'), indexHtml);

  // Copy static assets
  try {
    await copyDir(join(root, 'public'), join(clientDist, 'public'));
  } catch {}

  // Copy server files (rename .js to .mjs for ES module compatibility)
  await copyDir(join(root, 'core'), join(serverDist, 'core'), transform, true);
  await copyDir(join(root, 'lib'), join(serverDist, 'lib'), transform, true);
  await copyDir(join(root, 'app'), join(serverDist, 'app'), transform, true);
  await copyDir(join(root, 'components'), join(serverDist, 'components'), transform, true);

  // Generate routes.json for client-side routing
  const routes = await generateRoutesJson();
  await writeFile(join(clientDist, 'routes.json'), JSON.stringify(routes, null, 2));
  console.log('[Build] Generated routes.json:', routes.map(r => r.path).join(', '));

  console.log('Build complete! Output in dist/client and dist/server');
}

build().catch(console.error);
