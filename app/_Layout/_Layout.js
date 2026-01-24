import { Component, define } from '../../core/component.js';

export default class Layout extends Component {
  static templateUrl = '/app/_Layout/_Layout.html';

  get props() {
    return { ...super.props, year: new Date().getFullYear() };
  }
}

define('app-layout', Layout);
