import { Component, define } from '../../core/component.js';
import { validateAll } from '../../lib/validate.js';

const schema = {
  name: { required: true, min: 2 },
  email: { required: true, email: true },
  message: { required: true, min: 10 }
};

export default class ContactPage extends Component {
  static templateUrl = '/app/Contact/Contact.html';
  static store = ['counter'];
  static metadata = { title: 'Contact', description: 'Get in touch with us.' };
  static ssrProps = { title: 'Contact Us', isLoading: false, sent: false };
  static local = { errors: {}, isLoading: false, sent: false };
  static reactive = false; // Don't auto-update, we'll handle it manually

  get props() {
    const { errors, isLoading, sent } = this.local;
    return { ...super.props, title: 'Contact Us', timestamp: new Date().toLocaleString(), isLoading, sent, errors };
  }

  bind() {
    this.on('button', 'click', () => this.submit());
  }

  showErrors(errors) {
    // Update error messages and styles without full re-render
    ['name', 'email', 'message'].forEach(field => {
      const input = this.$(`#${field}`);
      const errorEl = this.$(`.error-${field}`);
      if (input) input.classList.toggle('input-error', !!errors[field]);
      if (errorEl) {
        errorEl.textContent = errors[field] || '';
        errorEl.style.display = errors[field] ? 'block' : 'none';
      }
    });
  }

  async submit() {
    const data = {
      name: this.$('#name')?.value || '',
      email: this.$('#email')?.value || '',
      message: this.$('#message')?.value || ''
    };

    const { valid, errors } = validateAll(data, schema);
    this.showErrors(errors);
    if (!valid) return;

    // Show loading state
    const btn = this.$('button');
    btn.disabled = true;
    btn.textContent = 'Sending...';

    await new Promise(r => setTimeout(r, 800));

    // Show success and clear form
    this.$('#name').value = '';
    this.$('#email').value = '';
    this.$('#message').value = '';
    this.showErrors({});
    btn.disabled = false;
    btn.textContent = 'Send Message';

    // Show success message
    const successEl = this.$('.success-message');
    if (successEl) successEl.style.display = 'block';
  }
}

define('contact-page', ContactPage);
