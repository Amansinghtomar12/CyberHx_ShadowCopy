# CyberHX Design System v2

Single source of truth: **`src/index.css`**. Everything below exists in that file —
if a class or token is not listed here, it does not exist. Do not invent names.

Brand invariants: near-black blue-tinted ground `#060b10`, acid-lime accent `#c6ff00`,
Inter (UI) + JetBrains Mono (data/labels), uppercase micro-labels with wide tracking.

Tailwind v4. Tokens are declared in `@theme static { … }`, so **every token is emitted
as a CSS variable** and is usable two ways:

* as a Tailwind utility — `bg-surface-raised`, `text-cat-web`, `rounded-card`, `shadow-e3`
* as a raw variable — `style={{ color: 'var(--color-cat-web)' }}`

---

## 1. Colour tokens

### 1.1 Frozen legacy palette — NEVER rename, ten files depend on them

| Token | Value | Utilities |
|---|---|---|
| `--color-cyber-bg` | `#060b10` | `bg-cyber-bg` |
| `--color-cyber-sidebar` | `#0a1118` | `bg-cyber-sidebar` |
| `--color-cyber-card` | `#0d161f` | `bg-cyber-card` |
| `--color-cyber-border` | `#1a242d` | `border-cyber-border` |
| `--color-cyber-neon` | `#c6ff00` | `text-cyber-neon`, `bg-cyber-neon` |
| `--color-cyber-muted` | `#8a949d` | `text-cyber-muted` |
| `--color-cyber-text` | `#e1e7ec` | `text-cyber-text` |

These keep working exactly as before. New work should prefer the semantic names below,
but mixing is safe — the values are identical where they overlap.

### 1.2 Surface ramp (low → high elevation)

| Token | Value | Use |
|---|---|---|
| `--color-surface-sunken` | `#04080c` | page gutters, the layer behind everything |
| `--color-surface-base` | `#060b10` | page background (= `cyber-bg`) |
| `--color-surface-rail` | `#0a1118` | nav rails, sticky headers (= `cyber-sidebar`) |
| `--color-surface-card` | `#0d161f` | default panel (= `cyber-card`) |
| `--color-surface-raised` | `#121d28` | hovered / selected / stacked panel |
| `--color-surface-overlay` | `#17232f` | modals, popovers, dropdowns |
| `--color-surface-inset` | `#08111a` | wells: inputs, code blocks, progress tracks |
| `--color-surface-veil` | `rgba(6,11,16,.72)` | scrim behind modals |

Utilities: `bg-surface-*`. Rule of thumb: **one step up per level of stacking**, never two.

### 1.3 Borders

`--color-border-subtle` `#131c25` · `--color-border-base` `#1a242d` (= `cyber-border`) ·
`--color-border-strong` `#27343f` · `--color-border-hover` `#3a4855` ·
`--color-border-neon` `rgba(198,255,0,.38)` · `--color-border-danger` `rgba(224,112,95,.38)`

Utilities: `border-border-subtle`, `border-border-base`, `border-border-strong`,
`border-border-hover`, `border-border-neon`, `border-border-danger`.

**`border-border-danger` is the only danger border.** Never hand-type
`rgba(224,112,95,…)` for a border again — pair it with `bg-diff-hard-wash` for the fill.

### 1.4 Neon ramp

| Token | Value | Use |
|---|---|---|
| `--color-neon-dim` | `#8fb800` | pressed lime, gradient stops, dim accents |
| `--color-neon` | `#c6ff00` | the accent (= `cyber-neon`) |
| `--color-neon-bright` | `#ddff6b` | highlight edge, hover top-stop |
| `--color-neon-ink` | `#0a1000` | text placed **on** a lime fill |
| `--color-neon-glow` | `rgba(198,255,0,.35)` | shadow/glow colour |
| `--color-neon-wash` | `rgba(198,255,0,.08)` | tinted fill behind lime text |

Never put `--color-cyber-text` on a lime fill; use `text-neon-ink`.

### 1.5 Text ramp

`--color-text-primary` `#e1e7ec` (= `cyber-text`) · `--color-text-secondary` `#aab5bf` ·
`--color-text-muted` `#8a949d` (= `cyber-muted`, AA on all surfaces) ·
`--color-text-faint` `#667381` — **decorative / placeholder / ≥18px only**, it is below AA
for small body text.

### 1.6 Semantic — difficulty, status, category

Difficulty: `--color-diff-easy` `#7ecb8f`, `--color-diff-medium` `#e0b34a`, `--color-diff-hard` `#e0705f`
(+ `-wash` variants at 12% for fills).

Status: `--color-status-solved` `#a6e04a`, `--color-status-locked` `#6b7681`,
`--color-status-live` `#ff6a5e`, `--color-status-info` `#6d9fd4` (+ `-wash` variants).

