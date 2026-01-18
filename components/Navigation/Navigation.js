import { Component, store } from '../../core/index.js';
import template from './Navigation.html?raw';

class Navigation extends Component {
  static template = template;
  static store = ['user', 'isAuthenticated', 'theme'];

  bind() {
    this.on('#auth-btn', 'click', () => {
      store.get('isAuthenticated') ? store.logout() : store.login();
    });

    this.updateAuth();
  }

  updateAuth() {
    const { isAuthenticated, user } = this.state;
    const info = this.$('#user-info');
    const btn = this.$('#auth-btn');

    if (info) info.style.display = isAuthenticated ? 'flex' : 'none';
    if (isAuthenticated && user) {
      const avatar = this.$('#user-avatar');
      const name = this.$('#username');
      if (avatar) avatar.src = user.avatar;
      if (name) name.textContent = user.username;
    }
    if (btn) {
      btn.textContent = isAuthenticated ? 'Logout' : 'Login';
      btn.className = `auth-btn${isAuthenticated ? ' logout' : ''}`;
    }
  }
}

customElements.define('app-navigation', Navigation);
