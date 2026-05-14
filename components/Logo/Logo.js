import { Component, define } from '../../core/component.js';

export default class Logo extends Component {
  static templateUrl = '/components/Logo/Logo.html';

  mount() {
    if (!this.hasAttribute('animated')) return;

    const begins = [0, 0.08, 0.04, 0.12, 0.20, 0.28, 0.34];
    const colorIds = ['c0a','c0b','c1a','c1b','c2a','c2b','c3a','c3b','c4a','c4b','c5a','c5b','c6a','c6b'];

    requestAnimationFrame(() => {
      begins.forEach((delay, i) => {
        ['op','tx','rx'].forEach(type => {
          const el = this.$(`#a${i}${type}`);
          if (el) el.beginElementAt(delay);
        });
      });
      colorIds.forEach(id => {
        const el = this.$(`#${id}`);
        if (el) el.beginElementAt(1);
      });
    });
  }
}

define('app-logo', Logo);
