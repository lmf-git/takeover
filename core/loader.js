const loaded = new Set();

const pathFor = tag => {
  if (tag === 'app-layout') return '/app/_Layout/_Layout.js';
  if (tag === 'app-router') return '/components/Router/Router.js';
  const pascal = tag.replace(/^app-/, '').split('-').map(p => p[0].toUpperCase() + p.slice(1)).join('');
  return `/components/${pascal}/${pascal}.js`;
};

const load = tag => { if (!loaded.has(tag) && !customElements.get(tag)) { loaded.add(tag); import(pathFor(tag)).catch(() => {}); } };

const scan = node => {
  const tag = node.tagName?.toLowerCase();
  if (tag?.includes('-') && !customElements.get(tag) && !tag.endsWith('-page')) load(tag);
  node.querySelectorAll?.('*').forEach(scan);
  node.shadowRoot?.querySelectorAll('*').forEach(scan);
};

const observe = root => new MutationObserver(m => m.flatMap(x => [...x.addedNodes]).filter(n => n.nodeType === 1).forEach(scan)).observe(root, { childList: true, subtree: true });

observe(document);
document.querySelectorAll('*').forEach(el => { scan(el); el.shadowRoot && (el.shadowRoot.querySelectorAll('*').forEach(scan), observe(el.shadowRoot)); });

const orig = Element.prototype.attachShadow;
Element.prototype.attachShadow = function(init) {
  const shadow = orig.call(this, init);
  setTimeout(() => shadow.querySelectorAll('*').forEach(scan), 0);
  observe(shadow);
  return shadow;
};
