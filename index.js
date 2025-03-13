// Import core components
import './components/Router/Router.js';
import './components/Navigation/Navigation.js';
import './app/_Layout/_Layout.js';

// Import store
import './context.js';

// Import shared components - with correct path to components folder
import './components/Counter/Counter.js';

// The Router component now handles auto-discovery of routes from app folder.
// No need for a separate pages/index.js file anymore.

// Wait for DOM before initialization
document.addEventListener('DOMContentLoaded', () => {
  console.log('Application initialized with auto-discovered routes');
  
  // Clean up any potential duplicate store provider elements
  const storeProviders = document.querySelectorAll('store-provider');
  if (storeProviders.length > 1) {
    console.warn(`Found ${storeProviders.length} store providers, removing duplicates`);
    for (let i = 1; i < storeProviders.length; i++) {
      storeProviders[i].remove();
    }
  }
});
