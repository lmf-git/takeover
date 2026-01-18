import { Component, store, navigate, define } from '../../core/index.js';

export default class LoginPage extends Component {
  static templateUrl = '/app/Login/Login.html';
  static metadata = { title: 'Login', description: 'Login to access your dashboard.' };

  constructor() {
    super();
    Object.assign(this.local, { username: '', email: '', isLoading: false, errors: {}, attempts: 0 });
  }

  onLocalChange() {
    this.update();
  }

  get props() {
    const { username, email, errors, isLoading, attempts } = this.local;
    const errorMessages = Object.values(errors);
    return {
      ...super.props,
      isLoading,
      attempts,
      hasErrors: errorMessages.length > 0,
      errorMessages,
      canSubmit: username.length > 0 && errorMessages.length === 0,
      redirectFrom: typeof location !== 'undefined' ? new URLSearchParams(location.search).get('from') : null
    };
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
  }

  validate() {
    const errors = {};
    const { username, email } = this.local;
    if (username && username.length < 2) errors.username = 'Min 2 characters';
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Invalid email';
    this.local.errors = errors;
  }

  async login(creds = {}) {
    this.local.isLoading = true;
    this.local.attempts++;

    await new Promise(r => setTimeout(r, 600));
    store.login(creds);
    navigate(this.props.redirectFrom || '/dashboard');
  }

  clearForm() {
    Object.assign(this.local, { username: '', email: '', errors: {}, attempts: 0 });
  }
}

define('login-page', LoginPage);
