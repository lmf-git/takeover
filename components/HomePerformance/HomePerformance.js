import { Component, define } from '../../core/component.js';

const SCORES = [
  { label: 'Performance',    value: 100 },
  { label: 'Accessibility',  value: 100 },
  { label: 'Best Practices', value: 100 },
  { label: 'SEO',            value: 100 }
];

export default class HomePerformance extends Component {
  static templateUrl = '/components/HomePerformance/HomePerformance.html';

  mount() {
    this.#buildRings();
    this.#observe();
  }

  #buildRings() {
    const grid = this.$('#rings-grid');
    if (!grid) return;
    SCORES.forEach((s, i) => {
      const size = 132, stroke = 8;
      const r = (size - stroke) / 2;
      const circ = 2 * Math.PI * r;
      const item = document.createElement('div');
      item.className = 'ring-item';
      item.innerHTML = `
        <div class="ring-wrap" style="width:${size}px;height:${size}px">
          <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="display:block;transform:rotate(-90deg)">
            <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="var(--line-soft)" stroke-width="${stroke}"/>
            <circle id="ring-prog-${i}" cx="${size/2}" cy="${size/2}" r="${r}" fill="none"
              stroke="var(--accent-soft)" stroke-width="${stroke}" stroke-linecap="round"
              stroke-dasharray="${circ}"
              stroke-dashoffset="${circ}"
              style="transition:stroke-dashoffset 1.2s cubic-bezier(.2,.8,.2,1) ${i*120}ms"/>
          </svg>
          <div class="ring-display" id="ring-num-${i}">0</div>
          <div class="ring-glow"></div>
        </div>
        <div class="ring-label">${s.label}</div>
      `;
      grid.appendChild(item);
    });
    this._circ = 2 * Math.PI * ((132 - 8) / 2);
    this._revealed = false;
  }

  #observe() {
    const section = this.$('section');
    if (!section) return;
    const obs = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && !this._revealed) {
        this._revealed = true;
        obs.disconnect();
        this.#animateRings();
      }
    }, { threshold: 0.25 });
    obs.observe(section);
  }

  #animateRings() {
    SCORES.forEach((s, i) => {
      const prog = this.$(`#ring-prog-${i}`);
      const num = this.$(`#ring-num-${i}`);
      if (prog) prog.style.strokeDashoffset = String(this._circ - (s.value / 100) * this._circ);
      if (num) this.#countUp(num, s.value, 1200, i * 120);
    });
  }

  #countUp(el, target, dur, delay) {
    const start = performance.now() + delay;
    const tick = now => {
      if (now < start) { requestAnimationFrame(tick); return; }
      const t = Math.min(1, (now - start) / dur);
      const e = 1 - Math.pow(1 - t, 3);
      el.textContent = String(Math.round(target * e));
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
}

define('home-performance', HomePerformance);
