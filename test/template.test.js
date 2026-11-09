import test from 'node:test';
import assert from 'node:assert/strict';
import { renderWithExpressions as r, evaluate, jsonForScript, scopeCSS } from '../core/template.js';

test('paths, literals and unresolved names', () => {
  assert.equal(r('{{t.nav.home}} {{ n }} {{ ok }}', { t: { nav: { home: 'Home' } }, n: 0, ok: false }), 'Home 0 false');
  assert.equal(r('{{ missing }} {{constructor}}', {}), '{{ missing }} {{constructor}}');
  assert.equal(r('{{ t.some-key }} {{ count-1 }} {{ count - 1 }}', { t: { 'some-key': 'k' }, count: 5 }), 'k 4 4');
});

test('operator precedence', () => {
  assert.equal(evaluate('a === 1 && b === 2', { a: 1, b: 2 }), true);
  assert.equal(evaluate('!a && b', { a: 0, b: 0 }), 0);
  assert.equal(evaluate('!a || b', { a: 0, b: 0 }), true);
  assert.equal(evaluate('a + 1 * 2', { a: 1 }), 3);
  assert.equal(evaluate('(a + 1) * 2', { a: 1 }), 4);
  assert.equal(evaluate('n > -1', { n: 0 }), true);
  assert.equal(evaluate("x ? 'a:b' : 'c'", { x: 1 }), 'a:b');
  assert.equal(evaluate("'a+b'", {}), 'a+b');
  assert.equal(evaluate("name || 'anon'", {}), 'anon');
});

test('methods, indexing, length, $c', () => {
  assert.equal(evaluate('name.toUpperCase()', { name: 'bob' }), 'BOB');
  assert.equal(evaluate("csv.split(',')[1]", { csv: 'a,b' }), 'b');
  assert.equal(evaluate('name.constructor()', { name: 'bob' }), undefined);
  assert.equal(evaluate('xs.length', { xs: [1, 2] }), 2);
  assert.equal(evaluate('nope.length', {}), 0);
  assert.equal(evaluate("$c('a', 'b')", { $c: (...n) => n.join(' ') }), 'a b');
  assert.equal(evaluate("alert('x')", { alert: () => 'called' }), undefined);
});

test('escaping', () => {
  assert.equal(r('{{html}} {{{html}}}', { html: '<b>' }), '&lt;b&gt; <b>');
});

test('{{#if}}: nesting, else, more than ten blocks, $ in the body', () => {
  assert.equal(r('{{#if a}}A{{#if b}}B{{else}}b{{/if}}{{else}}no{{/if}}', { a: 1, b: 0 }), 'Ab');
  assert.equal(r(Array.from({ length: 12 }, (_, i) => `{{#if x}}${i}{{/if}}`).join(','), { x: true }), '0,1,2,3,4,5,6,7,8,9,10,11');
  assert.equal(r('{{#if x}}price $& done{{/if}}', { x: 1 }), 'price $& done');
});

test('{{#each}}: escaped, item-scoped, never re-evaluated', () => {
  const items = [{ name: '<img onerror=x>', on: true }, { name: '{{secret}} $&' }];
  assert.equal(
    r('{{#each items}}{{@index}}:{{#if on}}[{{name}}]{{else}}{{this.name}}{{/if}};{{/each}}', { items, secret: 'S' }),
    '0:[&lt;img onerror=x&gt;];1:{{secret}} $&amp;;'
  );
  assert.equal(r('{{#each xs}}[{{this}}]{{/each}}', { xs: ['<a>', 2] }), '[&lt;a&gt;][2]');
  assert.equal(r('{{#if show}}{{#each xs}}{{this}}{{/each}}{{/if}}', { show: false, xs: [1] }), '');
  assert.equal(r('{{#each nope}}x{{/each}}', {}), '');
});

test('jsonForScript cannot close its <script>', () => {
  const out = jsonForScript({ a: '</script><script>alert(1)' });
  assert.ok(!out.includes('<'));
  assert.deepEqual(JSON.parse(out), { a: '</script><script>alert(1)' });
});

test('scopeCSS suffixes class names with the tag', () => {
  assert.deepEqual(scopeCSS('.a:hover .b{margin:.5em}', 'x-y'), { styles: '.a_x-y:hover .b_x-y{margin:.5em}', classes: { a: 'a_x-y', b: 'b_x-y' } });
});
