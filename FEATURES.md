# Project Features

This document outlines the key features and technologies used in this project.

## Core Features

-   **Vanilla Web Components**: The project is built using native Web Components, allowing for reusable, encapsulated UI components without relying on external frameworks. Each component extends a `Component` base class that provides reactive capabilities.
-   **Reactive Web Component Base Class**: A foundational `Component` class provides advanced functionality for all custom elements. It integrates reactive global state management, a custom templating engine, and lifecycle hooks (`mount`, `bind`, `unmount`). It utilizes Shadow DOM for style and markup encapsulation, and `AbortController` for automatic event listener cleanup, ensuring robust component management.
-   **Local Reactive State**: Components can manage their internal state reactively using `this.local`, a Proxy-based system, allowing for isolated component-specific data flows.
-   **CSS Module Integration**: Locally scoped CSS for components is achieved through CSS Modules, imported as raw strings and injected into the Shadow DOM, preventing style conflicts and promoting component reusability.
-   **Custom Global State Management**: A custom, lightweight `Store` uses JavaScript Proxies and EventTarget for reactive state management. It provides `get` and `set` methods, supports subscriptions to state changes, and integrates with `localStorage` for persisting user and theme settings. Built-in actions handle theme toggling and basic user login/logout.
-   **Custom Templating Engine**: A custom, secure templating engine supports variable interpolation (`{{variable}}`), conditional rendering (`{{#if condition}}...{{else}}...{{/if}}`), and list rendering (`{{#each array}}...{{/each}}` with `{{this}}` and `{{@index}}`). It features safe expression evaluation to prevent code injection, allowing for dynamic content generation directly within HTML templates.
-   **Client-Side Routing**: Features client-side routing for seamless navigation and smooth page transitions within the Single Page Application (SPA) mode. Declarative routing links (`<a route href="...">`) are automatically handled by the component base class.
-   **SEO/Metadata Management**: Components can update global page metadata (e.g., title, description, Open Graph tags) via the global store, facilitating dynamic SEO and rich social media previews.
-   **Theming System (CSS Custom Properties based)**: A comprehensive theming system utilizes CSS Custom Properties to provide flexible light and dark modes, ensuring consistent UI appearance across the application, including within Shadow DOM.
-   **Event-driven Interaction**: Components can dispatch and listen for custom events, enabling decoupled communication and interaction patterns across the application.
-   **Modular Component Registration**: All components and pages are explicitly imported and registered, ensuring a clear, modular structure for managing custom elements.
-   **Vite**: Utilizes Vite for a fast development experience with Hot Module Replacement (HMR) and an optimized build process for production.
-   **Server-Side Rendering (SSR)**: Supports Server-Side Rendering to improve initial page load performance, enhance SEO, and provide a better user experience.
-   **Netlify SSR Support**: Configured for deployment on Netlify, leveraging Netlify Functions to enable SSR capabilities in a serverless environment.

## Modes of Operation

The project supports two primary modes:

-   **Single Page Application (SPA) Mode**: The entire application is rendered client-side after the initial HTML load, providing a dynamic and interactive user experience.
-   **Server-Side Rendering (SSR) Mode**: The initial page request is rendered on the server, and the application then "hydrates" on the client-side to become a fully interactive SPA.

## Potential Issues and Considerations

-   **Reliance on Custom Implementations**: The project heavily relies on custom-built solutions for state management, templating, and the component base class. While offering control, this approach incurs significant maintenance overhead, requires diligent testing, and may lack the robustness, performance optimizations, and community support found in established libraries or frameworks. This could introduce subtle bugs, performance bottlenecks, or security vulnerabilities.
-   **Systemic Manual DOM Manipulation**: A pervasive issue across multiple components (Dashboard, Login, Navigation, ThemeToggle) is the direct manipulation of the DOM (`.innerHTML`, `.textContent`, `.style`, `.classList`) within component methods (e.g., `bind()`, `updateUI()`) instead of leveraging the reactive templating engine (`renderWithExpressions`). This bypasses the reactive paradigm, makes UI updates harder to reason about, increases the potential for inconsistencies, and complicates maintenance.
-   **CSS Module Integration Efficiency**: Injecting CSS Modules via `<style>${styles}</style>` directly into each component's Shadow DOM can lead to style duplication across component instances. This might increase memory usage and potentially impact initial render performance for pages with numerous components. For modern browsers, `adoptedStyleSheets` could offer a more efficient solution.
-   **Global State Management Scalability and Debuggability**: The event-driven custom `Store` for global state management, while functional for smaller applications, may become challenging to debug and scale in larger, more complex applications without dedicated developer tools for state visualization and tracing.
-   **Client-Side Routing Robustness**: The custom client-side router, while handling basic navigation and dynamic parameters, might lack advanced features (e.g., nested routes, route guards, dynamic regex matching, advanced transitions) common in mature routing libraries. Its custom nature introduces complexity in maintenance and extension.
-   **Dynamic Component Definition in Router**: The Router's approach of dynamically defining new `HTMLElement` classes for routes within its `loadDynamic` method, even with checks, is an unconventional use of `customElements.define` and could be architecturally fragile. Dynamically importing already-defined component modules would be a more standard and robust pattern.
-   **SEO/Metadata Management Implementation**: Although components can update global metadata in the store, the exact mechanism for dynamically updating the document's `<head>` for client-side SPA navigation and ensuring optimal SEO during hydration needs careful verification. Inadequate implementation can lead to inconsistent metadata for search engine crawlers. A dedicated solution like a `Helmet`-like library might be beneficial.
-   **SSR Complexity and Performance**: Implementing custom Server-Side Rendering, especially with Netlify Functions, significantly increases project complexity.
    *   **Limited Static File Serving**: The `server/index.js` serves a limited set of static file types in production, potentially leading to 404s for other assets.
    *   **No Caching Headers for Static Assets**: Lack of caching headers for served static files can impact performance.
    *   **Synchronous `fs` Operations**: Use of synchronous `fs` methods in Node.js can block the event loop, impacting server responsiveness.
    *   **Eager Template Loading in SSR**: `import.meta.glob` with `eager: true` for all page HTML templates in `entry-server.js` can lead to high memory consumption on the server for large applications.
    *   **Incomplete Server-Side Component Rendering**: The current SSR primarily renders templates, potentially missing server-side execution of Web Component lifecycle logic (e.g., `mount()`) or data pre-fetching.
-   **Security: Manual `innerHTML` and Sanitization**: While the custom templating engine aims for safety, manual `innerHTML` assignments (e.g., in `Dashboard.js`, `Login.js`, Router's 404) without explicit sanitization of potentially user-generated content could introduce XSS vulnerabilities.
-   **Missing Data Fetching and Loading/Error States**: Page components like `app/Users/[id]/User.js` demonstrate dynamic routes but lack examples of actual data fetching from an API, along with corresponding loading and error states, which are crucial for real-world applications.
-   **Hardcoded Global Styles in `index.html`**: A `<style>` block in `index.html` for `body` and `.container` duplicates global styling concerns, which could be better centralized in `lib/globals.css`.

