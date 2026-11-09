import { Component, define } from '../../core/component.js';

export default class HomeStructure extends Component {
  static templateUrl = '/components/HomeStructure/HomeStructure.html';

  // bind() runs after every render, and delegate() ties the listener to that
  // render — so a re-render (a locale switch) replaces it instead of stacking a
  // second one on the shadow root, which made each click toggle twice.
  bind() {
    this.delegate('click', '.tree-row[data-folder]', row => {
      row.classList.toggle('collapsed');
      this._applyVisibility();
    });
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
