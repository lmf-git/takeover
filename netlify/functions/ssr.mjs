import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const clientDist = path.join(root, 'dist/client');
const serverDist = path.join(root, 'dist/server');

export async function handler(event) {
  try {
    const template = fs.readFileSync(path.join(clientDist, 'index.html'), 'utf-8');
    const { render } = await import(path.join(serverDist, 'core/server/entry-server.js'));

    const url = event.path + (event.rawQuery ? `?${event.rawQuery}` : '');
    const result = await render(url);

    // Handle auth redirects
    if (result.redirect) {
      return { statusCode: 302, headers: { Location: result.redirect } };
    }

    const { appHtml, initialStateScript, headMeta, scopedStyles } = result;

    const html = template
      .replace('<!--head-meta-->', (headMeta || '') + (scopedStyles || ''))
      .replace('<!--app-html-->', appHtml)
      .replace('<!--initial-state-->', initialStateScript);

    return { statusCode: 200, headers: { 'Content-Type': 'text/html' }, body: html };
  } catch (e) {
    console.error('[SSR Error]', e);
    return { statusCode: 500, body: `<h1>500</h1><pre>${e.message}</pre>` };
  }
}
