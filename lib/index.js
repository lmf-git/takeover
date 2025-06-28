// Import core components
import '../components/Router/Router.js';
import '../components/Navigation/Navigation.js';
import '../components/Counter/Counter.js';
import '../app/_Layout/_Layout.js';
import './context.js';

// Let everything initialize after DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  // Clean up any duplicate store providers
  const providers = document.querySelectorAll('store-provider');
  if (providers.length > 1) {
    for (let i = 1; i < providers.length; i++) providers[i].remove();
  }
});
