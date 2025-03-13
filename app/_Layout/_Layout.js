import template from "./_Layout.html?raw";

class Layout extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    this.shadowRoot.innerHTML = template;
  }
}

customElements.define("app-layout", Layout);
