// Dev-only SSR host. The dev server runs rendering in a worker thread and
// replaces the worker whenever a source file changes: a new thread has an empty
// module cache, so edits anywhere in the import graph — app/, components/,
// core/, lib/ — take effect on the next request, and the old thread's memory is
// released with it. (Node has no way to un-import an ES module in place.)
import { parentPort } from 'node:worker_threads';

const entry = import('./entry-server.js');

parentPort.on('message', async ({ id, method, args }) => {
  try {
    const result = await (await entry)[method](...args);
    parentPort.postMessage({ id, result });
  } catch (e) {
    parentPort.postMessage({ id, error: { message: e?.message || String(e), stack: e?.stack || '' } });
  }
});
