import { Component, store, navigate, define } from '../../core/component.js';
import { validateAll } from '../../lib/validate.js';
import { getQueryParam } from '../../lib/nav.js';

const schema = { username: { min: 2 }, email: { email: true } };

export default class LoginPage extends Component {
  static templateUrl = '/app/Login/Login.html';
  static metadata = { title: 'Login', description: 'Login to access your dashboard.' };
  static ssrProps = { username: '', email: '', isLoading: false, hasErrors: false, errorMessages: [], canSubmit: false, attempts: 0 };
  static local = { username: '', email: '', isLoading: false, errors: {}, attempts: 0 };

  get props() {
    const { username, errors, isLoading, attempts } = this.local;
    const errorMessages = Object.values(errors);
    const redirectFrom = this.pageProps?.query?.from || getQueryParam('from');
    return { ...super.props, isLoading, attempts, hasErrors: errorMessages.length > 0, errorMessages, canSubmit: username.length > 0 && !errorMessages.length, redirectFrom };
  }

  bind() {
    // Combined handler: update value + validate in one render cycle
    this.on('#username', 'input', e => this.updateField('username', e.target.value));
    this.on('#email', 'input', e => this.updateField('email', e.target.value));
    this.on('#custom-login', 'click', () => this.login({ username: this.local.username, email: this.local.email }));
    this.on('#quick-login', 'click', () => this.login());
    this.on('#clear-form', 'click', () => this.batch(() => Object.assign(this.local, { username: '', email: '', errors: {}, attempts: 0 })));
  }

  updateField(field, value) {
    // Batch updates to trigger only one re-render
    this.batch(() => {
      this.local[field] = value;
      const { errors } = validateAll(this.local, schema);
      this.local.errors = errors;
    });
  }

  async login(creds = {}) {
    this.local.attempts++;
    await this.withLoading(async () => {
      await new Promise(r => setTimeout(r, 600));
      store.login(creds);
      navigate(this.props.redirectFrom || '/dashboard');
    });
  }
}

define('login-page', LoginPage);
