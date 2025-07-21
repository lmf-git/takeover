import template from "./Home.html?raw";
import store, { connect } from "../../lib/context.js";
import { renderWithExpressions } from "../../lib/template.js";

class HomePage extends connect(HTMLElement) {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    console.log('HomePage connected');
    this.render();
    this.setupEventListeners();
    
    // Connect to global store for reactive updates
    this.connectStore(['counter', 'theme', 'user', 'isAuthenticated'], (state) => {
      this.render(); // Re-render when global state changes
    });
  }
  
  render() {
    // Get current global state
    const globalState = store.get();
    
    // Render with current page props and global state
    this.shadowRoot.innerHTML = renderWithExpressions(template, {
      ...this.pageProps,
      ...globalState
    });
    
    // Re-attach event listeners after render
    this.setupEventListeners();
  }
  
  setupEventListeners() {
    // Handle navigation links
    const links = this.shadowRoot.querySelectorAll('a[route]');
    links.forEach(link => {
      link.addEventListener('click', this.linkClick);
    });
  }
  
  linkClick(event) {
    event.preventDefault();
    const path = this.getAttribute('href');
    console.log(`Page link: ${path}`);
    
    window.dispatchEvent(new CustomEvent('navigate', {
      detail: { path }
    }));
  }
}

customElements.define("home-page", HomePage);

export default "home-page";
