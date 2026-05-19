# Pivota — Design Protocol (CLAUDE.md)

> Source of truth for the Pivota brand identity: logo, color, type, and the rules
> for using them in product, marketing, and engineering surfaces.
>
> **Version 2.0 · May 19 2026.** Supersedes all prior logo deliveries — including
> the cyan-purple gradient, the pink-card "Pacifico" treatment, and earlier hand-
> drawn cursive marks. Anything not pictured or specified below is unapproved.

---

## 0. How to use this file

If you're an AI agent (Claude Code or otherwise) opening a Pivota project, **read
this file first**. It overrides any contradictory guidance you've inferred from
older screenshots, component files, or design files in the repo.

If you're a human, this is the canonical brand standard. The accompanying
`pivota-brand.css` file is the drop-in stylesheet that implements everything
described here. The `svg/` and `icons/` folders contain the production logo
artwork.

---

## 1. The logo

### 1.1 The mark — `p.`

The Pivota mark is the lowercase letter **p** set in **Fredoka SemiBold (600)**,
closed with a clean circular period. It reads as "p, full stop" — Pivota
finishes the thought.

**Construction (100-unit grid):**
| Property        | Value                       |
| --------------- | --------------------------- |
| Typeface        | Fredoka 600 (SemiBold)      |
| Glyph size      | 108 units                   |
| Glyph position  | center @ x=36, baseline y=78 |
| Period          | circle r=8.5 @ (80, 72)     |
| Period color    | matches mark color           |
| Bg corner radius | 22 units (0.22 × side)      |

