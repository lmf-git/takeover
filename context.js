// Simple state management for web components
const createStore = (initialState = {}) => {
  let state = { ...initialState };
  const listeners = new Map();
  let nextId = 1;
  
  return {
    get: (path = null) => {
      if (!path) return { ...state };
      return path.split('.').reduce((obj, key) => 
        obj && obj[key] !== undefined ? obj[key] : undefined, state);
    },
    
    set: (newState) => {
      const oldState = { ...state };
      state = { ...state, ...newState };
      
      const changedKeys = Object.keys(newState);
      listeners.forEach((listener) => {
        if (listener.paths.length === 0 || 
            listener.paths.some(path => changedKeys.includes(path))) {
          listener.callback(state, oldState);
        }
      });
      
      return state;
    },
    
    subscribe: (callback, paths = []) => {
      const id = nextId++;
      listeners.set(id, { callback, paths });
      return () => listeners.delete(id);
    }
  };
};

// Create singleton store
const store = createStore({ counter: 0, lastRoute: null });
if (typeof window !== 'undefined') window.store = store;

// Helper mixin for components
export function connect(baseClass) {
  return class extends baseClass {
    _unsubscribe = null;
    
    connectStore(paths = [], callback) {
      this._unsubscribe = store.subscribe((state, oldState) => {
        if (callback) callback(state, oldState);
        else if (this.stateChanged) this.stateChanged(state, oldState);
      }, paths);
      return store.get();
    }
    
    disconnectedCallback() {
      if (super.disconnectedCallback) super.disconnectedCallback();
      if (this._unsubscribe) {
        this._unsubscribe();
        this._unsubscribe = null;
      }
    }
  };
}

// Register store provider element
customElements.define('store-provider', class extends HTMLElement {
  connectedCallback() {
    window.dispatchEvent(new CustomEvent('store-ready', { detail: { store } }));
  }
});

export default store;
