import { Component, define } from '../../core/component.js';

export default class Values extends Component {
  static templateUrl = '../../components/Values/Values.html';
  static store = ['lang']; // Subscribe to lang for dynamic text
}

define('home-values', Values);
