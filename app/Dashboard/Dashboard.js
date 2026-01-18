import { Component } from '../../core/index.js';
import template from './Dashboard.html?raw';

class DashboardPage extends Component {
  static template = template;
  static store = ['user', 'isAuthenticated'];

  constructor() {
    super();
    Object.assign(this.local, {
      todos: [
        { id: 1, text: 'Review quarterly reports', completed: false, priority: 'high' },
        { id: 2, text: 'Update user documentation', completed: true, priority: 'medium' },
        { id: 3, text: 'Optimize database queries', completed: false, priority: 'high' },
        { id: 4, text: 'Plan team meeting agenda', completed: false, priority: 'low' }
      ],
      filter: 'all',
      nextId: 5
    });
  }

  onLocalChange(prop) {
    if (['todos', 'filter'].includes(prop)) this.update();
  }

  get props() {
    const { todos, filter } = this.local;
    const filtered = filter === 'all' ? todos : todos.filter(t => filter === 'completed' ? t.completed : !t.completed);
    return { ...super.props, filteredTodos: filtered, filterMessage: filtered.length ? null : `No ${filter} todos` };
  }

  mount() {
    this.setMeta({
      title: 'Dashboard',
      description: this.state.user ? `Dashboard for ${this.state.user.username}` : 'Protected dashboard'
    });
  }

  bind() {
    this.on('#add-todo', 'click', () => this.addTodo());
    this.on('#new-todo-input', 'keypress', e => e.key === 'Enter' && this.addTodo());
    this.on('#clear-completed', 'click', () => this.clearCompleted());

    // Event delegation for dynamic elements
    this.on(this.shadowRoot, 'click', e => {
      const btn = e.target.closest('[data-filter]');
      if (btn) this.local.filter = btn.dataset.filter;

      const del = e.target.closest('.todo-delete');
      if (del) this.deleteTodo(+del.dataset.todoId);
    });

    this.on(this.shadowRoot, 'change', e => {
      const cb = e.target.closest('.todo-checkbox');
      if (cb) this.toggleTodo(+cb.dataset.todoId);
    });

    this.updateUI();
  }

  addTodo() {
    const input = this.$('#new-todo-input');
    const text = input?.value.trim();
    if (!text) return;
    this.local.todos = [...this.local.todos, { id: this.local.nextId++, text, completed: false, priority: 'medium' }];
    input.value = '';
  }

  toggleTodo(id) {
    this.local.todos = this.local.todos.map(t => t.id === id ? { ...t, completed: !t.completed } : t);
  }

  deleteTodo(id) {
    this.local.todos = this.local.todos.filter(t => t.id !== id);
  }

  clearCompleted() {
    this.local.todos = this.local.todos.filter(t => !t.completed);
  }

  updateUI() {
    const { todos, filter } = this.local;
    const completed = todos.filter(t => t.completed).length;

    const stats = this.$('#todo-stats');
    if (stats) stats.innerHTML = `<span>Total: ${todos.length}</span><span>Active: ${todos.length - completed}</span><span>Completed: ${completed}</span>`;

    this.$$('.filter-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.filter === filter);
    });
  }
}

customElements.define('dashboard-page', DashboardPage);
