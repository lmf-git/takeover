import template from "./Router.html?raw";
import store from "../../context.js";
import { renderWithExpressions } from "../../template.js";

class Router extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.routes = new Map();
    this.currentPath = null;
    this.isNavigating = false;
  }

  connectedCallback() {
    this.shadowRoot.innerHTML = template;
    this.container = this.shadowRoot.querySelector('#outlet');
    if (!this.container) return console.error('Router outlet not found');
    
    // Event listeners
    window.addEventListener('popstate', () => this.route());
    window.addEventListener('navigate', (e) => this.navigate(e.detail.path));
    document.addEventListener('click', this.handleLinkClick.bind(this));
    
    // Initialize routes and handle initial URL
    this.discoverRoutes();
    this.route();
  }

  handleLinkClick(e) {
    const anchor = e.composedPath().find(el => 
      el.tagName === 'A' && el.hasAttribute && el.hasAttribute('route'));
    
    if (anchor) {
      e.preventDefault();
      this.navigate(anchor.getAttribute('href'));
    }
  }

  discoverRoutes() {
    // Get page modules without loading them yet
    const pageModules = import.meta.glob('../../app/**/*.html', { query: '?raw', import: 'default' });
    
    // Register routes based on file paths
    Object.keys(pageModules).forEach(path => {
      if (path.includes('/_')) return; // Skip utility folders
      
      const match = path.match(/\.\.\/\.\.\/app\/(.+?)\/\1\.html$/i);
      if (match) {
        const pageName = match[1];
        const componentName = pageName.toLowerCase() + '-page';
        const routePath = '/' + (pageName === 'Home' ? '' : pageName.toLowerCase());
        
        this.registerRoute(routePath, {
          component: componentName,
          loader: pageModules[path],
          loaded: false
        });
      }
    });
    
    // Set fallback route
    if (!this.routes.has('*') && this.routes.has('/')) {
      this.routes.set('*', this.routes.get('/'));
    }
  }

  registerRoute(path, routeInfo) {
    this.routes.set(path, routeInfo);
  }

  navigate(path) {
    if (this.currentPath === path) return;
    history.pushState(null, null, path);
    this.route();
  }

  async route() {
    // Prevent concurrent routing
    if (this.isNavigating) {
      return setTimeout(() => this.route(), 50);
    }
    
    this.isNavigating = true;
    const path = window.location.pathname;
    
    try {
      store.set({ lastRoute: path });
      if (this.currentPath === path) return;
      
      this.currentPath = path;
      const routeInfo = this.routes.get(path) || this.routes.get('*');
      
      if (routeInfo) {
        this.container.innerHTML = '';
        
        if (!routeInfo.loaded) {
          await this.loadComponent(routeInfo);
        }
        
        const pageProps = {
          path,
          title: path === '/' ? 'Home Page' : 
            path.substring(1).charAt(0).toUpperCase() + path.substring(2) + ' Page',
          timestamp: new Date().toLocaleString(),
          ...store.get()
        };
        
        const component = document.createElement(routeInfo.component);
        component.pageProps = pageProps;
        
        requestAnimationFrame(() => {
          this.container.appendChild(component);
        });
      }
    } finally {
      this.isNavigating = false;
    }
  }
  
  async loadComponent(routeInfo) {
    if (customElements.get(routeInfo.component)) {
      routeInfo.loaded = true;
      return;
    }
    
    const templateContent = await routeInfo.loader();
    
    // Double-check to prevent race conditions
    if (customElements.get(routeInfo.component)) {
      routeInfo.loaded = true;
      return;
    }
    
    class DynamicPage extends HTMLElement {
      constructor() {
        super();
        this.attachShadow({ mode: "open" });
        this.pageProps = {};
        this._mounted = false;
      }

      connectedCallback() {
        if (this._mounted) return;
        
        this.shadowRoot.innerHTML = renderWithExpressions(templateContent, this.pageProps);
        
        this.shadowRoot.querySelectorAll('a[route]').forEach(link => {
          link.addEventListener('click', (event) => {
            event.preventDefault();
            window.dispatchEvent(new CustomEvent('navigate', {
              detail: { path: event.target.getAttribute('href') }
            }));
          });
        });
        
        this._mounted = true;
        if (typeof this.onMount === 'function') this.onMount();
      }
      
      disconnectedCallback() {
        this._mounted = false;
      }
    }
    
    customElements.define(routeInfo.component, DynamicPage);
    routeInfo.loaded = true;
  }
}

customElements.define("app-router", Router);
