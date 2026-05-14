import store from '/lib/store.js';
import { initLocale } from '/lib/i18n.js';
// Always-present components — imported before loader.js so the loader's DOM scan
// finds them already registered and skips the dynamic import chain.
import '/app/_Layout/_Layout.js';
import '/components/Router/Router.js';
import '/components/Navigation/Navigation.js';
import '/components/Logo/Logo.js';
import '/components/LanguageSwitch/LanguageSwitch.js';
import '/components/MobileMenu/MobileMenu.js';
import '/components/MenuToggle/MenuToggle.js';
import '/components/HeroGrid/HeroGrid.js';
import '/components/Footer/Footer.js';
// Loader must come after the defines above
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
