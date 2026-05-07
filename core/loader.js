const loaded = new Set();
const scanned = new WeakSet();

const pathFor = tag => {
  if (tag === 'app-layout') return '/app/_Layout/_Layout.js';
  if (tag === 'app-router') return '/components/Router/Router.js';
  const pascal = tag.replace(/^app-/, '').split('-').map(p => p[0].toUpperCase() + p.slice(1)).join('');
  return `/components/${pascal}/${pascal}.html?script`;
};

const load = tag => { 
  if (!loaded.has(tag) && !customElements.get(tag)) { 
    loaded.add(tag); 
    import(pathFor(tag)).catch(e => console.warn(`[loader] Failed to load ${tag}:`, e.message)); 
  } 
};

const scan = node => {
  if (!node || scanned.has(node)) return;
  
  if (node.nodeType === 1) { // Element
    scanned.add(node);
    const tag = node.tagName.toLowerCase();
    if (tag.includes('-') && !customElements.get(tag) && !tag.endsWith('-page')) {
      load(tag);
    }
    if (node.shadowRoot) scan(node.shadowRoot);
    
    // Scan children
    let child = node.firstElementChild;
    while (child) {
      scan(child);
      child = child.nextElementSibling;
    }
  } else if (node.nodeType === 11) { // ShadowRoot / Fragment
    scanned.add(node);
    let child = node.firstChild;
    while (child) {
      if (child.nodeType === 1) scan(child);
      child = child.nextSibling;
    }
  }
};

const observed = new WeakSet();
const observe = root => {
  if (!root || observed.has(root)) return;
  observed.add(root);
  new MutationObserver(m => {
    for (const record of m) {
      for (const node of record.addedNodes) {
        if (node.nodeType === 1) scan(node);
      }
    }
  }).observe(root, { childList: true, subtree: true });
};

// Initial scan
scan(document.documentElement);
observe(document.documentElement);

const orig = Element.prototype.attachShadow;
Element.prototype.attachShadow = function(init) {
  const shadow = orig.call(this, init);
  setTimeout(() => {
    scan(shadow);
    observe(shadow);
  }, 0);
  return shadow;
};
