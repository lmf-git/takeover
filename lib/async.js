/**
 * Async utilities for common patterns
 * @module lib/async
 */

/**
 * Debounce a function - delays execution until after wait ms of no calls
 * @param {Function} fn - Function to debounce
 * @param {number} wait - Milliseconds to wait
 * @returns {Function} Debounced function with .cancel() method
 */
export function debounce(fn, wait = 300) {
  let timeout;
  const debounced = (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), wait);
  };
  debounced.cancel = () => clearTimeout(timeout);
  return debounced;
}

/**
 * Throttle a function - limits execution to once per wait ms
 * @param {Function} fn - Function to throttle
 * @param {number} wait - Milliseconds between calls
 * @returns {Function} Throttled function
 */
export function throttle(fn, wait = 300) {
  let last = 0;
  return (...args) => {
    const now = Date.now();
    if (now - last >= wait) {
      last = now;
      fn(...args);
    }
  };
}

/**
 * Delay execution for given milliseconds
 * @param {number} ms - Milliseconds to wait
 * @returns {Promise<void>}
 */
export const delay = ms => new Promise(r => setTimeout(r, ms));

/**
 * Retry a function with exponential backoff
 * @param {Function} fn - Async function to retry
 * @param {Object} options - { retries: 3, delay: 1000, backoff: 2 }
 * @returns {Promise<*>}
 */
export async function retry(fn, { retries = 3, delay: initialDelay = 1000, backoff = 2 } = {}) {
  let lastError;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      if (i < retries) await delay(initialDelay * Math.pow(backoff, i));
    }
  }
  throw lastError;
}

/**
 * Run a function with a timeout
 * @param {Function} fn - Async function
 * @param {number} ms - Timeout in milliseconds
 * @param {string} [message] - Timeout error message
 * @returns {Promise<*>}
 */
export function timeout(fn, ms, message = 'Operation timed out') {
  return Promise.race([
    fn(),
    delay(ms).then(() => Promise.reject(new Error(message)))
  ]);
}

/**
 * Run functions in parallel with concurrency limit
 * @param {Array<Function>} fns - Array of async functions
 * @param {number} limit - Max concurrent executions
 * @returns {Promise<Array>}
 */
export async function parallel(fns, limit = 5) {
  const results = [];
  const executing = [];
  for (const [i, fn] of fns.entries()) {
    const p = Promise.resolve().then(() => fn()).then(r => results[i] = r);
    executing.push(p);
    if (executing.length >= limit) {
      await Promise.race(executing);
      executing.splice(executing.findIndex(e => e === p), 1);
    }
  }
  await Promise.all(executing);
  return results;
}

/**
 * Create a deferred promise
 * @returns {{ promise: Promise, resolve: Function, reject: Function }}
 */
export function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

/**
 * Run a function only once
 * @param {Function} fn - Function to run once
 * @returns {Function}
 */
export function once(fn) {
  let called = false, result;
  return (...args) => {
    if (!called) { called = true; result = fn(...args); }
    return result;
  };
}

/**
 * Memoize an async function
 * @param {Function} fn - Async function to memoize
 * @param {Function} [keyFn] - Function to generate cache key
 * @returns {Function}
 */
export function memoize(fn, keyFn = (...args) => JSON.stringify(args)) {
  const cache = new Map();
  return async (...args) => {
    const key = keyFn(...args);
    if (cache.has(key)) return cache.get(key);
    const result = await fn(...args);
    cache.set(key, result);
    return result;
  };
}

export default { debounce, throttle, delay, retry, timeout, parallel, deferred, once, memoize };
