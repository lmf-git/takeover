import { Component, store, define } from '../../core/component.js';

export default class Navigation extends Component {
  static templateUrl = '/components/Navigation/Navigation.html';
  static store = ['user', 'isAuthenticated', 'theme'];

  bind() {
    this.on('#auth-btn', 'click', () => {
      store.get('isAuthenticated') ? store.logout() : store.login();
    });
  }
}

define('app-navigation', Navigation);
