import { Component, store } from '../../core/index.js';
import template from './ThemeToggle.html?raw';

class ThemeToggle extends Component {
  static template = template;
  static store = ['theme'];

  bind() {
    this.on('#toggle-btn', 'click', () => store.toggleTheme());

    const isDark = this.state.theme === 'dark';
    const icon = this.$('#icon');
    const label = this.$('#label');
    if (icon) icon.textContent = isDark ? '☀️' : '🌙';
    if (label) label.textContent = isDark ? 'Light' : 'Dark';
  }
}

customElements.define('theme-toggle', ThemeToggle);
