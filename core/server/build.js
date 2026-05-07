import { readFile, writeFile, readdir, mkdir, rm, copyFile, stat } from 'node:fs/promises';
import { join, dirname, extname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { pathFromFile } from '../routes.js';
import { bundle } from './bundle.js';
import { minifyJS, minifyCSS } from './minify.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '../..');
const dist = join(root, 'dist');

const ensureDir = dir => mkdir(dir, { recursive: true }).catch(() => {});
const cleanDir = dir => rm(dir, { recursive: true, force: true }).catch(() => {});

const contentHash = s => createHash('sha256').update(s).digest('hex').slice(0, 8);

// ─── Raw-import inlining (dev-only transform preserved for compat) ────────────
async function transformJS(content, filePath) {
  let result = content;
  for (const [full, varName, importPath] of content.matchAll(/import\s+(\w+)\s+from\s+['"](.+)\?raw['"]/g)) {
    try {
      const raw = await readFile(join(dirname(filePath), importPath), 'utf-8');
      result = result.replace(full, `const ${varName} = ${JSON.stringify(raw)}`);
    } catch {}
  }
  return result;
}

// ─── Copy + minify individual files ─────────────────────────────────────────
async function copyDir(src, dest, opts = {}) {
  const { transformContent = null, renameJsToMjs = false, doMinify = false } = opts;
  await ensureDir(dest);
  for (const entry of await readdir(src, { withFileTypes: true })) {
    const srcPath = join(src, entry.name);
    let destPath = join(dest, entry.name);

    if (entry.isDirectory()) {
      if (!entry.name.startsWith('.') && !['node_modules', 'dist'].includes(entry.name))
        await copyDir(srcPath, destPath, opts);
    } else if (entry.isFile()) {
      const ext = extname(entry.name);
      let content = await readFile(srcPath, 'utf-8');

      if (ext === '.js') {
        if (transformContent) content = await transformContent(content, srcPath, ext);
        if (doMinify) content = minifyJS(content);
      }
      if (ext === '.css' && doMinify) content = minifyCSS(content);

      if (renameJsToMjs && ext === '.js') {
        destPath = destPath.replace(/\.js$/, '.mjs');
        content = content
          .replace(/from\s+['"]([^'"]+)\.js['"]/g, "from '$1.mjs'")
          .replace(/import\s+['"]([^'"]+)\.js['"]/g, "import '$1.mjs'");
      }

      await ensureDir(dirname(destPath));
      await writeFile(destPath, content);
    }
  }
}

// ─── Script extraction from .html files ─────────────────────────────────────
async function extractScripts(srcDir, destDir, doMinify = false) {
  for (const entry of await readdir(srcDir, { withFileTypes: true })) {
    const srcPath = join(srcDir, entry.name), destPath = join(destDir, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith('.')) {
      await extractScripts(srcPath, destPath, doMinify);
    } else if (entry.name.endsWith('.html')) {
      const match = (await readFile(srcPath, 'utf-8')).match(/<script\b[^>]*>([\s\S]*?)<\/script>/i);
      if (match) {
        let js = match[1].trim();
        if (doMinify) js = minifyJS(js);
        await ensureDir(dirname(destPath));
        await writeFile(destPath.replace('.html', '.script.js'), js);
      }
    }
  }
}

// ─── routes.json generation ──────────────────────────────────────────────────
async function generateRoutesJson(appPath) {
  const routes = [];

  async function scan(dir, base = '') {
    for (const item of await readdir(dir, { withFileTypes: true })) {
      const itemPath = join(dir, item.name);
      const relative$1 = base ? `${base}/${item.name}` : item.name;

      if (item.isDirectory() && !item.name.startsWith('_') && !item.name.startsWith('.')) {
        await scan(itemPath, relative$1);
      } else if (item.isFile() && item.name.endsWith('.html') && !item.name.startsWith('_')) {
        const routePath = pathFromFile(relative$1.replace('.html', '.js'), '');
        if (!routePath) continue;

        const html = await readFile(itemPath, 'utf-8');
        const hasEmbedded = /<script\b[^>]*>[\s\S]*?<\/script>/i.test(html);

        let script = html.match(/<script\b[^>]*>([\s\S]*?)<\/script>/i)?.[1] || '';
        if (!script) {
          for (const ext of ['.mjs', '.js']) {
            try { script = await readFile(itemPath.replace('.html', ext), 'utf-8'); break; } catch {}
          }
        }

        let metadata = null, ssrProps = {}, requiresAuth = false;
        if (script) {
          try {
            const extractObj = (src, prefix) => {
              const m = src.match(new RegExp(`static\\s+${prefix}\\s*=\\s*\\{`));
              if (!m) return null;
              let start = m.index + m[0].length - 1, depth = 1, i = start + 1;
              while (i < src.length && depth > 0) { if (src[i] === '{') depth++; else if (src[i] === '}') depth--; i++; }
              return src.slice(start, i);
            };
            const localObj = extractObj(script, 'local');
            const ssrObj = extractObj(script, 'ssrProps');
            const m2 = script.match(/static\s+metadata\s*=\s*(\{[^}]+\})/);
            const m3 = script.match(/static\s+requiresAuth\s*=\s*(true|false)/);
            if (localObj) ssrProps = { ...ssrProps, ...eval(`(${localObj})`) };
            if (ssrObj) ssrProps = { ...ssrProps, ...eval(`(${ssrObj})`) };
            if (m2) metadata = eval(`(${m2[1]})`);
            if (m3) requiresAuth = m3[1] === 'true';
          } catch {}
        }

        routes.push({
          path: routePath,
          component: relative$1.split('/').pop().replace('.html', '').toLowerCase() + '-page',
          module: `/app/${relative$1.replace('.html', hasEmbedded ? '.script.js' : '.js')}`,
          dynamic: routePath.includes(':'),
          ...(metadata && { metadata }),
          ...(Object.keys(ssrProps).length && { ssrProps }),
          ...(requiresAuth && { requiresAuth })
        });
      }
    }
  }
  await scan(appPath);
  return routes;
}

// ─── Build ───────────────────────────────────────────────────────────────────
async function build() {
  console.log('[build] Starting...');
  const clientDist = join(dist, 'client');
  const serverDist = join(dist, 'server');
  const assetsDir = join(clientDist, '_assets');

  await cleanDir(dist);
  await Promise.all([ensureDir(clientDist), ensureDir(serverDist), ensureDir(assetsDir)]);

  // 1. Bundle the client entry + all static imports into a single hashed file
  console.log('[build] Bundling core...');
  const entryAbs = join(root, 'core/server/entry-client.js');
  const { code: bundleCode, hash: bundleHash } = await bundle(entryAbs, root, { minify: true });

  // Prepend all locale data so translations are available synchronously (no fetch)
  const localeData = {};
  await Promise.all(['en', 'es', 'fr'].map(async lang => {
    try { localeData[lang] = JSON.parse(await readFile(join(root, 'locales', `${lang}.json`), 'utf-8')); } catch {}
  }));
  const finalBundle = `window.__LOCALES__=${JSON.stringify(localeData)};${bundleCode}`;

  const bundleFile = `core.${bundleHash}.js`;
  await writeFile(join(assetsDir, bundleFile), finalBundle);
  console.log(`[build] Core bundle → _assets/${bundleFile} (${(finalBundle.length/1024).toFixed(1)}kb)`);

  // 2. Copy + minify individual component/app/lib/core files (for dynamic imports)
  const transform = (content, path, ext) => ext === '.js' ? transformJS(content, path) : content;
  await Promise.all([
    copyDir(join(root, 'app'), join(clientDist, 'app'), { transformContent: transform, doMinify: true }),
    copyDir(join(root, 'components'), join(clientDist, 'components'), { transformContent: transform, doMinify: true }),
    copyDir(join(root, 'core'), join(clientDist, 'core'), { transformContent: transform, doMinify: true }),
    copyDir(join(root, 'lib'), join(clientDist, 'lib'), { transformContent: transform, doMinify: true }),
  ]);

  // 3. Extract + minify embedded scripts from .html files
  await extractScripts(join(root, 'app'), join(clientDist, 'app'), true);
  await extractScripts(join(root, 'components'), join(clientDist, 'components'), true);

  // 4. Build HTML template — reference hashed bundle instead of entry-client.js
  const globalsCss = await readFile(join(root, 'globals.css'), 'utf-8').catch(() => '');
  const minCss = minifyCSS(globalsCss);
  const cssHash = contentHash(minCss);
  const cssFile = `globals.${cssHash}.css`;
  await writeFile(join(assetsDir, cssFile), minCss);

  // Preloads: no longer need entry-client preload (it's bundled), keep dynamic component preloads
  const modulePreloads = [
    '/components/Router/Router.js',
  ].map(p => `<link rel="modulepreload" href="${p}">`).join('\n  ');

  const otherPreloads = [
    `<link rel="preload" href="/_assets/${cssFile}" as="style">`,
    '<link rel="preload" href="/routes.json" as="fetch">',
  ].join('\n  ');

  let template = await readFile(join(root, 'index.html'), 'utf-8');
  template = template
    .replace('<!--inline-css-->', `<link rel="stylesheet" href="/_assets/${cssFile}">`)
    .replace('<!--preload-links-->', modulePreloads + '\n  ' + otherPreloads)
    // Replace the module script tag with the hashed bundle
    .replace(/<script type="module" src="\/core\/server\/entry-client\.js"><\/script>/,
      `<script type="module" src="/_assets/${bundleFile}"></script>`);

  await writeFile(join(clientDist, '_template.html'), template);

  // 5. Locale JSON files (client for fetch, server for SSR)
  await Promise.all([
    copyDir(join(root, 'locales'), join(clientDist, 'locales')),
    copyDir(join(root, 'locales'), join(serverDist, 'locales')),
  ]);

  // 7. Public assets
  await copyDir(join(root, 'public'), join(clientDist, 'public')).catch(() => {});

  // 8. Server-side copy (for SSR) — .mjs renamed for CF workers
  await Promise.all([
    copyDir(join(root, 'core'), join(serverDist, 'core'), { transformContent: transform, renameJsToMjs: true }),
    copyDir(join(root, 'lib'), join(serverDist, 'lib'), { transformContent: transform, renameJsToMjs: true }),
    copyDir(join(root, 'app'), join(serverDist, 'app'), { transformContent: transform, renameJsToMjs: true }),
    copyDir(join(root, 'components'), join(serverDist, 'components'), { transformContent: transform, renameJsToMjs: true }),
  ]);

  // 9. routes.json
  const routes = await generateRoutesJson(join(root, 'app'));
  await writeFile(join(clientDist, 'routes.json'), JSON.stringify(routes, null, 2));

  // 10. Cloudflare worker
  await copyFile(join(root, 'deploy/cloudflare/_worker.js'), join(clientDist, '_worker.js')).catch(() => {});

  // 11. Manifest for debugging
  const manifest = {
    bundle: `/_assets/${bundleFile}`,
    css: `/_assets/${cssFile}`,
    routes: routes.map(r => r.path),
    built: new Date().toISOString(),
  };
  await writeFile(join(clientDist, '_manifest.json'), JSON.stringify(manifest, null, 2));

  console.log(`[build] Done. Routes: ${routes.map(r => r.path).join(', ')}`);
}

build().catch(e => { console.error('[build] Failed:', e); process.exit(1); });
