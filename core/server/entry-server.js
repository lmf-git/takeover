import { readFile } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { renderWithExpressions, matchRoute, createMatcher, pathFromFile } from '../index.js';
import { scanDir, scanRoutes } from '../scan.js';
import store from '../../lib/store.js';

// Use SSR_ROOT env var (set by Netlify function) or fall back to import.meta.url
const __dirname = dirname(fileURLToPath(import.meta.url));
const root = process.env.SSR_ROOT || resolve(__dirname, '../..');
const appDir = resolve(root, 'app');
const componentsDir = resolve(root, 'components');

// Caches
const templateCache = new Map();
const cssModuleCache = new Map();

async function loadTemplate(tag) {
  if (templateCache.has(tag)) return templateCache.get(tag);

  let filePath;
  if (tag === 'app-layout') {
    filePath = join(appDir, '_Layout/_Layout.html');
  } else if (tag === 'app-router') {
    return null;
  } else if (tag.endsWith('-page')) {
    const name = tag.replace('-page', '');
    const pascal = name.charAt(0).toUpperCase() + name.slice(1);
    filePath = join(appDir, `${pascal}/${pascal}.html`);
  } else {
    const name = tag.startsWith('app-') ? tag.slice(4) : tag;
    const pascal = name.split('-').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('');
    filePath = join(componentsDir, `${pascal}/${pascal}.html`);
  }

  try {
    const html = await readFile(filePath, 'utf-8');
    // Strip <script> tags - template only needs HTML/CSS
    const template = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').trim();
    templateCache.set(tag, template);
    return template;
  } catch {
    templateCache.set(tag, null);
    return null;
  }
}

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

function processCSSModule(css, scope) {
  const classes = {};
  const processed = css.replace(/\.([a-zA-Z_][\w-]*)/g, (match, className) => {
    const scopedName = `${className}_${scope}`;
    classes[className] = scopedName;
    return `.${scopedName}`;
  });
  return { css: processed, classes };
}

// Extract <style> from template (no scoping needed for shadow DOM)
function extractStyles(html) {
  const styleRegex = /<style>([\s\S]*?)<\/style>/gi;
  let styles = '';
  const content = html.replace(styleRegex, (_, css) => {
    styles += css;
    return '';
  });
  return { content, styles };
}

// Render component with Declarative Shadow DOM
async function renderComponent(tag, props) {
  const template = await loadTemplate(tag);
  if (!template) return null;

  // Load CSS module
  const { css: moduleCss, classes } = await loadCSSModule(tag);

  // Render template with $css classes available
  const componentProps = { ...props, $css: classes };
  const rendered = renderWithExpressions(template, componentProps);
  const { content, styles } = extractStyles(rendered);

  // Combine CSS module + inline styles
  const allStyles = (moduleCss || '') + (styles || '');

  // Wrap in Declarative Shadow DOM
  const shadowContent = (allStyles ? `<style>${allStyles}</style>` : '') + content;

  return {
    html: `<${tag}><template shadowrootmode="open">${shadowContent}</template></${tag}>`,
    classes
  };
}

// Render custom elements in HTML (non-recursive to avoid loops)
async function renderComponents(html, props) {
  let result = html;
  let iterations = 0;
  const maxIterations = 50;

  // Keep processing until no more empty custom elements found
  while (iterations < maxIterations) {
    iterations++;

    // Find empty custom element tags (contains hyphen, no content)
    const tagRegex = /<([a-z]+-[a-z-]+)([^>]*)><\/\1>/g;
    const matches = [...result.matchAll(tagRegex)];

    if (matches.length === 0) break;

    for (const match of matches) {
      const [fullMatch, tag] = match;

      if (tag === 'app-router') continue;

      const component = await renderComponent(tag, props);
      if (component) {
        result = result.replace(fullMatch, component.html);
      }
    }
  }

  if (iterations >= maxIterations) {
    console.warn('[SSR] Max iterations reached in renderComponents');
  }

  return result;
}

// Extract template from HTML (everything except <script> and keep <style>)
function extractTemplate(html) {
  return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').trim();
}

// Extract script content from HTML
function extractScript(html) {
  const match = html.match(/<script\b[^>]*>([\s\S]*?)<\/script>/i);
  return match ? match[1] : null;
}

