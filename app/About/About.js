import { Component } from '../../core/index.js';
import template from './About.html?raw';

class AboutPage extends Component {
  static template = template;
  static metadata = { title: 'About', description: 'Learn more about our application.' };

  get props() {
    return { ...super.props, title: 'About Us', timestamp: new Date().toLocaleString() };
  }
}

customElements.define('about-page', AboutPage);
