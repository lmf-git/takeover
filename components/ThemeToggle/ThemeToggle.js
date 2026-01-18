import { Component, store } from '../../core/index.js';
import template from './ThemeToggle.html?raw';

class ThemeToggle extends Component {
  static template = template;
  static store = ['theme'];

  bind() {
    this.on('#toggle-btn', 'click', () => store.toggleTheme());
  }
}

customElements.define('theme-toggle', ThemeToggle);
