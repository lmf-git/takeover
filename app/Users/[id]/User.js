import { Component } from '../../../core/index.js';
import template from './User.html?raw';

class UserPage extends Component {
  static template = template;
  static store = ['user', 'isAuthenticated'];

  mount() {
    const id = this.pageProps?.params?.id || 'Unknown';
    this.setMeta({ title: `User ${id}`, description: `Profile for user ${id}.` });
  }
}

customElements.define('user-page', UserPage);
