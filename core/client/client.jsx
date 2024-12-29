/** @jsx h */
import { h } from './jsx-runtime.js';
import { Router } from './router.js';
import Home from './pages/Home.jsx';

const router = new Router();

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', () => {
    router.add('/home', Home);
    router.add('/', Home);
    
    document.addEventListener('click', (e) => {
        const link = e.target.closest('a');
        if (link && link.href.startsWith(window.location.origin)) {
            e.preventDefault();
            router.navigate(link.pathname);
        }
    });

    window.addEventListener('popstate', () => {
        router.render(window.location.pathname);
    });

    // Initial render
    router.render(window.location.pathname);
});

export { router };