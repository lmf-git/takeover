import { Component, define } from '../../core/component.js';

export default class Fleet extends Component {
  static templateUrl = '../../components/Fleet/Fleet.html';
  static store = ['lang']; // Subscribe to lang for dynamic text

  mount() {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) entry.target.classList.add('visible');
      });
    }, { threshold: 0.12 });
    this.$$('.fade-up').forEach(el => observer.observe(el));
  }
}

define('fleet-page', Fleet);
