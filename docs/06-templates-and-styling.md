# Templates and styling

Templates are HTML with `{{ }}` holes, evaluated by a small regex-based interpreter (`core/template.js`) that runs identically on server and client, with no compiler and no `eval`.

## Syntax

| Form | Meaning |
| --- | --- |
| `{{expr}}` | Evaluate and HTML-escape |
| `{{{expr}}}` | Evaluate and insert raw |
| `{{#if cond}}…{{else}}…{{/if}}` | Conditional; nesting works |
| `{{#each items}}…{{/each}}` | Loop over a top-level array: `{{this}}`, `{{this.key}}` or `{{key}}`, `{{@index}}` |
| `{{t.section.key}}` | Message from the active catalogue |
| `{{$css.name}}` | Scoped class name from the component's CSS Module |
| `@click="method"` | Call `this.method(event)`; also `@submit`, `@input`, `@change`, `@keydown`, `@keyup` |
| `@click="store.action"` | Call `store.action()` with no arguments |
| `:prop="expr"` on a child custom element | Pass a JS value instead of a string (experimental, see below) |

## Expressions

The evaluator tries, in order: `true`, `false`, `null`, `undefined`; `!x`; `a ? b : c`; comparisons (`===`, `!==`, `==`, `!=`, `<`, `>`, `<=`, `>=`); `&&` and `||`; arithmetic on numbers (`+` also concatenates strings); `x.method(arg)` for `split`, `join`, `slice`, `toUpperCase`, `toLowerCase`, `trim`, `charAt`, `substring` and `replace` with at most one literal argument; `x[0]`; string and number literals; `.length`; dotted paths.

Behaviour worth knowing, each confirmed by running the evaluator:

- A value of `undefined` leaves the literal `{{expr}}` in the output; `null` prints `null` and `false` prints `false`.
- `{{#each}}` takes a bare top-level name (`items`, not `user.items`), inserts item fields **unescaped**, and cannot nest.
- Inside `{{#each}}`, `{{#if field}}` sees the item only when its body has no `{{…}}`; otherwise the condition is read from the outer props, and the block usually disappears.
- At most **10** `{{#if}}` blocks are resolved per render; the 11th onward print as raw text.
- There are no parentheses, precedence follows the regex order, and a string literal containing `+` evaluates to an empty string. Compute anything non-trivial in JS and expose the result as a prop.

## What a template can see

| Name | Server render | Client render |
| --- | --- | --- |
| Store keys: `locale`, `messages`, `meta`, yours | Yes | Yes |
| The page's `local` | Yes | Yes |
| The page's `ssrProps` | Yes | **No** |
| A nested component's own `local` | **No** | Yes |
| `params`, `query` | Yes | Only after client-side navigation |
| `path` | Full URL including the query string | `location.pathname` |
| `t` | Active catalogue | Active catalogue |
| `$css` | Yes | Yes |
| `$c(...)` | No | Present, but the evaluator cannot call it |
| `redirectFrom`, `timestamp`, `year` | Yes | No |

On the server, nested components render with the **page's** props plus their own `$css`. Anything that must look the same before and after hydration should come from the store or the page's `local`.

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
