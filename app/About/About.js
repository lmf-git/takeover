import template from "./About.html?raw";

class AboutPage extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    console.log('AboutPage connected');
    this.shadowRoot.innerHTML = template;
    
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

customElements.define("about-page", AboutPage);

export default "about-page";
