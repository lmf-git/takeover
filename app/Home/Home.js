import { Component, store } from '../../core/index.js';
import template from './Home.html?raw';

class HomePage extends Component {
  static template = template;
  static store = ['counter', 'theme', 'user', 'isAuthenticated'];
  static metadata = { title: 'Home - Web Components App', description: 'Welcome to our web components application.' };

  bind() {
    this.on('.logout-button', 'click', () => store.logout());
    this.on('.login-button', 'click', () => store.login());
    this.on('.login-admin-button', 'click', () => store.login({ username: 'admin', email: 'admin@test.com' }));
  }
}

customElements.define('home-page', HomePage);
