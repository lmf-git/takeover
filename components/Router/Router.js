import template from "./Router.html?raw";
import store from "../../context.js";
import { renderWithExpressions } from "../../template.js";

class Router extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.routes = new Map();
    this.pageModules = null;
    this.currentPath = null;
    this.isNavigating = false; // Flag to prevent concurrent navigation
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
    this.pageModules = import.meta.glob('../../app/**/*.html', { query: '?raw', import: 'default' });
    
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

  async navigate(path) {
    // Prevent navigating to the current path
    if (this.currentPath === path) {
      console.log(`Already on path: ${path}, navigation skipped`);
      return;
    }

    console.log(`Navigate to: ${path}`);
    history.pushState(null, null, path);
    this.route();
  }

  async route() {
    // Prevent concurrent routing operations
    if (this.isNavigating) {
      console.log('Navigation already in progress, queueing...');
      // Queue up this navigation to occur after the current one
      setTimeout(() => this.route(), 50);
      return;
    }

    this.isNavigating = true;
    const path = window.location.pathname;
    console.log(`Routing: ${path}`);
    
    try {
      // Update the current route in the global store
      store.set({ lastRoute: path });
      
      // If we're already on this path, don't re-render
      if (this.currentPath === path) {
        console.log(`Already on path: ${path}, render skipped`);
        return;
      }
      
      // Remember the current path
      this.currentPath = path;
      
      // Try to match the exact route or fall back to the wildcard route
      let routeInfo = this.routes.get(path) || this.routes.get('*');
      
      if (routeInfo) {
        console.log(`Match: ${routeInfo.component}`);
        
        // Clear the container first
        this.container.innerHTML = '';
        
        // If the component hasn't been loaded yet, load it now
        if (!routeInfo.loaded) {
          await this.loadComponent(routeInfo);
        }
        
        // Generate props for the page
        const pageProps = {
          path,
          title: this.getPageTitle(path),
          timestamp: new Date().toLocaleString(),
          // Add any other common props here
          ...store.get() // Add store state as props
        };
        
        // Create the component instance with props
        const component = document.createElement(routeInfo.component);
        component.pageProps = pageProps; // Pass props to the component
        
        // Wait a frame before appending to ensure DOM stability
        requestAnimationFrame(() => {
          this.container.appendChild(component);
          console.log(`Component ${routeInfo.component} mounted with props`);
        });
      } else {
        console.warn(`No route for: ${path}`);
      }
    } catch (error) {
      console.error(`Failed to load or create component:`, error);
    } finally {
      // Release the navigation lock
      this.isNavigating = false;
    }
  }
  
  getPageTitle(path) {
    // Extract page name from path
    const pageName = path === '/' ? 'Home' : 
      path.substring(1).charAt(0).toUpperCase() + path.substring(2);
    return `${pageName} Page`;
  }
  
  async loadComponent(routeInfo) {
    try {
      // Check if the component is already defined to avoid duplicate registration
      if (customElements.get(routeInfo.component)) {
        console.log(`Component ${routeInfo.component} already defined, skipping definition`);
        routeInfo.loaded = true;
        return;
      }
      
      // Load the HTML template
      const templateContent = await routeInfo.loader();
            
      // Double-check that the component still isn't defined
      // (could have been defined while we were waiting for the template)
      if (customElements.get(routeInfo.component)) {
        console.log(`Component ${routeInfo.component} was defined while loading template`);
        routeInfo.loaded = true;
        return;
      }
      
      // Create the component class
      class DynamicPage extends HTMLElement {
        static isPageComponent = true;
        
        constructor() {
          super();
          this.attachShadow({ mode: "open" });
          this.pageProps = {}; // Will be set when component is created
          this._mounted = false;
        }

        connectedCallback() {
          // Prevent duplicate rendering if already mounted
          if (this._mounted) {
            console.log(`Component ${routeInfo.component} already mounted, skipping render`);
            return;
          }
          
          // Render the template with props
          const renderedTemplate = renderWithExpressions(templateContent, this.pageProps);
          this.shadowRoot.innerHTML = renderedTemplate;
          
          // Add click handlers for route links
          const links = this.shadowRoot.querySelectorAll('a[route]');
          links.forEach(link => {
            link.addEventListener('click', (event) => {
              event.preventDefault();
              const linkPath = event.target.getAttribute('href');
              window.dispatchEvent(new CustomEvent('navigate', {
                detail: { path: linkPath }
              }));
            });
          });
          
          // Mark as mounted to prevent duplicate renders
          this._mounted = true;
          
          // If the component has an onMount method, call it
          if (typeof this.onMount === 'function') {
            this.onMount();
          }
        }
        
        disconnectedCallback() {
          // Clean up any resources or event listeners
          this._mounted = false;
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
