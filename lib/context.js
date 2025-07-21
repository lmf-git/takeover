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

// Theme utilities
const getSystemTheme = () => window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
const savedTheme = localStorage.getItem('theme') || getSystemTheme();

// Auth utilities
const generateFakeUser = () => ({
  id: Math.random().toString(36).substr(2, 9),
  username: `user_${Math.floor(Math.random() * 1000)}`,
  email: `user${Math.floor(Math.random() * 1000)}@example.com`,
  avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${Math.random()}`,
  role: Math.random() > 0.7 ? 'admin' : 'user'
});

// Create singleton store with enhanced state
const store = createStore({ 
  counter: 0, 
  lastRoute: null,
  theme: savedTheme,
  user: localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user')) : null,
  isAuthenticated: !!localStorage.getItem('user')
});

// Theme management
store.toggleTheme = () => {
  const currentTheme = store.get('theme');
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  store.set({ theme: newTheme });
  localStorage.setItem('theme', newTheme);
  document.documentElement.setAttribute('data-theme', newTheme);
};

// Auth management
store.login = (credentials = {}) => {
  const user = generateFakeUser();
  if (credentials.username) user.username = credentials.username;
  if (credentials.email) user.email = credentials.email;
  
  store.set({ user, isAuthenticated: true });
  localStorage.setItem('user', JSON.stringify(user));
  return user;
};

store.logout = () => {
  store.set({ user: null, isAuthenticated: false });
  localStorage.removeItem('user');
};

// Initialize theme on load
if (typeof document !== 'undefined') {
  document.documentElement.setAttribute('data-theme', savedTheme);
}

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
