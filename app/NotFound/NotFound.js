import { Component, define } from '../../core/component.js';

export default class NotFoundPage extends Component {
  static templateUrl = '/app/NotFound/NotFound.html';
  static metadata = { title: '404 - Not Found', description: 'Page not found.' };
}

define('notfound-page', NotFoundPage);
