import { Component } from '../../core/index.js';
import template from './_Layout.html?raw';

class Layout extends Component {
  static template = template;

  get props() {
    return { ...super.props, year: new Date().getFullYear() };
  }
}

customElements.define('app-layout', Layout);
