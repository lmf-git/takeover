import { Component } from '../../core/index.js';
import template from './Contact.html?raw';

class ContactPage extends Component {
  static template = template;
  static metadata = { title: 'Contact', description: 'Get in touch with us.' };

  bind() {
    this.on('button', 'click', () => alert('Message sent!'));
  }
}

customElements.define('contact-page', ContactPage);
