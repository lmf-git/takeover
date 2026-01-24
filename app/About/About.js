import { Component, define } from '../../core/component.js';

export default class AboutPage extends Component {
  static templateUrl = '/app/About/About.html';
  static store = ['counter'];
  static metadata = { title: 'About', description: 'Learn more about our application.' };
  static ssrProps = { title: 'About Us' };

  get props() {
    return { ...super.props, title: 'About Us', timestamp: new Date().toLocaleString() };
  }
}

define('about-page', AboutPage);
