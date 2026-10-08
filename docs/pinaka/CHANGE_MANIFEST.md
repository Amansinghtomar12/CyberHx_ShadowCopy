# Pinaka theme — change manifest

Branch: `feature/pinaka-ramayana-experience`, based on `main @ ce23b64`
("Remove the Grand Finale decoration (#39)").

Everything below is frontend-only. **No change** to `supabase/`, `vercel.json`,
`package.json` dependencies, `index.html`, environment secrets, or any API
contract.

## New files (removable as a unit)

```
frontend/src/themes/index.ts                       theme resolution, boot, icon registry
frontend/src/themes/pinaka/boot.ts                 loads the stylesheet, fonts, glyphs (theme only)
frontend/src/themes/pinaka/config.ts               event facts, partners, worlds, copy, storage keys
frontend/src/themes/pinaka/hooks.ts                deriveWorld / derivePhase / useWorldAttributes
frontend/src/themes/pinaka/intro-gate.ts           shouldShowIntro()
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
frontend/src/themes/pinaka/components/WorldBanner.tsx
frontend/src/themes/pinaka/components/AuthGateway.tsx
frontend/src/themes/pinaka/components/PodiumFrame.tsx
frontend/src/themes/pinaka/components/ProfileJourney.tsx
frontend/src/themes/pinaka/components/ThemeSwitch.tsx
frontend/src/themes/pinaka/README.md               module contract
frontend/src/lib/brand.ts                          tokenValue(): read a CSS token as a literal (charts)
frontend/qa/visual/{harness,mock,scenes}.cjs, README.md   screenshot harness (dev tool, not shipped)
docs/pinaka/*.md                                   this documentation set
```

## Edited files — every edit is an `isPinaka()` branch or a token reference

| File | What changed | Default-theme effect |
|---|---|---|
| `src/main.tsx` | `bootTheme().finally(() => createRoot(...).render(...))` | render is deferred by one resolved promise; no fetch on the default theme |
| `src/App.tsx` | imports; `CATEGORY_ICON` wrapped in `registerCategoryIcons()`; `pinaka/world/worldPhase/introOpen` locals; environment swap; intro mount; nav badge; `WorldBanner` above and `JourneyMap` below `CommandHeader`; `PartnerStrip` in the footer; `ArrowSolveLight` beside `BreachConfirm`; two lime literals → `color-mix(... var(--color-neon) ...)` with the same alpha | none (identical elements and pixels) |
| `src/components/AuthPage.tsx` | environment swap; hero column → `AuthGateway` under the theme; four copy strings ternaried | none |
| `src/Scoreboard.tsx` | `PodiumFrame` around the three podium cards; `pk-lanka-hall` class on the page wrapper; one label; `seriesColor()` reads the accent via `lib/brand` | none (same hex on the default theme) |
| `src/components/chain/ChainedBoard.tsx` | the lazy chain renderer picks `SetuChain` under the theme; one lime glow → `color-mix` | none |
| `src/components/chain/ChainExperience.tsx` | two lime literals → token/`color-mix` | none |
| `src/components/b2r/B2RBoard.tsx` | three lime literals → token/`color-mix` | none |
| `src/Settings.tsx` | `ThemeSwitch` in the Experience panel, shown only when the skin is in play | none (not rendered) |
| `src/UserProfile.tsx` | `at` field added to the solves view-model; `ProfileJourney` under the theme; chart accent via `lib/brand` | none |
| `src/TeamProfile.tsx` | chart accent via `lib/brand` | none |
| `src/SharedComponents.tsx` | `TOKEN.neon/neonDim/neonBright` become getters via `lib/brand` | none |

## Unavoidable deviations from "presentation only"

* `main.tsx` defers the first render until `bootTheme()` settles. On the
  default theme this is an already-resolved promise (one microtask). On the
  Pinaka theme it waits for the theme CSS chunk (≈ 20–30 KB gzip, same origin)
  so the first paint is not un-themed. If that fetch fails the platform renders
  with the default skin.
* `UserProfile.tsx` keeps the raw `submitted_at` alongside the formatted time
  in its local view-model (`at`). Nothing reads it except the theme.
* `registerCategoryIcons()` lets the theme replace entries of App's icon map
  during boot. The map's keys and the components' props are unchanged.

## Build-time configuration (new, all optional)

`VITE_THEME` (`pinaka` | `cyberhx`, default `cyberhx`), `VITE_THEME_UNTIL`
(ISO date), `VITE_THEME_SWITCH` (`0` disables per-device overrides). See
`RESTORE.md`.
