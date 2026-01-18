import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const serverDist = path.join(root, 'dist/server');

export async function handler(event) {
  try {
    const { getClientRoutes } = await import(path.join(serverDist, 'core/server/entry-server.js'));
    const routes = await getClientRoutes();

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(routes)
    };
  } catch (e) {
    console.error('[Routes Error]', e);
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
}
