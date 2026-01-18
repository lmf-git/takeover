import { readFile } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderWithExpressions, matchRoute, createMatcher, pathFromFile } from '../index.js';
import { scanDir } from '../scan.js';
import store from '../../lib/store.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '../..');
const appDir = resolve(root, 'app');
const componentsDir = resolve(root, 'components');

// Template cache for SSR
const templateCache = new Map();
const cssModuleCache = new Map();

async function loadTemplate(tag) {
  if (templateCache.has(tag)) return templateCache.get(tag);

  // Map tag to file path
  let filePath;
  if (tag === 'app-layout') {
    filePath = join(appDir, '_Layout/_Layout.html');
  } else if (tag === 'app-router') {
    return null; // Router is structural, not content
  } else if (tag.endsWith('-page')) {
    const name = tag.replace('-page', '');
    const pascal = name.charAt(0).toUpperCase() + name.slice(1);
    filePath = join(appDir, `${pascal}/${pascal}.html`);
  } else {
    // Shared component: app-counter -> Counter, theme-toggle -> ThemeToggle
    const name = tag.startsWith('app-') ? tag.slice(4) : tag;
    const pascal = name.split('-').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('');
    filePath = join(componentsDir, `${pascal}/${pascal}.html`);
  }

  try {
    const html = await readFile(filePath, 'utf-8');
    templateCache.set(tag, html);
    return html;
  } catch {
    templateCache.set(tag, null);
    return null;
  }
}

// Get CSS module path for a tag
function getCSSModulePath(tag) {
  if (tag === 'app-layout') {
    return join(appDir, '_Layout/_Layout.module.css');
  } else if (tag === 'app-router') {
    return null;
  } else if (tag.endsWith('-page')) {
    const name = tag.replace('-page', '');
    const pascal = name.charAt(0).toUpperCase() + name.slice(1);
    return join(appDir, `${pascal}/${pascal}.module.css`);
  } else {
    const name = tag.startsWith('app-') ? tag.slice(4) : tag;
    const pascal = name.split('-').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('');
    return join(componentsDir, `${pascal}/${pascal}.module.css`);
  }
}

// Load and process CSS module - returns { css, classes }
async function loadCSSModule(tag) {
  if (cssModuleCache.has(tag)) return cssModuleCache.get(tag);

  const filePath = getCSSModulePath(tag);
  if (!filePath) {
    cssModuleCache.set(tag, { css: '', classes: {} });
    return { css: '', classes: {} };
  }

  try {
    const rawCss = await readFile(filePath, 'utf-8');
    const { css, classes } = processCSSModule(rawCss, tag);
    const result = { css, classes };
    cssModuleCache.set(tag, result);
    return result;
  } catch {
    cssModuleCache.set(tag, { css: '', classes: {} });
    return { css: '', classes: {} };
  }
}

// Process CSS module: extract class names and scope them
function processCSSModule(css, scope) {
  const classes = {};
  const scopeAttr = `[data-v-${scope}]`;

  // Find all class selectors and create mappings
  const processed = css.replace(/\.([a-zA-Z_][\w-]*)/g, (match, className) => {
    const scopedName = `${className}_${scope}`;
    classes[className] = scopedName;
    return `.${scopedName}`;
  });

  // Add scope attribute to all selectors
  const scoped = processed.replace(/([^{}]+)(\{[^}]*\})/g, (_, selectors, rules) => {
    const scopedSels = selectors.split(',').map(sel => {
      sel = sel.trim();
      if (!sel || sel.startsWith('@') || sel.startsWith('from') || sel.startsWith('to') || /^\d/.test(sel)) return sel;
      return sel + scopeAttr;
    }).join(', ');
    return scopedSels + rules;
  });

  return { css: scoped, classes };
}

