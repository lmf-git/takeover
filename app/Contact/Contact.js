import { Component, define } from '../../core/index.js';

export default class ContactPage extends Component {
  static templateUrl = '/app/Contact/Contact.html';
  static metadata = { title: 'Contact', description: 'Get in touch with us.' };

  bind() {
    this.on('button', 'click', () => alert('Message sent!'));
  }
}

define('contact-page', ContactPage);