Foregrounds for text sitting **on** a danger/success wash: `--color-danger-fg` `#ffb3ab`
(`text-danger-fg`) and `--color-success-fg` `#bfeaa7` (`text-success-fg`) — these are the
`.btn-danger` / `.btn-success` label colours, reuse them rather than re-typing the hex.

Category (muted, deliberately not rainbow):

| Category | Token | Value |
|---|---|---|
| web | `--color-cat-web` | `#4fb3a4` |
| crypto | `--color-cat-crypto` | `#8e86d6` |
| steg | `--color-cat-steg` | `#c97fa0` |
| rev | `--color-cat-rev` | `#cfa15c` |
| pwn | `--color-cat-pwn` | `#d96a5c` |
| forensic | `--color-cat-forensic` | `#6d9fd4` |
| osint | `--color-cat-osint` | `#8fb573` |
| misc | `--color-cat-misc` | `#93a1ad` |

The keys match `Category` in `src/types.ts` exactly, so this is safe:

```tsx
<span style={{ color: `var(--color-cat-${challenge.category})` }} />
```

Use category hue for a 1px accent, an icon, or a dot — **never** as a large fill.

---

## 2. Type scale

Utilities `text-display | text-h1 | text-h2 | text-h3 | text-body | text-small | text-micro | text-label`.
Line-height, letter-spacing and (where noted) weight ship with the size — do not re-add them.

| Utility | Size | Line-height | Tracking | Weight | Use |
|---|---|---|---|---|---|
| `text-display` | 3.25rem | 1.02 | −0.035em | 800 | hero / landing only |
| `text-h1` | 2.125rem | 1.1 | −0.028em | 700 | page title |
| `text-h2` | 1.5rem | 1.2 | −0.02em | 700 | section title |
| `text-h3` | 1.125rem | 1.3 | −0.012em | 700 | card title |
| `text-body` | 0.875rem | 1.6 | 0 | — | prose, descriptions |
| `text-small` | 0.8125rem | 1.5 | 0.002em | — | secondary/meta text |
| `text-label` | 0.6875rem | 1.4 | 0.14em | 700 | uppercase control labels |
| `text-micro` | 0.625rem | 1.4 | **0.18em** | 700 | uppercase micro-labels (the house idiom) |

`text-micro` and `text-label` are for **uppercase labels only**. Anything that carries
information a competitor has to read — a count, a timestamp, a rank, an email, a hash, a
hint under a field — is `text-small` at minimum. There is no arbitrary `text-[11px]`.

Shortcut: **`.label-micro`** = `text-micro` + uppercase + `text-muted`, one class.
Use `font-mono` for anything numeric (points, ranks, timers, flags) — mono is set to
tabular figures so columns line up.

---

## 3. Spacing, radius, elevation, motion

**Spacing** — 4px base (`--spacing: .25rem`), so `p-1` = 4px, `p-2` = 8px, `gap-3` = 12px.
Named steps: `--spacing-gutter` 24px (`p-gutter` — panel padding), `--spacing-section` 40px
(`mb-section` — block rhythm), `--spacing-page` 64px (`py-page`).

