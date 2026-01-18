import { Component } from '../../core/index.js';
import template from './NotFound.html?raw';

class NotFoundPage extends Component {
  static template = template;

  mount() {
    this.setMeta({ title: '404 - Not Found', description: 'Page not found.' });
  }
}

customElements.define('not-found-page', NotFoundPage);
