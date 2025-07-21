import template from "./Navigation.html?raw";
import store, { connect } from "../../lib/context.js";

class Navigation extends connect(HTMLElement) {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    this.shadowRoot.innerHTML = template;
    
    // Add click event listeners for navigation
    const links = this.shadowRoot.querySelectorAll('a[route]');
    links.forEach(link => {
      link.addEventListener('click', this.linkClick);
    });
    
    // Auth button functionality
    const authBtn = this.shadowRoot.getElementById('auth-btn');
    authBtn.addEventListener('click', this.handleAuth.bind(this));
    
    // Connect to store for auth and theme updates
    this.connectStore(['user', 'isAuthenticated', 'theme'], this.updateAuthUI.bind(this));
  }
  
  linkClick(event) {
    event.preventDefault();
    const path = event.target.getAttribute('href');
    
    window.dispatchEvent(new CustomEvent('navigate', {
      detail: { path }
    }));
  }
  
  handleAuth() {
    const { isAuthenticated } = store.get();
    
    if (isAuthenticated) {
      store.logout();
    } else {
      const username = prompt('Enter username (optional):') || undefined;
      const email = prompt('Enter email (optional):') || undefined;
      store.login({ username, email });
    }
  }
  
  updateAuthUI(state) {
    const userInfo = this.shadowRoot.getElementById('user-info');
    const userAvatar = this.shadowRoot.getElementById('user-avatar');
    const username = this.shadowRoot.getElementById('username');
    const authBtn = this.shadowRoot.getElementById('auth-btn');
    
    if (state.isAuthenticated && state.user) {
      userInfo.style.display = 'flex';
      userAvatar.src = state.user.avatar;
      username.textContent = state.user.username;
      authBtn.textContent = 'Logout';
      authBtn.className = 'auth-btn logout';
    } else {
      userInfo.style.display = 'none';
      authBtn.textContent = 'Login';
      authBtn.className = 'auth-btn';
    }
  }
}

customElements.define("app-navigation", Navigation);
