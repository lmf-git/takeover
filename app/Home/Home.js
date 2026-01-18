import { Component, store, define } from '../../core/index.js';

export default class HomePage extends Component {
  static templateUrl = '/app/Home/Home.html';
  static store = ['counter', 'theme', 'user', 'isAuthenticated'];
  static metadata = { title: 'Home - Web Components App', description: 'Welcome to our web components application.' };
  static ssrProps = { title: 'Welcome Home' };

  get props() {
    return { ...super.props, title: 'Welcome Home', timestamp: new Date().toLocaleString() };
  }

  bind() {
    this.on('.logout-button', 'click', () => store.logout());
    this.on('.login-button', 'click', () => store.login());
    this.on('.login-admin-button', 'click', () => store.login({ username: 'admin', email: 'admin@test.com' }));
  }
}

define('home-page', HomePage);
