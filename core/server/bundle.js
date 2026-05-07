// Zero-dependency ESM bundler
// Handles static import/export, leaves dynamic import() with resolved paths.
// Node built-ins (node:*) are excluded from bundling.

import { readFile } from 'node:fs/promises';
import { resolve, dirname, join, relative } from 'node:path';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { minifyJS } from './minify.js';

// ─── Import/export regex patterns ───────────────────────────────────────────

// static import forms
const RE_IMPORT = /^[ \t]*import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"]\s*;?/gm;
// import 'side-effect'
const RE_IMPORT_SIDE = /^[ \t]*import\s+['"]([^'"]+)['"]\s*;?/gm;
// dynamic import() — just update the path
const RE_IMPORT_DYN = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

// export default X
const RE_EXPORT_DEFAULT = /^[ \t]*export\s+default\s+/m;
// export { a, b as c }
const RE_EXPORT_NAMED_BLOCK = /^[ \t]*export\s+\{([^}]+)\}\s*(?:from\s+['"]([^'"]+)['"])?\s*;?/gm;
// export const/let/var/function/class/async function name
const RE_EXPORT_DECL = /^[ \t]*export\s+((?:async\s+)?(?:const|let|var|function\*?|class))\s+(\w+)/gm;
// export * from 'path'
const RE_EXPORT_STAR = /^[ \t]*export\s+\*(?:\s+as\s+(\w+))?\s+from\s+['"]([^'"]+)['"]\s*;?/gm;
// export default function/class (named or anonymous)
const RE_EXPORT_DEFAULT_DECL = /^[ \t]*export\s+default\s+((?:async\s+)?function\*?|class)(?:\s+(\w+))?/gm;

// ─── Path resolution ─────────────────────────────────────────────────────────

function resolveImport(specifier, fromFile, root) {
  if (specifier.startsWith('node:') || (!specifier.startsWith('.') && !specifier.startsWith('/'))) return null;
  let abs;
  if (specifier.startsWith('/')) abs = join(root, specifier);
  else abs = resolve(dirname(fromFile), specifier);
  // Try as-is, then with .js extension
  if (existsSync(abs)) return abs;
  if (existsSync(abs + '.js')) return abs + '.js';
  return null;
}

// Normalised module key (root-relative URL)
const moduleKey = (abs, root) => '/' + relative(root, abs).replace(/\\/g, '/');

// ─── Module graph builder ─────────────────────────────────────────────────────

async function buildGraph(entry, root, graph = new Map(), order = []) {
  const key = moduleKey(entry, root);
  if (graph.has(key)) return;

  const src = await readFile(entry, 'utf-8');
  const deps = [];

  // Collect all specifiers
  for (const re of [RE_IMPORT, RE_IMPORT_SIDE, RE_EXPORT_NAMED_BLOCK, RE_EXPORT_STAR]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(src)) !== null) {
      const spec = m[m.length - 1]; // last capture is always the specifier
      if (!spec) continue;
      const abs = resolveImport(spec, entry, root);
      if (abs) deps.push({ spec, abs, key: moduleKey(abs, root) });
    }
  }
  // dynamic imports — just collect for resolution later
  RE_IMPORT_DYN.lastIndex = 0;
  let dm;
  while ((dm = RE_IMPORT_DYN.exec(src)) !== null) {
    const abs = resolveImport(dm[1], entry, root);
    if (abs) deps.push({ spec: dm[1], abs, key: moduleKey(abs, root), dynamic: true });
  }

  graph.set(key, { src, entry, deps });

  // Recurse (depth-first, skipping dynamic)
  for (const dep of deps.filter(d => !d.dynamic)) {
    await buildGraph(dep.abs, root, graph, order);
  }
  order.push(key);
}

// ─── Module transformer ───────────────────────────────────────────────────────

