// Production build script - no dependencies
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '../..');
const dist = join(root, 'dist');

async function ensureDir(dir) {
  try { await mkdir(dir, { recursive: true }); } catch {}
}

async function copyDir(src, dest, transform) {
  await ensureDir(dest);
  const entries = await readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);

    if (entry.isDirectory()) {
      if (!entry.name.startsWith('.') && entry.name !== 'node_modules' && entry.name !== 'dist') {
        await copyDir(srcPath, destPath, transform);
      }
    } else if (entry.isFile()) {
      const ext = extname(entry.name);
      let content = await readFile(srcPath);

      if (['.js', '.html'].includes(ext) && transform) {
        content = await transform(content.toString(), srcPath, ext);
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

async function build() {
  console.log('Building...');

  const clientDist = join(dist, 'client');
  const serverDist = join(dist, 'server');

  // Clean dist
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

  // Copy and process index.html
  let indexHtml = await readFile(join(root, 'index.html'), 'utf-8');
  await writeFile(join(clientDist, 'index.html'), indexHtml);

  // Copy static assets
  try {
    await copyDir(join(root, 'public'), join(clientDist, 'public'));
  } catch {}

  // Copy server files
  await copyDir(join(root, 'core'), join(serverDist, 'core'), transform);
  await copyDir(join(root, 'lib'), join(serverDist, 'lib'), transform);
  await copyDir(join(root, 'app'), join(serverDist, 'app'), transform);

  console.log('Build complete! Output in dist/client and dist/server');
}

build().catch(console.error);
