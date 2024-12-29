import { build } from './builder/static.js';
import { routes, layouts } from './routes.js';

async function main() {
    const isDev = process.argv.includes('--dev');
    const isSSR = process.argv.includes('--ssr');
    
    if (isDev) {
        const { createDevServer } = await import('./server/dev-server.mjs');
        const server = createDevServer({ ssr: isSSR });
        server.start();
    } else {
        // Static build
        await build({
            routes,
            layouts,
            outDir: './dist',
            styleFile: 'src/styles.scss'
        });
    }
}

main().catch(console.error);
