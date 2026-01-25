import { Component, define } from '../../core/component.js';

export default class DashboardPage extends Component {
  static templateUrl = '/app/Dashboard/Dashboard.html';
  static store = ['user', 'isAuthenticated'];
  static requiresAuth = true;
  static metadata = { title: 'Dashboard', description: 'Protected dashboard area' };
  static local = {
    todos: [
      { id: 1, text: 'Review quarterly reports', completed: false, priority: 'high' },
      { id: 2, text: 'Update user documentation', completed: true, priority: 'medium' },
      { id: 3, text: 'Optimize database queries', completed: false, priority: 'high' },
      { id: 4, text: 'Plan team meeting agenda', completed: false, priority: 'low' }
    ],
    filter: 'all', nextId: 5
  };

  get props() {
    const { todos, filter } = this.local;
    const filtered = filter === 'all' ? todos : todos.filter(t => filter === 'completed' ? t.completed : !t.completed);
    const completed = todos.filter(t => t.completed).length;
    return { ...super.props, filteredTodos: filtered, filter, filterMessage: filtered.length ? null : `No ${filter} todos`, todoCount: todos.length, activeCount: todos.length - completed, completedCount: completed };
  }

  bind() {
    this.on('#add-todo', 'click', () => this.addTodo());
    this.on('#new-todo-input', 'keypress', e => e.key === 'Enter' && this.addTodo());
    this.on('#clear-completed', 'click', () => this.local.todos = this.local.todos.filter(t => !t.completed));
    this.delegate('click', '[data-filter]', el => this.local.filter = el.dataset.filter);
    this.delegate('click', '.todo-delete', el => this.local.todos = this.local.todos.filter(t => t.id !== +el.dataset.todoId));
    this.delegate('change', '.todo-checkbox', el => this.local.todos = this.local.todos.map(t => t.id === +el.dataset.todoId ? { ...t, completed: !t.completed } : t));
  }

  addTodo() {
    const input = this.$('#new-todo-input'), text = input?.value.trim();
    if (!text) return;
    this.local.todos = [...this.local.todos, { id: this.local.nextId++, text, completed: false, priority: 'medium' }];
    input.value = '';
  }
}

define('dashboard-page', DashboardPage);
