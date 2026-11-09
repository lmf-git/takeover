// Custom-element tag → source-file resolution.
//
// Every place that has to turn a tag into a file path shares this module: the
// browser auto-loader (core/loader.js), the Node SSR renderer
// (core/server/entry-server.js) and the edge adapters (deploy/*). One
// implementation is what stops those three from drifting apart.
//
// The registry itself is *discovered*, never hand-maintained: core/scan.js walks
// app/ and components/ for `define('<tag>', …)` calls and maps each tag to the
// file stem that declares it ('home-cta' → 'components/HomeCTA/HomeCTA'). That
// result reaches consumers as window.__TAGS__ (browser), a direct argument
// (Node SSR), or _ssr-config.json (edge adapters). Core therefore carries no
// project-specific tag names, and a tag whose folder or file doesn't match the
// naming convention needs no configuration anywhere.

/** Matches `define('my-tag', …)` and `customElements.define('my-tag', …)`. */
export const DEFINE_RE = /\bdefine\(\s*['"]([a-z][a-z0-9]*(?:-[a-z0-9]+)+)['"]/g;

/** kebab-case → PascalCase, dropping a leading `app-` namespace: app-logo → Logo */
export const pascalFor = tag =>
  tag.replace(/^app-/, '').split('-').map(p => p[0].toUpperCase() + p.slice(1)).join('');

/**
 * Convention-based guess, used only when a tag is absent from the registry —
 * an element defined at runtime, or a consumer that received no registry.
 * Pages live in app/, everything else in components/; the file is named after
 * its folder.
 */
export const fallbackStem = tag => {
  const name = pascalFor(tag.replace(/-page$/, ''));
  return `${tag.endsWith('-page') ? 'app' : 'components'}/${name}/${name}`;
};

/** Resolve a tag to its extension-less source path: 'home-cta' → 'components/HomeCTA/HomeCTA'. */
export const stemForTag = (tag, registry) => (registry && registry[tag]) || fallbackStem(tag);

/**
 * Root-relative URLs for every file a tag may own. Callers pick what they need:
 * the loader wants `js`, the SSR renderers want `html` / `moduleCss` / `css`.
 */
export function pathsForTag(tag, registry) {
  const stem = stemForTag(tag, registry);
  return {
    stem,
    dir: stem.slice(0, stem.lastIndexOf('/')),
    js: `/${stem}.js`,
    html: `/${stem}.html`,
    moduleCss: `/${stem}.module.css`,
    css: `/${stem}.css`,
  };
}