// Build routes
async function buildRoutes() {
  const files = await scanDir(appDir, '.html');
  const routes = [];

  for (const { path: filePath, relative } of files) {
    if (relative.startsWith('_')) continue;

    const routePath = pathFromFile(relative.replace('.html', '.js'), '');
    if (!routePath) continue;

    const html = await readFile(filePath, 'utf-8');
    const template = extractTemplate(html);
    const dynamic = routePath.includes(':');

    let ssrProps = {};
    let metadata = null;

    // Try to extract ssrProps, metadata, and requiresAuth from script
    let script = extractScript(html);
    let requiresAuth = false;

    // If no embedded script, try loading separate .js file
    if (!script) {
      const jsPath = filePath.replace('.html', '.js');
      try {
        script = await readFile(jsPath, 'utf-8');
      } catch {
        // No .js file either
      }
    }

    if (script) {
      // Parse static properties from script content
      const ssrPropsMatch = script.match(/static\s+ssrProps\s*=\s*(\{[^}]+\})/);
      const metadataMatch = script.match(/static\s+metadata\s*=\s*(\{[^}]+\})/);
      const requiresAuthMatch = script.match(/static\s+requiresAuth\s*=\s*(true|false)/);

      try {
        if (ssrPropsMatch) ssrProps = eval(`(${ssrPropsMatch[1]})`);
        if (metadataMatch) metadata = eval(`(${metadataMatch[1]})`);
        if (requiresAuthMatch) requiresAuth = requiresAuthMatch[1] === 'true';
      } catch (e) {
        console.log(`[SSR] Failed to parse static props from ${relative}:`, e.message);
      }
    }

    routes.push({
      path: routePath,
      component: relative.split('/').pop().replace('.html', '').toLowerCase() + '-page',
      html: template,
      dynamic,
      matcher: dynamic ? createMatcher(routePath) : null,
      ssrProps,
      metadata,
      requiresAuth
    });
  }

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

  // Check auth - redirect if route requires auth and user isn't authenticated
  if (route.requiresAuth && !state.isAuthenticated) {
    return { redirect: `/login?from=${encodeURIComponent(path)}` };
  }

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

  // Load layout template
  const layoutTemplate = await loadTemplate('app-layout');
  const { css: layoutModuleCss, classes: layoutClasses } = await loadCSSModule('app-layout');

  // Render layout
  const layoutProps = { ...props, $css: layoutClasses };
  const layoutRendered = renderWithExpressions(layoutTemplate, layoutProps);
  const { content: layoutContent, styles: layoutStyles } = extractStyles(layoutRendered);

  // Render page component with DSD
  const pageComponent = await renderComponent(route.component, props);
  let pageHtml = pageComponent ? pageComponent.html : '<h1>Page not found</h1>';
  // Render nested components inside the page
  pageHtml = await renderComponents(pageHtml, props);

  // Replace app-router with rendered page
  let finalLayout = layoutContent.replace(
    /<app-router[^>]*><\/app-router>/g,
    `<app-router><div id="outlet">${pageHtml}</div></app-router>`
  );

  // Render remaining components in layout (navigation, etc.)
  finalLayout = await renderComponents(finalLayout, props);

  // Output as Declarative Shadow DOM template (element wrapper is in index.html)
  const allLayoutStyles = (layoutModuleCss || '') + (layoutStyles || '');
  const layoutShadowContent = (allLayoutStyles ? `<style>${allLayoutStyles}</style>` : '') + finalLayout;
  const appHtml = `<template shadowrootmode="open">${layoutShadowContent}</template>`;

  const meta = route.metadata || state.meta || {};
  const headMeta = [
    meta.title && `<title>${esc(meta.title)}</title>`,
    meta.description && `<meta name="description" content="${esc(meta.description)}">`
  ].filter(Boolean).join('');

  return {
    appHtml,
    initialStateScript: `<script>window.__INITIAL_STATE__=${JSON.stringify(state)}</script>`,
    headMeta,
    scopedStyles: '' // Styles now in shadow DOM
  };
}

// Export routes for client-side Router (used by /api/routes endpoint)
export async function getClientRoutes() {
  return scanRoutes(appDir);
}
