import '/core/loader.js';
import store from '/lib/store.js';
import { initLocale } from '/lib/i18n.js';

// Wait for all custom elements visible in the DOM to be defined (hydration complete)
const waitForHydration = () => {
  // querySelectorAll with :not(:defined) is a single native selector pass — no JS filtering loop
  const pending = [...document.querySelectorAll(':not(:defined)')].map(el => el.tagName.toLowerCase()).filter(t => t.includes('-'));
  const unique = [...new Set(pending)];
  if (!unique.length) return Promise.resolve();
  return Promise.all(unique.map(tag => customElements.whenDefined(tag)));
};

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
  // Restore all SSR state; locale will be re-checked by initLocale below
  const { theme, ...rest } = window.__INITIAL_STATE__;
  store.set(rest);
}

// Initialise locale after restoring state (uses localStorage preference if set)
initLocale();
