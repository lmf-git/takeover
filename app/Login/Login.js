import { Component, store, navigate } from '../../core/index.js';
import template from './Login.html?raw';

class LoginPage extends Component {
  static template = template;

  constructor() {
    super();
    Object.assign(this.local, { username: '', email: '', isLoading: false, errors: {}, attempts: 0 });
  }

  mount() {
    this.setMeta({ title: 'Login', description: 'Login to access your dashboard.' });
    this.from = new URLSearchParams(location.search).get('from');
    if (this.from) {
      const info = this.$('#redirect-info');
      const msg = this.$('#redirect-message');
      if (info) info.style.display = 'block';
      if (msg) msg.textContent = `Redirected from ${this.from}. Please login.`;
    }
  }

  bind() {
    this.on('#username', 'input', e => this.updateField('username', e.target.value));
    this.on('#email', 'input', e => this.updateField('email', e.target.value));
    this.on('#custom-login', 'click', () => this.login({ username: this.local.username, email: this.local.email }));
    this.on('#quick-login', 'click', () => this.login());
    this.on('#clear-form', 'click', () => this.clearForm());
  }

  updateField(field, value) {
    this.local[field] = value;
    this.validate();
    this.updateUI();
  }

  validate() {
    const errors = {};
    const { username, email } = this.local;
    if (username && username.length < 2) errors.username = 'Min 2 characters';
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Invalid email';
    this.local.errors = errors;
    this.local.canSubmit = username.length > 0 && !Object.keys(errors).length;
  }

  async login(creds = {}) {
    this.local.isLoading = true;
    this.local.attempts++;
    this.updateUI();

    await new Promise(r => setTimeout(r, 600));
    store.login(creds);
    navigate(this.from || '/dashboard');
  }

  clearForm() {
    Object.assign(this.local, { username: '', email: '', errors: {}, attempts: 0 });
    ['#username', '#email'].forEach(s => { const el = this.$(s); if (el) el.value = ''; });
    this.updateUI();
  }

  updateUI() {
    const { errors, isLoading, canSubmit, attempts } = this.local;
    const btn = this.$('#custom-login');
    const counter = this.$('#attempt-counter');
    const errorBox = this.$('#error-container');

    ['username', 'email'].forEach(f => {
      const el = this.$(`#${f}`);
      if (el) el.style.borderColor = errors[f] ? 'var(--danger-color)' : '';
    });

    if (btn) {
      btn.disabled = isLoading;
      btn.textContent = isLoading ? 'Logging in...' : 'Login';
      btn.style.opacity = canSubmit ? '1' : '0.6';
    }

    if (counter) {
      counter.textContent = `Attempts: ${attempts}`;
      counter.style.display = attempts ? 'block' : 'none';
    }

    if (errorBox) {
      const errs = Object.values(errors);
      errorBox.innerHTML = errs.map(e => `<div class="error">${e}</div>`).join('');
      errorBox.style.display = errs.length ? 'block' : 'none';
    }
  }
}

customElements.define('login-page', LoginPage);
