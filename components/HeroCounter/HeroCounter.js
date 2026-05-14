import { Component, define } from '../../core/component.js';

export default class HeroCounter extends Component {
  static templateUrl = '/components/HeroCounter/HeroCounter.html';
  static store = ['locale'];
  static local = { count: 0 };
  static reactive = false;

  mount() {
    this.#sync();
    this.on('#btn-inc', 'click', () => { this.local.count++; this.#sync(); });
    this.on('#btn-dec', 'click', () => { this.local.count--; this.#sync(); });
    this.on('#btn-reset', 'click', () => { this.local.count = 0; this.#sync(); });
  }

  #sync() {
    const count = this.local.count;
    const locale = this.state.locale || 'en';
    const el = n => this.$(n);

    const val = el('#counter-val');
    if (val) val.textContent = String(count).padStart(2, '0');

    const svCount = el('#sv-count');
    if (svCount) svCount.textContent = count;

    const svLocale = el('#sv-locale');
    if (svLocale) svLocale.textContent = locale;

    const svTheme = el('#sv-theme');
    if (svTheme) svTheme.textContent = document.documentElement.getAttribute('data-theme') || 'dark';

    const localePath = el('#locale-path');
    if (localePath) localePath.innerHTML = `<span style="color:var(--fg-dim)">/${locale === 'en' ? '' : locale}</span>`;

    const svLabel = el('#sv-label');
    const t = this.state.messages || {};
    if (svLabel) svLabel.textContent = `// ${(t.counter?.title || 'reactive store').toLowerCase()}`;
  }
}

define('hero-counter', HeroCounter);