function transformModule(key, src, deps, root) {
  const depBySpec = new Map(deps.map(d => [d.spec, d]));

  let out = src;

  // 1. Side-effect imports: import 'x'
  out = out.replace(RE_IMPORT_SIDE, (_, spec) => {
    const dep = resolveImport(spec, join(root, key), root);
    if (!dep) return _; // external, keep
    return `__r(${JSON.stringify(moduleKey(dep, root))});`;
  });

  // 2. Static imports: import ... from 'x'
  out = out.replace(RE_IMPORT, (_, clause, spec) => {
    const dep = resolveImport(spec, join(root, key), root);
    if (!dep) {
      // External/node — drop (shouldn't appear in client bundles)
      return `/* external: ${spec} */`;
    }
    const depKey = JSON.stringify(moduleKey(dep, root));
    const c = clause.trim();

    // import * as ns from 'x'
    const nsMatch = c.match(/^\*\s+as\s+(\w+)$/);
    if (nsMatch) return `const ${nsMatch[1]}=__r(${depKey});`;

    // import def from 'x' or import def, { ... } from 'x'
    const defaultMatch = c.match(/^(\w+)(?:\s*,\s*(.+))?$/);
    const braceMatch = c.match(/^\{([^}]+)\}$/);

    let lines = [`const __dep${depKey.slice(1,-1).replace(/[^a-z0-9]/gi,'_')}=__r(${depKey});`];
    const tmp = `__dep${depKey.slice(1,-1).replace(/[^a-z0-9]/gi,'_')}`;

    if (defaultMatch) {
      lines.push(`const ${defaultMatch[1]}=${tmp}.default??${tmp};`);
      if (defaultMatch[2]) {
        // has named part too
        const named = defaultMatch[2].replace(/^\{|\}$/g,'').trim();
        for (const part of named.split(',')) {
          const [orig, alias] = part.trim().split(/\s+as\s+/);
          if (orig?.trim()) lines.push(`const ${(alias||orig).trim()}=${tmp}.${orig.trim()};`);
        }
      }
    } else if (braceMatch) {
      for (const part of braceMatch[1].split(',')) {
        const [orig, alias] = part.trim().split(/\s+as\s+/);
        if (orig?.trim()) lines.push(`const ${(alias||orig).trim()}=${tmp}.${orig.trim()};`);
      }
    } else {
      // fallback
      lines = [`const __imp=__r(${depKey});`];
    }

    return lines.join('');
  });

  // 3. export * from / export * as ns from
  out = out.replace(RE_EXPORT_STAR, (_, ns, spec) => {
    const dep = resolveImport(spec, join(root, key), root);
    if (!dep) return '';
    const dk = JSON.stringify(moduleKey(dep, root));
    if (ns) return `exports.${ns}=__r(${dk});`;
    return `Object.assign(exports,__r(${dk}));`;
  });

  // 4. export { a, b as c } from 'x'  OR  export { a, b }
  out = out.replace(RE_EXPORT_NAMED_BLOCK, (_, names, spec) => {
    const parts = names.split(',').map(p => p.trim()).filter(Boolean);
    if (spec) {
      const dep = resolveImport(spec, join(root, key), root);
      const dk = JSON.stringify(dep ? moduleKey(dep, root) : spec);
      return parts.map(p => {
        const [orig, alias] = p.split(/\s+as\s+/);
        return `exports.${(alias||orig).trim()}=__r(${dk}).${orig.trim()};`;
      }).join('');
    }
    return parts.map(p => {
      const [orig, alias] = p.split(/\s+as\s+/);
      return `exports.${(alias||orig).trim()}=${orig.trim()};`;
    }).join('');
  });

  // 5. export default function/class Name (with or without name)
  out = out.replace(RE_EXPORT_DEFAULT_DECL, (_, kw, name) => {
    if (name) return `${kw} ${name}`;
    return `exports.default=${kw} `;
  });
  // After the named export-default-decl block: append exports.Name = Name;
  // We handle this with a post-pass below.

  // 6. export const/let/var/function*/class name = ...
  out = out.replace(RE_EXPORT_DECL, (_, kw, name) => `${kw} ${name}`);

  // 7. export default <expression>  (must come after #5)
  out = out.replace(/^[ \t]*export\s+default\s+/m, 'exports.default=');

  // Collect all names that were exported via declarations so we can wire them up
  // We do a second scan on original src
  const exportedNames = [];
  RE_EXPORT_DECL.lastIndex = 0;
  let m;
  while ((m = RE_EXPORT_DECL.exec(src)) !== null) exportedNames.push(m[2]);
  RE_EXPORT_DEFAULT_DECL.lastIndex = 0;
  while ((m = RE_EXPORT_DEFAULT_DECL.exec(src)) !== null) {
    if (m[2]) exportedNames.push({ name: m[2], asDefault: true });
  }

  const wires = exportedNames.map(e => {
    if (typeof e === 'string') return `exports.${e}=${e};`;
    return `exports.default=${e.name};`;
  }).join('');

  // 8. Dynamic imports — rewrite specifiers to resolved keys
  out = out.replace(RE_IMPORT_DYN, (full, spec) => {
    const dep = resolveImport(spec, join(root, key), root);
    if (!dep) return full;
    return `import(${JSON.stringify(moduleKey(dep, root))})`;
  });

  return out + (wires ? '\n' + wires : '');
}

// ─── Bundle emitter ───────────────────────────────────────────────────────────

export async function bundle(entryAbs, root, { minify = false } = {}) {
  const graph = new Map();
  const order = [];
  await buildGraph(entryAbs, root, graph, order);

  const entryKey = moduleKey(entryAbs, root);

  const parts = [
    '(function(){\n"use strict";\n',
    'const __m={};\n',
    'const __r=id=>{\n  if(__m[id])return __m[id];\n  throw new Error("Module not found: "+id);\n};\n',
    'const __d=(id,fn)=>{\n  const e={__esModule:true};\n  __m[id]=e;\n  fn(e,__r);\n  return e;\n};\n\n',
  ];

  for (const key of order) {
    const { src, entry, deps } = graph.get(key);
    let transformed = transformModule(key, src, deps, root);
    if (minify) transformed = minifyJS(transformed);
    parts.push(`__d(${JSON.stringify(key)},(exports,__r)=>{\n${transformed}\n});\n\n`);
  }

  // Run entry
  parts.push(`__r(${JSON.stringify(entryKey)});\n})();\n`);

  const code = parts.join('');
  const hash = createHash('sha256').update(code).digest('hex').slice(0, 8);
  return { code, hash };
}

// ─── Dependency list (for preload generation) ─────────────────────────────────

export async function getDeps(entryAbs, root) {
  const graph = new Map();
  const order = [];
  await buildGraph(entryAbs, root, graph, order);
  return order;
}
