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

### Deploying SSR on Netlify

This project is pre-configured for Netlify SSR deployment using [Netlify Functions](https://docs.netlify.com/functions/overview/).

#### Project Structure

```
netlify/
  functions/
    ssr.mjs      # SSR handler function
    routes.mjs   # Routes API function
netlify.toml     # Netlify configuration
```

#### How It Works

1. **Build**: `yarn build` outputs to:
   - `dist/client/` - Static assets (HTML, JS, CSS, components)
   - `dist/server/` - Server-side code for SSR

2. **Static Assets**: Requests to `/core/*`, `/lib/*`, `/components/*`, `/app/*` are served directly from `dist/client/`

3. **SSR**: All other routes go through the `ssr` function which:
   - Renders the page server-side
   - Handles auth redirects (302)
   - Returns fully rendered HTML

4. **Routes API**: `/api/routes` is handled by the `routes` function

#### Deploy Steps

1. Connect your repository to Netlify
2. Netlify auto-detects `netlify.toml` configuration:
   - **Build command**: `yarn build`
   - **Publish directory**: `dist/client`
   - **Functions directory**: `netlify/functions`
3. Push to trigger deployment

#### Configuration Files

**`netlify.toml`**:
```toml
[build]
  command = "yarn build"
  publish = "dist/client"
  functions = "netlify/functions"

[functions]
  node_bundler = "esbuild"

# Static assets served directly
[[redirects]]
  from = "/core/*"
  to = "/core/:splat"
  status = 200

# ... more static redirects ...

# SSR for all other routes
[[redirects]]
  from = "/*"
  to = "/.netlify/functions/ssr"
  status = 200
```

#### Local Testing

To test the Netlify setup locally, install the Netlify CLI:

```bash
npm install -g netlify-cli
netlify dev
```