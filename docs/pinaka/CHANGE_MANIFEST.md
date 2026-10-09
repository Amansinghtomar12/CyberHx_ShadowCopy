# Pinaka theme — change manifest

Branch: `feature/pinaka-ramayana-experience`, based on `main @ ce23b64`
("Remove the Grand Finale decoration (#39)").

**No change** to `vercel.json`, `package.json` dependencies, `index.html`,
environment secrets, or any existing API contract. One additive migration
(below) adds the organisers' theme switch.

## New files (removable as a unit)

```
frontend/src/themes/index.ts                       theme resolution, server switch, live apply, icon registry
frontend/src/themes/AdminThemeControl.tsx           "Open Pinaka" button (header, phone menu) and panel (Admin → Event); lazy, admins only
frontend/src/themes/pinaka/boot.ts                 loads the stylesheet, fonts, glyphs; preloads the first world's plate (theme only)
frontend/src/themes/pinaka/config.ts               event facts, partners, worlds, copy, storage keys
frontend/src/themes/pinaka/hooks.ts                deriveWorld / derivePhase / useWorldAttributes
frontend/src/themes/pinaka/intro-gate.ts           shouldShowIntro()
frontend/src/themes/pinaka/keys.ts                 the two localStorage keys (kept out of config.ts so the default bundle stays small)
frontend/src/themes/pinaka/lazy.tsx                React.lazy entry points for every themed component
frontend/src/themes/pinaka/pinaka.css              stylesheet entry (@imports styles/*)
frontend/src/themes/pinaka/styles/tokens.css       token overrides under html[data-theme="pinaka"]
frontend/src/themes/pinaka/styles/core.css         re-skin of existing components
frontend/src/themes/pinaka/styles/{motifs,environment,intro,journey,setu,gateway,lanka,partners}.css
frontend/src/themes/pinaka/components/PinakaEnvironment.tsx
frontend/src/themes/pinaka/components/BowMotifs.tsx
frontend/src/themes/pinaka/components/CategoryGlyph.tsx
frontend/src/themes/pinaka/components/PinakaIntro.tsx
frontend/src/themes/pinaka/components/JourneyMap.tsx
frontend/src/themes/pinaka/components/PartnerStrip.tsx
frontend/src/themes/pinaka/components/SetuChain.tsx
frontend/src/themes/pinaka/components/AuthGateway.tsx
frontend/src/themes/pinaka/components/PodiumFrame.tsx
frontend/src/themes/pinaka/components/ProfileJourney.tsx
frontend/src/themes/pinaka/components/ThemeSwitch.tsx
frontend/src/themes/pinaka/components/journey/geo.ts   journey-map geography: Natural Earth coastlines (public domain), five stations, one road; pure data
frontend/src/themes/pinaka/assets/plates/index.ts  PLATES / PLATE_CREDITS: the world plates (two official paintings, three licensed photographs), focal and sun points, credits
frontend/src/themes/pinaka/assets/plates/sources.ts   plateSource / plateFocal / preloadPlate — the one place that picks a plate's file for an <img> or a preload
frontend/src/themes/pinaka/assets/plates/*.webp    ten same-origin WebP files (1920 + 960 px wide per plate, 817 KB in all; see ASSETS.md)
frontend/src/themes/pinaka/README.md               module contract
frontend/src/lib/brand.ts                          tokenValue(): read a CSS token as a literal (charts)
frontend/qa/visual/{harness,mock,scenes}.cjs, README.md   screenshot harness (dev tool, not shipped)
supabase/migrations/20261008000000_event_theme.sql   event_settings.theme + admin_set_theme() + public_theme()
docs/pinaka/*.md                                   this documentation set (AUDIT, DESIGN_SYSTEM, ASSETS, CHANGE_MANIFEST, RESTORE, REVIEW, TEST_RESULTS)
```

## Edited files — every edit is an `isPinaka()` branch or a token reference

