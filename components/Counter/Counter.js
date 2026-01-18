import { Component, store, define } from '../../core/index.js';

export default class Counter extends Component {
  static templateUrl = '/components/Counter/Counter.html';
  static store = ['counter'];

  bind() {
    this.on('.increment', 'click', () => store.set({ counter: (store.get('counter') || 0) + 1 }));
    this.on('.decrement', 'click', () => store.set({ counter: Math.max(0, (store.get('counter') || 0) - 1) }));
  }
}

define('app-counter', Counter);
