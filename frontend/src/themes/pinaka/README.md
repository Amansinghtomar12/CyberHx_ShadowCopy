# Pinaka theme — module contract

Temporary presentation layer for **Pinaka CTF 2026** on the CyberHX platform.
Everything in this directory is removable: delete `src/themes/pinaka/`, drop the
`isPinaka()` branches in the handful of mount points listed in
`docs/pinaka/CHANGE_MANIFEST.md`, and the platform is exactly what it was.

## Non-negotiables for every file in this directory

1. **Presentation only.** No Supabase calls, no `fetch`, no auth, no writes to
   anything but the two localStorage keys in `keys.ts` (`PINAKA_STORAGE_KEYS`) and the tab-only preview in sessionStorage (`themes/index.ts`).
   Every number a component shows arrives through props from data the platform
   already holds.
2. **Never a gate.** Nothing here may delay, cover or intercept a control the
   player needs: the flag input, hints, downloads, Turnstile, the Google button,
   navigation. Overlays are `pointer-events: none` unless they are explicitly
   dismissible and skippable (the intro), and even then the app renders and
   works underneath.
3. **No invented data.** No fake ranks, badges, countdowns to dates the server
   does not hold, or "winner" states before `eventStatus === 'ended'`.
4. **Cultural integrity.** Lord Rama is never drawn as a cartoon, a mascot or a
   game sprite. The bow, light, architecture and landscape carry the theme.
   No invented Sanskrit. Devanagari appears only where `config.ts` provides it
   (the name पिनाक, digits ०–९).
5. **Performance tiers.** Read `getCapability()` from
   `src/components/environment/performance.ts`:
   `still` (reduced motion) → no animation at all; `low` → CSS only, no canvas
   loops; `medium` → canvas allowed at DPR ≤ 1.5, few particles; `high` → full.
   Pause `requestAnimationFrame` loops when `document.hidden`. Dispose every
   listener, timer and context on unmount. Use `transform`/`opacity` for
   motion. No `backdrop-filter` on full-screen layers.
6. **Reduced motion** (`useReducedMotion()` from `motion/react` or the
   capability tier `still`) always has a complete, static, readable result.
7. **Accessibility.** Decorative SVG/canvas is `aria-hidden`. Any interactive
   element is a real `<button>`/`<a>` with a label, visible focus
   (`focus-ring` class), and sits in DOM order. Contrast of text on the
   theme's surfaces ≥ 4.5:1 (tokens are tuned for this; do not use
   `--color-text-faint` for information).
8. **Styling.** Components use the platform's Tailwind utilities and the
   tokens in `styles/tokens.css` (`--pk-*` and the overridden `--color-*`).
   Theme-specific CSS goes in `styles/<name>.css` (plain CSS, no `@apply`,
   no Tailwind directives), scoped under `html[data-theme="pinaka"]`, and is
   imported once from `pinaka.css`. **Do not import CSS from component
   files.** Class prefix for new classes: `pk-`.
9. **No new dependencies.** React, `motion/react`, `lucide-react` and the
   platform's own modules only. No three.js.
10. **Security.** No external scripts, no `dangerouslySetInnerHTML`, no remote
    assets other than Google Fonts (already in the CSP). Every drawing is
    inline SVG (or Canvas 2D); the only raster assets are the same-origin
    photographic plates in `assets/plates` (WebP, bundled by Vite, `img-src
    'self'`), credited in the footer's `PartnerStrip` and in
    `docs/pinaka/ASSETS.md`. No other image file, ever.

## Public surface

```
src/themes/index.ts              resolveTheme / getTheme / isPinaka / bootTheme / setThemeOverride
src/themes/pinaka/config.ts      PINAKA_EVENT, PINAKA_PARTNERS, WORLDS, CATEGORY_MOTIF, devanagariNumber
src/themes/pinaka/hooks.ts       deriveWorld, derivePhase, useWorld, useWorldAttributes
src/themes/pinaka/pinaka.css     stylesheet entry (loaded on demand)
src/themes/pinaka/styles/*.css   tokens.css, core.css, + one file per component family
src/themes/pinaka/components/    the components listed below
src/themes/pinaka/lazy.tsx       React.lazy wrappers for the heavy components
src/themes/pinaka/assets/plates/ PLATES, PLATE_CREDITS (index.ts); plateSource, plateFocal, preloadPlate (sources.ts); the twelve WebP files
```

## Components (file → default export → props)

