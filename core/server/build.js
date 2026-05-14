import { readFile, writeFile, readdir, mkdir, rm, copyFile, stat } from 'node:fs/promises';
import { join, dirname, extname, relative, resolve as pathResolve } from 'node:path';
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
async function transformJS(content, filePath, { rewriteToRegistry = false } = {}) {
  let result = content;
  for (const [full, varName, importPath] of content.matchAll(/import\s+(\w+)\s+from\s+['"](.+)\?raw['"]/g)) {
    try {
      const raw = await readFile(join(dirname(filePath), importPath), 'utf-8');
      result = result.replace(full, `const ${varName} = ${JSON.stringify(raw)}`);
    } catch {}
  }
  result = await inlineTemplate(result);
  if (rewriteToRegistry) result = rewriteImportsToRegistry(result, filePath);
  return result;
}

// Resolve a static import specifier to its bundle-registry key (the URL that the
// inlined core bundle registers each module under, e.g. '/core/component.js').
// Handles both absolute (/x.js) and relative (../x.js) specifiers.
function resolveToRegistryKey(spec, filePath) {
  if (!spec || spec.startsWith('node:') || (!spec.startsWith('.') && !spec.startsWith('/'))) return null;
  const abs = spec.startsWith('/') ? join(root, spec) : pathResolve(dirname(filePath), spec);
  return '/' + relative(root, abs).replace(/\\/g, '/');
}

// Rewrite static imports in standalone .js files (components/*, app/*) so they
// pull pre-bundled modules from globalThis.__r instead of triggering a fresh
// network fetch for /core/component.js, /core/template.js, etc. Eliminates the
// dependency-chain Lighthouse warning when these files are lazy-loaded.
function rewriteImportsToRegistry(src, filePath) {
  // import { A, B as C } from '...'
  src = src.replace(/import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]\s*;?/g, (full, names, spec) => {
    const key = resolveToRegistryKey(spec, filePath);
    if (!key) return full;
    const parts = names.split(',').map(p => {
      const [orig, alias] = p.trim().split(/\s+as\s+/);
      return alias ? `${orig.trim()}:${alias.trim()}` : orig.trim();
    }).filter(Boolean).join(',');
    return `const{${parts}}=globalThis.__r(${JSON.stringify(key)});`;
  });
  // import Default from '...'  (and  import Default, { ... } from '...')
  src = src.replace(/import\s+(\w+)(?:\s*,\s*\{([^}]+)\})?\s*from\s*['"]([^'"]+)['"]\s*;?/g, (full, def, named, spec) => {
    const key = resolveToRegistryKey(spec, filePath);
    if (!key) return full;
    const tmp = `__m_${key.replace(/[^a-z0-9]/gi, '_')}`;
    let out = `const ${tmp}=globalThis.__r(${JSON.stringify(key)});const ${def}=${tmp}.default??${tmp};`;
    if (named) {
      out += named.split(',').map(p => {
        const [orig, alias] = p.trim().split(/\s+as\s+/);
        return `const ${alias || orig}=${tmp}.${orig.trim()};`;
      }).join('');
    }
    return out;
  });
  // import 'side-effect'
  src = src.replace(/import\s*['"]([^'"]+)['"]\s*;?/g, (full, spec) => {
    const key = resolveToRegistryKey(spec, filePath);
    if (!key) return full;
    return `globalThis.__r(${JSON.stringify(key)});`;
  });
  return src;
}

