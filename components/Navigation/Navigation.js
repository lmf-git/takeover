import { Component, define } from '../../core/component.js';
import { setLocale } from '../../lib/i18n.js';

export default class Navigation extends Component {
  static templateUrl = '/components/Navigation/Navigation.html';
  static store = ['locale'];

  mount() {
    this.#syncTheme();
    this.on('#theme-toggle', 'click', () => this.#toggleTheme());
    this.on('#lang-en', 'click', () => setLocale('en'));
    this.on('#lang-es', 'click', () => setLocale('es'));
    this.on('#lang-fr', 'click', () => setLocale('fr'));
  }

  #syncTheme() {
    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    const sun = this.$('#icon-sun');
    const moon = this.$('#icon-moon');
    if (sun) sun.style.display = isDark ? 'block' : 'none';
    if (moon) moon.style.display = isDark ? 'none' : 'block';
  }

  #toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    this.#syncTheme();
  }
}

define('app-navigation', Navigation);
