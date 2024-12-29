import { build } from '../core/builder/static.js';

const routes = {
    '/': {
        file: '../pages/home.js',
        component: 'HomePage'
    },
    '/about': {
        file: '../pages/about.js',
        component: 'AboutPage'
    }
};

const options = {
    outDir: './dist',
    styleFile: './src/styles.scss'
};

try {
    await build(routes, options);
    console.log('Build completed successfully!');
} catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
}
