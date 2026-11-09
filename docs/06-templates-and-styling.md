# Templates and styling

Templates are HTML with `{{ }}` holes, evaluated by a small interpreter (`core/template.js`: a tokenizer and a recursive-descent parser) that runs identically on server and client, with no compiler and no `eval`.

## Syntax

| Form | Meaning |
| --- | --- |
| `{{expr}}` | Evaluate and HTML-escape |
| `{{{expr}}}` | Evaluate and insert raw |
| `{{#if cond}}…{{else}}…{{/if}}` | Conditional; nesting works |
| `{{#each items}}…{{/each}}` | Loop over a top-level array: `{{this}}`, `{{this.key}}` or `{{key}}`, `{{@index}}`; values are HTML-escaped |
| `{{t.section.key}}` | Message from the active catalogue |
| `{{$css.name}}` | Scoped class name from the component's CSS Module |
| `@click="method"` | Call `this.method(event)`; also `@submit`, `@input`, `@change`, `@keydown`, `@keyup` |
| `@click="store.action"` | Call `store.action()` with no arguments |
| `:prop="expr"` on a child custom element | Pass a JS value instead of a string (experimental, see below) |

## Expressions

Expressions follow JavaScript's precedence, lowest to highest: `a ? b : c`; `||`; `&&`; comparisons (`===`, `!==`, `==`, `!=`, `<`, `>`, `<=`, `>=`); `+` `-`; `*` `/`; unary `!` and `-`; then member access (`a.b`, `a[0]`), method calls and parentheses. Operands are `true`, `false`, `null`, `undefined`, numbers, quoted strings and dotted paths.

- **Methods** are limited to `split`, `join`, `slice`, `toUpperCase`, `toLowerCase`, `trim`, `charAt`, `substring` and `replace`; anything else evaluates to `undefined`. The only callable top-level name is `$c('a', 'b')`.
- **`+`** adds two numbers and otherwise concatenates as strings; `-`, `*` and `/` need two numbers, and dividing by zero gives `0`.
- **`.length`** of anything that is not an array or a string is `0`, so `{{#if items.length}}` is safe before `items` exists.
- **Hyphenated keys** work in paths (`{{t.some-key}}`). Write subtraction with spaces (`count - 1`); `count-1` is tried as a key first and as a subtraction only if no such key exists.
- A value of `undefined` leaves the literal `{{expr}}` in the output; `null` prints `null` and `false` prints `false`. Only a template's own props resolve: `{{constructor}}` stays as written.
- `{{#each}}` takes a bare top-level name (`items`, not `user.items`) and cannot nest. Each item renders the block with its fields in scope, so `{{#if field}}` inside the loop sees the item, and item values are never scanned for `{{…}}` again.
- `{{#if}}` blocks nest to any depth and there is no limit on how many a template holds.

## What a template can see

| Name | Server render | Client render |
| --- | --- | --- |
| Store keys: `locale`, `messages`, `meta`, yours | Yes | Yes |
| The page's `local` | Yes | Yes |
| The page's `ssrProps` | Yes | Yes (through `pageProps`) |
| A component's own `local` | Yes (its initial `static local`) | Yes |
| `params`, `query` | Yes | Yes, on pages |
| `path` | Full URL including the query string | `location.pathname` |
| `t` | Active catalogue | Active catalogue |
| `$css` | Yes | Yes |
| `$c(...)` | Yes | Yes |
| `redirectFrom`, `timestamp`, `year` | Yes | No |

On the server, a nested component renders with the page's props, its own `static local` on top, and its own `$css`. On the client it sees the store and its own `local` only, so don't rely on a page's `local` or `ssrProps` leaking into its children: pass data down through the store or a `:prop` binding.

A custom element in a template may have children (`<x-card><p>…</p></x-card>`). The server adds the element's shadow root and keeps the children as light DOM, which the component places with `<slot>`.

In CSS Modules, class names are rewritten everywhere except inside comments, quoted strings and `url(…)`.

## Events and prop bindings

`@event` attributes are wired after every render with that render's `AbortSignal`, so they never leak. A trailing `()` in the handler name is allowed, but arguments are not: the method receives the event. `@submit` does not call `preventDefault()` for you.

`:prop="expr"` is experimental. On the client, after each parent render, it assigns `child[prop] = value` as a JS property; the child's template does **not** see that value unless the child copies it into `local`, for example in a setter. On the server, the expression is resolved as a dotted path and merged into the child's template props, and the attribute is stripped from the output.

## Styling

Every component's CSS ends up in one `<style>` at the top of its shadow root, so selectors are isolated by the shadow boundary either way.

- **Inline `<style>` in the template.** Most components here use it. It is hoisted on render and never rewritten.
- **`Name.module.css` beside the template.** Auto-discovered. Each `.class` becomes `.class_<tag>`; templates read the mapping as `{{$css.class}}` and JS uses `this.cx('class')`. `components/Footer/` is the worked example.
- **`Name.css` beside the template.** Auto-discovered and unscoped; can coexist with a module sheet.
- **`globals.css`.** Inlined into every HTML response. Put design tokens (`--bg`, `--fg`, `--accent`, …) and `@font-face` here: custom properties cross shadow boundaries, ordinary selectors don't. Light-theme values live under `[data-theme='light']`.

The CSS Module pass is a single regex over the whole file. It also rewrites dotted words in comments and in URLs: `url(/img/hero.png)` becomes `url(/img/hero.png_<tag>)`. Keep module comments prose-only and keep `url()` out of module sheets.

In production the build folds both sheets into the class as minified `static cssModuleText` and `cssText`, and SSR embeds the same scoped CSS in the shadow root, so a component costs no stylesheet request.

---

[← Components](05-components.md) · [Index](README.md#contents) · [State and i18n →](07-state-and-i18n.md)
