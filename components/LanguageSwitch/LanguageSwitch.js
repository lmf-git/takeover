import { Component, define } from '../../core/component.js';
import { setLocale } from '../../lib/i18n.js';

export default class LanguageSwitch extends Component {
  static templateUrl = '/components/LanguageSwitch/LanguageSwitch.html';
  static store = ['locale', 'messages'];

  switchEs() { setLocale('es'); }
  switchEn() { setLocale('en'); }
}

define('language-switch', LanguageSwitch);
