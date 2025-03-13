import template from "./Navigation.html?raw";

class Navigation extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    this.shadowRoot.innerHTML = template;
    
    // Add click event listeners
    const links = this.shadowRoot.querySelectorAll('a[route]');
    links.forEach(link => {
      link.addEventListener('click', this.linkClick);
    });
  }
  
  // Renamed from handleNavLinkClick to linkClick
  linkClick(event) {
    event.preventDefault();
    const path = this.getAttribute('href');
    console.log(`Nav link: ${path}`);
    
    // Dispatch with simplified event name
    window.dispatchEvent(new CustomEvent('navigate', {
      detail: { path }
    }));
  }
}

customElements.define("app-navigation", Navigation);
