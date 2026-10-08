# Pinaka — design system (theme layer)

The Pinaka skin is a **token override plus a small component family** on top of
the CyberHX design system (`frontend/src/styles/DESIGN_SYSTEM.md`). Nothing
below replaces that document; it says what changes when
`html[data-theme="pinaka"]` is set and what the theme adds.

Source of truth: `frontend/src/themes/pinaka/styles/tokens.css` (tokens),
`styles/core.css` (re-skin of existing components), one `styles/<family>.css`
per themed component family.

## 1. Palette

Ground is deep midnight; gold is the only accent; parchment carries text. The
five chapters tint the environment, never the UI.

| Role | Token | Value | Contrast on ground |
|---|---|---|---|
| Ground | `--color-surface-base` / `--color-cyber-bg` | `#0a0e17` | — |
| Rail / nav | `--color-surface-rail` | `#0d1220` | — |
| Card | `--color-surface-card` | `rgba(17,20,34,.74)` | — |
| Overlay (modals) | `--color-surface-overlay` | `#171b2c` | — |
| Text primary (parchment) | `--color-text-primary` / `--color-cyber-text` | `#f3e8d1` | 15.3 : 1 |
| Text secondary | `--color-text-secondary` | `#cdc0a6` | 10.1 : 1 |
| Text muted | `--color-text-muted` / `--color-cyber-muted` | `#a69a84` | 6.3 : 1 |
| Text faint (decorative only) | `--color-text-faint` | `#726859` | 3.1 : 1 |
| Accent (replaces lime) | `--color-neon` / `--color-cyber-neon` | `#e3bb66` | 9.6 : 1 |
| Accent dim | `--color-neon-dim` | `#c49a45` | 6.7 : 1 |
| Accent bright | `--color-neon-bright` | `#f6dfa3` | 13.4 : 1 |
| Ink on accent fill | `--color-neon-ink` | `#1a1206` | 9.2 : 1 on `#e3bb66` |
| Border base | `--color-border-base` / `--color-cyber-border` | `#262a3a` | — |
| Gold hairline | `--color-border-neon` | `rgba(227,187,102,.55)` | — |

Theme-private tokens (prefix `--pk-`): `--pk-gold`, `--pk-gold-soft`,
`--pk-gold-bright`, `--pk-gold-deep`, `--pk-gold-ink`, `--pk-gold-line`,
`--pk-gold-faint`, `--pk-gold-glow`, `--pk-foil` (the foil gradient),
`--pk-indigo`, `--pk-sandstone`, `--pk-emerald`, `--pk-crimson`,
`--pk-parchment`, and the per-world `--pk-world-tint`, `--pk-world-rim`,
`--pk-world-sky-top`, `--pk-world-sky-bottom`.

Semantic colours keep their meaning: difficulty (easy green → medium amber →
hard red, insane violet), status (live red, info blue, first blood pink) are
only warmed one step. **Solved** becomes gold: a solved card is a lit stone.
**Danger stays red**: `btn-danger`, `border-border-danger` and the hard-wash
are never gold, so a destructive admin action never looks like the primary one.

Category hues are muted and used only for icons, 1px accents and dots, exactly
as in the base system.

## 2. Typography

| Use | Face | Token |
|---|---|---|
| Page titles, section headings, event name, the big numbers in the intro | Cinzel 600 | `--pk-font-display` |
| Narrative prose (intro, journey copy, the gateway taglines) | EB Garamond | `--pk-font-prose`, class `pk-prose` |
| Everything a competitor reads as information: body, labels, cards, forms, tables | Inter | `--font-sans` (unchanged) |
| Flags, points, timers, ranks, hashes, code | JetBrains Mono | `--font-mono` (unchanged) |

Rules: Cinzel only on `.text-display`, `.text-h1`, `h2.text-h2` and the
theme's own display elements; never below 18px; never for a challenge card
title (`text-h3` stays Inter). Devanagari appears only as the name पिनाक in
the title lockup and as chapter/stage numerals (०–९) from
`config.ts#devanagariNumber`; no decorative Sanskrit anywhere. Fonts load from
Google Fonts with `display=swap` (already permitted by the CSP) and every
declaration carries a serif fallback stack.

## 3. Material and ornament

* **Surfaces**: dark stone — `rgba(14,17,29,.66)` cards with a gold hairline
  where the light lands (`::after` top edge), warm sheen on hover. No glossy
  gradients.
* **Carved frame** (`.pk-carved`): an inset hairline 6px inside the border,
  used on the panels that lead a page (the world banner, the journey map).
  Not on every card.
* **Corner brackets** (`CornerFrame`), **eyebrow rules** (`.pk-eyebrow`),
  **diamonds** (`.pk-diamond`), **foil text** (`.pk-foil-text`): the small
  ornament vocabulary. Use at most one per block.
* **Primary button**: a brushed-gold fill with an inner highlight; secondary
  and outline are gold hairlines on stone.
* **Cursor**: the platform's reticle, recoloured gold (fine pointers only).

## 4. Motion

Inherits the base motion tokens (`--duration-fast/base/slow`, `--ease-out-quint`)
and the base reduced-motion contract. The theme adds:

| Effect | Where | Budget | Reduced motion |
|---|---|---|---|
| World crossfade | environment | 1.2 s opacity | instant |
| Motes / embers / leaves | environment canvas | ≤ 90 particles, ≤ 30 fps, paused when hidden | none |
| Parallax | environment layers | transform only, ≤ 9% of scroll, ≤ 6px pointer | none |
| Bow trace (solve) | challenge modal overlay | ≤ 1.7 s (2.1 s Insane), `pointer-events: none` | fade of "+points" only |
| Bowstring countdown | world banner | 1 s tick, SVG dash | static ring |
| Journey gleam | journey map path | 6 s loop, transform | none |
| Setu thread gleam, water drift | chained board | CSS keyframes, transform | static |
| Intro | first visit | ≤ 4.5 s, skippable from frame one, auto-dismiss | static title frame |

No `backdrop-filter` on full-screen layers; no `filter: blur()` on moving
elements; nothing animates layout.

## 5. The five worlds

| Chapter | World | Where | Tint |
|---|---|---|---|
| I | Ayodhya — the awakening | profile, team, settings, admin, sign-in, the board before the event | sandstone dawn |
| II | Vanavasa — the forest of trials | the challenge board (free) | forest emerald |
| III | Setu — the path of connections | the chained board | indigo water, gold threads |
| IV | Lanka — the arena of strategy | scoreboard, teams, users | crimson / bronze embers |
| V | Vijaya — the light of victory | every screen once the event has ended | golden horizon |

The world is derived in `hooks.ts#deriveWorld` from the view, the board mode
and the server-derived event status, and published on `<html data-world>`.
Only `tokens.css` reads it (sky and rim tokens); components take it as a prop.

## 6. What the theme is not allowed to do

Change a control's size, position, label semantics or tab order; hide an
error; put a canvas or overlay over Turnstile, the Google button, the flag
input, downloads or copy buttons; invent any number; show a winner before
`eventStatus === 'ended'`; load a script; depict a sacred figure as a mascot.
