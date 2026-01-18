import { Component, define } from '../../../core/index.js';

export default class UserPage extends Component {
  static templateUrl = '/app/Users/[id]/User.html';
  static store = ['user', 'isAuthenticated'];

  mount() {
    const id = this.pageProps?.params?.id || 'Unknown';
    this.setMeta({ title: `User ${id}`, description: `Profile for user ${id}.` });
  }
}

define('user-page', UserPage);
