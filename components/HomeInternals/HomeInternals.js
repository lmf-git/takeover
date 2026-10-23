import { Component, define } from '../../core/component.js';

// Tabbed diagrams from docs/images, inlined (as dg-* classes on the site's tokens) so SSR
// paints the first one and every panel follows the theme toggle. Switching tabs only flips
// hidden/aria-selected; nothing re-renders.
export default class HomeInternals extends Component {
  static templateUrl = '/components/HomeInternals/HomeInternals.html';

  #tab = 'architecture';

  // bind() runs after every render (a locale switch re-renders this component), so the
  // selected tab is re-applied here and listeners go through delegate() to be dropped
  // with the render that registered them.
  bind() {
    this.#show(this.#tab);
    this.delegate('click', '[role="tab"]', tab => this.#show(tab.dataset.tab, true));
    this.delegate('keydown', '[role="tab"]', (tab, e) => {
      const tabs = this.$$('[role="tab"]');
      const i = tabs.indexOf(tab);
      const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
      if (next === undefined) return;
      e.preventDefault();
      this.#show(tabs.at(next % tabs.length).dataset.tab, true);
    });
  }

  #show(name, focus = false) {
    this.#tab = name;
    for (const tab of this.$$('[role="tab"]')) {
      const on = tab.dataset.tab === name;
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
      if (on && focus) tab.focus();
    }
    for (const panel of this.$$('[role="tabpanel"]')) panel.hidden = panel.id !== `panel-${name}`;
  }
}

define('home-internals', HomeInternals);
