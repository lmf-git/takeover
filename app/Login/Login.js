import template from "./Login.html?raw";
import store from "../../lib/context.js";

class LoginPage extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    
    // Create reactive local state using Proxy (useEffect equivalent)
    this.state = this.createReactiveState({
      username: '',
      email: '',
      isLoading: false,
      errors: {},
      loginAttempts: 0,
      canSubmit: false
    });
  }

  createReactiveState(initialState) {
    return new Proxy(initialState, {
      set: (target, prop, value) => {
        const oldValue = target[prop];
        target[prop] = value;
        
        // React to specific state changes (like useEffect with dependencies)
        this.handleStateChange(prop, value, oldValue);
        
        return true;
      }
    });
  }

  handleStateChange(prop, newValue, oldValue) {
    // Different effects for different state changes
    switch (prop) {
      case 'username':
      case 'email':
        this.validateForm();
        this.updateInputStyles();
        break;
        
      case 'isLoading':
        this.updateLoadingState(newValue);
        break;
        
      case 'errors':
        this.displayErrors();
        break;
        
      case 'loginAttempts':
        this.updateAttemptCounter(newValue);
        break;
        
      case 'canSubmit':
        this.updateSubmitButton(newValue);
        break;
    }
  }

  connectedCallback() {
    console.log('LoginPage connected');
    this.shadowRoot.innerHTML = template;
    
    // Show redirect info if redirected from protected page
    const urlParams = new URLSearchParams(window.location.search);
    const from = urlParams.get('from');
    if (from) {
      const redirectInfo = this.shadowRoot.getElementById('redirect-info');
      const redirectMessage = this.shadowRoot.getElementById('redirect-message');
      redirectInfo.style.display = 'block';
      redirectMessage.textContent = `You were redirected from ${from}. Please login to continue.`;
    }
    
    this.setupEventListeners(from);
    this.validateForm(); // Initial validation
  }
  
  setupEventListeners(from) {
    const customLoginBtn = this.shadowRoot.getElementById('custom-login');
    const quickLoginBtn = this.shadowRoot.getElementById('quick-login');
    const clearBtn = this.shadowRoot.getElementById('clear-form');
    const usernameInput = this.shadowRoot.getElementById('username');
    const emailInput = this.shadowRoot.getElementById('email');
    
    // Reactive input handlers (update local state)
    usernameInput.addEventListener('input', (e) => {
      this.state.username = e.target.value;
    });
    
    emailInput.addEventListener('input', (e) => {
      this.state.email = e.target.value;
    });
    
    // Clear form programmatically
    clearBtn.addEventListener('click', () => {
      this.clearForm();
    });
    
    customLoginBtn.addEventListener('click', () => {
      this.handleLogin(from, { 
        username: this.state.username || undefined, 
        email: this.state.email || undefined 
      });
    });
    
    quickLoginBtn.addEventListener('click', () => {
      this.handleLogin(from);
    });
    
    // Handle form submission on Enter
    [usernameInput, emailInput].forEach(input => {
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && this.state.canSubmit) {
          customLoginBtn.click();
        }
      });
    });
  }
  
  async handleLogin(from, credentials = {}) {
    this.state.isLoading = true;
    this.state.loginAttempts++;
    
    try {
      // Simulate async login
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      store.login(credentials);
      this.redirectAfterLogin(from);
    } catch (error) {
      this.state.errors = { general: 'Login failed. Please try again.' };
    } finally {
      this.state.isLoading = false;
    }
  }
  
  validateForm() {
    const errors = {};
    
    if (this.state.username && this.state.username.length < 2) {
      errors.username = 'Username must be at least 2 characters';
    }
    
    if (this.state.email && !this.isValidEmail(this.state.email)) {
      errors.email = 'Please enter a valid email';
    }
    
    this.state.errors = errors;
    this.state.canSubmit = this.state.username.length > 0 && Object.keys(errors).length === 0;
  }
  
  isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }
  
  clearForm() {
    // Programmatic clearing - will trigger reactive updates
    this.state.username = '';
    this.state.email = '';
    this.state.errors = {};
    this.state.loginAttempts = 0;
    
    // Clear actual input values
    const usernameInput = this.shadowRoot.getElementById('username');
    const emailInput = this.shadowRoot.getElementById('email');
    usernameInput.value = '';
    emailInput.value = '';
  }
  
  updateInputStyles() {
    const usernameInput = this.shadowRoot.getElementById('username');
    const emailInput = this.shadowRoot.getElementById('email');
    
    // Update styles based on validation
    usernameInput.style.borderColor = this.state.errors.username ? 'var(--danger-color)' : 'var(--border-color)';
    emailInput.style.borderColor = this.state.errors.email ? 'var(--danger-color)' : 'var(--border-color)';
  }
  
  updateLoadingState(isLoading) {
    const customLoginBtn = this.shadowRoot.getElementById('custom-login');
    const quickLoginBtn = this.shadowRoot.getElementById('quick-login');
    
    [customLoginBtn, quickLoginBtn].forEach(btn => {
      btn.disabled = isLoading;
      btn.style.opacity = isLoading ? '0.6' : '1';
      btn.style.cursor = isLoading ? 'not-allowed' : 'pointer';
    });
    
    if (isLoading) {
      customLoginBtn.textContent = 'Logging in...';
    } else {
      customLoginBtn.textContent = 'Login with Custom Info';
    }
  }
  
  displayErrors() {
    const errorContainer = this.shadowRoot.getElementById('error-container');
    const errors = Object.values(this.state.errors);
    
    if (errors.length > 0) {
      errorContainer.innerHTML = errors.map(err => `<div class="error">${err}</div>`).join('');
      errorContainer.style.display = 'block';
    } else {
      errorContainer.style.display = 'none';
    }
  }
  
  updateAttemptCounter(attempts) {
    const counter = this.shadowRoot.getElementById('attempt-counter');
    counter.textContent = `Login attempts: ${attempts}`;
    counter.style.display = attempts > 0 ? 'block' : 'none';
  }
  
  updateSubmitButton(canSubmit) {
    const customLoginBtn = this.shadowRoot.getElementById('custom-login');
    customLoginBtn.style.backgroundColor = canSubmit ? 'var(--primary-color)' : 'var(--text-secondary)';
  }
  
  redirectAfterLogin(from) {
    const redirectTo = from || '/dashboard';
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('navigate', {
        detail: { path: redirectTo }
      }));
    }, 100);
  }
}

customElements.define("login-page", LoginPage);

export default "login-page";