**Radius** (additive — Tailwind's own `rounded-sm/md/lg/xl` are untouched):
`rounded-inset` 6px (chips, wells) · `rounded-control` 8px (buttons, inputs) ·
`rounded-card` 14px · `rounded-panel` 18px (modals) · `rounded-pill`.

**Tracking** — `tracking-code` (`--tracking-code` 0.28em) for invite/access codes shown or
typed in mono. Everything else takes the tracking baked into its type token.

**Elevation** — all shadows are tinted with the background hue `rgba(2,6,11,…)`, never pure black:

| Utility | Use |
|---|---|
| `shadow-e1` | hairline lift — rows, quiet buttons |
| `shadow-e2` | resting card |
| `shadow-e3` | hovered card, sticky header |
| `shadow-e4` | popover, dropdown, tooltip |
| `shadow-e5` | modal |
| `shadow-well` | *inset* — inputs, tracks, pressed states |
| `shadow-neon` / `shadow-neon-strong` | lime glow for accent/hover states |

**Motion** — `--duration-fast` 120ms, `--duration-base` 200ms, `--duration-slow` 360ms;
easings `--ease-standard` `cubic-bezier(.4,0,.2,1)`, `--ease-out-quint` `cubic-bezier(.22,1,.36,1)`,
`--ease-spring` `cubic-bezier(.34,1.4,.64,1)`. Utilities `ease-standard`, `ease-out-quint`,
`ease-spring`; durations via `duration-[var(--duration-base)]` or in raw CSS.
**Animate only `transform` and `opacity`.** With `motion/react`, use
`transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}` to match `--ease-out-quint`.

---

## 4. Component classes

All live in `@layer components`, so any Tailwind utility still overrides them.
State is expressed with **`.is-active` / `.is-loading` / `.is-invalid`** and native
`:disabled` — never with a bespoke state class.

### 4.1 Buttons

```
.btn                                  base (medium size baked in)
  variants  .btn-primary .btn-secondary .btn-ghost .btn-outline .btn-danger .btn-success
  sizes     .btn-sm .btn-md .btn-lg
  shapes    .btn-icon (square, icon-only — REQUIRES aria-label) .btn-block (full width)
  states    :disabled / [disabled] / [aria-disabled="true"] , .is-loading
```

* `.btn-primary` — acid lime with a restrained gradient sheen, hover `translateY(-1px)` +
  lime glow, real `:active` press (`scale(.985)` + inset shadow). The confident one; one per view.
* `.btn-secondary` — raised surface, neon border on hover. The workhorse.
* `.btn-ghost` — text-first, for toolbars and dismissals.
* `.btn-outline` — lime wire, for a second-priority accent action.
* `.btn-danger` / `.btn-success` — tinted, never shouty.
* `.is-loading` hides the label and draws a spinner in the variant's own foreground colour;
  it also sets `pointer-events: none`. Keep the real `disabled={loading}` prop as it is.

```tsx
<button className="btn btn-primary btn-lg btn-block" disabled={loading}>Submit Flag</button>
<button className="btn btn-primary is-loading" disabled>Submit Flag</button>
<button className="btn btn-ghost btn-sm btn-icon" aria-label="Close"><X className="w-4 h-4" /></button>
```

### 4.2 Surfaces

`.surface` (card: card bg + border + `rounded-card` + `shadow-e2`) ·
`.surface-raised` · `.surface-inset` (well) · `.surface-overlay` (modal/popover: `rounded-panel` + `shadow-e5`) ·
`.card-interactive` (hoverable card: lift −2px, neon border, lime top-sheen, focus ring).

`.card-interactive` on a `<button>`/`<a>` gives you keyboard focus for free — keep the
semantic element, do not swap it for a `div`.

### 4.3 Form controls

`.input` · `.textarea` · `.select` · `.field-label`
Mono type, inset well, lime focus border + 3px soft ring. `.is-invalid` turns the border and
ring clay-red. `:disabled` dims to 50%.

```tsx
<label className="field-label" htmlFor="flag">Flag</label>
<input id="flag" className="input" placeholder="CyberHX{...}" />
<select className="select">…</select>
```

### 4.4 Badges, chips, tabs

`.badge` + `.badge-neon .badge-easy .badge-medium .badge-hard .badge-solved .badge-locked
.badge-live .badge-info` — pill, micro-caps, tinted wash + matching border.
`.badge-live` adds a pulsing dot automatically (opacity-only, off under reduced motion).

`.chip` + `.chip.is-active` — filter pills; active is a solid lime fill with `neon-ink` text.
`.tab` + `.tab.is-active` — active tab gets a raised background and a lime underline bar.
`.nav-link-active` — the legacy top-nav underline, refined into a lime gradient rule (still works).

### 4.5 Primitives

`.skeleton` (shimmer via `transform`, respects reduced motion) · `.skeleton-text` (12px bar) ·
`.divider` / `.divider-vertical` (fading hairline) · `.kbd` · `.tooltip` (bubble; you position it) ·
`.scrim` (fixed full-screen veil + blur, for modal backdrops) ·
`.focus-ring` (adds the lime `:focus-visible` outline to custom composite controls) ·
`.label-micro` · `.text-glow` · `.custom-scrollbar` (thin, tokenised — still used, refined) ·
`.page-shell` (see below).

Global keyboard focus already applies to `a, button, input, select, textarea, summary, [tabindex]`
via `:focus-visible`. **Never** add `focus:outline-none` without replacing the ring —
if you need to kill the default border-only focus, use `focus-visible` styling or `.focus-ring`.

---

## 5. AmbientBackground

`src/components/AmbientBackground.tsx` — default export, decorative, `aria-hidden`,
`position: fixed; inset: 0; pointer-events: none` always.

```tsx
import AmbientBackground from './components/AmbientBackground';

<div className="min-h-screen bg-cyber-bg">
  <AmbientBackground />          {/* or intensity="normal" */}
  <div className="page-shell">   {/* REQUIRED: lifts content above the ambient plane */}
    …page…
  </div>
</div>
```

Props: `intensity?: 'subtle' | 'normal'` (default `'subtle'`), `className?: string`.

Four planes: static colour wash → receding perspective grid → drifting wireframe node
network in three depth bands → sparse motes, with mouse parallax at different speeds per
plane (throttled `pointermove` → rAF → CSS vars `--ambient-gx/--ambient-gy` + canvas offsets).
30fps cap, DPR capped at 2 with a pixel budget, ≤42 nodes, paused on `visibilitychange`.
Under `prefers-reduced-motion: reduce` it renders **only** the static wash + vignette — no
canvas, no listeners.

The ambient root sits at `z-index: 0`; anything that must be readable goes inside
`.page-shell` (or any `relative z-10` wrapper). Use `intensity="normal"` on the auth page
and other low-density screens; keep `subtle` on challenge/scoreboard views.

---

## 6. Recipe: restyle a page with this

1. **Frame** — page root keeps its `min-h-screen bg-cyber-bg`; add `<AmbientBackground />`
   and wrap the existing content in `<div className="page-shell">`.
2. **Surfaces** — replace every `bg-cyber-card border border-cyber-border rounded-lg` with
   `surface` (or `card-interactive` when the whole card is clickable). Padding: `p-gutter`.
3. **Type** — page title `text-h1`, section `text-h2`, card title `text-h3`, prose `text-body`,
   meta `text-small`, and every uppercase eyebrow becomes `label-micro`. Numbers get `font-mono`.
4. **Controls** — every `<button>` gets `btn` + a variant + a size. Every `<input>` gets `input`,
   every `<label>` gets `field-label`. Never restyle a button ad-hoc.
5. **Semantics** — difficulty → `badge badge-easy|badge-medium|badge-hard`;
   solve state → `badge-solved` / `badge-locked`; live event → `badge-live`;
   category hue → `var(--color-cat-<category>)` on a dot, icon or 1px accent.
6. **Depth** — resting `shadow-e2`, hover `shadow-e3/e4`, modal `surface-overlay` + `.scrim`.
7. **Motion** — 200ms `ease-out-quint`, transform/opacity only, and check the page with
   reduced motion on.
8. **Check** — keyboard-tab the page: every interactive element must show a lime ring.

### 6.1 Two shapes that must not drift

**Tables.** `<th>` = `label-micro px-5 py-3.5`, header row = `bg-surface-rail border-b
border-border-base`; `<td>` = `px-5 py-4`; row hover = `hover:bg-surface-raised` with
`duration-[var(--duration-fast)]`; body = `divide-y divide-border-subtle`. The table lives
inside `.surface overflow-hidden` > `overflow-x-auto custom-scrollbar` so the frame scrolls
and the page never does.

**Empty states.** One plate everywhere:

```tsx
<div className="flex flex-col items-center px-6 py-16 text-center">
  <span aria-hidden="true" className="flex h-12 w-12 items-center justify-center rounded-full
        border border-border-strong bg-surface-inset text-text-muted">
    <Icon className="h-5 w-5" />
  </span>
  <p className="mt-4 text-h3 text-cyber-text">{title}</p>
  <p className="mt-1.5 max-w-xs text-small text-text-muted">{body}</p>
</div>
```

### Before / after

```diff
- <div className="bg-cyber-card border border-cyber-border rounded-lg p-4 hover:border-cyber-neon transition-all">
-   <h3 className="text-white font-bold text-sm">{c.title}</h3>
-   <span className="text-[10px] font-bold uppercase tracking-widest text-cyber-muted">{c.difficulty}</span>
-   <button className="bg-cyber-neon text-black text-[11px] font-bold uppercase tracking-widest px-4 py-2 rounded">Open</button>
- </div>
+ <div className="card-interactive p-gutter">
+   <h3 className="text-h3 text-cyber-text">{c.title}</h3>
+   <span className="badge badge-easy">{c.difficulty}</span>
+   <button className="btn btn-primary btn-sm">Open</button>
+ </div>
```

```diff
- <label className="text-[10px] font-bold text-cyber-muted uppercase tracking-widest block">Email</label>
- <input className="w-full bg-cyber-sidebar border border-cyber-border rounded-lg px-4 py-3 text-white text-sm
-   focus:outline-none focus:border-cyber-neon transition-all font-mono" />
+ <label className="field-label" htmlFor="email">Email</label>
+ <input id="email" className="input" />
```

---

## 7. Rules

* Never rename or delete a `--color-cyber-*` token. Adding tokens is fine.
* No new npm dependencies. No three.js. `motion`, `lucide-react`, `recharts` only.
* Animate `transform`/`opacity` only; everything non-essential must die under
  `prefers-reduced-motion` (the global block in `index.css` already handles CSS animation —
  JS-driven motion must check `matchMedia` itself).
* Icon-only buttons need `aria-label`. Do not remove semantic elements or focus outlines.
* Presentation only: never touch supabase calls, hooks, handlers, props or routing.
