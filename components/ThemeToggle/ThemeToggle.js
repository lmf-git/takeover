import template from "./ThemeToggle.html?raw";
import store, { connect } from "../../lib/context.js";

class ThemeToggle extends connect(HTMLElement) {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    this.shadowRoot.innerHTML = template;
    
    const button = this.shadowRoot.getElementById('toggle-btn');
    const icon = this.shadowRoot.getElementById('icon');
    const label = this.shadowRoot.getElementById('label');
    
    button.addEventListener('click', () => {
      store.toggleTheme();
    });
    
    this.connectStore(['theme'], (state) => {
      const isDark = state.theme === 'dark';
      icon.textContent = isDark ? '☀️' : '🌙';
      label.textContent = isDark ? 'Light' : 'Dark';
    });
  }
}

customElements.define("theme-toggle", ThemeToggle);