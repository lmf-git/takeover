import { Store } from '../core/context.js';

const defaults = { meta: {}, locale: 'es', messages: {} };

const isBrowser = typeof window !== 'undefined';

// Seed from SSR snapshot at module-load time. Custom elements upgrade
// synchronously when their `customElements.define()` call runs in the
// bundle, *before* entry-client's tail can call store.set(__INITIAL_STATE__).
// Reading the snapshot here means the very first connectedCallback already
// sees the correct locale/messages — no post-hydrate update(), no reflow.
const initial = isBrowser && window.__INITIAL_STATE__
  ? { ...defaults, ...window.__INITIAL_STATE__ }
  : { ...defaults };

const store = isBrowser
  ? (window.__store__ ??= new Store(initial, defaults))
  : new Store(initial, defaults);

store.setMeta = meta => store.set({ meta: { ...store.get('meta'), ...meta } });

export default store;