// Replace `static templateUrl = '/path.html'` with `static template = "<inlined>"`.
// Also injects static cssModule / static css when sibling CSS files exist and none
// are explicitly declared — preserving the auto-discovery behaviour at runtime.
async function inlineTemplate(jsCode) {
  const match = jsCode.match(/static\s+templateUrl\s*=\s*['"]([^'"]+)['"]\s*;?/);
  if (!match) return jsCode;
  const tplUrl = match[1];
  const tplPath = join(root, tplUrl);
  try {
    const html = (await readFile(tplPath, 'utf-8'))
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
      .trim();
    let result = jsCode.replace(match[0], `static template = ${JSON.stringify(html)};`);

    // Auto-inject CSS references when sibling files exist but no explicit declaration
    const hasCssModule = /static\s+cssModule\b/.test(jsCode);
    const hasCssFile = /static\s+css\b/.test(jsCode);
    if (!hasCssModule) {
      const moduleCssPath = tplPath.replace(/\.html$/, '.module.css');
      const moduleCssUrl = tplUrl.replace(/\.html$/, '.module.css');
      const exists = await stat(moduleCssPath).then(() => true).catch(() => false);
      if (exists) result = result.replace(`static template = ${JSON.stringify(html)};`, `static template = ${JSON.stringify(html)};\n  static cssModule = ${JSON.stringify(moduleCssUrl)};`);
    }
    if (!hasCssFile) {
      const plainCssPath = tplPath.replace(/\.html$/, '.css');
      const plainCssUrl = tplUrl.replace(/\.html$/, '.css');
      const exists = await stat(plainCssPath).then(() => true).catch(() => false);
      if (exists) result = result.replace(`static template = ${JSON.stringify(html)};`, `static template = ${JSON.stringify(html)};\n  static css = ${JSON.stringify(plainCssUrl)};`);
    }
    return result;
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
// preferJs: emit .js (not .script.js) when no explicit .js source file exists.
// Used for components/ so loader.js can import them at their natural .js path.
// Pages (app/) always use .script.js to distinguish from route-registered .js files.
async function extractScripts(srcDir, destDir, doMinify = false, preferJs = false) {
  for (const entry of await readdir(srcDir, { withFileTypes: true })) {
    const srcPath = join(srcDir, entry.name), destPath = join(destDir, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith('.')) {
      await extractScripts(srcPath, destPath, doMinify, preferJs);
    } else if (entry.name.endsWith('.html')) {
      const match = (await readFile(srcPath, 'utf-8')).match(/<script\b[^>]*>([\s\S]*?)<\/script>/i);
      if (match) {
        const hasExplicitJs = preferJs && await stat(srcPath.replace('.html', '.js')).then(() => true).catch(() => false);
        const outPath = destPath.replace('.html', preferJs && !hasExplicitJs ? '.js' : '.script.js');
        let js = rewriteStaticImports(match[1].trim());
        js = await inlineTemplate(js);
        if (doMinify) js = minifyJS(js);
        await ensureDir(dirname(outPath));
        await writeFile(outPath, js);
      }
    }
  }
}

// ─── Content-hash .js files in a directory tree, rename, build manifest ──────
// We hash app/* and components/* output so they can be served with a 1-year
// immutable cache header. Bundle-resolved URLs (loader.js, Router, routes.json)
// consult window.__M__ to translate the original path to its hashed sibling.
async function hashAndCollect(dir, urlPrefix, manifest) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const srcPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      await hashAndCollect(srcPath, `${urlPrefix}/${entry.name}`, manifest);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      const content = await readFile(srcPath, 'utf-8');
      const hash = contentHash(content);
      // Insert hash before final .js: foo.script.js → foo.script.<hash>.js
      const newName = entry.name.replace(/\.js$/, `.${hash}.js`);
      const newPath = join(dir, newName);
      await writeFile(newPath, content);
      await rm(srcPath);
      manifest[`${urlPrefix}/${entry.name}`] = `${urlPrefix}/${newName}`;
    }
  }
}

