import { Component, define, store } from '../../core/component.js';

export default class MobileMenu extends Component {
  static templateUrl = '/components/MobileMenu/MobileMenu.html';

  mount() {
    store.addEventListener('change:mobileMenuOpen', () => {
      const open = store.get('mobileMenuOpen');
      if (open) {
        this.setAttribute('open', '');
        document.body.style.overflow = 'hidden';
      } else {
        this.removeAttribute('open');
        document.body.style.overflow = '';
      }
    }, { signal: this.signal });
  }

  bind() {
    this.on('#close-btn', 'click', () => store.set({ mobileMenuOpen: false }));
    this.on('#overlay', 'click', () => store.set({ mobileMenuOpen: false }));
    this.on('#cta-btn', 'click', () => {
      store.set({ mobileMenuOpen: false });
      window.dispatchEvent(new CustomEvent('navigate', { detail: { path: '/contact' } }));
    });
    // Close menu when a nav link triggers routing
    this.delegate('click', 'a[route]', () => store.set({ mobileMenuOpen: false }));
  }
}

define('mobile-menu', MobileMenu);
