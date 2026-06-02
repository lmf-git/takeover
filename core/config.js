// Zero-dependency project configuration loader.
//
// Core ships no project/implementation-specific values. Anything an individual
// site needs to tune — supported locales, critical-path font/module preloads —
// lives in `app.config.yml` at the repo root. This module reads that file (with
// a minimal YAML parser, so there's no dependency) and fills in sensible
// autodiscovered defaults when keys are omitted.
//
// Shape after normalization:
//   {
//     locales: { supported: string[], default: string },
//     preload: { fonts: string[], modules: string[] }
//   }

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// ─── Minimal YAML parser ──────────────────────────────────────────────────────
// Supports the subset this config needs: nested maps (by indentation),
// scalar block lists (`- item`), inline lists (`[a, b]`), comments, and the
// scalar types string/number/boolean/null. Not a general YAML implementation.

function stripComment(line) {
  let inSingle = false, inDouble = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === "'" && !inDouble) inSingle = !inSingle;
    else if (c === '"' && !inSingle) inDouble = !inDouble;
    else if (c === '#' && !inSingle && !inDouble && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i);
  }
  return line;
}

function parseScalar(v) {
  v = v.trim();
  if (v === '' || v === 'null' || v === '~') return null;
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (/^-?\d+$/.test(v)) return parseInt(v, 10);
  if (/^-?\d*\.\d+$/.test(v)) return parseFloat(v);
  if (v[0] === '[' && v[v.length - 1] === ']') {
    const inner = v.slice(1, -1).trim();
    return inner ? inner.split(',').map(parseScalar) : [];
  }
  if ((v[0] === '"' && v[v.length - 1] === '"') || (v[0] === "'" && v[v.length - 1] === "'")) return v.slice(1, -1);
  return v;
}

function parseYaml(text) {
  const lines = [];
  for (const raw of text.split(/\r?\n/)) {
    const stripped = stripComment(raw);
    if (!stripped.trim()) continue;
    lines.push({ indent: stripped.length - stripped.trimStart().length, content: stripped.trim() });
  }

  let i = 0;
  function parseBlock() {
    const baseIndent = lines[i].indent;
    if (lines[i].content.startsWith('- ')) {
      const arr = [];
      while (i < lines.length && lines[i].indent === baseIndent && lines[i].content.startsWith('- ')) {
        arr.push(parseScalar(lines[i].content.slice(2)));
        i++;
      }
      return arr;
    }
    const obj = {};
    while (i < lines.length && lines[i].indent === baseIndent) {
      const idx = lines[i].content.indexOf(':');
      if (idx === -1) { i++; continue; }
      const key = lines[i].content.slice(0, idx).trim();
      const rest = lines[i].content.slice(idx + 1).trim();
      i++;
      if (rest === '') {
        obj[key] = (i < lines.length && lines[i].indent > baseIndent) ? parseBlock() : null;
      } else {
        obj[key] = parseScalar(rest);
      }
    }
    return obj;
  }

  return i < lines.length ? parseBlock() : {};
}

// ─── Autodiscovery fallbacks ──────────────────────────────────────────────────

function discoverLocales(root) {
  try {
    return readdirSync(join(root, 'locales'))
      .filter(f => f.endsWith('.json'))
      .map(f => f.slice(0, -5))
      .sort();
  } catch { return []; }
}

function discoverFonts(root) {
  try {
    return readdirSync(join(root, 'public/fonts'))
      .filter(f => f.endsWith('.woff2'))
      .map(f => `/fonts/${f}`)
      .sort();
  } catch { return []; }
}

// ─── Normalization ────────────────────────────────────────────────────────────

function normalize(raw, root) {
  const localesCfg = raw.locales || {};
  let supported = localesCfg.supported;
  if (!Array.isArray(supported) || supported === 'auto') supported = discoverLocales(root);
  if (!supported.length) supported = ['en'];
  const wanted = localesCfg.default;
  const fallback = wanted && supported.includes(wanted) ? wanted : supported[0];

  const preload = raw.preload || {};
  // fonts: omit → none (preloading is a curated perf decision); `auto` → discover
  // every woff2 under public/fonts; an explicit list → use it verbatim.
  let fonts = preload.fonts;
  if (fonts === 'auto') fonts = discoverFonts(root);
  else if (!Array.isArray(fonts)) fonts = [];

  return {
    locales: { supported, default: fallback },
    preload: { fonts, modules: Array.isArray(preload.modules) ? preload.modules : [] },
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

const cache = new Map();

/**
 * Load and normalize `app.config.yml` (or `.yaml`) from `root`. Cached per root.
 * Falls back to autodiscovery / safe defaults when the file or any key is absent.
 */
export function loadConfig(root = DEFAULT_ROOT) {
  if (cache.has(root)) return cache.get(root);
  const file = ['app.config.yml', 'app.config.yaml'].map(f => join(root, f)).find(existsSync);
  let raw = {};
  if (file) {
    try { raw = parseYaml(readFileSync(file, 'utf-8')); } catch (e) { console.warn(`[config] Failed to parse ${file}:`, e.message); }
  }
  const config = normalize(raw, root);
  cache.set(root, config);
  return config;
}
