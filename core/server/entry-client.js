import '/core/loader.js';
import store from '/lib/store.js';

// Wait for all custom elements to be defined (hydration complete)
const waitForHydration = () => new Promise(resolve => {
  const check = () => {
    const pending = [...document.querySelectorAll('*')].filter(el =>
      el.tagName.includes('-') && !customElements.get(el.tagName.toLowerCase())
    );
    if (pending.length === 0) {
      resolve();
    } else {
      requestAnimationFrame(check);
    }
  };
  check();
});

// Restore scroll after hydration with smooth behavior
(async () => {
  try {
    const saved = JSON.parse(sessionStorage.getItem('__scroll__'));
    sessionStorage.removeItem('__scroll__');
    if (saved?.path === location.pathname && saved.y > 0) {
      await waitForHydration();
      // Small delay for layout to stabilize
      await new Promise(r => setTimeout(r, 100));
      scrollTo({ top: saved.y, left: saved.x, behavior: 'smooth' });
    }
  } catch {}
})();

if (window.__INITIAL_STATE__) {
  // Don't override theme - client-side localStorage value takes precedence
  const { theme, ...rest } = window.__INITIAL_STATE__;
  store.set(rest);
}
