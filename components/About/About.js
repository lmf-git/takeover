import { Component, define } from '../../core/component.js';

export default class About extends Component {
  static templateUrl = '../../components/About/About.html';
  static store = ['lang']; // Subscribe to lang for dynamic text
}

define('home-about', About);
