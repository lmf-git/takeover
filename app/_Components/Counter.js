import template from './Counter.html?raw';
import store, { connect } from '../../context.js';

class Counter extends connect(HTMLElement) {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this.shadowRoot.innerHTML = template;
    
    // Connect to store and listen for counter changes
    this.connectStore(['counter'], this.updateCounter.bind(this));
    
    // Initial render
    this.updateCounter(store.get());
    
    // Add event listeners
    this.shadowRoot.querySelector('.increment').addEventListener('click', () => {
      const currentValue = store.get('counter') || 0;
      store.set({ counter: currentValue + 1 });
    });
    
    this.shadowRoot.querySelector('.decrement').addEventListener('click', () => {
      const currentValue = store.get('counter') || 0;
      store.set({ counter: Math.max(0, currentValue - 1) });
    });
  }
  
  updateCounter(state) {
    const valueEl = this.shadowRoot.querySelector('#value');
    if (valueEl) {
      valueEl.textContent = state.counter;
    }
  }
}

customElements.define('app-counter', Counter);
