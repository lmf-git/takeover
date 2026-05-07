import { Component, define } from '../../core/component.js';

export default class Hero extends Component {
  static templateUrl = '../../components/Hero/Hero.html';
  static store = ['lang']; // Subscribe to lang for dynamic text
}

define('home-hero', Hero);
