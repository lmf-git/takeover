import { Component, define } from '../../core/component.js';

export default class Footer extends Component {
  static templateUrl = '/components/Footer/Footer.html';
  static store = ['lang'];
}

define('app-footer', Footer);
