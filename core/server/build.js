import { readFile, writeFile, readdir, mkdir, rm, copyFile, stat } from 'node:fs/promises';
import { join, dirname, extname, relative, resolve as pathResolve } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { scanComponents, scanPages, clientRoute } from '../scan.js';
import { escapeHtml, jsonForScript } from '../template.js';
import { bundle } from './bundle.js';
import { minifyJS, minifyCSS, minifyTemplateCSS } from './minify.js';
import { loadConfig } from '../config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '../..');
const dist = join(root, 'dist');
const config = loadConfig(root);

const ensureDir = dir => mkdir(dir, { recursive: true }).catch(() => {});
const cleanDir = dir => rm(dir, { recursive: true, force: true }).catch(() => {});

const contentHash = s => createHash('sha256').update(s).digest('hex').slice(0, 8);

// ─── Raw-import inlining (dev-only transform preserved for compat) ────────────
async function transformJS(content, filePath, { bundled = null } = {}) {
  let result = content;
  for (const [full, varName, importPath] of content.matchAll(/import\s+(\w+)\s+from\s+['"](.+)\?raw['"]/g)) {
    try {
      const raw = await readFile(join(dirname(filePath), importPath), 'utf-8');
      result = result.replace(full, () => `const ${varName} = ${JSON.stringify(raw)}`);
    } catch {}
  }
  // Imports are rewritten *before* the template is inlined: the template becomes a
  // string in this file, and an `import … from` in a code sample must stay text.
  if (bundled) result = rewriteImports(result, filePath, bundled);
  return inlineTemplate(result);
}

// Resolve a static import specifier to its root-relative URL — the key the inlined
// core bundle registers each module under, e.g. '/core/component.js'.
// Handles both absolute (/x.js) and relative (../x.js) specifiers.
function resolveToRegistryKey(spec, filePath) {
  if (!spec || spec.startsWith('node:') || (!spec.startsWith('.') && !spec.startsWith('/'))) return null;
  const abs = spec.startsWith('/') ? join(root, spec) : pathResolve(dirname(filePath), spec);
  return '/' + relative(root, abs).replace(/\\/g, '/');
}

const IMPORT_SIDE_RE = /^[ \t]*import\s*['"]([^'"]+)['"]\s*;?/gm;
const IMPORT_FROM_RE = /^[ \t]*import\s+([\w$\s{},*]+?)\s*from\s*['"]([^'"]+)['"]\s*;?/gm;

// `{ A, B as C }` → `{A,B:C}`
const destructure = names => names.split(',').map(p => {
  const [orig, alias] = p.trim().split(/\s+as\s+/);
  return alias ? `${orig.trim()}:${alias.trim()}` : orig.trim();
}).filter(Boolean).join(',');

// Rewrite the static imports of a lazily loaded module (components/*, app/*, and
// the inline <script> of a page) so it reuses what is already on the page:
//
//   • a module inside the core bundle → read from the bundle's registry
//     (globalThis.__r) — no second fetch of /core/component.js and friends;
//   • any other local module → a top-level `await import()` routed through the
//     asset manifest (window.__M__), because its file name is content-hashed at
//     build time and the registry has never heard of it.
//
// Bare and node: specifiers are left alone. Relative specifiers are resolved
// against `filePath`, so `../../core/component.js` works in page scripts too.
function rewriteImports(src, filePath, bundled) {
  let n = 0;
  const load = key => {
    const k = JSON.stringify(key);
    return bundled.has(key) ? `globalThis.__r(${k})` : `await import((globalThis.__M__||{})[${k}]||${k})`;
  };

  src = src.replace(IMPORT_SIDE_RE, (full, spec) => {
    const key = resolveToRegistryKey(spec, filePath);
    return key ? `${load(key)};` : full;
  });

  return src.replace(IMPORT_FROM_RE, (full, clause, spec) => {
    const key = resolveToRegistryKey(spec, filePath);
    if (!key) return full;
    const c = clause.trim();

    const ns = c.match(/^\*\s+as\s+([\w$]+)$/);
    if (ns) return `const ${ns[1]}=${load(key)};`;

    const named = c.match(/^\{([^}]*)\}$/);
    if (named) return `const{${destructure(named[1])}}=${load(key)};`;

    // import Default from '…'   |   import Default, { A, B as C } from '…'
    const def = c.match(/^([\w$]+)(?:\s*,\s*\{([^}]*)\})?$/);
    if (!def) return full;
    const tmp = `__i${n++}`;
    return `const ${tmp}=${load(key)},${def[1]}=${tmp}.default??${tmp}` +
      (def[2] ? `,{${destructure(def[2])}}=${tmp}` : '') + ';';
  });
}

