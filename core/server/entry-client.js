import '../loader.js';
import store from '../../lib/store.js';

if (window.__INITIAL_STATE__) {
  store.set(window.__INITIAL_STATE__);
}
