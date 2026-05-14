import { Store } from '../core/context.js';

const defaults = { meta: {}, locale: 'es', messages: {} };

const isBrowser = typeof window !== 'undefined';

const store = isBrowser
  ? (window.__store__ ??= new Store({ ...defaults }, defaults))
  : new Store({ ...defaults }, defaults);

store.setMeta = meta => store.set({ meta: { ...store.get('meta'), ...meta } });

export default store;
