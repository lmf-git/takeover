import { Component, store, define } from '../../core/component.js';

export default class Counter extends Component {
  static templateUrl = '/components/Counter/Counter.html';
  static store = ['counter'];

  bind() {
    this.on('.increment', 'click', () => store.update('counter', c => c + 1));
    this.on('.decrement', 'click', () => store.update('counter', c => Math.max(0, c - 1)));
  }
}

define('app-counter', Counter);
