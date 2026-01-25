// Shared SSR rendering logic - platform agnostic
import { renderWithExpressions, escapeHtml } from '../template.js';
import { matchRoute } from '../routes.js';

const cache = { templates: new Map(), css: new Map() };

const extractStyles = html => {
  let styles = '';
  return { content: html.replace(/<style>([\s\S]*?)<\/style>/gi, (_, c) => (styles += c, '')), styles };
};

const processCSS = (raw, scope) => {
  const classes = {};
  const css = raw.replace(/\.([a-zA-Z_][\w-]*)/g, (_, c) => (classes[c] = `${c}_${scope}`, `.${classes[c]}`));
  return { css, classes };
};

export function createRenderer({ loadFile, resolvePaths }) {

  async function load(tag) {
    if (cache.templates.has(tag)) return { tpl: cache.templates.get(tag), css: cache.css.get(tag) };

    const paths = resolvePaths(tag);
    if (!paths) return { tpl: null, css: { css: '', classes: {} } };

    let tpl = null, css = { css: '', classes: {} };
    try {
      const html = await loadFile(paths.tpl);
      tpl = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').trim();
    } catch {}
    try {
      const raw = await loadFile(paths.css);
      css = processCSS(raw, tag);
    } catch {}

    cache.templates.set(tag, tpl);
    cache.css.set(tag, css);
    return { tpl, css };
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
      for (const [full, tag, attrs] of matches) {
        if (tag === 'app-router') continue;
        // Extract :prop="expr" bindings from attributes and evaluate them
        let childProps = props;
        const propBindings = [...(attrs || '').matchAll(/\s:([a-zA-Z_][\w-]*)="([^"]+)"/g)];
        if (propBindings.length) {
          const boundProps = {};
          for (const [, propName, expr] of propBindings) {
            // Simple expression evaluation for SSR
            const value = expr.split('.').reduce((o, k) => o?.[k], props);
            boundProps[propName] = value;
          }
          childProps = { ...props, ...boundProps };
        }
        const rendered = await renderComponent(tag, childProps);
        if (rendered) result = result.replace(full, rendered);
      }
    }
    return result;
  }

  return async function render(url, routes, state = {}) {
    const [pathname, search] = url.split('?');
    const path = pathname === '/' ? '/' : pathname.replace(/\/$/, '');
    const result = matchRoute(routes, path);
    if (!result) return { appHtml: '<h1>404</h1>', initialStateScript: '', headMeta: '' };

    const { route, params } = result;
    if (route.requiresAuth && !state.isAuthenticated) {
      return { redirect: `/login?from=${encodeURIComponent(path)}` };
    }

    const ssrProps = typeof route.ssrProps === 'function' ? route.ssrProps({ path: url, params }) : route.ssrProps || {};
    const query = Object.fromEntries(new URLSearchParams(search || ''));
    const props = { ...state, ...ssrProps, path: url, params, query, redirectFrom: query.from || null, timestamp: new Date().toLocaleString(), year: new Date().getFullYear() };

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
    const headMeta = [meta.title && `<title>${escapeHtml(meta.title)}</title>`, meta.description && `<meta name="description" content="${escapeHtml(meta.description)}">`].filter(Boolean).join('');

    return { appHtml, initialStateScript: `<script>window.__INITIAL_STATE__=${JSON.stringify(state)}</script>`, headMeta };
  };
}
