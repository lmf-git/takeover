import { Router } from './core/router.js';

const router = new Router();
const initialState = window.__INITIAL_STATE__ || {};

// Handle client-side navigation
document.addEventListener('click', e => {
    const link = e.target.closest('a');
    if (link && link.href.startsWith(window.location.origin)) {
        e.preventDefault();
        const path = link.href.slice(window.location.origin.length);
        router.navigate(path);
    }
});

// Handle back/forward navigation
window.addEventListener('popstate', () => {
    router.render(window.location.pathname);
});

// Initialize the router with the current path
router.render(window.location.pathname);

export { router };