// Recursively render custom elements in HTML
async function renderComponents(html, props, collectedStyles = {}, collectedModules = {}, depth = 0) {
  if (depth > 10) return html; // Prevent infinite recursion

  // Find all custom element tags (contains hyphen)
  const tagRegex = /<([a-z]+-[a-z-]+)([^>]*)><\/\1>/g;
  let result = html;
  let match;
  const replacements = [];

  while ((match = tagRegex.exec(html)) !== null) {
    const [fullMatch, tag, attrs] = match;
    const template = await loadTemplate(tag);

    if (template) {
      // Load CSS module for this component
      const { css: moduleCss, classes } = await loadCSSModule(tag);
      if (moduleCss) {
        collectedModules[`${tag}-module`] = moduleCss;
      }

      // Render the component template with $css classes available
      const componentProps = { ...props, $css: classes };
      const rendered = renderWithExpressions(template, componentProps);
      const parsed = extractAndScopeStyles(rendered, tag);
      const scoped = addScopeToHtml(parsed.content, tag);

      // Collect scoped styles (these override module styles)
      if (parsed.styles) {
        collectedStyles[tag] = parsed.styles;
      }

      // Recursively render nested components
      const nested = await renderComponents(scoped, props, collectedStyles, collectedModules, depth + 1);

      replacements.push({
        original: fullMatch,
        replacement: `<${tag} data-ssr data-v-${tag}${attrs}>${nested}</${tag}>`
      });
    }
  }

  // Apply replacements
  for (const { original, replacement } of replacements) {
    result = result.replace(original, replacement);
  }

  return result;
}

function extractAndScopeStyles(html, scope) {
  const styleRegex = /<style>([\s\S]*?)<\/style>/gi;
  let styles = '';
  const content = html.replace(styleRegex, (_, css) => {
    styles += scopeCSS(css, scope);
    return '';
  });
  return { content, styles };
}

function scopeCSS(css, scope) {
  const attr = `[data-v-${scope}]`;
  return css.replace(/([^{}]+)(\{[^}]*\})/g, (_, selectors, rules) => {
    const scoped = selectors.split(',').map(sel => {
      sel = sel.trim();
      if (!sel || sel.startsWith('@') || sel.startsWith('from') || sel.startsWith('to') || /^\d/.test(sel)) return sel;
      if (sel.includes(':host')) return sel.replace(/:host/g, attr);
      return sel + attr;
    }).join(', ');
    return scoped + rules;
  });
}

function addScopeToHtml(html, scope) {
  return html.replace(/<(\w+)([^>]*?)>/g, (match, tag, attrs) => {
    if (tag.toLowerCase() === '!doctype') return match;
    return `<${tag}${attrs} data-v-${scope}>`;
  });
}

// Build routes from HTML templates and load component modules for SSR props
async function buildRoutes() {
  const files = await scanDir(appDir, '.html');
  const routes = [];

  for (const { path: filePath, relative } of files) {
    if (relative.startsWith('_')) continue;

    const routePath = pathFromFile(relative.replace('.html', '.js'), '');
    if (!routePath) continue;

    const html = await readFile(filePath, 'utf-8');
    const dynamic = routePath.includes(':');
    const jsPath = filePath.replace('.html', '.js');

    // Try to load component module to get SSR props
    let ssrProps = {};
    let metadata = null;
    console.log(`[SSR] Trying to import: ${jsPath}`);
    try {
      const mod = await import(jsPath);
      console.log(`[SSR] Module loaded, exports:`, Object.keys(mod));
      const ComponentClass = mod.default || Object.values(mod).find(v => typeof v === 'function');
      console.log(`[SSR] ComponentClass:`, ComponentClass?.name, 'ssrProps:', ComponentClass?.ssrProps);
      if (ComponentClass) {
        ssrProps = ComponentClass.ssrProps || {};
        metadata = ComponentClass.metadata;
      }
    } catch (e) {
      console.log(`[SSR] Failed to load ${jsPath}:`, e.message);
    }

    routes.push({
      path: routePath,
      component: relative.split('/').pop().replace('.html', '').toLowerCase() + '-page',
      html,
      dynamic,
      matcher: dynamic ? createMatcher(routePath) : null,
      ssrProps,
      metadata
    });
  }

  // Add 404 wildcard
  const notFound = routes.find(r => r.component === 'notfound-page');
  if (notFound) routes.push({ ...notFound, path: '*', dynamic: false, matcher: null });

  return routes;
}

