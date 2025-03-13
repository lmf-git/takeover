import template from "./Router.html?raw";

class Router extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.routes = new Map();
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
    
    // Auto-register routes directly from app folder
    this.registerAppPages();
  }

  async registerAppPages() {
    try {
      // Auto-discover page components from HTML files in the app directory
      const htmlFiles = import.meta.glob('../../app/**/*.html', { as: 'raw', eager: true });
      
      // Process HTML files and create routes
      Object.entries(htmlFiles).forEach(([path, content]) => {
        // Skip files in _Layout or any folder starting with underscore
        if (path.includes('/_')) {
          console.log(`Skipping layout file: ${path}`);
          return;
        }
        
        // Extract route path from file path
        // Format: ../../app/SomePage/SomePage.html -> /some-page
        const match = path.match(/\.\.\/\.\.\/app\/(.+?)\/\1\.html$/i);
        
        if (match) {
          const pageName = match[1];
          const componentName = pageName.toLowerCase() + '-page';
          const routePath = '/' + (pageName === 'Home' ? '' : pageName.toLowerCase());
          
          // Create and register the component
          const component = this.createComponentFromTemplate(content, componentName);
          
          // Register the route
          this.registerRoute(routePath, component);
        }
      });
      
      // Add default/fallback route
      if (!this.routes.has('*') && this.routes.has('/')) {
        this.routes.set('*', this.routes.get('/'));
      }
      
      // Initial routing
      this.route();
      
    } catch (error) {
      console.error('Failed to load pages:', error);
    }
  }
  
  createComponentFromTemplate(templateContent, name) {
    // Skip if already defined
    if (customElements.get(name)) {
      return name;
    }
    
    // Create component class from HTML template
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
    
    customElements.define(name, DynamicPage);
    return name;
  }

  registerRoute(path, component) {
    console.log(`Route registered: ${path} -> ${component}`);
    this.routes.set(path, component);
  }

  navigate(path) {
    console.log(`Navigate to: ${path}`);
    history.pushState(null, null, path);
    this.route();
  }

  route() {
    const path = window.location.pathname;
    console.log(`Routing: ${path}`);
    
    const route = this.routes.get(path) || this.routes.get('*');
    
    console.log(`Match: ${route}`);
    
    if (route) {
      this.container.innerHTML = '';
      
      try {
        const component = document.createElement(route);
        this.container.appendChild(component);
        console.log(`Component ${route} mounted`);
      } catch (error) {
        console.error(`Failed to create ${route}:`, error);
      }
    } else {
      console.warn(`No route for: ${path}`);
    }
  }
}

customElements.define("app-router", Router);