| File | What changed | Default-theme effect |
|---|---|---|
| `src/main.tsx` | `bootTheme(() => supabase.rpc('public_theme'))` then `createRoot(...).render(...)`; an RPC error is thrown so it counts as "no answer" | one anonymous RPC before first paint (cached per device; a first visit waits ≤ 700 ms for it; the skin's own chunks get ≤ 2.5 s, after which the page paints and the skin lands in place) |
| `src/App.tsx` | imports; `CATEGORY_ICON` wrapped in `registerCategoryIcons()`; `pinaka` (from `useTheme()`), `world/worldPhase/introOpen` locals; environment swap; intro mount; nav badge + the admins' `AdminThemeControl` button; `noteServerTheme(data.theme)` in the event-settings poll; `JourneyMap` below `CommandHeader` (whenever the board renders, so the waiting and closed states are named too), with `progress` (the board's solved share) and `personal` (the player's own, from `solvedIds`); the nav badge hides until the header has room for it (`xl`, `2xl` for admins); `PartnerStrip` in the footer (organiser, partners and the photographs' credit line); `ArrowSolveLight` beside `BreachConfirm` (both keyed); `.page-shell` is `inert` while the intro is up and an effect hands focus to the nav brand once it has closed; two lime literals → `color-mix(... var(--color-neon) ...)` with the same alpha | none for players (identical elements and pixels); admins gain one header button |
| `src/components/AuthPage.tsx` | environment swap; hero column → `AuthGateway` under the theme; four copy strings ternaried | none |
| `src/Scoreboard.tsx` | `PodiumFrame` around the three podium cards; `pk-lanka-hall` class on the page wrapper; one label; `seriesColor()` reads the accent via `lib/brand` | none (same hex on the default theme) |
| `src/components/chain/ChainedBoard.tsx` | two lazy renderers; `SetuChain` chosen at render under the theme; one lime glow → `color-mix` | none |
| `src/components/b2r/B2RBoard.tsx` | the same two-renderer swap for Boot-to-Root chains | none |
| `src/components/chain/ChainExperience.tsx` | two lime literals → token/`color-mix` | none |
| `src/components/b2r/B2RBoard.tsx` | three lime literals → token/`color-mix` | none |
| `src/Settings.tsx` | `ThemeSwitch` in the Experience panel, shown only when the skin is in play (build, server or device) | none (not rendered) |
| `src/components/admin/AdminDashboard.tsx` | `AdminThemeControl` panel at the top of the Event tab | admins gain one panel; every existing control unchanged |
| `src/UserProfile.tsx` | `at` field added to the solves view-model; `ProfileJourney` under the theme; chart accent via `lib/brand` | none |
| `src/TeamProfile.tsx` | chart accent via `lib/brand` | none |
| `src/SharedComponents.tsx` | `TOKEN.neon/neonDim/neonBright` become getters via `lib/brand` | none |
| `src/lib/brand.ts` (new) | token reads for chart literals, cached until the theme switches (`resetTokenCache()`, called by `applyTheme`) | same hex values as before on the default theme |

### Theme files touched by the plates round (all inside the removable unit)

`components/PinakaEnvironment.tsx` + `styles/environment.css` (the world's
plate behind each scene, promoted only once loaded, a second veil over it),
`components/AuthGateway.tsx` + `styles/gateway.css` (the hero plate as the
column's backdrop), `components/PinakaIntro.tsx` + `styles/intro.css` (the
hero plate dim behind the city), `components/PartnerStrip.tsx` +
`styles/partners.css` (the credit line), `components/JourneyMap.tsx` +
`styles/journey.css` (the map from `journey/geo.ts`), `boot.ts` (one plate
preload). No platform file outside the table above changed for it except the
`personal` prop on `JourneyMap` in `App.tsx`.

### Theme files touched by the official-art round

`assets/plates` (the temple and Lanka paintings as the Ayodhya/hero and
Lanka plates, the three replaced photographs deleted, a `sun` point per
plate, `sizes` from the drawn width), `components/PinakaEnvironment.tsx` +
`styles/environment.css` (plates in full colour with no silhouettes over
them; god rays and a sun bloom graded per world; the dharma wheel emblem as
a slowly turning celestial relic; brighter motes, bokeh and embers; veils
only where the interface is dense), `styles/core.css` (no body image; glass
panels and sidebar; badges legible on bright art; the nav bar's full-height
torch-lit corners, stone and compass). In `App.tsx`, only the pinaka-only
nav badge changed: a `pk-nav-badge` class and an `aria-hidden` compass span
inside it.

## Unavoidable deviations from "presentation only"

* `main.tsx` defers the first render until `bootTheme()` settles: one
  anonymous `public_theme()` RPC (skipped once cached on the device; a first
  visit waits for it at most 700 ms), then — only when the answer is
  `pinaka` — the theme CSS chunk and the first components (same origin), for at
  most 2.5 s, so the first paint is not un-themed. Past either deadline the
  platform paints with the default skin and the skin is applied in place when
  it arrives; if a chunk fails outright the default is committed explicitly so
  the DOM and every component agree.
* `supabase/migrations/20261008000000_event_theme.sql` is the one server
  change: an additive `theme` column on `event_settings` with a CHECK, the
  admin-only audited `admin_set_theme(text)` and the read-only
  `public_theme()` for the sign-in page. Verified on a throwaway Postgres 16
  (see TEST_RESULTS.md).
* `UserProfile.tsx` keeps the raw `submitted_at` alongside the formatted time
  in its local view-model (`at`). Nothing reads it except the theme.
* `registerCategoryIcons()` lets the theme replace entries of App's icon map
  during boot. The map's keys and the components' props are unchanged.

## Build-time configuration (new, all optional)

`VITE_THEME` (`pinaka` | `cyberhx`, default `cyberhx`), `VITE_THEME_UNTIL`
(ISO date), `VITE_THEME_SWITCH` (`0` disables per-device overrides). See
`RESTORE.md`.
