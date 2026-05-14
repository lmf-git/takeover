import { Component, define, store } from '../../core/component.js';

export default class MenuToggle extends Component {
  static templateUrl = '/components/MenuToggle/MenuToggle.html';

  mount() {
    store.addEventListener('change:mobileMenuOpen', () => {
      const open = !!store.get('mobileMenuOpen');
      if (open) this.setAttribute('open', '');
      else this.removeAttribute('open');
      this.$('#toggle-btn')?.setAttribute('aria-expanded', String(open));
    }, { signal: this.signal });
  }

  bind() {
    this.on('#toggle-btn', 'click', () => {
      store.set({ mobileMenuOpen: !store.get('mobileMenuOpen') });
    });
  }
}

define('app-menu-toggle', MenuToggle);
