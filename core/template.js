const get = (obj, path) => path?.split('.').reduce((o, k) => o?.[k], obj);
const safeMethods = new Set(['split', 'join', 'slice', 'toUpperCase', 'toLowerCase', 'trim', 'charAt', 'substring', 'replace']);
const literals = { true: true, false: false, null: null, undefined: undefined };

function evaluate(expr, props) {
  const t = expr.trim();
  if (t in literals) return literals[t];
  if (t.startsWith('!')) return !evaluate(t.slice(1), props);

  let m;
  if (m = t.match(/^(.+?)\s*\?\s*(.+?)\s*:\s*(.+)$/))
    return evaluate(m[1], props) ? evaluate(m[2], props) : evaluate(m[3], props);

  if (m = t.match(/^(.+?)\s*(===|!==|==|!=|>=|<=|>|<)\s*(.+)$/)) {
    const lv = evaluate(m[1], props), rv = evaluate(m[3], props);
    const ops = { '===': (a, b) => a === b, '!==': (a, b) => a !== b, '==': (a, b) => a == b, '!=': (a, b) => a != b, '>': (a, b) => a > b, '<': (a, b) => a < b, '>=': (a, b) => a >= b, '<=': (a, b) => a <= b };
    return ops[m[2]](lv, rv);
  }

  if (t.includes('&&')) return t.split('&&').every(p => evaluate(p, props));
  if (t.includes('||')) return t.split('||').some(p => evaluate(p, props));

  if (m = t.match(/^(.+?)\s*([\*\/\+\-])\s*(.+)$/)) {
    const lv = evaluate(m[1], props), rv = evaluate(m[3], props), op = m[2];
    if (typeof lv === 'number' && typeof rv === 'number')
      return { '*': lv * rv, '/': rv ? lv / rv : 0, '+': lv + rv, '-': lv - rv }[op];
    if (op === '+') return String(lv ?? '') + String(rv ?? '');
  }

  if (m = t.match(/^(.+?)\.(\w+)\(([^)]*)\)(\[\d+\])?$/)) {
    const obj = evaluate(m[1], props);
    if (!obj || !safeMethods.has(m[2])) return;
    const arg = m[3].match(/^['"](.*)['"]$/) ? m[3].slice(1, -1) : /^-?\d+$/.test(m[3]) ? +m[3] : undefined;
    const res = arg !== undefined ? obj[m[2]](arg) : obj[m[2]]();
    return m[4] && Array.isArray(res) ? res[+m[4].slice(1, -1)] : res;
  }

  if (m = t.match(/^(.+?)\[(\d+)\]$/)) return evaluate(m[1], props)?.[+m[2]];
  if (m = t.match(/^(['"])(.*)(\1)$/)) return m[2];
  if (/^-?\d+(\.\d+)?$/.test(t)) return +t;
  if (t.endsWith('.length')) { const a = get(props, t.slice(0, -7)); return Array.isArray(a) ? a.length : 0; }

  return get(props, t);
}

export const render = (tpl, props = {}) =>
  tpl.replace(/\{\{([^{}]+)\}\}/g, (m, p) => get(props, p.trim()) ?? m);

export function renderWithExpressions(tpl, props = {}) {
  let r = tpl;

  r = r.replace(/\{\{#each\s+(\w+)\s*\}\}([\s\S]*?)\{\{\/each\}\}/g, (_, arr, block) => {
    const items = props[arr];
    if (!Array.isArray(items)) return '';
    return items.map((item, i) => {
      let o = block
        .replace(/\{\{#if\s+([^}]+)\}\}([^{]*?)(?:\{\{else\}\}([^{]*?))?\{\{\/if\}\}/g, (_, c, y, n = '') => evaluate(c, { ...props, ...item }) ? y : n)
        .replace(/\{\{this\}\}/g, typeof item === 'object' ? JSON.stringify(item) : item)
        .replace(/\{\{@index\}\}/g, i);
      if (typeof item === 'object' && item)
        Object.entries(item).forEach(([k, v]) => o = o.replace(new RegExp(`\\{\\{(this\\.)?${k}\\}\\}`, 'g'), v ?? ''));
      return o;
    }).join('');
  });

  for (let i = 0; i < 10; i++) {
    const m = r.match(/\{\{#if\s+([^}]+)\}\}((?:(?!\{\{#if)[\s\S])*?)(?:\{\{else\}\}((?:(?!\{\{#if)[\s\S])*?))?\{\{\/if\}\}/);
    if (!m) break;
    r = r.replace(m[0], evaluate(m[1], props) ? m[2] : m[3] || '');
  }

  return r.replace(/\{\{([^{}]+)\}\}/g, (m, e) => {
    const t = e.trim();
    if (t[0] === '#' || t[0] === '/') return m;
    const v = evaluate(t, props);
    return v !== undefined ? String(v) : m;
  });
}
