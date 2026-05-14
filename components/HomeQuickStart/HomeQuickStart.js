import { Component, define } from '../../core/component.js';

const STEPS = [
  { cmd: 'npx create-takeover@latest my-app', label: 'Scaffold a new project' },
  { cmd: 'cd my-app && yarn dev', label: 'Native ESM dev server with HMR on :3000' },
  { cmd: 'yarn build && yarn deploy:cloudflare', label: 'Bundle, minify, hash assets, ship to the edge' }
];

export default class HomeQuickStart extends Component {
  static templateUrl = '/components/HomeQuickStart/HomeQuickStart.html';

  mount() {
    const container = this.$('#steps');
    if (!container) return;

    STEPS.forEach((step, i) => {
      const div = document.createElement('div');
      div.className = 'step';
      div.innerHTML = `
        <span class="step-num">0${i + 1}</span>
        <div class="step-content">
          <div class="step-cmd"><span class="prompt">$ </span>${this.#escape(step.cmd)}</div>
          <div class="step-label">${this.#escape(step.label)}</div>
        </div>
        <button class="copy-btn" data-cmd="${this.#escape(step.cmd)}">COPY</button>
      `;
      container.appendChild(div);
    });

    this.delegate('click', '.copy-btn', (btn) => {
      navigator.clipboard?.writeText(btn.dataset.cmd).catch(() => {});
      btn.textContent = '✓';
      btn.classList.add('copied');
      setTimeout(() => { btn.textContent = 'COPY'; btn.classList.remove('copied'); }, 1400);
    });
  }

  #escape(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
}

define('home-quickstart', HomeQuickStart);
