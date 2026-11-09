const get = (obj, path) => path?.split('.').reduce((o, k) => o?.[k], obj);
const safeMethods = new Set(['split', 'join', 'slice', 'toUpperCase', 'toLowerCase', 'trim', 'charAt', 'substring', 'replace']);
const literals = new Map([['true', true], ['false', false], ['null', null], ['undefined', undefined]]);
export const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/**
 * JSON for embedding in an inline <script>. Plain JSON.stringify leaves `</script>`
 * (and U+2028/9) intact, so a string value could end the script block early.
 */
export const jsonForScript = v => JSON.stringify(v)
  .replace(/</g, '\\u003c')
  .replace(/\u2028/g, '\\u2028')
  .replace(/\u2029/g, '\\u2029');

// ─── Shared style helpers (client component + SSR renderer) ───────────────────

/** Pull every <style> block out of rendered HTML: { content, styles }. */
export const extractStyles = html => {
  let styles = '';
  return { content: html.replace(/<style>([\s\S]*?)<\/style>/gi, (_, css) => (styles += css, '')), styles };
};

/**
 * CSS Modules without PostCSS: every class name gets the element's tag appended
 * (.inner → .inner_app-footer) and the original→scoped map is exposed to templates
 * as $css. Element/pseudo selectors are untouched.
 */
const CLASS_RE = /\/\*[\s\S]*?\*\/|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|url\([^)]*\)|\.([a-zA-Z_][\w-]*)/g;

export const scopeCSS = (raw, scope) => {
  const classes = {};
  // Comments, quoted strings and url(…) are matched only to be skipped — a
  // `.png` in `url(img.png)` or `content: "a.b"` is not a class name.
  const styles = raw.replace(CLASS_RE, (m, n) => (n === undefined ? m : (classes[n] = `${n}_${scope}`, `.${classes[n]}`)));
  return { styles, classes };
};

// ─── Expression evaluator ─────────────────────────────────────────────────────
// A small tokenizer + recursive-descent parser, so precedence is the usual one:
//   ?:  <  ||  <  &&  <  comparison  <  + -  <  * /  <  ! -  <  . [] ()
// Parsed expressions are cached per source string — a template's expressions are
// re-evaluated on every render, but only ever parsed once.

const OP_RE = /===|!==|==|!=|>=|<=|&&|\|\||[?:!<>+\-*/().,[\]]/y;
const NUM_RE = /\d+(?:\.\d+)?/y;
// A hyphen directly between word characters is part of the name (`t.some-key`).
// evaluate() retries such a name as a subtraction when the lookup comes back
// undefined, which is what makes `count-1` work as well.
const NAME_RE = /[A-Za-z_$][\w$]*(?:-[\w$]+)*/y;
const NAME_NO_HYPHEN_RE = /[A-Za-z_$][\w$]*/y;

function tokenize(src, hyphenOps) {
  const toks = [];
  const nameRe = hyphenOps ? NAME_NO_HYPHEN_RE : NAME_RE;
  const n = src.length;
  let i = 0;
  const match = re => { re.lastIndex = i; return re.exec(src)?.[0]; };
  while (i < n) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue; }
    if (c === '"' || c === "'") {
      let j = i + 1, s = '';
      while (j < n && src[j] !== c) { if (src[j] === '\\' && j + 1 < n) j++; s += src[j++]; }
      if (j >= n) return null;
      toks.push({ t: 'str', v: s, s: i, e: j + 1 });
      i = j + 1;
      continue;
    }
    let m;
    if ((m = match(NUM_RE))) toks.push({ t: 'num', v: +m, raw: m, s: i, e: i + m.length });
    else if ((m = match(nameRe))) toks.push({ t: 'name', v: m, raw: m, s: i, e: i + m.length });
    else if ((m = match(OP_RE))) toks.push({ t: 'op', v: m, s: i, e: i + m.length });
    else return null;
    i += m.length;
  }
  return toks;
}

