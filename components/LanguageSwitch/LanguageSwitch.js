import { Component, define } from '../../core/component.js';
import { setLocale } from '../../lib/i18n.js';

export default class LanguageSwitch extends Component {
  static templateUrl = '/components/LanguageSwitch/LanguageSwitch.html';
  static store = ['locale'];

  update() {
    super.update();
    // Keep select value in sync after each render
    const sel = this.$('#lang-select');
    if (sel) sel.value = this.state.locale || 'en';
  }

  bind() {
    this.on('#lang-select', 'change', e => setLocale(e.target.value));
  }
}

define('language-switch', LanguageSwitch);
