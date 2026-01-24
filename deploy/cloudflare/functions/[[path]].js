import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
process.env.SSR_ROOT = join(root, 'dist/server');

export async function onRequest({ request }) {
  const url = new URL(request.url);

  // Serve static assets directly
  if (['.js', '.mjs', '.css', '.json', '.svg', '.png', '.jpg', '.ico', '.woff', '.woff2'].some(e => url.pathname.endsWith(e))) {
    return;
  }

  const template = readFileSync(join(root, 'dist/client/_template.html'), 'utf-8');
  const { render } = await import(pathToFileURL(join(root, 'dist/server/core/server/entry-server.mjs')).href);
  const result = await render(url.pathname + url.search);

  if (result.redirect) {
    return new Response(null, { status: 302, headers: { Location: result.redirect } });
  }

  const html = template
    .replace('<!--head-meta-->', (result.headMeta || '') + (result.scopedStyles || ''))
    .replace('<!--app-html-->', result.appHtml)
    .replace('<!--initial-state-->', result.initialStateScript);

  return new Response(html, { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
}