| File | Export | Props | Notes |
|---|---|---|---|
| `components/PinakaEnvironment.tsx` | `PinakaEnvironment` | `{ world: World; phase: EventPhase; intensity?: 'subtle' \| 'normal' }` | Fixed full-viewport layer behind `.page-shell` (z-index 0, `pointer-events:none`, `aria-hidden`). Replaces `<AmbientBackground/>` under the theme. Crossfades between worlds. Writes `data-world`/`data-phase` via `useWorldAttributes`. CSS in `styles/environment.css`. |
| `components/BowMotifs.tsx` | named: `BowLoader`, `BowProgress`, `BowstringCountdown`, `ArrowSolveLight`, `GoldRule`, `Eyebrow`, `CornerFrame` | see file | The signature motif family. CSS in `styles/motifs.css`. |
| `components/CategoryGlyph.tsx` | named: `PINAKA_CATEGORY_ICON`, `CategoryGlyph` | `Record<string, React.ComponentType<{className?: string}>>` | Ten original 24×24 stroke icons, `currentColor`, drop-in for the Lucide map in App.tsx. |
| `components/PinakaIntro.tsx` | `PinakaIntro` | `{ onDone: () => void }` | First-visit, skippable, ≤ 4.5 s, non-blocking; the page behind it is `inert`; focus returns to the nav on leave. Whether to play it is `intro-gate.ts#shouldShowIntro()`, which the app reads without downloading this chunk. The hero plate (`PLATES.hero`) sits dim behind the city — opacity ≈ 0.58 under a wash that is darkest across the middle, edges dissolved by a radial mask, no blur filter — fading in over 1.2 s from mount; the still path shows it at rest; forced colours drop it. Only the plate's URL strings enter this chunk. CSS in `styles/intro.css`. |
| `components/JourneyMap.tsx` | `JourneyMap` | `{ phase: EventPhase; progress: number; total?: number; personal?: number; collapsed?: boolean }` | The campaign as progress: all of India (Natural Earth, India's point of view) with the road through seven stations, each leg a sixth of the board (`journey/milestones.ts`), so the team's arrow and the lit road follow its real solves; the head names the next milestone and the solves it needs. Lays itself out by its own width (container query on `.pk-journey-host`): map beside the milestones from 900px, stacked below; the map always fits its box. Animations pause while off screen. CSS in `styles/journey.css`. |
| `components/PartnerStrip.tsx` | `PartnerStrip` | `{ variant?: 'footer' \| 'gateway' }` | Organiser + partner recognition from `config.ts`, and under it the photographs' credit line from `assets/plates#PLATE_CREDITS` ("Photographs · title by author (licence) · …", title → source, licence → deed, `rel="noopener noreferrer"`). Present in both variants, never truncated (CC BY-SA asks for it wherever a plate is shown). CSS in `styles/partners.css`. |
| `components/SetuChain.tsx` | `SetuChain` | same as `ChainExperience`: `{ series: ChainSeriesVM; onOpenChallenge(id); onBack() }` | The bridge-of-stones chain. Same data, same controls as `ChainExperience`. CSS in `styles/setu.css`. |
| `components/AuthGateway.tsx` | `AuthGateway` | `{}` | The hero column of the sign-in page under the theme (desktop only; the page hides the column below `lg`). The hero plate is the column's own backdrop: an `<img>` from `plateSource`/`plateFocal`, clipped to the column, feathered at its edges, under the stone and under two dark gradients (from the top and from the left) tuned so the lockup, taglines, fact rows and partner plate measure ≥ 4.5:1 against the photograph. Drifts once on the high tier only (scale 1.06 → 1 over 40 s, transform only, `will-change` dropped when it ends); nothing moves under reduced motion or on 'still'. Sizes nothing, never reaches the form column. CSS in `styles/gateway.css`. |
| `components/PodiumFrame.tsx` | `PodiumFrame` | `{ rank: 1\|2\|3; children }` | Ornamental frame around the existing podium cards. CSS in `styles/lanka.css`. |
| `components/ProfileJourney.tsx` | `ProfileJourney` | `{ solves: { title; category; at; points }[] }` | Chronology of real solves on the profile. |
| `components/ThemeSwitch.tsx` | `ThemeSwitch` | `{}` | Settings → Experience: Pinaka / Classic, per device. |

## Worlds and phases

`World = 'ayodhya' | 'vanavasa' | 'setu' | 'lanka' | 'vijaya'` and
`EventPhase = 'before' | 'during' | 'after'` (from `hooks.ts`). The app derives
them from the current view, board mode and the server-derived `eventStatus`;
components only consume them.

## Testing hooks

`?theme=pinaka` / `?theme=cyberhx` / `?theme=auto` selects the skin for the
device; `?preview=pinaka` / `?preview=off` for this tab only (sessionStorage,
used by the admin panel's preview link). `?intro=1` replays the intro once;
all three are read and stripped at boot by `themes/index.ts`. The visual harness in `qa/visual/` drives
every screen in both themes.