// Replace `static templateUrl = '/path.html'` with `static template = "<inlined>"`,
// and fold any CSS Module / plain stylesheet into the class as source text.
//
// Stylesheets are inlined rather than referenced by URL for two reasons: a
// referenced sheet costs a network request per component at upgrade time, and —
// unlike the JS, which hashAndCollect content-addresses — it would be an unhashed
// asset sitting under the `immutable` cache rules for /app/* and /components/*.
// Inlining sidesteps both. An explicitly declared static cssModule/css URL is
// resolved the same way; otherwise the sibling <Name>.module.css / <Name>.css is
// auto-discovered, matching the runtime convention in core/component.js.
async function inlineTemplate(jsCode) {
  const match = jsCode.match(/static\s+templateUrl\s*=\s*['"]([^'"]+)['"]\s*;?/);
  if (!match) return jsCode;
  const tplUrl = match[1];
  const tplPath = join(root, tplUrl);
  try {
    // <style> blocks are a third of the template bytes; minify them here, since
    // the string ends up in the JS the browser downloads.
    const html = minifyTemplateCSS((await readFile(tplPath, 'utf-8'))
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
      .trim());
    const templateDecl = `static template = ${JSON.stringify(html)};`;
    let result = jsCode.replace(match[0], () => templateDecl);

    // [static field, declaration regex, sibling suffix] for the scoped and plain sheets
    const sheets = [
      ['cssModuleText', /static\s+cssModule\s*=\s*['"]([^'"]+)['"]\s*;?/, '.module.css'],
      ['cssText', /static\s+css\s*=\s*['"]([^'"]+)['"]\s*;?/, '.css'],
    ];

    for (const [field, declRe, suffix] of sheets) {
      const declared = jsCode.match(declRe);
      const url = declared ? declared[1] : tplUrl.replace(/\.html$/, suffix);
      const path = join(root, url);
      if (!declared && !await stat(path).then(() => true).catch(() => false)) continue;
      const css = await readFile(path, 'utf-8').catch(() => null);
      if (css == null) continue;
      const decl = `static ${field} = ${JSON.stringify(minifyCSS(css))};`;
      // Replace the author's URL declaration, or append after the template.
      result = declared
        ? result.replace(declared[0], () => decl)
        : result.replace(templateDecl, () => `${templateDecl}\n  ${decl}`);
    }
    return result;
  } catch {
    return jsCode;
  }
}

