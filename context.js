// Minimal state management for web components

// Create a simple store with pub/sub pattern
const createStore = (initialState = {}) => {
  let state = { ...initialState };
  const listeners = new Map();
  let nextId = 1;
  
  // Create store instance
  const store = {
    // Get state or part of state
    get: (path = null) => {
      if (!path) return { ...state };
      
      return path.split('.').reduce((obj, key) => 
        obj && obj[key] !== undefined ? obj[key] : undefined, state);
    },
    
    // Update state
    set: (newState) => {
      const oldState = { ...state };
      state = { ...state, ...newState };
      
      // Notify listeners about changes
      const changedKeys = Object.keys(newState);
      listeners.forEach((listener) => {
        if (listener.paths.length === 0 || 
            listener.paths.some(path => changedKeys.includes(path))) {
          listener.callback(state, oldState);
        }
      });
      
      return state;
    },
    
    // Subscribe to state changes
    subscribe: (callback, paths = []) => {
      const id = nextId++;
      listeners.set(id, { callback, paths });
      
      // Return unsubscribe function
      return () => listeners.delete(id);
    }
  };
  
  return store;
};

// Create a singleton store
const store = createStore({
  counter: 0,
  lastRoute: null
});

// Make the store globally available
if (typeof window !== 'undefined') {
  window.store = store;
}

// Create a web component that provides the store to the app
class StoreProvider extends HTMLElement {
  connectedCallback() {
    // Emit a store-ready event
    window.dispatchEvent(new CustomEvent('store-ready', { 
      detail: { store } 
    }));
  }
}

// Define the store-provider element
customElements.define('store-provider', StoreProvider);

// Helper mixin for components to connect to store
export function connect(baseClass) {
  return class extends baseClass {
    _unsubscribe = null;
    
    // Connect to store
    connectStore(paths = [], callback) {
      this._unsubscribe = store.subscribe((state, oldState) => {
        if (callback) {
          callback(state, oldState);
        } else if (this.stateChanged) {
          this.stateChanged(state, oldState);
        }
      }, paths);
      
      return store.get();
    }
    
    // Cleanup on disconnect
    disconnectedCallback() {
      if (super.disconnectedCallback) {
        super.disconnectedCallback();
      }
      
      if (this._unsubscribe) {
        this._unsubscribe();
        this._unsubscribe = null;
      }
    }
  };
}

// Export the store as default
export default store;
