// Import core components
import './components/Router/Router.js';
import './components/Navigation/Navigation.js';
import './app/_Layout/_Layout.js';

// Import store
import './app/_Store/Store.js';

// Import shared components - ensure they're loaded before pages need them
import './app/_Components/Counter.js';

// The Router will handle loading page components

// Wait for DOM before initialization
document.addEventListener('DOMContentLoaded', () => {
  console.log('Application initialized');
  
  // Clean up any potential duplicate store provider elements
  const storeProviders = document.querySelectorAll('store-provider');
  if (storeProviders.length > 1) {
    console.warn(`Found ${storeProviders.length} store providers, removing duplicates`);
    for (let i = 1; i < storeProviders.length; i++) {
      storeProviders[i].remove();
    }
  }
});
