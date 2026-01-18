import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(__dirname, '../../dist');

export async function handler(event) {
  try {
    const template = fs.readFileSync(path.join(dist, 'client/index.html'), 'utf-8');
    const { render } = await import(path.join(dist, 'server/entry-server.js'));

    const { appHtml, initialStateScript, headMeta, redirect } = await render(event.rawUrl || event.path);

    if (redirect) {
      return { statusCode: 302, headers: { Location: redirect } };
    }

    const html = template
      .replace('<!--head-meta-->', headMeta || '')
      .replace('<!--app-html-->', appHtml)
      .replace('<!--initial-state-->', initialStateScript);

    return { statusCode: 200, headers: { 'Content-Type': 'text/html' }, body: html };
  } catch (e) {
    console.error('[SSR Error]', e);
    return { statusCode: 500, body: `<h1>500</h1><pre>${e.message}</pre>` };
  }
}
