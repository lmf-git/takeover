import template from "./Dashboard.html?raw";
import { renderWithExpressions } from "../../lib/template.js";

class DashboardPage extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    
    // Create reactive local state for todo list
    this.state = this.createReactiveState({
      todos: [
        { id: 1, text: 'Review quarterly reports', completed: false, priority: 'high' },
        { id: 2, text: 'Update user documentation', completed: true, priority: 'medium' },
        { id: 3, text: 'Optimize database queries', completed: false, priority: 'high' },
        { id: 4, text: 'Plan team meeting agenda', completed: false, priority: 'low' }
      ],
      newTodoText: '',
      filter: 'all', // all, active, completed
      nextId: 5
    });
  }

  createReactiveState(initialState) {
    return new Proxy(initialState, {
      set: (target, prop, value) => {
        const oldValue = target[prop];
        target[prop] = value;
        
        // React to state changes (useEffect equivalent)
        this.handleStateChange(prop, value, oldValue);
        
        return true;
      }
    });
  }

  handleStateChange(prop, newValue, oldValue) {
    // Different effects for different state changes
    switch (prop) {
      case 'todos':
      case 'filter':
        this.renderPage(); // Re-render entire page with template
        this.updateStats();
        this.updateFilterButtons();
        this.reattachEventListeners();
        break;
        
      case 'newTodoText':
        this.updateAddButton();
        break;
    }
  }

  connectedCallback() {
    console.log('DashboardPage connected');
    this.renderPage(); // Initial render with template
    this.setupEventListeners();
    this.updateStats(); // Initial stats
  }
  
  renderPage() {
    // Get filtered todos and filter message for template
    const filteredTodos = this.getFilteredTodos();
    const filterMessage = this.state.filter === 'all' ? 
      null : `No ${this.state.filter} todos`;
    
    const templateData = {
      ...this.pageProps,
      filteredTodos,
      filterMessage,
      user: this.pageProps?.user || { username: 'User', role: 'user' }
    };
    
    console.log('Template data:', templateData);
    console.log('filteredTodos.length:', filteredTodos.length);
    
    // Render template with current state
    this.shadowRoot.innerHTML = renderWithExpressions(template, templateData);
  }
  
  setupEventListeners() {
    this.reattachEventListeners();
  }
  
  reattachEventListeners() {
    // Handle navigation links
    const links = this.shadowRoot.querySelectorAll('a[route]');
    links.forEach(link => {
      link.addEventListener('click', this.linkClick);
    });
    
    // Todo form handlers
    const addBtn = this.shadowRoot.getElementById('add-todo');
    const newTodoInput = this.shadowRoot.getElementById('new-todo-input');
    const clearCompletedBtn = this.shadowRoot.getElementById('clear-completed');
    
    if (addBtn) addBtn.addEventListener('click', () => this.addTodo());
    
    if (newTodoInput) {
      // Input tracking
      newTodoInput.addEventListener('input', (e) => {
        this.state.newTodoText = e.target.value;
      });
      
      // Enter key to add
      newTodoInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && this.state.newTodoText.trim()) {
          this.addTodo();
        }
      });
    }
    
    if (clearCompletedBtn) {
      clearCompletedBtn.addEventListener('click', () => this.clearCompleted());
    }
    
    // Filter buttons
    ['all', 'active', 'completed'].forEach(filter => {
      const btn = this.shadowRoot.getElementById(`filter-${filter}`);
      if (btn) {
        btn.addEventListener('click', () => {
          this.state.filter = filter;
        });
      }
    });
    
    // Todo checkboxes and delete buttons (from template)
    this.shadowRoot.querySelectorAll('.todo-checkbox').forEach(checkbox => {
      checkbox.addEventListener('change', (e) => {
        const id = parseInt(e.target.dataset.todoId);
        this.toggleTodo(id);
      });
    });
    
    this.shadowRoot.querySelectorAll('.todo-delete').forEach(deleteBtn => {
      deleteBtn.addEventListener('click', (e) => {
        const id = parseInt(e.target.dataset.todoId);
        this.deleteTodo(id);
      });
    });
  }
  
  addTodo() {
    const text = this.state.newTodoText.trim();
    if (!text) return;
    
    const newTodo = {
      id: this.state.nextId,
      text: text,
      completed: false,
      priority: 'medium'
    };
    
    // This triggers reactive update
    this.state.todos = [...this.state.todos, newTodo];
    this.state.nextId++;
    this.state.newTodoText = '';
    
    // Clear input field
    const input = this.shadowRoot.getElementById('new-todo-input');
    input.value = '';
  }
  
  toggleTodo(id) {
    this.state.todos = this.state.todos.map(todo =>
      todo.id === id ? { ...todo, completed: !todo.completed } : todo
    );
  }
  
  deleteTodo(id) {
    this.state.todos = this.state.todos.filter(todo => todo.id !== id);
  }
  
  clearCompleted() {
    this.state.todos = this.state.todos.filter(todo => !todo.completed);
  }
  
  getFilteredTodos() {
    switch (this.state.filter) {
      case 'active':
        return this.state.todos.filter(todo => !todo.completed);
      case 'completed':
        return this.state.todos.filter(todo => todo.completed);
      default:
        return this.state.todos;
    }
  }
  
  
  updateStats() {
    const total = this.state.todos.length;
    const completed = this.state.todos.filter(todo => todo.completed).length;
    const active = total - completed;
    
    const statsEl = this.shadowRoot.getElementById('todo-stats');
    statsEl.innerHTML = `
      <span>Total: ${total}</span>
      <span>Active: ${active}</span>
      <span>Completed: ${completed}</span>
    `;
  }
  
  updateFilterButtons() {
    ['all', 'active', 'completed'].forEach(filter => {
      const btn = this.shadowRoot.getElementById(`filter-${filter}`);
      btn.className = `filter-btn ${this.state.filter === filter ? 'active' : ''}`;
    });
  }
  
  updateAddButton() {
    const addBtn = this.shadowRoot.getElementById('add-todo');
    addBtn.disabled = !this.state.newTodoText.trim();
    addBtn.style.opacity = this.state.newTodoText.trim() ? '1' : '0.5';
  }
  
  linkClick(event) {
    event.preventDefault();
    const path = event.target.getAttribute('href');
    console.log(`Page link: ${path}`);
    
    window.dispatchEvent(new CustomEvent('navigate', {
      detail: { path }
    }));
  }
}

customElements.define("dashboard-page", DashboardPage);

export default "dashboard-page";