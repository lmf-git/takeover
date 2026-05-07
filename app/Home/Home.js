import { Component, define } from '../../core/component.js';

export default class Home extends Component {
  static templateUrl = '../../app/Home/Home.html';
  static store = ['lang']; // Subscribe to lang for dynamic text

  mount() {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
        }
      });
    }, { threshold: 0.12 });

    // Find elements with 'fade-up' class within the component's shadow DOM.
    // This ensures animations are applied to elements within the component itself,
    // rather than relying on global selectors that might not work as expected with Shadow DOM.
    this.$$('.fade-up').forEach(el => observer.observe(el));
  }
}

define('home-page', Home);
