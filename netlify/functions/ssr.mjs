import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const clientDist = path.join(root, 'dist/client');
const serverDist = path.join(root, 'dist/server');

// Set environment variable for entry-server.js to use correct paths
process.env.SSR_ROOT = serverDist;

export async function handler(event) {
  const template = fs.readFileSync(path.join(clientDist, '_template.html'), 'utf-8');
  const entryPath = path.join(serverDist, 'core/server/entry-server.mjs');
  const { render } = await import(pathToFileURL(entryPath).href);

  const url = event.path + (event.rawQuery ? `?${event.rawQuery}` : '');
  const result = await render(url);

  if (result.redirect) {
    return { statusCode: 302, headers: { Location: result.redirect } };
  }

  const { appHtml, initialStateScript, headMeta, scopedStyles } = result;

  const html = template
    .replace('<!--head-meta-->', (headMeta || '') + (scopedStyles || ''))
    .replace('<!--app-html-->', appHtml)
    .replace('<!--initial-state-->', initialStateScript);

  return { statusCode: 200, headers: { 'Content-Type': 'text/html' }, body: html };
}
