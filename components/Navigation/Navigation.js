import { Component, store } from '../../core/index.js';
import template from './Navigation.html?raw';

class Navigation extends Component {
  static template = template;
  static store = ['user', 'isAuthenticated', 'theme'];

  bind() {
    this.on('#auth-btn', 'click', () => {
      store.get('isAuthenticated') ? store.logout() : store.login();
    });
  }
}

customElements.define('app-navigation', Navigation);