// ─── Copy + minify individual files ─────────────────────────────────────────
async function copyDir(src, dest, opts = {}, rel = '') {
  // minifyCss defaults to doMinify, but the server copy sets it independently:
  // SSR reads templates and .module.css off disk and embeds their CSS in the shadow
  // root of every response, so it must be minified even though server JS is left
  // readable. `skip(relativePath)` leaves a file out of the copy.
  const { transformContent = null, renameJsToMjs = false, doMinify = false, minifyCss = doMinify, skip = null } = opts;
  await ensureDir(dest);
  for (const entry of await readdir(src, { withFileTypes: true })) {
    const srcPath = join(src, entry.name);
    let destPath = join(dest, entry.name);
    const relPath = rel ? `${rel}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      if (!entry.name.startsWith('.') && !['node_modules', 'dist'].includes(entry.name))
        await copyDir(srcPath, destPath, opts, relPath);
    } else if (entry.isFile()) {
      if (skip?.(relPath)) continue;
      const ext = extname(entry.name);
      // Only .js (transform/minify/rename) and minified .css / template <style> are
      // processed as text. Everything else — fonts, images, etc. — must be copied
      // byte-for-byte; reading binary as UTF-8 corrupts it (invalid bytes → U+FFFD).
      const needsText = ext === '.js' || ((ext === '.css' || ext === '.html') && minifyCss);

      if (!needsText) {
        await ensureDir(dirname(destPath));
        await copyFile(srcPath, destPath);
        continue;
      }

      let content = await readFile(srcPath, 'utf-8');

      if (ext === '.js') {
        if (transformContent) content = await transformContent(content, srcPath, ext);
        if (doMinify) content = minifyJS(content);
      }
      if (ext === '.css' && minifyCss) content = minifyCSS(content);
      if (ext === '.html' && minifyCss) content = minifyTemplateCSS(content);

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
// preferJs: emit .js (not .script.js) when no explicit .js source file exists.
// Used for components/ so loader.js can import them at their natural .js path.
// Pages (app/) always use .script.js to distinguish from route-registered .js files.
async function extractScripts(srcDir, destDir, bundled, doMinify = false, preferJs = false) {
  for (const entry of await readdir(srcDir, { withFileTypes: true })) {
    const srcPath = join(srcDir, entry.name), destPath = join(destDir, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith('.')) {
      await extractScripts(srcPath, destPath, bundled, doMinify, preferJs);
    } else if (entry.name.endsWith('.html')) {
      const match = (await readFile(srcPath, 'utf-8')).match(/<script\b[^>]*>([\s\S]*?)<\/script>/i);
      if (match) {
        const hasExplicitJs = preferJs && await stat(srcPath.replace('.html', '.js')).then(() => true).catch(() => false);
        const outPath = destPath.replace('.html', preferJs && !hasExplicitJs ? '.js' : '.script.js');
        let js = rewriteImports(match[1].trim(), srcPath, bundled);
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
// Page discovery is shared with the dev server and the SSR entry (core/scan.js
// scanPages); the build only swaps in the content-hashed module URL.
async function generateRoutesJson(appPath, manifest = {}) {
  return (await scanPages(appPath)).map(page => {
    const module = `/app/${page.relative.replace('.html', page.hasEmbeddedScript ? '.script.js' : '.js')}`;
    return clientRoute(page, manifest[module] || module);
  });
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
  const { code: bundleCode, hash: bundleHash, modules } = await bundle(entryAbs, root, {
    minify: true,
    transform: src => inlineTemplate(src),
  });
  const bundled = new Set(modules);

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
  // core/ and lib/ stay plain ESM: a lazy module may import one the bundle doesn't
  // contain (/lib/validate.js), and the Cloudflare worker imports the SSR renderer.
  const serverTransform = (content, path, ext) => ext === '.js' ? transformJS(content, path) : content;
  const clientLazyTransform = (content, path, ext) => ext === '.js' ? transformJS(content, path, { bundled }) : content;
  // dist/client is the public web root. Of core/, the browser and the worker only
  // ever load the runtime modules — the Node-only pieces (the build itself, the dev
  // server, the config/scan code that imports node:fs) have no business being served.
  const serverOnlyCore = rel => rel === 'config.js' || rel === 'scan.js' || (rel.startsWith('server/') && rel !== 'server/ssr.js');
  await Promise.all([
    copyDir(join(root, 'app'), join(clientDist, 'app'), { transformContent: clientLazyTransform, doMinify: true }),
    copyDir(join(root, 'components'), join(clientDist, 'components'), { transformContent: clientLazyTransform, doMinify: true }),
    copyDir(join(root, 'core'), join(clientDist, 'core'), { transformContent: serverTransform, doMinify: true, skip: serverOnlyCore }),
    copyDir(join(root, 'lib'), join(clientDist, 'lib'), { transformContent: serverTransform, doMinify: true }),
  ]);

  // 3. Extract + minify embedded scripts from .html files
  // Pages (app/) → .script.js; components/ → .js when no explicit .js source exists
  await extractScripts(join(root, 'app'), join(clientDist, 'app'), bundled, true);
  await extractScripts(join(root, 'components'), join(clientDist, 'components'), bundled, true, true);

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

  // Critical-path font preloads from app.config.yml (declared @font-face in the
  // inlined globals.css). Preloading them same-origin lets the browser fetch the
  // fonts in parallel with HTML parse instead of waiting for the CSS to apply,
  // shaving the font swap off LCP.
  // No modulepreloads here — the core bundle already inlines every static import.
  // No routes.json preload — routes are inlined into the HTML below.
  const fontPreloads = config.preload.fonts
    .map(p => `<link rel="preload" href="${p}" as="font" type="font/woff2" crossorigin>`).join('');

  const preloadLinks = fontPreloads;

  // 9. routes.json — generated first so we can inline it into the HTML template
  const routes = await generateRoutesJson(join(root, 'app'), assetManifest);
  await writeFile(join(clientDist, 'routes.json'), JSON.stringify(routes, null, 2));

  // Inline routes + asset manifest into HTML so the Router doesn't need a
  // separate fetch and the loader can resolve hashed component URLs.
  // The dependency-chain gate point — saves a full round-trip on first paint.
  const routesScript = `<script>window.__ROUTES__=${jsonForScript(routes)}</script>`;
  const manifestScript = `<script>window.__M__=${jsonForScript(assetManifest)}</script>`;
  // Discovered tag → source-file registry (core/scan.js scanComponents), so
  // core/loader.js resolves files the kebab→PascalCase convention can't reproduce.
  const { tags, locals } = await scanComponents(root);
  const tagsScript = `<script>window.__TAGS__=${jsonForScript(tags)}</script>`;

  let template = await readFile(join(root, 'index.html'), 'utf-8');
  // Inline the bundle into a <script type="module">. Eliminates the separate JS
  // request entirely, dropping critical chain depth from 2 → 1. HTML is dynamic
  // (SSR per-locale) so we lose nothing on caching.
  // String.replace interprets $-patterns in the replacement string ($&, $`, $', $1)
  // and would corrupt any bundle containing those sequences (e.g. routes.js uses '$').
  // Use a function replacement to avoid that.
  template = template
    .replace('<!--inline-css-->', () => `<style>${minCss}</style>`)
    .replace('<!--preload-links-->', () => preloadLinks + manifestScript + tagsScript + routesScript)
    .replace(/<script type="module" src="\/core\/server\/entry-client\.js"><\/script>/,
      () => `<script type="module">${bundleCode}</script>`);

  await writeFile(join(clientDist, '_template.html'), template);

  // 4b. CSR fallback shell — index.html. Same inlined bundle/routes/manifest as
  // _template.html, but the three SSR placeholders are pre-filled at build time so
  // any plain static host (no SSR runtime) serves a client-rendered app: the Router
  // finds an empty outlet and renders the route in the browser. SSR is unaffected —
  // adapters keep filling _template.html per request.
  //
  // Locale state mirrors exactly what entry-server.js injects for SSR:
  //   __INITIAL_STATE__  default locale + its messages — so the *first* client
  //                      render already has the catalogue (no raw-{{t.*}} FOUC).
  //   __LOCALES__        the other supported locales — so a language switch (or a
  //                      non-default-locale visitor) resolves synchronously instead
  //                      of fetching /locales/<l>.json (no flash).
  //   __LOCALE_CONFIG__  supported/default list, so client negotiation matches.
  // Without this the store seeds messages:{} and every {{t.*}} paints raw until the
  // first fetch resolves — the CSR locale flash.
  const localeMessages = {};
  await Promise.all(config.locales.supported.map(async l => {
    try { localeMessages[l] = JSON.parse(await readFile(join(root, 'locales', `${l}.json`), 'utf-8')); }
    catch { localeMessages[l] = {}; }
  }));
  const defaultLocale = config.locales.default;
  const otherLocales = Object.fromEntries(
    config.locales.supported.filter(l => l !== defaultLocale).map(l => [l, localeMessages[l]])
  );
  // Static <head> meta for the shell. CSR can't negotiate per-route on the server,
  // so we bake in the home route's metadata over the site defaults: crawlers (and
  // the first paint, before the bundle runs) get a real title + description. The
  // client meta sync in entry-client.js then keeps these current as the Router navigates.
  const siteMeta = {
    ...(config.site.title && { title: config.site.title }),
    ...(config.site.description && { description: config.site.description }),
  };
  const homeMeta = { ...siteMeta, ...routes.find(r => r.path === '/')?.metadata };
  const csrState =
    `<script>window.__INITIAL_STATE__=${jsonForScript({ site: siteMeta, meta: homeMeta, locale: defaultLocale, messages: localeMessages[defaultLocale] || {} })}</script>` +
    (Object.keys(otherLocales).length ? `<script>window.__LOCALES__=${jsonForScript(otherLocales)}</script>` : '') +
    `<script>window.__LOCALE_CONFIG__=${jsonForScript(config.locales)}</script>`;
  const csrHeadMeta = [
    homeMeta.title && `<title>${escapeHtml(homeMeta.title)}</title>`,
    homeMeta.description && `<meta name="description" content="${escapeHtml(homeMeta.description)}">`,
  ].filter(Boolean).join('');
  const csrHtml = template
    .replace(/<html\s+lang="[^"]*"/, () => `<html lang="${defaultLocale}"`)
    .replace('<!--head-meta-->', () => csrHeadMeta)
    .replace('<!--app-html-->', () => '')
    .replace('<!--initial-state-->', () => csrState);
  await writeFile(join(clientDist, 'index.html'), csrHtml);

  // 5. Locale JSON files (client for fetch, server for SSR)
  await Promise.all([
    copyDir(join(root, 'locales'), join(clientDist, 'locales')),
    copyDir(join(root, 'locales'), join(serverDist, 'locales')),
  ]);

  // 7. Public assets (copied flat to client root so /fonts/... works)
  await copyDir(join(root, 'public'), clientDist).catch(() => {});

  // 7b. sitemap.xml, generated from the route table so it can't drift from the
  // pages that exist. Needs the public origin (site.url in app.config.yml);
  // without one nothing is emitted. Left out: dynamic routes (their URLs depend on
  // data the build doesn't have) and requiresAuth pages (a crawler only gets a redirect).
  if (config.site.url) {
    const urls = routes.filter(r => !r.dynamic && !r.requiresAuth && r.component !== 'notfound-page')
      .map(r => `  <url><loc>${escapeHtml(config.site.url + r.path)}</loc></url>`);
    await writeFile(join(clientDist, 'sitemap.xml'),
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`);
    const robotsPath = join(clientDist, 'robots.txt');
    const robots = existsSync(robotsPath) ? await readFile(robotsPath, 'utf-8') : 'User-agent: *\nAllow: /\n';
    if (!/^sitemap:/im.test(robots))
      await writeFile(robotsPath, `${robots.trimEnd()}\n\nSitemap: ${config.site.url}/sitemap.xml\n`);
  }

  // 8. Server-side copy (for SSR) — .mjs renamed for CF workers
  const serverOpts = { transformContent: serverTransform, renameJsToMjs: true, minifyCss: true };
  await Promise.all([
    copyDir(join(root, 'core'), join(serverDist, 'core'), serverOpts),
    copyDir(join(root, 'lib'), join(serverDist, 'lib'), serverOpts),
    copyDir(join(root, 'app'), join(serverDist, 'app'), serverOpts),
    copyDir(join(root, 'components'), join(serverDist, 'components'), serverOpts),
  ]);
  // Manifest reused by entry-server.mjs to emit hashed modulepreload URLs.
  await writeFile(join(serverDist, '_assets-manifest.json'), JSON.stringify(assetManifest, null, 2));

  // 10. Cloudflare worker
  await copyFile(join(root, 'deploy/cloudflare/_worker.js'), join(clientDist, '_worker.js')).catch(() => {});

  // 10b. Project config — entry-server reads it at runtime (SSR_ROOT=dist/server)
  // to negotiate locales. Server root only: dist/client is public, and the edge
  // adapter gets what it needs from _ssr-config.json below.
  for (const name of ['app.config.yml', 'app.config.yaml']) {
    await copyFile(join(root, name), join(serverDist, name)).catch(() => {});
  }

  // 10c. Runtime config for edge adapters that can't read app.config.yml or walk
  // the source tree (the Cloudflare worker has no node:fs). Everything an SSR
  // runtime needs that isn't per-request: the locale list, the site defaults, the
  // session-cookie name, the discovered tag registry and each component's
  // `static local`. The Node/Netlify path derives all of it directly instead.
  await writeFile(join(clientDist, '_ssr-config.json'), JSON.stringify({
    locales: config.locales,
    site: { title: config.site.title, description: config.site.description },
    auth: config.auth,
    tags,
    locals,
  }, null, 2));

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
