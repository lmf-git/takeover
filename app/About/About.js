import { Component } from '../../core/index.js';
import template from './About.html?raw';
import styles from './About.module.css?raw';

class AboutPage extends Component {
  static template = template;
  static styles = styles;

  mount() {
    this.setMeta({ title: 'About', description: 'Learn more about our application.' });
  }
}

customElements.define('about-page', AboutPage);
