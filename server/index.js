import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import { createServer as createViteServer } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const resolve = p => path.resolve(__dirname, p);
const isProd = process.env.NODE_ENV === 'production';
const port = process.env.PORT || 3000;

async function start() {
  const vite = isProd ? null : await createViteServer({
    server: { middlewareMode: true },
    appType: 'custom'
  });

  http.createServer(async (req, res) => {
    if (vite) {
      vite.middlewares(req, res, () => handleSSR(req, res, vite));
    } else {
      handleSSR(req, res, null);
    }
  }).listen(port, () => console.log(`http://localhost:${port}`));
}

async function handleSSR(req, res, vite) {
  try {
    const url = req.url;

    // Serve static in production
    if (isProd) {
      const file = resolve(`../dist/client${url}`);
      if (fs.existsSync(file) && fs.statSync(file).isFile()) {
        const ext = path.extname(file);
        const types = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml' };
        res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
        return fs.createReadStream(file).pipe(res);
      }
    }

    let template = fs.readFileSync(resolve(isProd ? '../dist/client/index.html' : '../index.html'), 'utf-8');
    let render;

    if (vite) {
      template = await vite.transformIndexHtml(url, template);
      render = (await vite.ssrLoadModule('/server/entry-server.js')).render;
    } else {
      render = (await import(resolve('../dist/server/entry-server.js'))).render;
    }

    const { appHtml, initialStateScript, headMeta, redirect } = await render(url);

    if (redirect) {
      res.writeHead(302, { Location: redirect });
      return res.end();
    }

    const html = template
      .replace('<!--head-meta-->', headMeta || '')
      .replace('<!--app-html-->', appHtml)
      .replace('<!--initial-state-->', initialStateScript);

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
  } catch (e) {
    vite?.ssrFixStacktrace(e);
    console.error(e);
    res.writeHead(500);
    res.end(e.message);
  }
}

start();
