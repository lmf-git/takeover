import { Component, store, define } from '../../core/component.js';

export default class Navigation extends Component {
  static templateUrl = '/components/Navigation/Navigation.html';
  static store = ['lang'];

  setLanguage(e) {
    const lang = e.target.closest('button')?.dataset.lang;
    if (lang) store.setLang(lang);
  }

  mount() {
    window.addEventListener('scroll', () => {
      const nav = this.$('nav');
      if (nav) {
        if (window.scrollY > 60) {
          nav.style.background = 'rgba(10, 24, 37, 0.98)';
        } else {
          nav.style.background = 'rgba(10, 24, 37, 0.92)';
        }
      }
    });
  }
}

define('app-navigation', Navigation);
