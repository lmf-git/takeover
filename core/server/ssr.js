// Shared SSR rendering logic - platform agnostic
import { renderWithExpressions, escapeHtml, evaluate, extractStyles, scopeCSS, jsonForScript } from '../template.js';
import { matchRoute } from '../routes.js';

// Same class-scoping transform the client runs (core/template.js scopeCSS).
const processCSS = (raw, scope) => {
  const { styles, classes } = scopeCSS(raw, scope);
  return { css: styles, classes };
};

// The opening tag of a custom element that has no declarative shadow root yet.
// Expanding from the opening tag (rather than an empty `<x-y></x-y>` pair) keeps
// whatever the element contains as light DOM, so components with children —
// slotted content — are server-rendered too.
const DSD_OPEN = '<template shadowrootmode="open">';
const HOST_RE = /<([a-z][a-z0-9]*(?:-[a-z0-9]+)+)((?:\s[^>]*)?)>(?!<template shadowrootmode=)/g;
const PROP_BINDING_RE = /\s:([a-zA-Z_][\w-]*)="([^"]+)"/g;

// The CSS-module helpers a template sees, same as the client's `props`.
const cssProps = classes => ({ $css: classes, $c: (...names) => names.map(n => classes[n] || n).join(' ') });

/**
 * @param {Object} deps
 * @param {(path: string) => Promise<string>} deps.loadFile
 * @param {(tag: string) => ({ tpl, css, plainCss } | null)} deps.resolvePaths
 * @param {Object<string, Object>} [deps.locals] tag → the component's `static local`
 *   (core/scan.js scanComponents). The server never imports component modules, so
 *   this is how a nested component's initial state reaches its template.
 */
