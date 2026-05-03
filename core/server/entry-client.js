import '/core/loader.js';
import store from '/lib/store.js';

// Wait for all custom elements to be defined (hydration complete)
const waitForHydration = () => new Promise(resolve => {
  const check = () => {
    // Only check custom elements that are actually in the DOM
    const pending = [...document.body.getElementsByTagName('*')].filter(el =>
      el.tagName.includes('-') && !customElements.get(el.tagName.toLowerCase())
    );
    if (pending.length === 0) {
      resolve();
    } else {
      // Use customElements.whenDefined for each pending tag for better performance
      Promise.all(pending.map(el => customElements.whenDefined(el.tagName.toLowerCase()))).then(resolve);
    }
  };
  check();
});

// Restore scroll after hydration
(async () => {
  try {
    const saved = JSON.parse(sessionStorage.getItem('__scroll__'));
    sessionStorage.removeItem('__scroll__');
    if (saved?.path === location.pathname && saved.y > 0) {
      await waitForHydration();
      // Use requestAnimationFrame to ensure layout is ready
      requestAnimationFrame(() => {
        scrollTo(saved.x, saved.y);
      });
    }
  } catch {}
})();

if (window.__INITIAL_STATE__) {
  // Don't override theme - client-side localStorage value takes precedence
  const { theme, ...rest } = window.__INITIAL_STATE__;
  store.set(rest);
}
