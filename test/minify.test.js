import test from 'node:test';
import assert from 'node:assert/strict';
import { minifyJS, minifyCSS, minifyTemplateCSS } from '../core/server/minify.js';

// Minified code must still mean the same thing: run both and compare.
const run = src => new Function(`${src}\nreturn result;`)();
const same = src => assert.deepEqual(run(minifyJS(src)), run(src));

test('JS without semicolons survives (ASI)', () => {
  same('const a = 1\nconst b = 2\nlet c = a\nc++\nconst f = function () { return 5 }\nconst result = [a, b, c, f()]');
  same('let i = 1\nlet j = 2\ni\n++\nj\nconst result = [i, j]');
});

test('JS operators that must not merge', () => {
  same('const a = 2, b = 3\nconst result = [a + +b, a - -b, a / b, /a+/.test("aa")];');
});

test('JS strings, templates, regexes and comments', () => {
  same('const s = "a  //  b"; const t = `x ${ 1 +  1 } /* y */`; // gone\n/* gone */ const re = /[/]  +/g;\nconst result = [s, t, re.source];');
  assert.equal(minifyJS('/*! keep */ a  =  1'), '/*! keep */a=1');
});

test('CSS', () => {
  assert.equal(minifyCSS('a , b > c + d { color : red ; margin: 0 auto; }'), 'a,b>c+d{color :red;margin:0 auto}');
  assert.equal(minifyCSS('.x { width: calc( 100% + 2px - 1em ); }'), '.x{width:calc(100% + 2px - 1em)}');
  assert.equal(minifyCSS('a :hover { content: "a  +  b /* c */" } /* gone */'), 'a :hover{content:"a  +  b /* c */"}');
  assert.equal(minifyTemplateCSS('<style>\n  a { b: c; }\n</style>\n<p>  kept  </p>'), '<style>a{b:c}</style>\n<p>  kept  </p>');
});
