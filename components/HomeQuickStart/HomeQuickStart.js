import { Component, define } from '../../core/component.js';

export default class HomeQuickStart extends Component {
  static templateUrl = '/components/HomeQuickStart/HomeQuickStart.html';

  mount() {
    this.delegate('click', '.copy-btn', (btn) => {
      navigator.clipboard?.writeText(btn.dataset.cmd).catch(() => {});
      btn.textContent = '✓';
      btn.classList.add('copied');
      setTimeout(() => { btn.textContent = 'COPY'; btn.classList.remove('copied'); }, 1400);
    });
  }
}

define('home-quickstart', HomeQuickStart);
