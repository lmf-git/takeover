import { layoutManager } from './layout.js';
import Home from './pages/Home.jsx';

export class Router {
    constructor() {
        this.routes = new Map();
        this.container = document.getElementById('app');
    }

    async add(path, component, layout = null) {
        const loadedComponent = await component();
        this.routes.set(path, { component: loadedComponent, layout });
    }

    match(path) {
        return this.routes.get(path) || this.routes.get('*');
    }

    async render(path) {
        const route = this.match(path);
        if (!route) return null;
        
        const content = await route.component();
        const layoutContent = await layoutManager.render(content, route.layout);
        
        if (this.container) {
            this.container.innerHTML = layoutContent;
            document.title = `App - ${path}`;
        }
        
        return layoutContent;
    }

    navigate(path) {
        window.history.pushState({}, '', path);
        this.render(path);
    }
}

const router = new Router();

// Adding the Home route
router.add('/', () => import('./pages/Home.jsx'), 'mainLayout');
