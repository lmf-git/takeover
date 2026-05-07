import { Component, define } from '../../core/component.js';

export default class Logo extends Component {
  static templateUrl = '/components/Logo/Logo.html';
}

define('app-logo', Logo);
