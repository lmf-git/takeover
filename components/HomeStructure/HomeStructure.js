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

    const depth = parseInt(row.dataset.depth, 10);
    const collapsed = row.classList.toggle('collapsed');

    let sibling = row.nextElementSibling;
    while (sibling) {
      const sibDepth = parseInt(sibling.dataset.depth, 10);
      if (sibDepth <= depth) break;
      if (collapsed) {
        sibling.hidden = true;
      } else if (sibDepth === depth + 1) {
        sibling.hidden = false;
      }
      sibling = sibling.nextElementSibling;
    }
  }
}

define('home-structure', HomeStructure);
