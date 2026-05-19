# Pivota Brand Kit — v2.0

The production brand identity for Pivota. Drop the `pivota-brand/` folder into
any project and you have the logo, color, type, and protocol everything else
needs.

## What's in here

| File / folder           | Contents                                                       |
| ----------------------- | -------------------------------------------------------------- |
| `CLAUDE.md`             | Design protocol — read this first.                              |
| `index.html`            | Visual brand-kit browser — open in a browser to see everything. |
| `pivota-brand.css`      | Drop-in stylesheet — tokens, logo classes, type, surfaces.     |
| `svg/`                  | Production SVGs — mark, wordmark, lockups, favicon.            |
| `icons/`                | PNG renders at every standard size, four background variants.   |

## Quick start

```html
<head>
  <link rel="stylesheet" href="pivota-brand/pivota-brand.css">
  <link rel="icon" type="image/svg+xml" href="pivota-brand/svg/favicon.svg">
</head>

<a href="/" aria-label="Pivota home" class="pv-lockup">
  <span class="pv-logo pv-logo--gradient pv-logo--md"></span>
  <span class="pv-wordmark pv-wordmark--md">Pivota</span>
</a>
```

## Versioning

**v2.0** — May 19 2026. Locked Fredoka SemiBold as the brand typeface. Retired
prior cursive marks and the pink/cyan-purple background treatments.

To update: edit, version the change in `CLAUDE.md`, regenerate `icons/`, and
ship to consumers.