function parse(src, hyphenOps = false) {
  const toks = tokenize(src, hyphenOps);
  if (!toks || !toks.length) return null;
  let p = 0;
  const peek = v => toks[p]?.t === 'op' && toks[p].v === v;
  const eat = v => peek(v) && (p++, true);
  const fail = () => { throw new SyntaxError('bad expression'); };
  const binary = (next, ops) => () => {
    let left = next();
    while (toks[p]?.t === 'op' && ops.includes(toks[p].v)) { const op = toks[p++].v; left = [op, left, next()]; }
    return left;
  };

  function primary() {
    const tk = toks[p++];
    if (!tk) fail();
    if (tk.t === 'num' || tk.t === 'str') return ['lit', tk.v];
    if (tk.t === 'name') {
      if (literals.has(tk.v)) return ['lit', literals.get(tk.v)];
      if (eat('(')) return ['fn', tk.v, args()];
      return ['var', tk.v];
    }
    if (tk.v === '(') { const e = ternary(); if (!eat(')')) fail(); return e; }
    return fail();
  }
  function args() {
    const list = [];
    if (eat(')')) return list;
    do list.push(ternary()); while (eat(','));
    if (!eat(')')) fail();
    return list;
  }
  function postfix() {
    const first = p;
    let node = primary(), plainPath = node[0] === 'var';
    for (;;) {
      if (eat('.')) {
        const tk = toks[p++];
        if (!tk || (tk.t !== 'name' && tk.t !== 'num')) fail();
        if (eat('(')) { node = ['call', node, tk.raw, args()]; plainPath = false; }
        else node = ['get', node, tk.raw];
      } else if (eat('[')) {
        const index = ternary();
        if (!eat(']')) fail();
        node = ['idx', node, index];
        plainPath = false;
      } else break;
    }
    if (plainPath) {
      const text = src.slice(toks[first].s, toks[p - 1].e);
      if (text.includes('-')) return ['hyphen', node, text];
    }
    return node;
  }
  function unary() {
    if (eat('!')) return ['!', unary()];
    if (eat('-')) return ['neg', unary()];
    return postfix();
  }
  const mul = binary(unary, ['*', '/']);
  const add = binary(mul, ['+', '-']);
  const cmp = binary(add, ['===', '!==', '==', '!=', '>=', '<=', '>', '<']);
  const and = binary(cmp, ['&&']);
  const or = binary(and, ['||']);
  function ternary() {
    const cond = or();
    if (!eat('?')) return cond;
    const yes = ternary();
    if (!eat(':')) fail();
    return ['?', cond, yes, ternary()];
  }

  try {
    const ast = ternary();
    return p === toks.length ? ast : null;
  } catch { return null; }
}

const astCache = new Map();
const parseCached = (src, hyphenOps = false) => {
  const key = hyphenOps ? `-${src}` : `+${src}`;
  if (!astCache.has(key)) astCache.set(key, parse(src, hyphenOps));
  return astCache.get(key);
};

const numeric = (a, b) => typeof a === 'number' && typeof b === 'number';

function run(n, props) {
  switch (n[0]) {
    case 'lit': return n[1];
    // Own properties only, so {{constructor}} or {{toString}} stay unresolved.
    case 'var': return props != null && Object.hasOwn(props, n[1]) ? props[n[1]] : undefined;
    case 'get': {
      const obj = run(n[1], props);
      // `.length` of anything that isn't a list or a string is 0, so
      // `{{#if items.length}}` is safe before `items` has loaded.
      if (n[2] === 'length') return Array.isArray(obj) || typeof obj === 'string' ? obj.length : 0;
      return obj?.[n[2]];
    }
    case 'hyphen': {
      const v = run(n[1], props);
      if (v !== undefined) return v;
      const ast = parseCached(n[2], true);
      return ast ? run(ast, props) : undefined;
    }
    case 'idx': return run(n[1], props)?.[run(n[2], props)];
    case 'call': {
      const obj = run(n[1], props);
      if (obj == null || !safeMethods.has(n[2]) || typeof obj[n[2]] !== 'function') return undefined;
      return obj[n[2]](...n[3].map(a => run(a, props)));
    }
    // The only callable top-level name is the CSS-module class helper.
    case 'fn': return n[1] === '$c' && typeof props?.$c === 'function' ? props.$c(...n[2].map(a => run(a, props))) : undefined;
    case '!': return !run(n[1], props);
    case 'neg': { const v = run(n[1], props); return typeof v === 'number' ? -v : undefined; }
    case '?': return run(n[1], props) ? run(n[2], props) : run(n[3], props);
    case '&&': { const l = run(n[1], props); return l ? run(n[2], props) : l; }
    case '||': { const l = run(n[1], props); return l ? l : run(n[2], props); }
  }
  const l = run(n[1], props), r = run(n[2], props);
  switch (n[0]) {
    case '===': return l === r;
    case '!==': return l !== r;
    case '==': return l == r;
    case '!=': return l != r;
    case '>': return l > r;
    case '<': return l < r;
    case '>=': return l >= r;
    case '<=': return l <= r;
    case '+': return numeric(l, r) ? l + r : String(l ?? '') + String(r ?? '');
    case '-': return numeric(l, r) ? l - r : undefined;
    case '*': return numeric(l, r) ? l * r : undefined;
    case '/': return numeric(l, r) ? (r ? l / r : 0) : undefined;
  }
}

