const loaded = new Set();
const scanned = new WeakSet();

const pathFor = tag => {
  if (tag === 'app-layout') return '/app/_Layout/_Layout.js';
  if (tag === 'app-router') return '/components/Router/Router.js';
  const pascal = tag.replace(/^app-/, '').split('-').map(p => p[0].toUpperCase() + p.slice(1)).join('');
  return `/components/${pascal}/${pascal}.js`;
};

const load = tag => { if (!loaded.has(tag) && !customElements.get(tag)) { loaded.add(tag); import(pathFor(tag)).catch(() => {}); } };

const scan = node => {
  if (!node || scanned.has(node)) return;
  scanned.add(node);
  const tag = node.tagName?.toLowerCase();
  if (tag?.includes('-') && !customElements.get(tag) && !tag.endsWith('-page')) load(tag);
  node.querySelectorAll?.('*').forEach(scan);
  node.shadowRoot?.querySelectorAll('*').forEach(scan);
};

const observed = new WeakSet();
const observe = root => {
  if (observed.has(root)) return;
  observed.add(root);
  new MutationObserver(m => m.flatMap(x => [...x.addedNodes]).filter(n => n.nodeType === 1).forEach(scan)).observe(root, { childList: true, subtree: true });
};

observe(document);
document.querySelectorAll('*').forEach(el => { scan(el); el.shadowRoot && (scan(el.shadowRoot), observe(el.shadowRoot)); });

const orig = Element.prototype.attachShadow;
Element.prototype.attachShadow = function(init) {
  const shadow = orig.call(this, init);
  setTimeout(() => scan(shadow), 0);
  observe(shadow);
  return shadow;
};