// ─── routes.json generation ──────────────────────────────────────────────────
async function generateRoutesJson(appPath, manifest = {}) {
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

        const originalModule = `/app/${relative$1.replace('.html', hasEmbedded ? '.script.js' : '.js')}`;
        routes.push({
          path: routePath,
          component: relative$1.split('/').pop().replace('.html', '').toLowerCase() + '-page',
          module: manifest[originalModule] || originalModule,
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

  // The bundle is inlined directly into the HTML template below — no separate
  // network request, no chain depth=2 critical-path warning. We still emit the
  // hashed file so it remains available for tooling/debugging.
  const bundleFile = `core.${bundleHash}.js`;
  await writeFile(join(assetsDir, bundleFile), bundleCode);
  console.log(`[build] Core bundle (inlined into HTML) ${(bundleCode.length/1024).toFixed(1)}kb`);

  // 2. Copy + minify individual component/app/lib/core files (for dynamic imports)
  // app/ and components/ are dynamically imported by loader.js/Router after the core
  // bundle has run. Rewriting their static imports to globalThis.__r avoids re-fetching
  // /core/component.js, /lib/store.js, etc. when each lazy component module is loaded.
  // core/ and lib/ stay untouched: they're either already inlined in the bundle or
  // need to remain plain ESM for the dev server.
  const serverTransform = (content, path, ext) => ext === '.js' ? transformJS(content, path) : content;
  const clientLazyTransform = (content, path, ext) => ext === '.js' ? transformJS(content, path, { rewriteToRegistry: true }) : content;
  await Promise.all([
    copyDir(join(root, 'app'), join(clientDist, 'app'), { transformContent: clientLazyTransform, doMinify: true }),
    copyDir(join(root, 'components'), join(clientDist, 'components'), { transformContent: clientLazyTransform, doMinify: true }),
    copyDir(join(root, 'core'), join(clientDist, 'core'), { transformContent: serverTransform, doMinify: true }),
    copyDir(join(root, 'lib'), join(clientDist, 'lib'), { transformContent: serverTransform, doMinify: true }),
  ]);

  // 3. Extract + minify embedded scripts from .html files
  // Pages (app/) → .script.js; components/ → .js when no explicit .js source exists
  await extractScripts(join(root, 'app'), join(clientDist, 'app'), true);
  await extractScripts(join(root, 'components'), join(clientDist, 'components'), true, true);

  // 3b. Content-hash lazy-loaded modules. Original-URL → hashed-URL map is
  // inlined into HTML as window.__M__ so loader.js / Router.js can translate
  // at import time. Enables `max-age=31536000, immutable` for these paths.
  const assetManifest = {};
  await hashAndCollect(join(clientDist, 'app'), '/app', assetManifest);
  await hashAndCollect(join(clientDist, 'components'), '/components', assetManifest);
  await writeFile(join(clientDist, '_assets-manifest.json'), JSON.stringify(assetManifest, null, 2));

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
  const routes = await generateRoutesJson(join(root, 'app'), assetManifest);
  await writeFile(join(clientDist, 'routes.json'), JSON.stringify(routes, null, 2));

  // Inline routes + asset manifest into HTML so the Router doesn't need a
  // separate fetch and the loader can resolve hashed component URLs.
  // The dependency-chain gate point — saves a full round-trip on first paint.
  const routesScript = `<script>window.__ROUTES__=${JSON.stringify(routes)}</script>`;
  const manifestScript = `<script>window.__M__=${JSON.stringify(assetManifest)}</script>`;

  let template = await readFile(join(root, 'index.html'), 'utf-8');
  // Inline the bundle into a <script type="module">. Eliminates the separate JS
  // request entirely, dropping critical chain depth from 2 → 1. HTML is dynamic
  // (SSR per-locale) so we lose nothing on caching.
  // String.replace interprets $-patterns in the replacement string ($&, $`, $', $1)
  // and would corrupt any bundle containing those sequences (e.g. routes.js uses '$').
  // Use a function replacement to avoid that.
  template = template
    .replace('<!--inline-css-->', () => `<style>${minCss}</style>`)
    .replace('<!--preload-links-->', () => preloadLinks + manifestScript + routesScript)
    .replace(/<script type="module" src="\/core\/server\/entry-client\.js"><\/script>/,
      () => `<script type="module">${bundleCode}</script>`);

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
    copyDir(join(root, 'core'), join(serverDist, 'core'), { transformContent: serverTransform, renameJsToMjs: true }),
    copyDir(join(root, 'lib'), join(serverDist, 'lib'), { transformContent: serverTransform, renameJsToMjs: true }),
    copyDir(join(root, 'app'), join(serverDist, 'app'), { transformContent: serverTransform, renameJsToMjs: true }),
    copyDir(join(root, 'components'), join(serverDist, 'components'), { transformContent: serverTransform, renameJsToMjs: true }),
  ]);
  // Manifest reused by entry-server.mjs to emit hashed modulepreload URLs.
  await writeFile(join(serverDist, '_assets-manifest.json'), JSON.stringify(assetManifest, null, 2));

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