export function createRenderer({ loadFile, resolvePaths, locals = {} }) {
  // Per-renderer, not per-module: the dev server builds a fresh renderer whenever
  // a source file changes, which is what drops stale templates and CSS.
  const cache = { templates: new Map(), css: new Map() };

  async function load(tag) {
    if (cache.templates.has(tag)) return { tpl: cache.templates.get(tag), css: cache.css.get(tag) };

    const paths = resolvePaths(tag);
    if (!paths) return { tpl: null, css: { css: '', classes: {} } };

    let tpl = null, css = { css: '', classes: {} };
    try {
      const html = await loadFile(paths.tpl);
      tpl = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').trim();
    } catch {}
    // Load .module.css (scoped) and/or adjacent .css (plain) — both can coexist
    try {
      const raw = await loadFile(paths.css);
      css = processCSS(raw, tag);
    } catch {}
    if (paths.plainCss) {
      try {
        const plain = await loadFile(paths.plainCss);
        css = { css: (css.css || '') + plain, classes: css.classes };
      } catch {}
    }

    cache.templates.set(tag, tpl);
    cache.css.set(tag, css);
    return { tpl, css };
  }

  /** The element's declarative shadow root, or null when the tag has no template. */
  async function renderShadow(tag, props) {
    const { tpl, css } = await load(tag);
    if (!tpl) return null;
    const rendered = renderWithExpressions(tpl, { ...props, ...cssProps(css.classes) });
    const { content, styles } = extractStyles(rendered);
    const allStyles = (css.css || '') + (styles || '');
    return `${DSD_OPEN}${allStyles ? `<style>${allStyles}</style>` : ''}${content}</template>`;
  }

  // Expand every custom element in `html`, then the ones their templates bring
  // in, pass by pass. Each element renders with the surrounding props, its own
  // `static local` on top (as on the client), and any :prop="expr" bindings.
  async function renderComponents(html, props, max = 50) {
    let result = html;
    // Tags with no template (unknown elements, the router) can never expand —
    // remember them so they don't keep the loop spinning to `max`.
    const inert = new Set(['app-router']);
    for (let i = 0; i < max; i++) {
      const pending = new Map(); // opening tag as written → its replacement
      for (const [open, tag, attrs] of result.matchAll(HOST_RE)) {
        if (inert.has(tag) || pending.has(open)) continue;
        const bound = {};
        // Same evaluator as the client, so both sides agree on the value.
        for (const [, name, expr] of attrs.matchAll(PROP_BINDING_RE)) bound[name] = evaluate(expr, props);
        const shadow = await renderShadow(tag, { ...props, ...locals[tag], ...bound });
        if (shadow == null) { inert.add(tag); continue; }
        pending.set(open, `<${tag}${attrs.replace(PROP_BINDING_RE, '')}>${shadow}`);
      }
      if (!pending.size) break;
      result = result.replace(HOST_RE, open => pending.get(open) ?? open);
    }
    return result;
  }

  /**
   * @param {Object} [options]
   * @param {Object} [options.otherLocales] Supported locales *other* than the active
   *   one, inlined as window.__LOCALES__ so a client/server locale mismatch (or a
   *   language switch) resolves synchronously instead of adding a fetch to the
   *   critical chain. The active locale's messages already ride in __INITIAL_STATE__.
   * @param {Object} [options.localeConfig] { supported, default } from app.config.yml,
   *   inlined as window.__LOCALE_CONFIG__ so client negotiation matches the server's.
   * @returns {Promise<Object>} { redirect } or { status, appHtml, headMeta, ... }.
   *   status is 404 when nothing but the NotFound fallback matched — adapters must send
   *   it, or every missing URL (llms.txt, /.well-known/*) reads as a real 200 page.
   */
  return async function render(url, routes, state = {}, options = {}) {
    const { otherLocales = null, localeConfig = null } = options;
    const localesScript =
      (otherLocales && Object.keys(otherLocales).length ? `<script>window.__LOCALES__=${jsonForScript(otherLocales)}</script>` : '') +
      (localeConfig ? `<script>window.__LOCALE_CONFIG__=${jsonForScript(localeConfig)}</script>` : '');

    const [pathname, search] = url.split('?');
    const path = pathname === '/' ? '/' : pathname.replace(/\/$/, '');
    const result = matchRoute(routes, path);
    if (!result) return { status: 404, appHtml: '<h1>404</h1>', initialStateScript: '', headMeta: '', localesScript };

    const { route, params } = result;
    if (route.requiresAuth && !state.isAuthenticated) {
      return { redirect: `/login?from=${encodeURIComponent(path)}` };
    }

    const ssrProps = typeof route.ssrProps === 'function' ? route.ssrProps({ path: url, params }) : route.ssrProps || {};
    const query = Object.fromEntries(new URLSearchParams(search || ''));
    // Same layering as the client's `props`: store, the page's `static local`, then
    // what the route supplies.
    const props = { ...state, ...locals[route.component], ...ssrProps, path: url, params, query, redirectFrom: query.from || null, timestamp: new Date().toLocaleString(), year: new Date().getFullYear(), t: state.messages || {} };

    const { tpl: layoutTpl, css: layoutCss } = await load('app-layout');
    const layoutRendered = renderWithExpressions(layoutTpl, { ...props, ...cssProps(layoutCss.classes) });
    const { content: layoutContent, styles: layoutStyles } = extractStyles(layoutRendered);

    const pageShadow = await renderShadow(route.component, props);
    let pageHtml = pageShadow ? `<${route.component}>${pageShadow}</${route.component}>` : '<h1>Page not found</h1>';
    pageHtml = await renderComponents(pageHtml, props);

    // Function-form replacement: the rendered HTML may contain $&, $$, $' …
    let finalLayout = layoutContent.replace(/<app-router[^>]*><\/app-router>/g, () => `<app-router><div id="outlet">${pageHtml}</div></app-router>`);
    finalLayout = await renderComponents(finalLayout, props);

    const allLayoutStyles = (layoutCss.css || '') + (layoutStyles || '');
    const appHtml = `${DSD_OPEN}${allLayoutStyles ? `<style>${allLayoutStyles}</style>` : ''}${finalLayout}</template>`;

    // state.site carries the site-wide defaults (app.config.yml site.title /
    // site.description); the page's own metadata wins field by field. The resolved
    // meta is what the client store starts from, so the <head> it syncs matches
    // the one rendered here.
    const meta = { ...state.site, ...state.meta, ...route.metadata };
    // Modulepreload the SSR'd page's script so it fetches in parallel with the core bundle
    // instead of waiting for core to parse and trigger the Router's dynamic import.
    const pagePreload = route.module ? `<link rel="modulepreload" href="${route.module}">` : '';
    const headMeta = [
      pagePreload,
      meta.title && `<title>${escapeHtml(meta.title)}</title>`,
      meta.description && `<meta name="description" content="${escapeHtml(meta.description)}">`,
    ].filter(Boolean).join('');

    // '*' is withNotFound's clone of the NotFound page (core/routes.js); the page's
    // own URL (/notfound) is a 404 too, not a real 200 document.
    const status = route.path === '*' || route.component === 'notfound-page' ? 404 : 200;
    return { status, appHtml, initialStateScript: `<script>window.__INITIAL_STATE__=${jsonForScript({ ...state, meta })}</script>`, headMeta, localesScript };
  };
}
