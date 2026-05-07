import { Component, define } from '../../core/component.js';

export default class Products extends Component {
  static templateUrl = '/app/Products/Products.html';
  static store = ['lang'];

  mount() {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) entry.target.classList.add('visible');
      });
    }, { threshold: 0.12 });
    this.$$('.fade-up').forEach(el => observer.observe(el));
  }
}

define('products-page', Products);
