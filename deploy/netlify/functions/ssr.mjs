import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
process.env.SSR_ROOT = join(root, 'dist/server');

export async function handler(event) {
  const template = readFileSync(join(root, 'dist/client/_template.html'), 'utf-8');
  const { render } = await import(pathToFileURL(join(root, 'dist/server/core/server/entry-server.mjs')).href);
  const result = await render(event.path + (event.rawQuery ? `?${event.rawQuery}` : ''));

  if (result.redirect) return { statusCode: 302, headers: { Location: result.redirect } };

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'text/html' },
    body: template
      .replace('<!--head-meta-->', (result.headMeta || '') + (result.scopedStyles || ''))
      .replace('<!--app-html-->', result.appHtml)
      .replace('<!--initial-state-->', result.initialStateScript)
  };
}
