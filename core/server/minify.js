// Zero-dependency JS tokenizer-based minifier and CSS minifier

const REGEX_AFTER = new Set([
  'return','typeof','void','delete','throw','new','in','instanceof','of',
  'case','yield','await','export','default','import','from',
  '=','+=','-=','*=','/=','%=','**=','&=','|=','^=','&&=','||=','??=',
  '=>','(','[','{','}',';',',','!','~','&&','||','??','?',':','?.','<','>',
  '<=','>=','==','!=','===','!==','++','--','+','-','*','%','**','&','|','^',
]);

const isWord = c => /[\w$]/.test(c);

function nextNonSpace(src, i) {
  while (i < src.length && /\s/.test(src[i])) i++;
  return src[i];
}

export function minifyJS(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  let last = ''; // last emitted token value for regex disambiguation
  let ws = false, nl = false; // whitespace / a line break seen since the last token

  // Can the previous token end a statement, and can `s` start one? Only then does
  // JavaScript insert a semicolon at a line break — so only then must the break
  // survive. Dropping it would glue `const a = 1\nconst b = 2` into a syntax error.
  const endsStatement = () => /[\w$)\]}'"`]/.test(out[out.length - 1]) || last === '++' || last === '--' || (last.length > 1 && last[0] === '/');
  const startsStatement = s => /[\w$'"{!~]/.test(s[0]) || s === '++' || s === '--';

  const eat = (s) => {
    if (out) {
      const prev = out[out.length - 1];
      if (nl && endsStatement() && startsStatement(s)) out += '\n';
      // Two words need a space; so do `a + +b` / `a - -b`, or they become `++` / `--`.
      else if (ws && ((isWord(prev) && isWord(s[0])) || ((prev === '+' || prev === '-') && s[0] === prev))) out += ' ';
    }
    ws = nl = false;
    out += s;
    last = s;
  };

  function readStr(q) {
    let s = q; i++;
    while (i < n) {
      const c = src[i];
      if (c === '\\') { s += c + (src[i+1] ?? ''); i += 2; continue; }
      s += c; i++;
      if (c === q) break;
    }
    return s;
  }

  function readTpl() {
    let s = '`'; i++;
    while (i < n) {
      const c = src[i];
      if (c === '\\') { s += c + (src[i+1] ?? ''); i += 2; continue; }
      if (c === '$' && src[i+1] === '{') {
        s += '${'; i += 2;
        let depth = 1;
        while (i < n && depth > 0) {
          const tc = src[i];
          if (tc === '\\') { s += tc + (src[i+1] ?? ''); i += 2; continue; }
          if (tc === '`') { s += readTpl(); continue; }
          if (tc === '"' || tc === "'") { s += readStr(tc); continue; }
          if (tc === '{') depth++;
          else if (tc === '}') { depth--; if (!depth) { s += '}'; i++; break; } }
          s += tc; i++;
        }
        continue;
      }
      s += c; i++;
      if (c === '`') break;
    }
    return s;
  }

  function readRegex() {
    let s = '/'; i++;
    let inClass = false;
    while (i < n) {
      const c = src[i];
      if (c === '\\') { s += c + (src[i+1] ?? ''); i += 2; continue; }
      if (c === '[') { inClass = true; }
      else if (c === ']') { inClass = false; }
      else if (c === '/' && !inClass) { s += c; i++; break; }
      s += c; i++;
    }
    while (i < n && /[gimsuy]/.test(src[i])) s += src[i++];
    return s;
  }

  function canRegex() {
    if (!last) return true;
    return REGEX_AFTER.has(last);
  }

  while (i < n) {
    const c = src[i];

    // Whitespace
    if (/\s/.test(c)) {
      // Only recorded here; eat() decides what (if anything) the gap becomes.
      ws = true;
      while (i < n && /\s/.test(src[i])) { if (src[i] === '\n') nl = true; i++; }
      continue;
    }

    // Single-line comment
    if (c === '/' && src[i+1] === '/') {
      while (i < n && src[i] !== '\n') i++;
      ws = true;
      continue;
    }

    // Block comment — preserve if it starts with /*! (license)
    if (c === '/' && src[i+1] === '*') {
      const keep = src[i+2] === '!';
      const start = i; i += 2;
      while (i < n && !(src[i] === '*' && src[i+1] === '/')) i++;
      i += 2;
      if (keep) out += src.slice(start, i);
      ws = true;
      if (src.slice(start, i).includes('\n')) nl = true;
      continue;
    }

    // Regex
    if (c === '/' && src[i+1] !== '/' && src[i+1] !== '*' && canRegex()) {
      eat(readRegex());
      continue;
    }

    // Template literal
    if (c === '`') { eat(readTpl()); continue; }

    // Strings
    if (c === '"' || c === "'") { eat(readStr(c)); continue; }

    // Words (identifiers, keywords, numbers)
    if (isWord(c)) {
      let w = '';
      while (i < n && isWord(src[i])) w += src[i++];
      eat(w);
      continue;
    }

    // Multi-char operators (longest first)
    const three = src.slice(i, i+3);
    const two = src.slice(i, i+2);
    const threes = ['===','!==','**=','&&=','||=','??=','...','<<=','>>=','?.'];
    const twos = ['==','!=','>=','<=','=>','**','&&','||','??','++','--','+=','-=','*=','/=','%=','&=','|=','^=','?.','<<','>>'];
    if (threes.includes(three)) { eat(three); i += 3; continue; }
    if (twos.includes(two)) { eat(two); i += 2; continue; }

    eat(c); i++;
  }

  return out.trim();
}

// Quoted strings are lifted out before the whitespace passes and restored after,
// so `content: "a  b"` and `url("x y.png")` come through byte-for-byte.
const MARK = String.fromCharCode(1);
const MARK_RE = new RegExp(`${MARK}(\\d+)${MARK}`, 'g');

export function minifyCSS(src) {
  const strings = [];
  let depth = 0;
  return src
    .replace(/\/\*[\s\S]*?\*\/|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g,
      s => (s[0] === '/' ? '' : `${MARK}${strings.push(s) - 1}${MARK}`))
    .replace(/\s+/g, ' ')
    .replace(/\s*([{};,>~])\s*/g, '$1')
    // After a colon only: `a :hover` (any hovered descendant) is not `a:hover`.
    .replace(/:\s+/g, ':')
    // `+` is a sibling combinator in selectors but an operator inside calc()/clamp(),
    // where the surrounding spaces are required: `calc(1px + 2px)`.
    .replace(/\(|\)|\s*\+\s*/g, s => {
      if (s === '(') { depth++; return s; }
      if (s === ')') { depth--; return s; }
      if (depth > 0) return /^\s+\+\s+$/.test(s) ? ' + ' : s;
      return '+';
    })
    .replace(/;}/g, '}')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .trim()
    .replace(MARK_RE, (_, i) => strings[i]);
}

/** Minify the <style> blocks of a component template; markup is left untouched. */
export const minifyTemplateCSS = html =>
  html.replace(/<style>([\s\S]*?)<\/style>/gi, (_, css) => `<style>${minifyCSS(css)}</style>`);
