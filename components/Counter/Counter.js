import { Component, store } from '../../core/index.js';
import template from './Counter.html?raw';
import styles from './Counter.module.css?raw';

class Counter extends Component {
  static template = template;
  static styles = styles;
  static store = ['counter'];

  bind() {
    this.on('.increment', 'click', () => store.set({ counter: (store.get('counter') || 0) + 1 }));
    this.on('.decrement', 'click', () => store.set({ counter: Math.max(0, (store.get('counter') || 0) - 1) }));
  }
}

customElements.define('app-counter', Counter);
