import { readFile } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderWithExpressions } from '../template.js';
import { matchRoute, createMatcher, pathFromFile } from '../routes.js';
import { scanDir } from '../scan.js';
import store from '../../lib/store.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = process.env.SSR_ROOT || resolve(__dirname, '../..');
const appDir = resolve(root, 'app');
const componentsDir = resolve(root, 'components');

const cache = { templates: new Map(), css: new Map() };

const resolvePath = tag => {
  if (tag === 'app-layout') return { tpl: join(appDir, '_Layout/_Layout.html'), css: join(appDir, '_Layout/_Layout.module.css') };
  if (tag === 'app-router') return null;
  const isPage = tag.endsWith('-page');
  const name = isPage ? tag.replace('-page', '') : tag.replace(/^app-/, '');
  const pascal = name.split('-').map(p => p[0].toUpperCase() + p.slice(1)).join('');
  const dir = isPage ? appDir : componentsDir;
  const folder = isPage ? pascal : pascal;
  return { tpl: join(dir, `${folder}/${pascal}.html`), css: join(dir, `${folder}/${pascal}.module.css`) };
};

async function load(tag) {
  if (cache.templates.has(tag)) return { tpl: cache.templates.get(tag), css: cache.css.get(tag) };
  const paths = resolvePath(tag);
  if (!paths) return { tpl: null, css: { css: '', classes: {} } };

  let tpl = null, css = { css: '', classes: {} };
  try {
    const html = await readFile(paths.tpl, 'utf-8');
    tpl = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').trim();
  } catch {}
  try {
    const raw = await readFile(paths.css, 'utf-8');
    const classes = {};
    const processed = raw.replace(/\.([a-zA-Z_][\w-]*)/g, (_, c) => (classes[c] = `${c}_${tag}`, `.${classes[c]}`));
    css = { css: processed, classes };
  } catch {}

  cache.templates.set(tag, tpl);
  cache.css.set(tag, css);
  return { tpl, css };
}

function extractStyles(html) {
  let styles = '';
  return { content: html.replace(/<style>([\s\S]*?)<\/style>/gi, (_, c) => (styles += c, '')), styles };
}

async function renderComponent(tag, props) {
  const { tpl, css } = await load(tag);
  if (!tpl) return null;
  const rendered = renderWithExpressions(tpl, { ...props, $css: css.classes });
  const { content, styles } = extractStyles(rendered);
  const allStyles = (css.css || '') + (styles || '');
  return `<${tag}><template shadowrootmode="open">${allStyles ? `<style>${allStyles}</style>` : ''}${content}</template></${tag}>`;
}

async function renderComponents(html, props, max = 50) {
  let result = html;
  for (let i = 0; i < max; i++) {
    const matches = [...result.matchAll(/<([a-z]+-[a-z-]+)([^>]*)><\/\1>/g)];
    if (!matches.length) break;
    for (const [full, tag] of matches) {
      if (tag === 'app-router') continue;
      const rendered = await renderComponent(tag, props);
      if (rendered) result = result.replace(full, rendered);
    }
  }
  return result;
}

async function buildRoutes() {
  const files = await scanDir(appDir, '.html');
  const routes = [];
  for (const { path: filePath, relative } of files) {
    if (relative.startsWith('_')) continue;
    const routePath = pathFromFile(relative.replace('.html', '.js'), '');
    if (!routePath) continue;

    const html = await readFile(filePath, 'utf-8');
    const template = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').trim();
    const dynamic = routePath.includes(':');

    let ssrProps = {}, metadata = null, requiresAuth = false;
    let script = html.match(/<script\b[^>]*>([\s\S]*?)<\/script>/i)?.[1];
    if (!script) {
      for (const ext of ['.mjs', '.js']) {
        try { script = await readFile(filePath.replace('.html', ext), 'utf-8'); break; } catch {}
      }
    }
    if (script) {
      try {
        const m1 = script.match(/static\s+ssrProps\s*=\s*(\{[^}]+\})/);
        const m2 = script.match(/static\s+metadata\s*=\s*(\{[^}]+\})/);
        const m3 = script.match(/static\s+requiresAuth\s*=\s*(true|false)/);
        if (m1) ssrProps = eval(`(${m1[1]})`);
        if (m2) metadata = eval(`(${m2[1]})`);
        if (m3) requiresAuth = m3[1] === 'true';
      } catch {}
    }
    routes.push({ path: routePath, component: relative.split('/').pop().replace('.html', '').toLowerCase() + '-page', html: template, dynamic, matcher: dynamic ? createMatcher(routePath) : null, ssrProps, metadata, requiresAuth });
  }
  const notFound = routes.find(r => r.component === 'notfound-page');
  if (notFound) routes.push({ ...notFound, path: '*', dynamic: false, matcher: null });
  return routes;
}

const routesPromise = buildRoutes();
const esc = s => String(s).replace(/[&"'<>]/g, c => ({ '&': '&amp;', '"': '&quot;', "'": '&#39;', '<': '&lt;', '>': '&gt;' })[c]);

export async function render(url) {
  const routes = await routesPromise;
  const [pathname, search] = url.split('?');
  const path = pathname === '/' ? '/' : pathname.replace(/\/$/, '');
  const result = matchRoute(routes, path);
  if (!result) return { appHtml: '<h1>404</h1>', initialStateScript: '', headMeta: '', scopedStyles: '' };

  const { route, params } = result;
  const state = store.get();
  if (route.requiresAuth && !state.isAuthenticated) return { redirect: `/login?from=${encodeURIComponent(path)}` };

  const ssrProps = typeof route.ssrProps === 'function' ? route.ssrProps({ path: url, params }) : route.ssrProps || {};
  const props = { ...state, ...ssrProps, path: url, params, query: Object.fromEntries(new URLSearchParams(search || '')), timestamp: new Date().toLocaleString(), year: new Date().getFullYear() };

  const { tpl: layoutTpl, css: layoutCss } = await load('app-layout');
  const layoutRendered = renderWithExpressions(layoutTpl, { ...props, $css: layoutCss.classes });
  const { content: layoutContent, styles: layoutStyles } = extractStyles(layoutRendered);

  let pageHtml = await renderComponent(route.component, props) || '<h1>Page not found</h1>';
  pageHtml = await renderComponents(pageHtml, props);

  let finalLayout = layoutContent.replace(/<app-router[^>]*><\/app-router>/g, `<app-router><div id="outlet">${pageHtml}</div></app-router>`);
  finalLayout = await renderComponents(finalLayout, props);

  const allLayoutStyles = (layoutCss.css || '') + (layoutStyles || '');
  const appHtml = `<template shadowrootmode="open">${allLayoutStyles ? `<style>${allLayoutStyles}</style>` : ''}${finalLayout}</template>`;

  const meta = route.metadata || state.meta || {};
  const headMeta = [meta.title && `<title>${esc(meta.title)}</title>`, meta.description && `<meta name="description" content="${esc(meta.description)}">`].filter(Boolean).join('');

  return { appHtml, initialStateScript: `<script>window.__INITIAL_STATE__=${JSON.stringify(state)}</script>`, headMeta, scopedStyles: '' };
}

export async function getClientRoutes() {
  const { scanRoutes } = await import('../scan.js');
  return scanRoutes(appDir);
}
