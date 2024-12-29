import { createServer } from 'http';
import { renderer } from './renderer.mjs';
import { readFile } from 'fs/promises';
import { compileSass } from './sass.mjs';

const PORT = process.env.PORT || 3000;

const server = createServer(async (req, res) => {
    // Static file handling
    if (req.url === '/client.js') {
        try {
            const clientScript = await readFile('./dist/client.js', 'utf-8'); // Adjust path based on your build output
            res.setHeader('Content-Type', 'application/javascript');
            res.end(clientScript);
            return;
        } catch (error) {
            console.error('Error serving client.js:', error);
            res.statusCode = 500;
            res.end('Server Error');
            return;
        }
    }

    if (req.url === '/styles.css') {
        try {
            const css = await compileSass('src/styles.scss'); // Adjust path as needed
            res.setHeader('Content-Type', 'text/css');
            res.end(css);
            return;
        } catch {
            res.statusCode = 500;
            res.end('Server Error');
            return;
        }
    }

    // Handle all routes by serving the main HTML
    try {
        const css = await compileSass('src/styles.scss'); // Adjust path as needed
        const html = await renderer(req.url, { css });
        res.setHeader('Content-Type', 'text/html');
        res.end(html);
    } catch (error) {
        console.error('Error:', error);
        res.statusCode = 404;
        res.end('Not found');
    }
});

server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});