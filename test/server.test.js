import test from 'node:test';
import assert from 'node:assert/strict';
import { sep } from 'node:path';
import { parseUrl, resolveInside, cacheControl } from '../core/server/http.js';
import { createMatcher, matchRoute, pathFromFile, withNotFound } from '../core/routes.js';
import { negotiateLocale } from '../core/locale.js';

test('parseUrl rejects malformed escapes instead of throwing', () => {
  assert.deepEqual(parseUrl('/a%20b?x=1'), { pathname: '/a b', query: 'x=1' });
  assert.equal(parseUrl('/%'), null);
  assert.equal(parseUrl('/%zz'), null);
});

test('resolveInside keeps requests inside the root', () => {
  const base = `${sep}srv${sep}site`;
  assert.equal(resolveInside(base, '/app/Home/Home.html'), [base, 'app', 'Home', 'Home.html'].join(sep));
  assert.equal(resolveInside(base, '/.well-known/x.json'), [base, '.well-known', 'x.json'].join(sep));
  for (const bad of ['/../secret', '/a/../../secret', '/..\\secret', '/.git/config', '/.env', '/a/.hidden'])
    assert.equal(resolveInside(base, bad), null, bad);
});

test('only content-addressed files are immutable', () => {
  assert.match(cacheControl('/app/Home/Home.script.53fad8a4.js'), /immutable/);
  assert.match(cacheControl('/_assets/core.4bdebd94.js'), /immutable/);
  assert.match(cacheControl('/fonts/geist-latin.woff2'), /immutable/);
  assert.equal(cacheControl('/routes.json'), 'no-cache');
  assert.equal(cacheControl('/core/template.js'), 'no-cache');
});

test('routes', () => {
  assert.equal(pathFromFile('Home/Home.js'), '/');
  assert.equal(pathFromFile('Blog/[slug]/Post.js'), '/blog/:slug/post');
  const routes = withNotFound([
    { path: '/', component: 'home-page', dynamic: false },
    { path: '/notfound', component: 'notfound-page', dynamic: false },
    { path: '/v1.0/:id', component: 'x-page', dynamic: true, matcher: createMatcher('/v1.0/:id') },
  ]);
  assert.deepEqual(matchRoute(routes, '/v1.0/a%20b').params, { id: 'a b' });
  assert.deepEqual(matchRoute(routes, '/v1.0/%zz').params, { id: '%zz' }); // malformed: no throw
  assert.equal(matchRoute(routes, '/v1x0/1').route.path, '*');             // '.' is literal
  assert.equal(matchRoute(routes, '/').route.component, 'home-page');
});

test('locale negotiation', () => {
  const opts = { supported: ['en', 'es', 'fr'], fallback: 'es' };
  assert.equal(negotiateLocale({ ...opts, acceptLanguage: 'de, fr-CA;q=0.8, en;q=0.9' }), 'en');
  assert.equal(negotiateLocale({ ...opts, cookie: 'a=1; locale=fr', acceptLanguage: 'en' }), 'fr');
  assert.equal(negotiateLocale({ ...opts, cookie: 'locale=%', acceptLanguage: 'de' }), 'es');
});

test('routes ending in a parameter', () => {
  assert.equal(pathFromFile('Items/[slug]/Slug.js'), '/items/:slug');
  assert.equal(pathFromFile('Items/[slug]/[slug].js'), '/items/:slug');
  assert.equal(pathFromFile('Users/[id]/Edit.js'), '/users/:id/edit');
});

test('cookies and per-request state', async () => {
  const { readCookie, requestState } = await import('../core/locale.js');
  assert.equal(readCookie('a=1; session=abc%20d; locale=fr', 'session'), 'abc d');
  assert.equal(readCookie('xsession=1', 'session'), null);
  const config = { site: { title: 'T', description: null }, auth: { cookie: 'session' } };
  const base = { meta: {}, locale: 'es', messages: {} };
  assert.deepEqual(requestState(base, { locale: 'en', messages: { a: 1 }, cookie: 'session=1', config }),
    { meta: {}, site: { title: 'T' }, locale: 'en', messages: { a: 1 }, isAuthenticated: true });
  assert.equal(requestState(base, { locale: 'en', messages: {}, cookie: '', config }).isAuthenticated, false);
  assert.ok(!('isAuthenticated' in requestState(base, { locale: 'en', messages: {}, cookie: 'session=1', config: { site: {}, auth: {} } })));
});

test('tag → file resolution', async () => {
  const { pathsForTag } = await import('../core/tags.js');
  assert.equal(pathsForTag('item-page', { 'item-page': 'app/Items/[slug]/Slug' }).html, '/app/Items/[slug]/Slug.html');
  assert.equal(pathsForTag('app-logo', null).js, '/components/Logo/Logo.js');
  assert.equal(pathsForTag('about-page', {}).moduleCss, '/app/About/About.module.css');
});
