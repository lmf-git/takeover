import { Component, define } from '../../core/component.js';

export default class HomeStructure extends Component {
  static templateUrl = '/components/HomeStructure/HomeStructure.html';

  mount() {
    this._handleClick = this._onTreeClick.bind(this);
    this.shadowRoot.addEventListener('click', this._handleClick);
  }

  unmount() {
    this.shadowRoot?.removeEventListener('click', this._handleClick);
  }

  _onTreeClick(e) {
    const row = e.target.closest('.tree-row[data-folder]');
    if (!row) return;
    row.classList.toggle('collapsed');
    this._applyVisibility();
  }

  // Recompute every row's visibility from collapsed ancestors. Rows are in
  // pre-order, so a single pass suffices: anything deeper than the shallowest
  // collapsed folder above it is hidden. Re-deriving (rather than toggling
  // siblings) keeps nested collapse state correct across re-expands.
  _applyVisibility() {
    let hideBelow = Infinity;
    for (const r of this.$$('.tree-row')) {
      const depth = parseInt(r.dataset.depth, 10);
      if (depth <= hideBelow) hideBelow = Infinity;
      r.hidden = depth > hideBelow;
      if (!r.hidden && r.classList.contains('collapsed')) hideBelow = depth;
    }
  }
}

define('home-structure', HomeStructure);
