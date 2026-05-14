const loaded = new Set();
const scanned = new WeakSet();

const pathFor = tag => {
  let path;
  if (tag === 'app-layout') path = '/app/_Layout/_Layout.js';
  else if (tag === 'app-router') path = '/components/Router/Router.js';
  else {
    const pascal = tag.replace(/^app-/, '').split('-').map(p => p[0].toUpperCase() + p.slice(1)).join('');
    path = `/components/${pascal}/${pascal}.js`;
  }
  // In production, files are content-hashed and served with immutable cache.
  // The build inlines window.__M__ to map original path → hashed path.
  return (typeof window !== 'undefined' && window.__M__ && window.__M__[path]) || path;
};

const eagerLoad = tag => {
  if (!loaded.has(tag) && !customElements.get(tag)) {
    loaded.add(tag);
    import(pathFor(tag)).catch(e => console.warn(`[loader] Failed to load ${tag}:`, e.message));
  }
};

// IntersectionObserver-driven lazy hydration. Elements with loading="lazy"
// don't trigger their dynamic import until they (or a 200px-leading margin)
// enter the viewport. SSR-rendered DSD content keeps showing regardless;
// only the JS upgrade is deferred.
const lazyObserver = (typeof IntersectionObserver !== 'undefined')
  ? new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        lazyObserver.unobserve(entry.target);
        eagerLoad(entry.target.tagName.toLowerCase());
      }
    }, { rootMargin: '200px' })
  : null;

const load = (tag, el) => {
  if (loaded.has(tag) || customElements.get(tag)) return;
  if (lazyObserver && el?.getAttribute('loading') === 'lazy') {
    lazyObserver.observe(el);
    return;
  }
  eagerLoad(tag);
};

const scan = node => {
  if (!node || scanned.has(node)) return;

  if (node.nodeType === 1) { // Element
    scanned.add(node);
    const tag = node.tagName.toLowerCase();
    if (tag.includes('-') && !customElements.get(tag) && !tag.endsWith('-page')) {
      load(tag, node);
    }
    if (node.shadowRoot) { observe(node.shadowRoot); scan(node.shadowRoot); }

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

// Defer the initial scan until after `load`. Every above-the-fold custom
// element is already eager-imported by the core bundle, so by the time
// loader.js runs the only candidates are lazy DSD components (home-about,
// footer, …). Kicking off their dynamic imports inside the critical-path
// window makes Lighthouse count them against LCP even though they sit
// off-screen. Postponing the scan keeps them out of the critical chain.
const startScan = () => {
  scan(document.documentElement);
  observe(document.documentElement);
};
const schedule = cb => {
  if (typeof requestIdleCallback === 'function') requestIdleCallback(cb, { timeout: 500 });
  else setTimeout(cb, 0);
};
if (document.readyState === 'complete') schedule(startScan);
else addEventListener('load', () => schedule(startScan), { once: true });

const orig = Element.prototype.attachShadow;
Element.prototype.attachShadow = function(init) {
  const shadow = orig.call(this, init);
  setTimeout(() => {
    scan(shadow);
    observe(shadow);
  }, 0);
  return shadow;
};
