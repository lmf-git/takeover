export default {
  server: {
    // More explicit historyApiFallback configuration
    historyApiFallback: true,
    middlewareMode: false,
    open: true
  },
  preview: {
    // Also apply historyApiFallback in preview mode
    historyApiFallback: true
  },
  build: {
    // SPA-friendly settings
    rollupOptions: {
      output: {
        manualChunks: undefined // Let Vite handle chunking automatically
      }
    }
  },
  // Ensure the base path is set correctly for SPA routing
  base: '/'
}