const routesPromise = buildRoutes().then(routes => {
  console.log('[SSR] Routes built:', routes.map(r => r.path));
  return routes;
});

const esc = s => String(s).replace(/[&"'<>]/g, c => ({ '&': '&amp;', '"': '&quot;', "'": '&#39;', '<': '&lt;', '>': '&gt;' })[c]);

export async function render(url) {
  const routes = await routesPromise;
  const [pathname, search] = url.split('?');
  const path = pathname === '/' ? '/' : pathname.replace(/\/$/, '');

  const result = matchRoute(routes, path);
  if (!result) return { appHtml: '<h1>404</h1>', initialStateScript: '', headMeta: '', scopedStyles: '' };

  const { route, params } = result;
  const state = store.get();

  // Merge store state with route's SSR props
  const ssrProps = typeof route.ssrProps === 'function'
    ? route.ssrProps({ path: url, params })
    : route.ssrProps || {};

  const props = {
    ...state,
    ...ssrProps,
    path: url,
    params,
    query: Object.fromEntries(new URLSearchParams(search || '')),
    timestamp: new Date().toLocaleString(),
    year: new Date().getFullYear()
  };

  // Load and render layout template
  const layoutTemplate = await loadTemplate('app-layout');
  const collectedStyles = {};
  const collectedModules = {};

  // Load CSS module for layout
  const { css: layoutModuleCss, classes: layoutClasses } = await loadCSSModule('app-layout');
  if (layoutModuleCss) collectedModules['app-layout-module'] = layoutModuleCss;

  // Render layout with expressions (including $css)
  const layoutProps = { ...props, $css: layoutClasses };
  let layoutRendered = renderWithExpressions(layoutTemplate, layoutProps);
  const layoutParsed = extractAndScopeStyles(layoutRendered, 'app-layout');
  collectedStyles['app-layout'] = layoutParsed.styles;

  // Load CSS module for page
  const { css: pageModuleCss, classes: pageClasses } = await loadCSSModule(route.component);
  if (pageModuleCss) collectedModules[`${route.component}-module`] = pageModuleCss;

  // Render the page content (including $css)
  const pageProps = { ...props, $css: pageClasses };
  const pageRendered = renderWithExpressions(route.html, pageProps);
  const pageParsed = extractAndScopeStyles(pageRendered, route.component);
  collectedStyles[route.component] = pageParsed.styles;

  // Recursively render components in page
  const pageWithComponents = await renderComponents(pageParsed.content, props, collectedStyles, collectedModules);
  const scopedPage = addScopeToHtml(pageWithComponents, route.component);

  // Inject page into layout (replace app-router with rendered page)
  let layoutContent = layoutParsed.content
    .replace(/<app-router[^>]*><\/app-router>/g,
      `<app-router><div id="outlet"><${route.component} data-ssr data-v-${route.component}>${scopedPage}</${route.component}></div></app-router>`);

  // Recursively render remaining components in layout (navigation, etc.)
  layoutContent = await renderComponents(layoutContent, props, collectedStyles, collectedModules);
  layoutContent = addScopeToHtml(layoutContent, 'app-layout');

  // Build style tags - modules first, then scoped styles (so scoped can override)
  const moduleStyles = Object.entries(collectedModules)
    .filter(([, css]) => css)
    .map(([tag, css]) => `<style data-v-style="${tag}">${css}</style>`)
    .join('\n');

  const scopedStyles = Object.entries(collectedStyles)
    .filter(([, css]) => css)
    .map(([tag, css]) => `<style data-v-style="${tag}">${css}</style>`)
    .join('\n');

  const allStyles = moduleStyles + (moduleStyles && scopedStyles ? '\n' : '') + scopedStyles;

  // Use route metadata for head tags
  const meta = route.metadata || state.meta || {};
  const headMeta = [
    meta.title && `<title>${esc(meta.title)}</title>`,
    meta.description && `<meta name="description" content="${esc(meta.description)}">`
  ].filter(Boolean).join('');

  return {
    appHtml: layoutContent,
    initialStateScript: `<script>window.__INITIAL_STATE__=${JSON.stringify(state)}</script>`,
    headMeta,
    scopedStyles: allStyles
  };
}
