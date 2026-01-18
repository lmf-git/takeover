// Auto-discover and load shared components
const components = await fetch('/api/components').then(r => r.json());
await Promise.all(components.map(path => import(path)));

// Load layout
await import('../app/_Layout/_Layout.js');
