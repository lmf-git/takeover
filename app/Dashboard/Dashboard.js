import { Component, define } from '../../core/index.js';

export default class DashboardPage extends Component {
  static templateUrl = '/app/Dashboard/Dashboard.html';
  static store = ['user', 'isAuthenticated'];
  static requiresAuth = true;
  static metadata = { title: 'Dashboard', description: 'Protected dashboard area' };

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
    const completed = todos.filter(t => t.completed).length;
    return {
      ...super.props,
      filteredTodos: filtered,
      filter,
      filterMessage: filtered.length ? null : `No ${filter} todos`,
      todoCount: todos.length,
      activeCount: todos.length - completed,
      completedCount: completed
    };
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
}

define('dashboard-page', DashboardPage);
