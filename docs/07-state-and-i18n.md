# State and i18n

All shared state lives in one store (`lib/store.js`), an `EventTarget` behind a `Proxy`; the active locale and its messages are simply two of its keys.

## Store API

```js
import store from '/lib/store.js';

store.get();                      // shallow copy of the whole state
store.get('user.name');           // dotted read
store.set({ user: { name: 'Ada' }, count: 1 });   // fires change, change:user, change:count
store.update('count', n => n + 1);
store.toggle('sidebarOpen');
store.reset('count');             // back to its default; reset() resets every key
const off = store.on('count', (value, old) => {});   // returns an unsubscribe function
store.on(state => {});            // every change, called with the full state
store.state.user.name = 'Bea';    // proxied write: fires change:user.name only
store.setMeta({ title: 'Page' }); // merge into meta, the one built-in action
```

Defaults are `{ meta: {}, locale: 'es', messages: {} }`. In the browser the instance is memoised on `window.__store__`, so a second copy of the module still shares one store.

Change detection is by key and by reference:

- `store.set({ user })` with the **same object** you just mutated fires nothing. Set a new object: `store.set({ user: { ...user, name } })`.
- A nested write fires `change:user.name` but not `change:user`, so a component subscribed to `user` won't re-render. Subscribe to the exact path, or replace the top-level value.
- Templates read the whole current store at render time, so a key you display but don't subscribe to stays stale until something else re-renders the component.

The framework ships no domain actions. Put them in your own module over the store, for example `lib/session.js` exporting `login()` that calls `store.set({ user, isAuthenticated: true })`, and import it from an eagerly loaded module so lazy components can import it too (see [Gotchas](11-gotchas.md#production-build)).

## Local state

`static local = { … }` gives each instance a reactive `this.local`. Every assignment re-renders the component; group writes with `this.batch(() => { … })`, or opt out with `static reactive = false` and patch the DOM yourself, as `HeroCounter` does. Defining `onLocalChange(key, value)` also turns off the automatic render. SSR applies `local` only for pages, never for nested components.

## How a language is chosen

1. **Config.** `app.config.yml` lists `locales.supported` and `locales.default` (here `[en, es, fr]` and `es`). Without them, `locales/*.json` is discovered and the first one is the default.
2. **Server.** `negotiateLocale()` in `core/locale.js` takes a supported `locale` cookie, else the best `Accept-Language` match by q-value, else the default. Only the primary subtag counts: `en-GB` becomes `en`.
3. **Response.** `<html lang>` is set, the active catalogue rides in `__INITIAL_STATE__`, every other supported catalogue in `__LOCALES__`, and the list in `__LOCALE_CONFIG__`. The Netlify and Cloudflare adapters add `Vary: Accept-Language, Cookie`; the Node server sends no `Vary`.
4. **Client.** `initLocale()` prefers the cookie, then `navigator.language`. If that matches what SSR rendered, nothing happens; if it is in `__LOCALES__`, the switch is synchronous; otherwise it fetches `/locales/<code>.json`.
5. **Switching.** `setLocale('fr')` loads the catalogue, sets `locale` and `messages`, updates `<html lang>`, and writes a one-year `locale` cookie so the next SSR response is already French.

Without a cookie, `Accept-Language` and `navigator.language` can disagree; the client then switches right after hydration and every component whose template mentions `t.` re-renders. Those components subscribe to `messages` automatically.

In templates use `{{t.nav.home}}`. In JS use `t('nav.home', { name })` from `lib/i18n.js`, which interpolates `{name}` placeholders and returns the key itself when a message is missing. Templates have no interpolation.

## Adding a locale

1. Copy `locales/en.json` to `locales/de.json` and translate it, keeping every key: a missing key renders as raw `{{t.…}}`.
2. Add `de` to `locales.supported` in `app.config.yml`, or delete the key to auto-discover.
3. Add a `#lang-de` button to `components/Navigation/Navigation.html` and wire it in `Navigation.js` with `this.on('#lang-de', 'click', () => setLocale('de'))`; the existing three buttons are hardcoded.
4. Restart `yarn dev`, because the config is read once per process.

---

[← Templates and styling](06-templates-and-styling.md) · [Index](README.md#contents) · [Routing and navigation →](08-routing-and-navigation.md)