The period is drawn as a separate `<circle>`, **not** Fredoka's native dot. The
custom dot is slightly larger (r=8.5 vs Fredoka's ~6) so it has equal visual
weight to the letter and reads as a deliberate punctuation, not a typographic
afterthought.

### 1.2 The four worlds (background variants)

| Variant            | Background                  | Foreground | Use                              |
| ------------------ | --------------------------- | ---------- | -------------------------------- |
| **Gradient** (1st) | `linear-gradient(135deg, #534AB7 → #7B6FD4 → #1D9E75)` | white | Hero · splash · app icon         |
| **Purple**         | `#534AB7`                   | white      | Default app icon · flat surfaces |
| **Ink**            | `#2C2C2A`                   | white      | Press · dark mode                |
| **Paper**          | `#FAFAF8` + hairline border | ink        | Inverse · favicon · light cards  |

**Retired backgrounds:**
- ❌ Cyan-to-purple gradient (older delivery)
- ❌ Pink card `#FFB6D9` (`--p-gradient-logo` in v1 tokens)

Both lacked product tokens; replace any instance with one of the four worlds above.

### 1.3 Lockups (use one, never two at once)

1. **Icon only** — square mark on any of the four backgrounds.
2. **Wordmark only** — `Pivota.` set in Fredoka 600 with the period in brand purple.
3. **Combined · horizontal** — icon + wordmark, side-by-side. Gap = 0.4 × icon height.
4. **Combined · stacked** — icon above wordmark, centered.
5. **Monogram** — just the `p.` glyph (no bg), for tight spaces.

### 1.4 Clear space & min size

- **Clear space** = `x`, where x ≈ the width of the bowl (~40% of mark width).
  Nothing — type, ruling line, edge, photo — enters that ring on any side.
- **Minimum size**: 16 px (favicon floor). Below 16 px do not render the mark.
- **Optical scaling**: at sizes ≤ 32 px the period appears too small for the
  letter at default proportions. The CSS-mask logo class scales the dot
  optically; if you're rendering the SVG manually, no adjustment needed.

### 1.5 Don'ts

- Don't stretch, squash, skew, or rotate the mark. Fredoka's natural italic angle is 0°; don't add one.
- Don't outline the mark. The geometry is a filled silhouette.
- Don't recolor outside the four worlds. No drop shadows.
- Don't pair mark and wordmark too tightly. Honor the x-rule.
- Don't substitute a system glyph or "p." typed in another font. Always use the production SVG or the `.pv-logo` class.
- Don't use the cyan-purple or pink backgrounds from prior deliveries.

---

## 2. Color

### 2.1 Brand palette

```
--pv-primary       #534AB7   Pivota purple  · primary CTA, links, focus rings
--pv-primary-50    #EEEDFE   purple tint    · selected pills, soft backgrounds
--pv-primary-800   #3C3489   purple deep    · pressed states, hover

--pv-coral         #D85A30   alerts, cart badge, danger
--pv-teal          #1D9E75   success, AI online, PDP primary (under .pv-pdp)
--pv-gold          #EF9F27   star ratings
```

### 2.2 Neutrals

```
--pv-ink           #2C2C2A   primary text
--pv-paper         #FAFAF8   default page background
--pv-paper-muted   #F4F4F2   muted surface
--pv-surface       #FFFFFF   card surface
```

Pivota uses **hairline 0.5px borders** in two strengths:
- `--pv-border` (8% black) — most surfaces
- `--pv-border-strong` (12%) — chips, pills, active controls

### 2.3 Gradients

```
--pv-gradient-primary  linear-gradient(135deg, #534AB7 0%, #7B6FD4 50%, #1D9E75 100%)
```

The primary gradient is the brand hero. It's the only approved gradient. There
is no secondary gradient.

### 2.4 PDP scope (Beauty)

Beauty product detail pages opt into a luxury-teal palette by setting
`<body class="pv-pdp">`. This swaps:
- `--pv-primary` to `#1A8E70`
- `--pv-radius-lg` to `8px` (tighter cards)

All other tokens, including the logo, stay identical.

---

## 3. Type

Pivota uses three typeface families with strict role separation:

| Family            | Role                              | Used for                                                 |
| ----------------- | --------------------------------- | -------------------------------------------------------- |
| **Fredoka**       | Brand — logo only                 | `p.` mark, "Pivota." wordmark, combined lockups          |
| **Inter**         | Product UI                        | Headings, body, buttons, labels, tables, navigation       |
| **Cormorant Garamond** | Editorial display            | Hero headlines, magazine-style sections, long-form intros |

**Do not use Fredoka in product UI.** It's a brand voice, not a UI typeface.

Type scale (base 16 px):

```
2xs 10 · xs 11 · sm 12 · base 13 · md 14 · lg 16 · xl 20 · 2xl 24 · 3xl 32 · 4xl 44 · 5xl 64
```

Body copy defaults to **13 px** in product UI (Pivota is dense — 13, not 14).
Long-form marketing pages may step up to 14–16 px.

Semantic helpers in `pivota-brand.css`:

```html
<h1 class="pv-display">Hero headline</h1>          <!-- Cormorant 44 -->
<h2 class="pv-display-sm">Section title</h2>        <!-- Cormorant 32 -->
<h3 class="pv-h1">Product heading</h3>              <!-- Inter 24 / 600 -->
<p  class="pv-body">Default body copy.</p>          <!-- Inter 13 -->
<span class="pv-eyebrow">Section · 04</span>        <!-- Inter 11 / 600 / uppercase -->
```

---

## 4. Spacing, radius, elevation

### 4.1 Radius

```
sm  6px      buttons, inputs, chips
md  10px     cards (compact), badges
lg  16px     cards (default), modals
icon 22%     app icons (relative to side)
pill 999px   pills, tabs
```

PDP scope tightens `lg` to `8px` for a more luxe feel.

### 4.2 Elevation

Pivota stays light. No dramatic shadows. Every elevated surface should also have
a hairline border so it reads on light AND dark surfaces.

```
sm   1px 2px 4% black + hairline
md   2px 8px 6% black + hairline
pop  10px 30px 10% black + hairline
glow 0 0 20px 15% purple   (focus / hover for primary CTA)
```

---

## 5. The single source of truth (files)

```
pivota-brand/
├── CLAUDE.md                      this file
├── README.md                      what's in the kit
├── pivota-brand.css               drop-in stylesheet (tokens + logo)
├── index.html                     visual brand-kit browser
├── svg/
│   ├── pivota-mark.svg            transparent · currentColor
│   ├── pivota-mark-on-gradient.svg
│   ├── pivota-mark-on-purple.svg
│   ├── pivota-wordmark.svg
│   ├── pivota-lockup-horizontal.svg
│   └── favicon.svg
└── icons/
    ├── icon-gradient-{1024,512,256,192,180,128,64}.png
    ├── icon-purple-{1024,512,256,128}.png
    ├── icon-ink-{512,256,128}.png
    ├── icon-paper-{512,256,128}.png
    ├── icon-maskable-{1024,512}.png   PWA maskable, 12% safe-area padding
    ├── favicon-{32,16}.png
    ├── apple-touch-icon.png            180×180 gradient
    ├── mark-ink-1024.png               transparent · ink
    └── mark-white-1024.png             transparent · white
```

---

## 6. Drop-in for any project

### Web

```html
<head>
  <link rel="stylesheet" href="/pivota-brand/pivota-brand.css">
  <link rel="icon"             type="image/svg+xml" href="/pivota-brand/svg/favicon.svg">
  <link rel="icon"             type="image/png" sizes="32x32" href="/pivota-brand/icons/favicon-32.png">
  <link rel="icon"             type="image/png" sizes="16x16" href="/pivota-brand/icons/favicon-16.png">
  <link rel="apple-touch-icon" href="/pivota-brand/icons/apple-touch-icon.png">
</head>

<a class="pv-lockup" href="/" aria-label="Pivota home">
  <span class="pv-logo pv-logo--gradient pv-logo--md"></span>
  <span class="pv-wordmark pv-wordmark--md">Pivota</span>
</a>
```

### PWA `manifest.json`

```json
{
  "name": "Pivota",
  "short_name": "Pivota",
  "theme_color": "#534AB7",
  "background_color": "#FAFAF8",
  "icons": [
    { "src": "/pivota-brand/icons/icon-gradient-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/pivota-brand/icons/icon-gradient-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/pivota-brand/icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

### iOS / Android native

Use `icons/icon-gradient-1024.png` as the source asset for both stores.
Generate platform-specific renditions from the 1024 master.

### Email signature / Slack / external comms

Use `icons/icon-gradient-256.png` (or 512 for retina). PNG, no SVG — most
clients strip SVG.

---

## 7. Engineering protocol

### 7.1 Migrating from v1 tokens (`--p-*`)

The old token namespace (`--p-primary`, `--p-neutral-900`, etc.) is **deprecated
but still supported**. New code should use `--pv-*` exclusively. When touching
existing code, leave `--p-*` references unless you're rewriting the surface.

The biggest break from v1 is the **retirement of `--p-gradient-logo`** (the
pink one). Any reference to it should be replaced with `--pv-gradient-primary`
or with one of the four logo backgrounds.

### 7.2 Adding new brand surfaces

When creating a new page or component:
1. Include `pivota-brand.css` at the root.
2. Use the `.pv-logo` and `.pv-wordmark` classes — never re-implement them.
3. Stick to the four-world background system. Don't invent new logo treatments.
4. Use Inter for UI, Cormorant for editorial, Fredoka **never** outside the logo.

### 7.3 Acceptance checklist (PR review)

- [ ] All logos use `pivota-brand.css` classes or the canonical SVGs.
- [ ] No references to the pink `--p-gradient-logo` token.
- [ ] No cursive/script "Pivota" rendering except in retired-asset documentation.
- [ ] Favicon links match the v2 paths.
- [ ] Light AND dark mode both render the appropriate logo variant.
- [ ] PWA manifest references the maskable + gradient icons.

---

## 8. What to escalate to brand, not improvise

- New lockup variants (vertical, badge, stamp) — design needed.
- Non-square containers (ovals, pills) for the icon — propose, don't ship.
- Animated logo treatments (intro, loader) — outside the static scope.
- Co-branding with third parties — design and legal review required.
- A second brand gradient — explicitly off-limits. There is only one.
- Sub-brands or vertical-specific marks (e.g. Pivota Beauty) — not approved.

---

## 9. Where this lives

The Pivota Design System project (this folder) is the single source of truth.
Other repos — `pengxu9-rgb/pivota-agent-ui`, marketing site, mobile apps —
should consume `pivota-brand/` either by submodule, copy-on-update, or by
linking the deployed CSS+icons from a CDN path.

When updating the system, version the change in this file (§ heading at top)
and announce it before opening PRs in consuming repos.
