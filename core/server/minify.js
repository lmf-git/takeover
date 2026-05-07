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

  const eat = (s) => { out += s; last = s; };

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
      let nl = false;
      while (i < n && /\s/.test(src[i])) { if (src[i] === '\n') nl = true; i++; }
      // Need space between two word tokens; newline can act as semicolon in some spots
      if (out && i < n && isWord(out[out.length-1]) && isWord(src[i])) out += ' ';
      continue;
    }

    // Single-line comment
    if (c === '/' && src[i+1] === '/') {
      while (i < n && src[i] !== '\n') i++;
      continue;
    }

    // Block comment — preserve if it starts with /*! (license)
    if (c === '/' && src[i+1] === '*') {
      const keep = src[i+2] === '!';
      const start = i; i += 2;
      while (i < n && !(src[i] === '*' && src[i+1] === '/')) i++;
      i += 2;
      if (keep) out += src.slice(start, i);
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

export function minifyCSS(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([{}:;,>~+])\s*/g, '$1')
    .replace(/;}/g, '}')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .trim();
}
