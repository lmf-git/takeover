// Auto-loader for custom elements based on naming convention
// Pages are loaded by Router - this handles shared components only

const loaded = new Set();

function pathFromTag(tag) {
  // Layout special case
  if (tag === 'app-layout') return '/app/_Layout/_Layout.js';
  if (tag === 'app-router') return '/components/Router/Router.js';

  // Shared components: strip 'app-' prefix, convert to PascalCase
  // app-navigation → /components/Navigation/Navigation.js
  // theme-toggle → /components/ThemeToggle/ThemeToggle.js
  let name = tag.startsWith('app-') ? tag.slice(4) : tag;
  const pascal = name.split('-').map(p => p[0].toUpperCase() + p.slice(1)).join('');
  return `/components/${pascal}/${pascal}.js`;
}

async function load(tag) {
  if (loaded.has(tag) || customElements.get(tag)) return;
  loaded.add(tag);

  const path = pathFromTag(tag);
  try {
    console.log(`[Loader] Loading ${tag} from ${path}`);
    await import(path);
    console.log(`[Loader] Loaded ${tag}`);
  } catch (e) {
    console.error(`[Loader] Failed to load ${tag} from ${path}:`, e);
  }
}

function check(node) {
  const tag = node.tagName?.toLowerCase();
  if (tag?.includes('-') && !customElements.get(tag) && !tag.endsWith('-page')) {
    load(tag);
  }
  // Check children
  node.querySelectorAll?.('*').forEach(check);
  // Also check inside shadow DOM
  if (node.shadowRoot) {
    node.shadowRoot.querySelectorAll('*').forEach(check);
  }
}

new MutationObserver(mutations => {
  mutations.flatMap(m => [...m.addedNodes]).filter(n => n.nodeType === 1).forEach(check);
}).observe(document, { childList: true, subtree: true });

// Initial scan of document and any existing shadow roots (from DSD)
function scanAll(root) {
  root.querySelectorAll('*').forEach(el => {
    check(el);
    if (el.shadowRoot) scanAll(el.shadowRoot);
  });
}
scanAll(document);

// Also observe shadow roots when they're created
const origAttachShadow = Element.prototype.attachShadow;
Element.prototype.attachShadow = function(init) {
  const shadow = origAttachShadow.call(this, init);
  // Check elements in new shadow root after a tick
  setTimeout(() => shadow.querySelectorAll('*').forEach(check), 0);
  // Observe the shadow root for future additions
  new MutationObserver(mutations => {
    mutations.flatMap(m => [...m.addedNodes]).filter(n => n.nodeType === 1).forEach(check);
  }).observe(shadow, { childList: true, subtree: true });
  return shadow;
};
