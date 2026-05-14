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
  result = await inlineTemplate(result);
  return result;
}

// Replace `static templateUrl = '/path.html'` with `static template = "<inlined>"`
// so the Component class skips the runtime fetch entirely. The HTML is read,
// stripped of <script> blocks (component classes live there), and JSON-encoded.
async function inlineTemplate(jsCode) {
  const match = jsCode.match(/static\s+templateUrl\s*=\s*['"]([^'"]+)['"]\s*;?/);
  if (!match) return jsCode;
  const tplUrl = match[1];
  const tplPath = join(root, tplUrl);
  try {
    const html = (await readFile(tplPath, 'utf-8'))
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
      .trim();
    return jsCode.replace(match[0], `static template = ${JSON.stringify(html)};`);
  } catch {
    return jsCode;
  }
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

// Rewrite static imports in extracted route scripts to use globalThis.__r,
// pulling modules from the already-loaded core bundle's registry instead of
// triggering a new network fetch. Dynamic imports and exports stay intact.
function rewriteStaticImports(src) {
  // import { A, B as C } from '/path.js'
  src = src.replace(/import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"];?/g, (_, names, path) => {
    const parts = names.split(',').map(p => {
      const [orig, alias] = p.trim().split(/\s+as\s+/);
      return alias ? `${orig.trim()}:${alias.trim()}` : orig.trim();
    }).join(',');
    return `const{${parts}}=globalThis.__r(${JSON.stringify(path)});`;
  });
  // import Default from '/path.js'  (and  import Default, { ... } from '/path.js')
  src = src.replace(/import\s+(\w+)(?:\s*,\s*\{([^}]+)\})?\s*from\s*['"]([^'"]+)['"];?/g, (_, def, named, path) => {
    const tmp = `__m_${path.replace(/[^a-z0-9]/gi, '_')}`;
    let out = `const ${tmp}=globalThis.__r(${JSON.stringify(path)});const ${def}=${tmp}.default??${tmp};`;
    if (named) {
      const parts = named.split(',').map(p => {
        const [orig, alias] = p.trim().split(/\s+as\s+/);
        return `const ${alias || orig}=${tmp}.${orig.trim()};`;
      }).join('');
      out += parts;
    }
    return out;
  });
  // import 'side-effect'
  src = src.replace(/import\s*['"]([^'"]+)['"];?/g, (_, path) => `globalThis.__r(${JSON.stringify(path)});`);
  return src;
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
        let js = rewriteStaticImports(match[1].trim());
        js = await inlineTemplate(js);
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
  const { code: bundleCode, hash: bundleHash } = await bundle(entryAbs, root, {
    minify: true,
    transform: src => inlineTemplate(src),
  });

  // Locale data is no longer prepended to the bundle. The SSR layer inlines only
  // the active locale into the HTML head (see entry-server.js), keeping the
  // critical-path JS smaller and avoiding ship cost for unused languages.
  const bundleFile = `core.${bundleHash}.js`;
  await writeFile(join(assetsDir, bundleFile), bundleCode);
  console.log(`[build] Core bundle → _assets/${bundleFile} (${(bundleCode.length/1024).toFixed(1)}kb)`);

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

  // Critical-path preloads. Fonts break the HTML→CSS→font dependency chain.
  // No modulepreloads here — the core bundle already inlines every static import.
  // No routes.json preload — routes are inlined into the HTML below.
  const fontPreloads = [
    '/fonts/aaltosansessential-regular.otf',
    '/fonts/aaltosansessential-medium.otf',
    '/fonts/aaltosansessential-semibold.otf',
  ].map(p => `<link rel="preload" href="${p}" as="font" type="font/otf" crossorigin>`).join('');

  const preloadLinks = fontPreloads;

  // 9. routes.json — generated first so we can inline it into the HTML template
  const routes = await generateRoutesJson(join(root, 'app'));
  await writeFile(join(clientDist, 'routes.json'), JSON.stringify(routes, null, 2));

  // Inline routes into HTML so the Router doesn't need a separate fetch.
  // The dependency-chain gate point — saves a full round-trip on first paint.
  const routesScript = `<script>window.__ROUTES__=${JSON.stringify(routes)}</script>`;

  let template = await readFile(join(root, 'index.html'), 'utf-8');
  template = template
    .replace('<!--inline-css-->', `<style>${minCss}</style>`)
    .replace('<!--preload-links-->', preloadLinks + routesScript)
    // Replace the module script tag with the hashed bundle
    .replace(/<script type="module" src="\/core\/server\/entry-client\.js"><\/script>/,
      `<script type="module" src="/_assets/${bundleFile}"></script>`);

  await writeFile(join(clientDist, '_template.html'), template);

  // 5. Locale JSON files (client for fetch, server for SSR)
  await Promise.all([
    copyDir(join(root, 'locales'), join(clientDist, 'locales')),
    copyDir(join(root, 'locales'), join(serverDist, 'locales')),
  ]);

  // 7. Public assets (copied flat to client root so /fonts/... works)
  await copyDir(join(root, 'public'), clientDist).catch(() => {});

  // 8. Server-side copy (for SSR) — .mjs renamed for CF workers
  await Promise.all([
    copyDir(join(root, 'core'), join(serverDist, 'core'), { transformContent: transform, renameJsToMjs: true }),
    copyDir(join(root, 'lib'), join(serverDist, 'lib'), { transformContent: transform, renameJsToMjs: true }),
    copyDir(join(root, 'app'), join(serverDist, 'app'), { transformContent: transform, renameJsToMjs: true }),
    copyDir(join(root, 'components'), join(serverDist, 'components'), { transformContent: transform, renameJsToMjs: true }),
  ]);

  // 10. Cloudflare worker
  await copyFile(join(root, 'deploy/cloudflare/_worker.js'), join(clientDist, '_worker.js')).catch(() => {});

  // 11. Manifest for debugging
  const manifest = {
    bundle: `/_assets/${bundleFile}`,
    routes: routes.map(r => r.path),
    built: new Date().toISOString(),
  };
  await writeFile(join(clientDist, '_manifest.json'), JSON.stringify(manifest, null, 2));

  console.log(`[build] Done. Routes: ${routes.map(r => r.path).join(', ')}`);
}

build().catch(e => { console.error('[build] Failed:', e); process.exit(1); });
