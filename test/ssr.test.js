import test from 'node:test';
import assert from 'node:assert/strict';
import { createRenderer } from '../core/server/ssr.js';
import { scopeCSS } from '../core/template.js';

// An in-memory project: templates keyed by the path resolvePaths hands out.
const files = {
  'app-layout.html': '<main><app-router></app-router></main>',
  'item-page.html': '<h1>{{params.id}}/{{kind}}/{{n}}</h1><x-card :label="kind"><p>child</p></x-card><x-leaf></x-leaf><x-unknown></x-unknown>',
  'x-card.html': '<b class="{{$c(\'box\')}}">{{label}}:{{own}}</b><slot></slot>',
  'x-card.module.css': '.box{background:url(a.png)}',
  'x-leaf.html': 'cost $& {{own}}',
};
const render = createRenderer({
  loadFile: async path => { if (path in files) return files[path]; throw new Error('missing'); },
  resolvePaths: tag => (tag === 'app-router' ? null : { tpl: `${tag}.html`, css: `${tag}.module.css`, plainCss: `${tag}.css` }),
  locals: { 'item-page': { n: 1 }, 'x-card': { own: 'card' }, 'x-leaf': { own: 'leaf' } },
});
const routes = [
  { path: '/items/:id', component: 'item-page', dynamic: true, matcher: { regex: /^\/items\/([^/]+)$/, params: ['id'] }, ssrProps: { kind: 'k' } },
  { path: '/secret', component: 'item-page', dynamic: false, requiresAuth: true },
];
const state = { meta: {}, site: { title: 'Site' }, locale: 'en', messages: {} };

test('page, nested components, children, locals, bindings', async () => {
  const { status, appHtml, headMeta, initialStateScript } = await render('/items/7?x=1', routes, state);
  assert.equal(status, 200);
  assert.match(appHtml, /<h1>7\/k\/1<\/h1>/);                                   // params, ssrProps, page local
  assert.match(appHtml, /<x-card><template shadowrootmode="open"><style>\.box_x-card\{background:url\(a\.png\)\}<\/style><b class="box_x-card">k:card<\/b><slot><\/slot><\/template><p>child<\/p><\/x-card>/);
  assert.match(appHtml, /<x-leaf><template shadowrootmode="open">cost \$& leaf<\/template><\/x-leaf>/);
  assert.match(appHtml, /<x-unknown><\/x-unknown>/);                            // no template: left alone
  assert.ok(!appHtml.includes('{{'));
  assert.match(headMeta, /<title>Site<\/title>/);                               // site default, no page metadata
  assert.match(initialStateScript, /"meta":\{"title":"Site"\}/);
});

test('status and redirects', async () => {
  assert.equal((await render('/nope', routes, state)).status, 404);
  assert.deepEqual(await render('/secret', routes, state), { redirect: '/login?from=%2Fsecret' });
  assert.equal((await render('/secret', routes, { ...state, isAuthenticated: true })).status, 200);
});

test('scopeCSS skips comments, strings and url()', () => {
  assert.equal(scopeCSS('.a{background:url(i.png)}/* .x */.b::after{content:"c.d"}', 't').styles,
    '.a_t{background:url(i.png)}/* .x */.b_t::after{content:"c.d"}');
});
