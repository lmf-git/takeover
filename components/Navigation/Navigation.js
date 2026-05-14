import { Component, define } from '../../core/component.js';

export default class Navigation extends Component {
  static templateUrl = '/components/Navigation/Navigation.html';
  static store = ['locale'];

  mount() {
    window.addEventListener('scroll', () => {
      const nav = this.$('#main-nav');
      if (nav) nav.style.background = window.scrollY > 60 ? 'rgba(10,24,37,0.98)' : 'rgba(10,24,37,0.92)';
    }, { signal: this.signal, passive: true });
  }

  bind() {
    this.on('#contact-cta', 'click', () => this.#scrollToSection('contact'));
    this.delegate('click', '[data-section]', (el, e) => {
      e.preventDefault();
      this.#scrollToSection(el.dataset.section);
    });
  }

  #scrollToSection(id) {
    if (location.pathname !== '/') {
      window.dispatchEvent(new CustomEvent('navigate', { detail: { path: '/' } }));
      setTimeout(() => window.dispatchEvent(new CustomEvent('goto-section', { detail: { id } })), 250);
    } else {
      window.dispatchEvent(new CustomEvent('goto-section', { detail: { id } }));
    }
  }
}

define('app-navigation', Navigation);
