import { Component, define } from '../../core/component.js';

export default class Logo extends Component {
  static templateUrl = '/components/Logo/Logo.html';

  mount() {
    if (!this.hasAttribute('animated')) return;
    const delays = [0, 0.45, 0.9, 1.35];
    requestAnimationFrame(() => {
      this.$$('animate').forEach((el, i) => el.beginElementAt(delays[i]));
    });
  }
}

define('app-logo', Logo);
