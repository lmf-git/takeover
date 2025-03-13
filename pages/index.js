// Auto-discover page components from HTML files in the app directory
const htmlFiles = import.meta.glob('../app/**/*.html', { as: 'raw', eager: true });
const routes = {};

// Create a component factory to generate web components from HTML templates
function createComponentFromTemplate(templateContent, name) {
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

// Process HTML files and create routes
Object.entries(htmlFiles).forEach(([path, content]) => {
  // Extract route path from file path
  // Format: ../app/SomePage/SomePage.html -> /some-page
  const match = path.match(/\.\.\/app\/(.+?)\/\1\.html$/i);
  
  if (match) {
    const componentName = match[1].toLowerCase() + '-page';
    const routePath = '/' + (match[1] === 'Home' ? '' : match[1].toLowerCase());
    
    // Create and register the component
    const component = createComponentFromTemplate(content, componentName);
    
    // Register the route
    routes[routePath] = component;
    console.log(`Auto-registered route: ${routePath} -> ${component}`);
  }
});

// Add default/fallback route
if (!routes['*'] && routes['/']) {
  routes['*'] = routes['/'];
}

export default { routes };
