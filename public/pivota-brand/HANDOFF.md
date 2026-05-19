# Hand this folder to Claude Code

The `pivota-brand/` folder is the **v2.0 production brand standard** for Pivota.
Drop the whole folder into any project and you have everything: logo, color, type,
and the rules for using them.

## Quick start (for Claude Code)

> Read `pivota-brand/CLAUDE.md` first. Then implement the changes against the
> repo. The full design rationale is in `pivota-brand/index.html` — open it in
> a browser to see every variant rendered.

## What changed from v1

This release **supersedes** all prior logo and color deliveries:

| Retired                                                  | Replaced by                                            |
| -------------------------------------------------------- | ------------------------------------------------------ |
| Pacifico script `p.` mark                                 | Fredoka 600 `p.` (geometric, friendly)                  |
| Pink card background `#FFB6D9` (`--p-gradient-logo`)      | Four canonical backgrounds: gradient / purple / ink / paper |
| Cyan-to-purple gradient                                   | `--pv-gradient-primary` (purple → mid-purple → teal)   |
| `--p-*` token namespace                                   | `--pv-*` (old still supported during transition)       |
| Cormorant italic wordmark (proposed)                      | Fredoka 600 wordmark (matches the mark)                |

## What stays the same

- All product UI: Inter typography, dense 13 px body, hairline 0.5px borders.
- All semantic colors: coral (alerts), teal (success / PDP), gold (ratings).
- The PDP scope (`.pv-pdp` / `.lovable-pdp`) and its tighter radius + teal primary.
- The neutral palette, the radius scale, the shadow tokens.

## Action list for Claude Code

When you receive this folder:

1. **Replace logo assets**. Find any `pivota-logo.{png,svg}`, `logo.png`, or app
   icons in the consumer repo. Swap with the equivalents from `pivota-brand/icons/`.
   For app stores, use `icon-gradient-1024.png` as the master.

2. **Update favicons**. Replace `favicon.ico` / `favicon.png` with
   `pivota-brand/icons/favicon-32.png` and update `<head>` links to also include
   `favicon-16.png` and `svg/favicon.svg`.

3. **Update PWA manifest**. Point the icons array to:
   - `icon-gradient-192.png` (192×192)
   - `icon-gradient-512.png` (512×512)
   - `icon-maskable-512.png` (512×512, `purpose: "maskable"`)

4. **Add the stylesheet**. Import `pivota-brand/pivota-brand.css` at the root.
   It defines the `--pv-*` tokens, the logo classes, and the type system.

5. **Migrate references to retired tokens**:
   - `--p-gradient-logo` → delete or replace with `--pv-gradient-primary`
   - Any inline pink (`#FFB6D9`, `#FFE4F1`) or cyan-purple gradients → replace
   - Any cursive `p.` rendered in code → swap for `<span class="pv-logo pv-logo--gradient pv-logo--md"></span>`

6. **Migrate wordmarks**. Anywhere the word "Pivota" is rendered as a brand
   element (header, footer, splash), use:
   ```html
   <span class="pv-wordmark pv-wordmark--md">Pivota</span>
   ```
   Do not use Fredoka in product UI — only for the wordmark.

7. **Update README/docs**. Anywhere the brand is documented, link to this folder
   as the source of truth.

## Do not touch (out of scope)

- Checkout flows (`src/app/order/**`, the API routes).
- Data adapters or `src/features/pdp/types.ts`.
- Any business logic outside of brand presentation.

If a change you'd need to make breaks any of the above, **flag it back to the
owner** instead of refactoring.

## After your PR

Tag the brand-system version in your CHANGELOG:

```
- chore(brand): adopt Pivota Brand Kit v2.0 (Fredoka mark + wordmark)
```

And run the existing test suite — most should pass with snapshot updates only.
Visual snapshots will all change (intended); update them once and review the
diff carefully.
