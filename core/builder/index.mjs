import { build } from './static.js';

// Default routes configuration
const defaultRoutes = {
    '/': {
        file: './pages/home.js',
        component: 'HomePage'
    },
    '/about': {
        file: './pages/about.js',
        component: 'AboutPage'
    }
};

const defaultOptions = {
    outDir: './dist',
    styleFile: './src/styles.scss'
};

// For CLI usage
if (import.meta.url === url.pathToFileURL(process.argv[1]).href) {
    try {
        await build(defaultRoutes, defaultOptions);
        console.log('Build completed successfully!');
    } catch (error) {
        console.error('Build failed:', error);
        process.exit(1);
    }
}

export { build };
