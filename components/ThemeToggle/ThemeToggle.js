import { Component, store, define } from '../../core/component.js';

export default class ThemeToggle extends Component {
  static templateUrl = '/components/ThemeToggle/ThemeToggle.html';
  static store = ['theme'];

  bind() {
    this.on('#toggle-btn', 'click', () => store.toggleTheme());
  }
}

define('theme-toggle', ThemeToggle);
