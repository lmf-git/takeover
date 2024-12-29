import { layoutManager } from './layout.js';

export class Router {
    constructor() {
        this.routes = new Map();
    }

    add(path, component, layout = null) {
        this.routes.set(path, { component, layout });
    }

    match(path) {
        return this.routes.get(path) || this.routes.get('*');
    }

    navigate(path) {
        if (typeof window !== 'undefined') {
            history.pushState(null, '', path);
            this.render(path);
        }
    }

    async render(path) {
        const route = this.match(path);
        if (!route) return null;
        
        const content = await route.component();
        const layoutContent = await layoutManager.render(content, route.layout);
        
        if (typeof window !== 'undefined') {
            document.getElementById('app').innerHTML = layoutContent;
            document.title = `App - ${path}`;
        }
        
        return layoutContent;
    }
}
