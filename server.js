import { createServer } from 'http';
import { Router } from './core/router.js';
import { Renderer } from './core/renderer.js';
import { compileSass, createStyleTag } from './core/sass.js';

const router = new Router();
let globalStyles = '';

export async function initServer(options = {}) {
    if (options.styleFile) {
        globalStyles = await compileSass(options.styleFile);
    }

    const server = createServer(async (req, res) => {
        if (req.url === '/client.js') {
            res.setHeader('Content-Type', 'application/javascript');
            // Serve client-side code
            return;
        }

        if (req.url === '/styles.css') {
            res.setHeader('Content-Type', 'text/css');
            res.end(globalStyles);
            return;
        }

        const content = await router.render(req.url);
        if (!content) {
            res.statusCode = 404;
            res.end('Not found');
            return;
        }

        res.setHeader('Content-Type', 'text/html');
        Renderer.createStream(content, {}, globalStyles).pipe(res);
    });

    return server;
}

export { router };
