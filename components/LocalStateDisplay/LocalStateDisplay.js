import { Component, define } from '../../core/component.js';

export default class LocalStateDisplay extends Component {
  static templateUrl = '/components/LocalStateDisplay/LocalStateDisplay.html';
  static local = { count: 0, message: '', cardClass: '' };

  #pendingProps = {};

  // Props can be set before component is connected - store them for later
  set count(val) {
    if (this.shadowRoot) this.local.count = val;
    else this.#pendingProps.count = val;
  }

  set message(val) {
    if (this.shadowRoot) this.local.message = val;
    else this.#pendingProps.message = val;
  }

  set cardClass(val) {
    if (this.shadowRoot) this.local.cardClass = val;
    else this.#pendingProps.cardClass = val;
  }

  mount() {
    // Apply any props that were set before component was connected
    this.batch(() => {
      if (this.#pendingProps.count !== undefined) this.local.count = this.#pendingProps.count;
      if (this.#pendingProps.message !== undefined) this.local.message = this.#pendingProps.message;
      if (this.#pendingProps.cardClass !== undefined) this.local.cardClass = this.#pendingProps.cardClass;
    });
  }

  // Emit events to parent to update its state
  increment() {
    this.emit('update-count', { delta: 1 });
  }

  decrement() {
    this.emit('update-count', { delta: -1 });
  }
}

define('local-state-display', LocalStateDisplay);
