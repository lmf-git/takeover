import template from "./Router.html?raw";
import store from "../../app/_Store/Store.js";

class Router extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.routes = new Map();
    this.pageModules = null;
  }

  connectedCallback() {
    this.shadowRoot.innerHTML = template;
    this.container = this.shadowRoot.querySelector('#outlet');
    
    if (!this.container) {
      console.error('Router outlet element not found');
      return;
    }
    
    // Listen for browser back/forward navigation
    window.addEventListener('popstate', () => this.route());
    
    // Listen for our custom navigation event
    window.addEventListener('navigate', (event) => {
      this.navigate(event.detail.path);
    });
    
    // Handle clicks on route links
    document.addEventListener('click', (e) => {
      const path = e.composedPath();
      const anchor = path.find(el => el.tagName === 'A' && el.hasAttribute && el.hasAttribute('route'));
      
      if (anchor) {
        e.preventDefault();
        console.log(`Link clicked: ${anchor.getAttribute('href')}`);
        this.navigate(anchor.getAttribute('href'));
      }
    });
    
    // Initialize page modules map (but don't load pages yet)
    this.initializePageModules();
    
    // Handle initial route
    this.route();
  }

  initializePageModules() {
    // Get references to page modules but don't load them yet (lazy: true is default)
    this.pageModules = import.meta.glob('../../app/**/*.html', { as: 'raw' });
    
    // Pre-register route paths based on file structure
    Object.keys(this.pageModules).forEach(path => {
      // Skip files in folders starting with underscore
      if (path.includes('/_')) {
        return;
      }
      
      // Extract route path from file path
      // Format: ../../app/SomePage/SomePage.html -> /some-page
      const match = path.match(/\.\.\/\.\.\/app\/(.+?)\/\1\.html$/i);
      
      if (match) {
        const pageName = match[1];
        const componentName = pageName.toLowerCase() + '-page';
        const routePath = '/' + (pageName === 'Home' ? '' : pageName.toLowerCase());
        
        // Register route path, but don't load the component yet
        this.registerRoute(routePath, {
          component: componentName,
          loader: this.pageModules[path], // Store the import function
          loaded: false
        });
      }
    });
    
    // Add default/fallback route
    if (!this.routes.has('*') && this.routes.has('/')) {
      this.routes.set('*', this.routes.get('/'));
    }
  }

  registerRoute(path, routeInfo) {
    console.log(`Route registered: ${path} -> ${routeInfo.component} (lazy)`);
    this.routes.set(path, routeInfo);
  }

  navigate(path) {
    console.log(`Navigate to: ${path}`);
    history.pushState(null, null, path);
    this.route();
  }

  async route() {
    const path = window.location.pathname;
    console.log(`Routing: ${path}`);
    
    // Update the current route in the global store
    store.set({ lastRoute: path });
    
    // Try to match the exact route or fall back to the wildcard route
    let routeInfo = this.routes.get(path) || this.routes.get('*');
    
    if (routeInfo) {
      console.log(`Match: ${routeInfo.component}`);
      
      try {
        // Clear the container
        this.container.innerHTML = '';
        
        // If the component hasn't been loaded yet, load it now
        if (!routeInfo.loaded) {
          await this.loadComponent(routeInfo);
        }
        
        // Create the component instance
        const component = document.createElement(routeInfo.component);
        this.container.appendChild(component);
        console.log(`Component ${routeInfo.component} mounted`);
      } catch (error) {
        console.error(`Failed to load or create component:`, error);
      }
    } else {
      console.warn(`No route for: ${path}`);
    }
  }
  
  async loadComponent(routeInfo) {
    try {
      // Load the HTML template
      const templateContent = await routeInfo.loader();
      
      // Skip if the component is already defined
      if (customElements.get(routeInfo.component)) {
        routeInfo.loaded = true;
        return;
      }
      
      // Create the component class
      class DynamicPage extends HTMLElement {
        constructor() {
          super();
          this.attachShadow({ mode: "open" });
        }

        connectedCallback() {
          this.shadowRoot.innerHTML = templateContent;
          
          // Add click handlers for route links
          const links = this.shadowRoot.querySelectorAll('a[route]');
          links.forEach(link => {
            link.addEventListener('click', (event) => {
              event.preventDefault();
              const path = event.target.getAttribute('href');
              window.dispatchEvent(new CustomEvent('navigate', {
                detail: { path }
              }));
            });
          });
        }
      }
      
      // Define the custom element
      customElements.define(routeInfo.component, DynamicPage);
      routeInfo.loaded = true;
      
      console.log(`Component ${routeInfo.component} defined (lazy loaded)`);
    } catch (error) {
      console.error(`Failed to load component template:`, error);
      throw error;
    }
  }
}

customElements.define("app-router", Router);
