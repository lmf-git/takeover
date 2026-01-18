// Core framework exports
export { Component, navigate, store } from './component.js';
export { Store } from './context.js';
export { render, renderWithExpressions } from './template.js';
export { createMatcher, pathFromFile, matchRoute } from './routes.js';

// Safe custom element registration (no-op on server)
const isBrowser = typeof window !== 'undefined';
export const define = (name, constructor) => isBrowser && customElements.define(name, constructor);
