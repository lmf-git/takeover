# Web Components Project (Vite + SSR/SPA)

This project demonstrates building a web application using vanilla Web Components, powered by Vite, with support for both Single Page Application (SPA) and Server-Side Rendering (SSR) modes. It features CSS Modules for scoped styling, a custom global state management system, and client-side routing.

## Features

-   **Vanilla Web Components**: Build reusable UI components with native browser capabilities.
-   **Vite**: Fast development server and optimized build process.
-   **CSS Modules**: Locally scoped CSS for components, preventing style conflicts.
-   **Custom Global State Management**: A simple `store` for managing application-wide state.
-   **Client-Side Routing**: Smooth page transitions without full page reloads.
-   **Server-Side Rendering (SSR)**: Improved initial load performance and SEO.
-   **Netlify SSR Support**: Configured for deployment on Netlify using Functions.

## Getting Started

First, install the project dependencies:

```bash
yarn
```

## Usage

This project supports two main modes of operation: **Single Page Application (SPA)** and **Server-Side Rendering (SSR)**.

---

### Single Page Application (SPA) Mode

In SPA mode, the entire application is rendered client-side. This is the traditional way a modern web app operates after the initial HTML load.

-   **Development Server (SPA)**: Runs a development server for client-side development with Hot Module Replacement (HMR).
    ```bash
    yarn dev-spa
    ```
-   **Build (SPA)**: Creates a production-ready client-side bundle in the `dist/client` directory.
    ```bash
    yarn build-spa
    ```
-   **Preview (SPA)**: Serves the production client-side build locally for testing.
    ```bash
    yarn preview-spa
    ```

---

### Server-Side Rendering (SSR) Mode

In SSR mode, the initial page request is rendered on the server, improving perceived performance and SEO. The application then "hydrates" on the client, becoming a fully interactive SPA.

-   **Development Server (SSR)**: Runs a Node.js server that integrates with Vite's dev server to provide SSR with HMR.
    ```bash
    yarn dev
    ```
-   **Build (SSR)**: Creates separate production bundles for the client (`dist/client`) and the server (`dist/server`). This command *must* be run before `yarn start`.
    ```bash
    yarn build
    ```
-   **Start (SSR Production)**: Runs the Node.js server in production mode, serving the pre-built client and server bundles.
    ```bash
    yarn start
    ```

---

## Deployment on Netlify

This project is configured to be deployed on Netlify, supporting both SPA and SSR modes.

### Deploying as SPA on Netlify

To deploy the SPA version:
1.  Run `yarn build-spa`.
2.  Connect your repository to Netlify.
3.  Configure Netlify to:
    *   **Build command**: `yarn build-spa`
    *   **Publish directory**: `dist/client`
    *   **Fallback/Redirects**: Add a `_redirects` file or Netlify UI rule to redirect all unmatched paths to `index.html` (for client-side routing).

### Deploying with SSR on Netlify (using Netlify Functions)

To deploy the SSR version, we will leverage Netlify Functions to run our Node.js server logic.

1.  **Configure `netlify.toml`**: Ensure a `netlify.toml` file exists in your project root with the following (or similar) configuration:

    ```toml
    [build]
      command = "yarn build" # Builds both client and server bundles
      publish = "dist/client" # Serves the static client assets
      functions = "netlify/functions" # Directory where our serverless function will live

    # Redirect all requests not matching a static file to our SSR function
    [[redirects]]
      from = "/*"
      to = "/.netlify/functions/ssr"
      status = 200
    
    # Optional: Configure Node.js version for Netlify Functions
    [functions]
      node_bundler = "esbuild"
      node_version = "18" # Or higher, depending on your needs
    ```

2.  **Create a Netlify Function**: You will need to create a file, for example, `netlify/functions/ssr.js`, which exports a handler function that runs your SSR logic. This function will act as the entry point for Netlify's serverless environment.

    *   This will involve adapting the `server.js` logic to be compatible with the Netlify Function signature (i.e., exporting an `async handler(event, context)` function).
    *   The `netlify/functions/ssr.js` file will need to import your `entry-server.js` and potentially read the `dist/client/index.html` and other assets.

    **(Note: The actual `netlify/functions/ssr.js` implementation will be handled by the agent in a subsequent step.)**

3.  **Deployment**: Connect your repository to Netlify, and it will use the `netlify.toml` to build and deploy your SSR application.

---

## Project Structure

```
.
├── public/                # Static assets
├── app/                   # Web Components (pages)
├── components/            # Web Components (reusable UI)
├── lib/                   # Utility functions, global store, template engine
├── netlify/functions/     # Netlify Functions for SSR
├── dist/                  # Build output (client and server)
├── vite.config.js
├── package.json
├── yarn.lock
├── index.html
├── server.js              # Local SSR development server
└── README.md
```
