import store from '/lib/store.js';
import { initLocale } from '/lib/i18n.js';
// Critical above-the-fold components — eagerly imported so they upgrade in sync
// with the initial DSD paint. Footer is omitted: it sits below the fold, is
// marked loading="lazy" in the layout, and is dynamic-imported by the loader's
// IntersectionObserver when scrolled into view.
import '/app/_Layout/_Layout.js';
import '/components/Router/Router.js';
import '/components/Navigation/Navigation.js';
import '/components/Logo/Logo.js';
import '/components/HeroCounter/HeroCounter.js';
import '/components/TriangleSeam/TriangleSeam.js';
import '/core/loader.js';

// Restore scroll position after navigation
(async () => {
  try {
    const saved = JSON.parse(sessionStorage.getItem('__scroll__'));
    sessionStorage.removeItem('__scroll__');
    if (saved?.path === location.pathname && saved.y > 0) {
      const pending = [...document.querySelectorAll(':not(:defined)')].map(el => el.tagName.toLowerCase()).filter(t => t.includes('-'));
      const unique = [...new Set(pending)];
      if (unique.length) await Promise.all(unique.map(tag => customElements.whenDefined(tag)));
      requestAnimationFrame(() => scrollTo(saved.x, saved.y));
    }
  } catch {}
})();

if (window.__INITIAL_STATE__) {
  store.set(window.__INITIAL_STATE__);
}

// initLocale is synchronous when window.__LOCALES__ is present (production).
// This sets the correct locale before any component's connectedCallback reaches
// its first await, so the re-sync update() fires with the right state.
initLocale();
