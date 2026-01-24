import { Component, define } from '../../core/component.js';

export default class ContactPage extends Component {
  static templateUrl = '/app/Contact/Contact.html';
  static store = ['counter'];
  static metadata = { title: 'Contact', description: 'Get in touch with us.' };
  static ssrProps = { title: 'Contact Us' };

  get props() {
    return { ...super.props, title: 'Contact Us', timestamp: new Date().toLocaleString() };
  }

  bind() {
    this.on('button', 'click', () => alert('Message sent!'));
  }
}

define('contact-page', ContactPage);