/** Evaluate a template expression against props. Unparseable input → plain path lookup. */
export function evaluate(expr, props) {
  const src = expr.trim();
  const ast = parseCached(src);
  return ast ? run(ast, props) : get(props, src);
}

export const render = (tpl, props = {}) =>
  tpl.replace(/\{\{([^{}]+)\}\}/g, (m, p) => get(props, p.trim()) ?? m);

// Extract :prop="expr" bindings from template, returns { html, bindings }
export function extractPropBindings(tpl) {
  const bindings = [];
  let bindId = 0;
  const html = tpl.replace(/<([a-z]+-[a-z-]+)([^>]*?)(\s*\/?>)/gi, (match, tag, attrs, close) => {
    const propBindings = {};
    const cleanAttrs = attrs.replace(/\s:([a-zA-Z_][\w-]*)="([^"]+)"/g, (_, propName, expr) => {
      propBindings[propName] = expr;
      return '';
    });
    if (Object.keys(propBindings).length) {
      const id = `__bind_${bindId++}`;
      bindings.push({ id, props: propBindings });
      return `<${tag}${cleanAttrs} data-prop-bind="${id}"${close}`;
    }
    return match;
  });
  return { html, bindings };
}

// Evaluate prop bindings and return map of id -> evaluated props
export function evaluatePropBindings(bindings, props) {
  const result = {};
  for (const { id, props: propExprs } of bindings) {
    result[id] = {};
    for (const [propName, expr] of Object.entries(propExprs)) {
      result[id][propName] = evaluate(expr, props);
    }
  }
  return result;
}

const EACH_RE = /\{\{#each\s+(\w+)\s*\}\}([\s\S]*?)\{\{\/each\}\}/g;
// Innermost blocks only (the body may not contain another {{#if), so repeated
// global passes resolve nesting from the inside out.
const IF_RE = /\{\{#if\s+([^}]+)\}\}((?:(?!\{\{#if)[\s\S])*?)(?:\{\{else\}\}((?:(?!\{\{#if)[\s\S])*?))?\{\{\/if\}\}/g;
// Stands in for an already-rendered {{#each}} block while the rest of the
// template is processed, so item output is never scanned for {{…}} a second time.
const SLOT_RE = /\u0000(\d+)\u0000/g;

const print = v => (typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v));

export function renderWithExpressions(tpl, props = {}) {
  // {{#each}}: every item renders the block with its own fields in scope
  // ({{name}}, {{this.name}}, {{this}}, {{@index}}), through the same pipeline as
  // the rest of the template — so values are HTML-escaped and {{#if}} sees the item.
  const slots = [];
  let r = tpl.replace(EACH_RE, (_, arr, block) => {
    const items = props[arr];
    const out = !Array.isArray(items) ? '' : items.map((item, i) => {
      const scope = { ...props, ...(item && typeof item === 'object' ? item : null), this: item };
      return renderWithExpressions(block.replace(/\{\{@index\}\}/g, () => i), scope);
    }).join('');
    return `\u0000${slots.push(out) - 1}\u0000`;
  });

  for (let prev; prev !== r;) {
    prev = r;
    r = r.replace(IF_RE, (_, cond, yes, no = '') => (evaluate(cond, props) ? yes : no));
  }

  // Triple braces {{{expr}}} for unescaped output
  r = r.replace(/\{\{\{([^{}]+)\}\}\}/g, (m, e) => {
    const v = evaluate(e, props);
    return v !== undefined ? print(v) : m;
  });

  // Double braces {{expr}} for escaped output
  r = r.replace(/\{\{([^{}]+)\}\}/g, (m, e) => {
    const t = e.trim();
    if (t[0] === '#' || t[0] === '/') return m;
    const v = evaluate(t, props);
    return v !== undefined ? escapeHtml(print(v)) : m;
  });

  return slots.length ? r.replace(SLOT_RE, (_, i) => slots[i]) : r;
}
