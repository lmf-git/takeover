import '/core/loader.js';
import store from '/lib/store.js';

if (window.__INITIAL_STATE__) {
  // Don't override theme - client-side localStorage value takes precedence
  const { theme, ...rest } = window.__INITIAL_STATE__;
  store.set(rest);
}
