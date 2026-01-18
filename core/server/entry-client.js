import '../../lib/index.js';
import store from '../context.js';

if (window.__INITIAL_STATE__) {
  store.set(window.__INITIAL_STATE__);
}
