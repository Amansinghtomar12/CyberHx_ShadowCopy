# Pinaka theme — adversarial review findings and their disposition

Five independent review lenses (functional preservation, accessibility/UX, performance, security/privacy, brand/cultural) were run against the branch and their findings consolidated here. Each item records what was done about it. "pending" items are being worked through; nothing is silently dropped.

| # | Severity | Lens | Finding | File | Disposition |
|---|---|---|---|---|---|
| 0 | high | a11y/UX | Scoreboard hall vignette bleeds 3rem past the right edge and causes horizontal page scroll | `frontend/src/themes/pinaka/styles/lanka.css:22` | pending |
| 1 | high | a11y/UX | JourneyMap SVG shrinks to an unreadable scale between sm and lg (labels ~2.5–4px) | `frontend/src/themes/pinaka/styles/journey.css:16` | pending |
| 2 | high | a11y/UX | Locked/"Closed" badge text drops to 3.41:1 under the theme (was 4.26:1) | `frontend/src/themes/pinaka/styles/tokens.css:104` | pending |
| 3 | medium | a11y/UX | Placeholder text (flag input) falls to 3.5:1 via the faint token | `frontend/src/themes/pinaka/styles/tokens.css:89` | pending |
| 4 | medium | a11y/UX | Intro curtain is opaque but does not contain focus: Tab leaves into content hidden underneath | `frontend/src/themes/pinaka/components/PinakaIntro.tsx:280` | pending |
| 5 | medium | a11y/UX | Foil-text titles vanish in Windows High Contrast / forced-colors mode | `frontend/src/themes/pinaka/styles/core.css:268` | pending |
| 6 | medium | a11y/UX | Setu briefing dialog claims aria-modal but never receives focus, has no Escape and no restore | `frontend/src/themes/pinaka/components/SetuChain.tsx:390` | pending |
| 7 | low | a11y/UX | Theme radiogroup has no arrow-key navigation | `frontend/src/themes/pinaka/components/ThemeSwitch.tsx:298` | pending |
| 8 | low | a11y/UX | aria-label on generic <span> for the board-progress readout is prohibited and ignored | `frontend/src/themes/pinaka/components/JourneyMap.tsx:140` | pending |
| 9 | low | a11y/UX | Countdown label and days render at 9–10px for sighted users | `frontend/src/themes/pinaka/components/BowMotifs.tsx:276` | pending |
| 10 | high | performance | Default-theme first render is gated on the public_theme RPC (up to 900 ms) whenever the server-theme cache is empty | `frontend/src/main.tsx:55` | fixed |
| 11 | high | performance | bootTheme's rejection branch is dead: postgrest-js resolves {data:null} on network/404, so a transient failure wipes the cache and flips a Pinaka device back to classic mid-boot | `frontend/src/themes/index.ts:242` | fixed |
| 12 | high | performance | Environment is fully rebuilt on every innerHeight change: mobile URL-bar collapse and on-screen keyboard rescale the silhouettes and respawn all motes | `frontend/src/themes/pinaka/components/PinakaEnvironment.tsx:867` | pending |
| 13 | medium | performance | First commit renders the full inline-SVG scene (hundreds of nodes) and discards it one effect later on high/medium tiers | `frontend/src/themes/pinaka/components/PinakaEnvironment.tsx:849` | pending |
| 14 | medium | performance | Canvas backing-store memory: motes canvas and three static strips at 1.5x DPR, doubled during the 1.2 s crossfade (~90-150 MB on common desktops) | `frontend/src/themes/pinaka/components/PinakaEnvironment.tsx:87` | pending |
| 15 | medium | performance | PinakaEnvironment chunk is not warmed at boot, so every cold Pinaka load paints the UI first and the background pops in one round-trip later with no fade | `frontend/src/themes/pinaka/boot.ts:14` | pending |
| 16 | medium | performance | lib/brand.ts caches getComputedStyle token values for the session, but the theme now switches in place, so chart accents go stale | `frontend/src/lib/brand.ts:13` | fixed |
| 17 | medium | performance | Infinite CSS animations on SVG children (Setu gleam, Journey gleam mask) force whole-SVG repaints at 60 fps for the life of the view | `frontend/src/themes/pinaka/styles/setu.css:107` | pending |
| 18 | low | performance | Environment transitions still run under the 'still' tier (fx dial off) and the sky transition repaints a full-viewport gradient every frame | `frontend/src/themes/pinaka/styles/environment.css:48` | pending |
| 19 | low | performance | Per-frame allocation in the mote loop and unbounded transient mote count on rapid world flips | `frontend/src/themes/pinaka/components/PinakaEnvironment.tsx:765` | pending |
| 20 | low | performance | PodiumFrame Suspense uses the card as its fallback, so the card remounts into the frame when the chunk arrives | `frontend/src/Scoreboard.tsx:856` | pending |
| 21 | info | performance | Bundle verification: lazy structure holds; default build eagerly ships ~10.4 kB minified (~3.5-4 kB gzip) of theme code, config.ts included via intro-gate | `frontend/src/themes/pinaka/lazy.tsx:15` | no action |
| 22 | high | functional | Theme load failure does not fall back: getTheme() lazily resolves to 'pinaka' after bootPinaka() rejects, so themed components render without the stylesheet | `frontend/src/themes/index.ts:210` | fixed |
| 23 | medium | functional | Two unkeyed children inside the modal's AnimatePresence collide on key "" | `frontend/src/App.tsx:2344` | pending |
| 24 | high | functional | lib/brand.ts caches token values for the session, so charts keep the previous theme's accent after an in-place theme switch | `frontend/src/lib/brand.ts:24` | fixed |
| 25 | medium | functional | A PostgREST error from public_theme() resolves with data=null, which wipes the server-theme cache and flips the skin, and re-arms the 900 ms first-paint wait on every load | `frontend/src/themes/index.ts:242` | fixed |
| 26 | medium | functional | AdminThemeControl nav variant records the RPC error but never renders it | `frontend/src/themes/AdminThemeControl.tsx:39` | pending |
| 27 | low | functional | Live theme switch remounts the open chain experience (ChainedBoard picks a different lazy component per render) | `frontend/src/components/chain/ChainedBoard.tsx:61` | pending |
| 28 | low | functional | B2R chained sub-mode still renders the classic steel ChainExperience under the Pinaka theme | `frontend/src/components/b2r/B2RBoard.tsx:13` | pending |
| 29 | low | functional | PodiumFrame Suspense uses the card as its own fallback, so the PodiumCard remounts and replays its entrance/count-up when the chunk arrives | `frontend/src/Scoreboard.tsx:257` | pending |
| 30 | low | functional | shouldShowIntro() is defined twice; App uses intro-gate.ts while README documents the PinakaIntro.tsx export | `frontend/src/themes/pinaka/intro-gate.ts:11` | fixed |
| 31 | medium | security | Device override outranks the organisers' switch; admin 'Preview on this device' pins the admin's own device and navigates away from the dashboard | `frontend/src/themes/index.ts:133` | pending |
| 32 | medium | security | First paint is blocked on Pinaka chunk downloads with no deadline when the theme is cached or server-open | `frontend/src/main.tsx:55` | pending |
| 33 | low | security | ?intro=1 is never stripped from the URL, so the full-screen curtain replays on every load of that address and bypasses the once-per-device guard | `frontend/src/themes/pinaka/intro-gate.ts:15` | fixed |
| 34 | low | security | Global 'Open Pinaka' switch is one confirm away in the header on every screen for every admin | `frontend/src/App.tsx:991` | pending |
| 35 | info | security | Confirmed clean: CSP, deps, markdown, blank-target links, DOM sinks, data exposure | `frontend/package.json:13` | no action |

## Details

### 0. Scoreboard hall vignette bleeds 3rem past the right edge and causes horizontal page scroll

**Scenario.** `.pk-lanka-hall::before` is `position:absolute; inset: -2rem -3rem auto -3rem` with no clipping ancestor: the Scoreboard wrapper (`flex-1 w-full min-w-0 mx-auto max-w-6xl px-4`, Scoreboard.tsx:720) sits in AnimatedView (`flex flex-1 w-full min-w-0`), `.page-shell` and the App root, none of which set `overflow-x: hidden`, and html/body in index.css have no overflow rule either. On any viewport narrower than 72rem+6rem (every phone, tablet and most laptops) the pseudo-element extends 48px beyond the viewport's right edge, so the Pinaka scoreboard page gains a 48px horizontal scrollbar / rubber-band pan that the classic theme does not have. `mask-image` does not affect layout, so it does not help. Negative left/top do not create scroll; only the right side does.

**Proposed fix.** Clip the bleed: add `overflow: clip` (or `overflow-x: clip`) to `.pk-lanka-hall`, or drop the horizontal bleed (`inset: -2rem 0 auto 0`) and let the gradients fade at the wrapper edge.

### 1. JourneyMap SVG shrinks to an unreadable scale between sm and lg (labels ~2.5–4px)

**Scenario.** The expanded panel is a 3-column grid `minmax(200px,250px) minmax(0,1fr) auto` with 2×1.25rem gaps and ~36px padding; the head track is maximised to 250px before the `1fr` map track gets the remainder. The board column has no rail below lg (`hidden lg:block` aside, App.tsx:1099) so at a 768px viewport the container is ~720px and the map track resolves to ~294px; at 640px it is ~182px. The SVG uses `viewBox 0 0 720 100` with `preserveAspectRatio="xMidYMid meet"` (JourneyMap.tsx:170-171), so the 9.5px station labels (journey.css:146) render at ~3.9px (768px) and ~2.4px (640px), the Devanagari numerals at ~4.5px, and the 8-unit rings at ~3px. Even on phones the `min-width: 560px` scroll track (journey.css:195) only yields a 0.78 scale, i.e. ~7.4px labels. Tablets in portrait get an illegible smear where the classic board shows nothing.

**Proposed fix.** Switch to the stacked phone layout (`head side / map map`) below lg instead of 640px, or give the map track a `minmax(420px,1fr)` and let the panel wrap, and raise the SVG text sizes so that at the minimum rendered width they stay ≥ 9px (e.g. 12–13px in viewBox units when the track can be ≤ 560px).

### 2. Locked/"Closed" badge text drops to 3.41:1 under the theme (was 4.26:1)

**Scenario.** `--color-status-locked: #716d7e` is the text colour of `.badge-locked` (index.css:639) at micro size. On the badge wash over a `.surface` (rgba(113,109,126,.12) over ≈#0d101b) the ratio is 3.41:1; on the raw ground it is 3.85:1. The theme's own AdminThemeControl renders the state word "Closed" with this class (AdminThemeControl.tsx:72), and the platform uses `badge-locked` for locked challenge/series states. Both are informational text, so they fail WCAG AA (4.5:1) and README §7 ("Contrast of text on the theme's surfaces ≥ 4.5:1"). The classic token (#6b7681 on #060b10) was 4.26:1, so this is also a regression.

**Proposed fix.** Lighten the token to ≥ 4.5:1 on the wash, e.g. `--color-status-locked: #8e8a9c` (≈5.6:1 on #0d101b) and adjust `--color-status-locked-wash` to match.

### 3. Placeholder text (flag input) falls to 3.5:1 via the faint token

**Scenario.** `--color-text-faint: #726859` is 3.53:1 on the ground and 3.5:1 on the input surface `--color-surface-inset` (#0b0f1b). index.css:206-207 uses this token for the global `::placeholder`, so every placeholder under the theme, including the flag field in ChallengeModal and the auth form fields, renders at 3.5:1 (the classic #667381 on #060b10 is 4.08:1, also failing but less). `.access-step[data-state="pending"]` (index.css:1408) uses it too. README §7 says not to use text-faint for information, but the base stylesheet already does, and the theme's override makes it worse rather than fixing it.

**Proposed fix.** Raise the token so placeholders pass, e.g. `--color-text-faint: #8a7d6a` (≈4.7:1 on #0b0f1b), or add `html[data-theme="pinaka"] ::placeholder { color: var(--color-text-muted); }` in core.css.

### 4. Intro curtain is opaque but does not contain focus: Tab leaves into content hidden underneath

**Scenario.** `.pk-intro` is a fixed, fully opaque, z-index 300 layer (intro.css:15-26) that covers the whole app for up to SEQUENCE_MS+AUTO_DISMISS_MS = 11.4s. The root is `role="dialog" aria-modal="false"` and nothing makes the page behind it `inert`. A sighted keyboard user who presses Tab after "Skip" (or before the Enter button exists at 3.9s) lands on the nav/search/challenge cards behind the curtain with no visible focus indicator, and can type into the board's search box without seeing it; then at T.enter the `enterRef.current.focus()` call (line 251) yanks focus back. A screen-reader user is told it is a dialog yet the full page remains in the reading order, which contradicts the visual state. On dismiss, the focused button unmounts and focus falls to `<body>`, so the keyboard user restarts from the top of the document.

**Proposed fix.** While the intro is open set `inert` on the `.page-shell` sibling (App.tsx:931) or trap Tab inside the dialog; on `leave()`, move focus to a sensible target (e.g. the nav brand button or `main`) before unmounting. Also render the Skip button before the stage so DOM order matches its top-right visual position.

### 5. Foil-text titles vanish in Windows High Contrast / forced-colors mode

**Scenario.** `.pk-foil-text` paints the glyphs with `background: var(--pk-foil); background-clip: text; color: transparent`. Under `@media (forced-colors: active)` browsers drop author background images and keep `color`, so the element renders as transparent text. That hides the intro's only heading `<h1 class="pk-intro-title pk-foil-text">PINAKA</h1>` (PinakaIntro.tsx:341) and the auth hero's `<h1 class="pk-gateway-name pk-foil-text">` (AuthGateway.tsx:144). `.pk-numeral-deva` (motifs.css:345-353) has the same construction but is aria-hidden ornament. No `forced-colors` rule exists anywhere in the theme or index.css.

**Proposed fix.** Add `@media (forced-colors: active) { html[data-theme="pinaka"] .pk-foil-text, html[data-theme="pinaka"] .pk-numeral-deva { background: none; color: CanvasText; -webkit-text-fill-color: CanvasText; } }` in core.css.

### 6. Setu briefing dialog claims aria-modal but never receives focus, has no Escape and no restore

**Scenario.** Pressing "Briefing" sets `showReadme` and renders `<div class="fixed inset-0 z-[4000] …" role="dialog" aria-modal="true">`. Focus stays on the now-covered Briefing button; the next Tab goes to the next element behind the black/70 backdrop (the stone buttons), not to the Close button inside the dialog. Escape does nothing (only the X button closes it), and on close focus is not returned. Screen readers announce a modal whose content is not where focus is. The z-index 4000 also puts it above the intro (300) and milestone (200) layers, unlike every other dialog in the app (100/110). This is copied verbatim from ChainExperience.tsx:183, so it is parity, but it is new code mounted under the theme.

**Proposed fix.** On open, focus the Close button (or the dialog container with tabIndex=-1); add a keydown handler for Escape; on close restore focus to the Briefing button; consider lowering z-index to the modal tier (110).

### 7. Theme radiogroup has no arrow-key navigation

**Scenario.** `role="radiogroup"` containing two `<button role="radio" aria-checked>` elements. ARIA radios are expected to be a single tab stop navigated with arrow keys; here each option is its own tab stop and Left/Right/Up/Down do nothing, so a screen-reader user hearing "radio button, 1 of 2" and pressing an arrow gets no response. Same pattern as FxToggle.tsx:39 (parity), and `window.location.reload()` on choose means a mis-press reloads the page.

**Proposed fix.** Either implement roving tabindex + arrow handling, or drop the radio semantics and use plain `aria-pressed` toggle buttons as the label "Look" suggests.

### 8. aria-label on generic <span> for the board-progress readout is prohibited and ignored

**Scenario.** `<span className="pk-journey-progress" aria-label={`Board progress ${pct} percent`}>` (also line 160) puts aria-label on an element with the generic role. ARIA 1.2 prohibits naming generic elements; Chrome/NVDA ignore it and read the visible children ("BOARD PROGRESS 42%"), while some combinations double-announce. Harmless to content but it is noise in audits and inconsistent across AT.

**Proposed fix.** Remove the aria-label (the visible text already reads correctly) or give the span `role="group"`/`role="status"` if a name is wanted.

### 9. Countdown label and days render at 9–10px for sighted users

**Scenario.** WorldBanner mounts `BowstringCountdown` with `size={92}` (WorldBanner.tsx:364). The label font-size is `Math.max(9, size*0.08)` = 9px and the days line `Math.max(10, size*0.09)` = 10px, with 0.26em tracking in uppercase mono. "OPENS IN" / "REMAINING" and "1d" are therefore the smallest text on the board, below the platform's 10px `--text-micro` floor. Contrast is fine (gold-deep 7.4:1) and the role="timer" aria-label carries the words for AT, but low-vision users without zoom cannot read what the ring counts toward.

**Proposed fix.** Raise the floors to 11px/12px (or pass `size={112}`) and let the ring grow instead of the text shrinking.

### 10. Default-theme first render is gated on the public_theme RPC (up to 900 ms) whenever the server-theme cache is empty

**Scenario.** main.tsx:55 defers createRoot().render() until bootTheme() settles. In themes/index.ts:241-247, when localStorage 'cyberhx.theme.server' is absent (every first visit, a cleared-storage visit, or any visit after noteServerTheme(null) removed the key) the function awaits Promise.race([rpc, 900ms]). The RPC goes through uplinkFetch + postgrest retries, so on a slow/3G connection a default-build visitor stares at a blank #root for the full 900 ms before React even mounts; on a fast connection it still adds one Supabase round-trip to the critical path. Note that if the race times out and the RPC later returns 'pinaka', noteServerTheme() re-skins the already-painted app in place (CSS chunk + fonts + icon swap), i.e. a flash of the classic theme followed by a live switch. Dev-time: with cache present the cost is a few microtasks plus a background RPC; without cache every reload waits min(RPC latency, 900 ms).

**Proposed fix.** Render immediately and treat the server theme as progressive enhancement: start the RPC, call createRoot().render() synchronously (the app already handles in-place theme switches via useTheme), and let noteServerTheme() flip the skin when the answer arrives. If a pre-paint decision is required for the Pinaka build only, gate the wait on buildTheme()==='pinaka' or VITE_THEME so the default build never pays it.

### 11. bootTheme's rejection branch is dead: postgrest-js resolves {data:null} on network/404, so a transient failure wipes the cache and flips a Pinaka device back to classic mid-boot

**Scenario.** main.tsx:55 passes `(await supabase.rpc('public_theme')).data`. postgrest-js (node_modules/@supabase/postgrest-js/dist/index.mjs:392) catches fetch errors and resolves with {data:null, error} unless throwOnError() is set, and a 404 (migration not yet applied) also yields data:null. So the `() => { /* offline or refused */ }` handler at index.ts:244 never runs; instead `.then(v => noteServerTheme(v))` at :243 receives null -> noteServerTheme (index.ts:102-111) sets serverTheme=null, deletes 'cyberhx.theme.server', and calls applyTheme('cyberhx'). Concretely: a visitor whose device cached 'pinaka' opens the site during a blip (or the uplink timeout fires) -> page boots in Pinaka (cache) -> a few seconds later the skin silently switches to classic; and because the cache is now gone, the next load hits the 900 ms stall from the previous finding. Admins' AdminThemeControl also shows 'Closed'.

**Proposed fix.** Treat null/undefined (and any {error}) as 'no opinion' without discarding the cache: in bootTheme only call noteServerTheme(v) when asTheme(v) !== null, or have the fetcher inspect `error` and reject/return undefined, and make noteServerTheme leave the existing cache in place when it receives null. Only an explicit 'cyberhx' from the server should clear the Pinaka cache.

### 12. Environment is fully rebuilt on every innerHeight change: mobile URL-bar collapse and on-screen keyboard rescale the silhouettes and respawn all motes

**Scenario.** readViewport() (:92-95) reads window.innerHeight; the resize listener (:867-875) debounces 160 ms then setVp(). vp.h feeds (a) layerGeometry via useMemo [world, depth, vw, vh] (:645) where u = vh/100 and base = vh*VISIBLE scale every shape, so all three strip canvases repaint with different proportions; (b) the motes effect deps [effectiveMode, vp.w, vp.h] (:947-962) which destroys and recreates the particle system with spawn(kind,false) (life=1, no fade-in), teleporting every mote; (c) inline strip heights (:999) causing layout. Phones resolve to the 'medium' tier (coarse pointer, performance.ts:87-90), so they run the canvases. On Android Chrome and iOS Safari the toolbar collapsing/expanding during an ordinary scroll fires resize with a ~56-100 px innerHeight delta, and focusing the flag input opens the keyboard (-40% innerHeight) -> each time, 160 ms later, the whole skyline visibly jumps/rescales and the particles pop to new random positions, then again on blur.

**Proposed fix.** Treat the viewport as stable for height-only changes: ignore deltas where the width is unchanged and |dh| < ~150 px (or key geometry off window.screen/visualViewport width + max(innerHeight) seen, or use 100lvh semantics), and when a real resize happens keep the existing mote positions (scale x/y by the ratio) instead of respawning. Only orientation/width changes should rebuild the layers.

### 13. First commit renders the full inline-SVG scene (hundreds of nodes) and discards it one effect later on high/medium tiers

**Scenario.** useState<Mode>('static') at :849 means the first render (and every remount, e.g. AuthPage -> App at login) goes through LayerSvg (:600-629) for all three depth strips: for a 1920x1080 viewport cityFar alone emits ~45 shikhara polygons plus ~90 lamp <g>s (2 circles each), the near strip duplicates every solid for the rim pass, and pointsAttr() builds a toFixed(1) string per vertex. The effect at :861-864 then calls setMode(detectMode()) and the whole SVG tree is torn down and replaced by LayerCanvas, whose useLayoutEffect paints the canvases synchronously. Net effect: two full scene builds and a DOM churn of several hundred elements on every mount, purely wasted on the tiers that will never show SVG. getCapability() is synchronous and cached, so there is no SSR reason to defer it here (AmbientBackground's 'static' fallback is a cheap CSS gradient; this one is not).

**Proposed fix.** Initialise lazily: useState<Mode>(() => (typeof window === 'undefined' ? 'static' : detectMode())) and keep the subscribeFx effect for live changes. Optionally also memoise LayerSvg output per geometry so the static tier does not rebuild point strings on vp changes.

### 14. Canvas backing-store memory: motes canvas and three static strips at 1.5x DPR, doubled during the 1.2 s crossfade (~90-150 MB on common desktops)

**Scenario.** canvasDpr() (:87-90) caps at 1.5 and is applied both to the full-viewport motes canvas (:716-717) and to each strip (:530-531, W = vw+48, H = vh*VISIBLE+96). At 1920x1080 on a DPR>=1.5 display: motes 2880x1620 (~18.7 MB) + far/mid/near ~12.8+11.3+9.7 MB = ~34 MB per slot; a world change mounts the second slot before the first is released (FADE_MS+200, :887-894) so peak is ~87 MB. At 2560x1440: ~33 MB motes + ~57 MB per slot -> ~148 MB peak; at 4K roughly double again. The motes canvas only ever shows <=90 soft 2-6 px sprites and the strips are soft-edged silhouettes, so 1.5x buys no visible sharpness. On the medium tier (phones with 3-4 GB) this is the largest GPU allocation on the page.

**Proposed fix.** Paint the motes canvas at DPR 1 (sprites are blurred gradients) and consider DPR 1 for the static strips as well, or at least for the 'medium' tier; alternatively render the strips at 1x and let the compositor upscale. That cuts canvas memory by ~55% with no perceptible change.

### 15. PinakaEnvironment chunk is not warmed at boot, so every cold Pinaka load paints the UI first and the background pops in one round-trip later with no fade

**Scenario.** bootPinaka() preloads CategoryGlyph and BowMotifs (:14-18) 'so their first use is not a frame late', but the one component every Pinaka screen renders first, PinakaEnvironment (16.8 kB chunk in the build), is only fetched when App.tsx:922 / AuthPage.tsx:412 reach React.lazy with fallback={null}. On a cold cache the page shell, nav and cards appear over the flat #0a0e17 body colour, then the environment chunk lands and the scene appears abruptly: .pk-env-scene (environment.css:71-77) is inserted with data-active="true" already set, so the opacity transition never runs on first insertion. WorldBanner/JourneyMap arrive the same way (layout shift under CommandHeader: a ~132 px panel inserts above it after first paint).

**Proposed fix.** Add import('./components/PinakaEnvironment') (and WorldBanner/JourneyMap for the board) to the Promise.all in bootPinaka so they arrive with the CSS, or give lazy.tsx a preload() that boot calls. For the first mount, start the active scene at opacity 0 and flip to 1 on the next frame (or use a CSS @starting-style) so it fades in instead of popping.

### 16. lib/brand.ts caches getComputedStyle token values for the session, but the theme now switches in place, so chart accents go stale

**Scenario.** tokenValue() (:15-24) reads --color-neon once and caches it forever ('the stylesheet does not change during a session'). But this branch makes the stylesheet change during a session: ThemeSwitch.tsx:36 and noteServerTheme (index.ts:110, fired by the 30 s event-settings poll) call applyTheme() without a reload. Scenario: a tab is open in classic, charts have cached '#c6ff00'; the admin opens Pinaka; within 30 s the tab re-skins gold, but Scoreboard series 0 and last (Scoreboard.tsx:206-208), SharedComponents TOKEN.neon/neonDim/neonBright and the UserProfile/TeamProfile COLORS[0] keep drawing lime on gold surfaces until a hard reload. The reverse (gold charts after switching back to classic) also occurs.

**Proposed fix.** Clear the cache when the theme changes: export a resetBrandCache() and call it from applyTheme() after setting data-theme (or subscribeTheme(() => cache.clear()) inside brand.ts). Alternatively key the cache by document.documentElement.dataset.theme.

### 17. Infinite CSS animations on SVG children (Setu gleam, Journey gleam mask) force whole-SVG repaints at 60 fps for the life of the view

**Scenario.** setu.css:107-120 animates transform/opacity on <rect class="pk-setu-gleam"> inside the causeway <svg> (SetuChain.tsx:303), one per active segment, 3.2 s infinite; journey.css:102-109 animates translateX on the <rect> inside a <mask> (JourneyMap.tsx:186), 6 s infinite. SVG descendants are not promoted to compositor layers in Chromium/WebKit, so each frame re-rasterises the containing SVG: the causeway SVG is 340+300*(n-1) px wide x 276 px with gradient-filled stones (a 10-node chain is ~3040x276), and the mask forces the masked path to be re-composited every frame. Combined with .pk-setu-ring opacity pulse (:159-169) and the two water::before/::after drift layers (:60-74, composited but full-stage) this is a steady main-thread paint cost while a player simply reads the chain, and will-change on SVG children (:110, :162) does not help. Both correctly stop under reduced-motion / .is-still, but not when the element is scrolled offscreen or the tab is merely unfocused.

**Proposed fix.** Move the moving parts out of the SVG: draw the gleam as an absolutely-positioned HTML <span> with a CSS transform along the chord (the thread geometry is already known), or render the gleam/mask on a small separate <svg> per segment so only that element repaints. For JourneyMap, replace the animated mask with an HTML overlay gradient translated over the map and clipped by overflow:hidden. Also pause these loops via IntersectionObserver when the section is offscreen.

### 18. Environment transitions still run under the 'still' tier (fx dial off) and the sky transition repaints a full-viewport gradient every frame

**Scenario.** README non-negotiable #5 says tier 'still' -> no animation at all. The component maps still/low to data-mode="static" (:80-85, :974) and drops canvases, but environment.css only disables transitions inside @media (prefers-reduced-motion: reduce) (:194-207). A player who set FX to 'off' in Settings (fx.ts) without an OS preference still gets the 1.2 s scene crossfade (:75), sun scale/opacity (:96) and the registered-custom-property sky transition (:49) on every navigation. That sky transition animates --pk-env-sky-a/b feeding background-image: linear-gradient(...), which is not compositor-driven: the full-viewport gradient is re-rasterised for ~72 frames per world change (and also at login when useWorldAttributes' cleanup/re-set bounces the tokens through their @property initial values).

**Proposed fix.** Add `html[data-theme="pinaka"] .pk-env[data-mode="static"] *` (or a data-still attribute set when getCapability().tier==='still') rules mirroring the reduced-motion block. For the sky, crossfade two opaque gradient layers by opacity (one per world, like the scene slots) instead of transitioning the gradient's colour stops.

### 19. Per-frame allocation in the mote loop and unbounded transient mote count on rapid world flips

**Scenario.** step() (:762-782) allocates a new `keep` array and reassigns `motes` every tick (30/s) even though removal only happens while motes are dying; a minor GC churn source in an otherwise allocation-free loop. setWorld() (:821-831) marks all current motes dying (0.9 s) and pushes `count` fresh ones whenever the kind changes; a player tabbing between Challenges (leaf) and Scoreboard (ember) five times in a second briefly drives the system to ~6x count (540 on high tier) plus three new makeHaze canvases per flip, all drawn at 30 fps until the dying ones expire.

**Proposed fix.** Remove dead motes in place with swap-and-pop (iterate backwards) and keep a single array; in setWorld, cap the live population (e.g. if motes.length > count*2, convert the oldest dying ones to the new kind instead of spawning) and reuse haze canvases when the band dimensions are unchanged.

### 20. PodiumFrame Suspense uses the card as its fallback, so the card remounts into the frame when the chunk arrives

**Scenario.** On the first Pinaka scoreboard visit (chunk not cached), <React.Suspense fallback={card}> renders PodiumCard directly; when PodiumFrame-*.js resolves, React commits <PodiumFrame>{card}</PodiumFrame>, a different parent, so each of the three PodiumCards unmounts and remounts: their motion entrance (reduced-aware) replays and any internal state resets, a one-time double paint of the podium. Also ORDER classes are now applied by both the wrapper (PodiumFrame.tsx:41-45) and the card (Scoreboard.tsx:191-193), relying on lanka.css:52 to neutralise the card's translate.

**Proposed fix.** Preload PodiumFrame when the scoreboard view is entered (lazy preload in bootPinaka or on nav hover) so the fallback never shows, or use fallback={null} on a wrapper that reserves the grid cell so the card is rendered once inside the frame.

### 21. Bundle verification: lazy structure holds; default build eagerly ships ~10.4 kB minified (~3.5-4 kB gzip) of theme code, config.ts included via intro-gate

**Scenario.** Measured with `vite build` into the scratchpad: pinaka.css is its own asset (pinaka-*.css 57.56 kB / 10.87 kB gzip), referenced only from boot-*.js (0.85 kB) via __vitePreload and not linked from dist/index.html; every component is a separate chunk (PinakaEnvironment 16.84 kB, SetuChain 11.20, BowMotifs 7.14, PinakaIntro 6.19, JourneyMap 4.74, AuthGateway 4.69, CategoryGlyph 3.27, ProfileJourney 2.80, ThemeSwitch 2.19, PodiumFrame 1.94, PartnerStrip 1.88); the main chunk contains no 'pk-env'/'pk-intro' code; no component imports CSS (only pinaka.css has @imports). Eager cost in the main chunk, by esbuild --minify of each file: themes/index.ts 2,686 B, AdminThemeControl.tsx 2,666 B, config.ts 3,021 B, lazy.tsx 689 B, hooks.ts 640 B, intro-gate.ts 274 B, lib/brand.ts 444 B = ~10.4 kB, plus the mount-point edits. config.ts (partner names, taglines, 'Cinzel' font URL: confirmed present in index-*.js) rides in because intro-gate.ts:9 imports PINAKA_STORAGE_KEYS from it, and once in the main chunk Rollup keeps all of its exports there for the lazy chunks to share.

**Proposed fix.** If the 3 kB matters: inline the intro storage key in intro-gate.ts (or move PINAKA_STORAGE_KEYS to a tiny keys.ts) so config.ts falls into the Pinaka chunks; AdminThemeControl could be lazy behind profile?.is_admin. Otherwise the structure matches the contract.

### 22. Theme load failure does not fall back: getTheme() lazily resolves to 'pinaka' after bootPinaka() rejects, so themed components render without the stylesheet

**Scenario.** effectiveTheme() is 'pinaka' (server cache, ?theme=pinaka or VITE_THEME) and `import('./pinaka/boot')` / the CSS link inside bootPinaka() rejects (flaky network at boot, blocked asset, stale hashed chunk). applyTheme() catches, logs 'staying on the default look' and returns WITHOUT setting `current` or `data-theme`. bootTheme() then calls getTheme(), which is `current ?? (current = effectiveTheme())` -> 'pinaka'. useTheme()/isPinaka() therefore return true everywhere: App renders <PinakaEnvironment>, <PinakaIntro>, WorldBanner, JourneyMap, SetuChain etc. Their own lazy imports retry independently and can succeed, but `html[data-theme="pinaka"]` is never set, so every `.pk-*` rule (position:fixed; pointer-events:none; z-index:0 on .pk-env; position:fixed; z-index:300 on .pk-intro) is inert: the environment div with explicit layer heights and a viewport-sized canvas renders IN FLOW at the top of the page pushing the app down, the intro renders in flow, SetuChain is unstyled. If the lazy imports also fail (stale deploy) React.lazy throws inside <Suspense fallback={null}> and there is no error boundary in the repo (grep for componentDidCatch/getDerivedStateFromError returns nothing), so the whole root unmounts. The promise in the comment ('a theme that fails to load leaves the page as it was') does not hold.

**Proposed fix.** In the catch branch of applyTheme(), commit the fallback explicitly: `restoreCategoryIcons(); document.documentElement.dataset.theme = 'cyberhx'; if (current !== 'cyberhx') { current = 'cyberhx'; listeners.forEach(fn => fn('cyberhx')); } return;` so isPinaka()/useTheme() agree with the DOM. Optionally wrap each themed <Suspense> in a tiny error boundary that renders null.

### 23. Two unkeyed children inside the modal's AnimatePresence collide on key ""

**Scenario.** Under the pinaka theme, a solve sets justBreached=true and <AnimatePresence> receives [<BreachConfirm/>, <Suspense><ArrowSolveLight/></Suspense>], neither with a key. framer-motion 12.43 (node_modules/framer-motion/dist/es/components/AnimatePresence/utils.mjs: `getChildKey = child => child.key || ""`) maps both to "" and renders two <PresenceChild key=""> siblings, so React logs 'Encountered two children with the same key, ``' on every modal render while the acknowledgement is visible, and the exit bookkeeping (exitComplete / exitingComponents, keyed by "") treats both as one entry: the first child to finish exiting (BreachConfirm, 0.16s) removes both. The default theme is unaffected because the second child is `false` and is filtered by onlyElements().

**Proposed fix.** Give both children stable keys, e.g. `<BreachConfirm key="breach" .../>` and `<React.Suspense key="arrow" fallback={null}>...`, so AnimatePresence tracks them separately.

### 24. lib/brand.ts caches token values for the session, so charts keep the previous theme's accent after an in-place theme switch

**Scenario.** ThemeSwitch (Settings), AdminThemeControl and the event-settings poll all switch skins live via applyTheme() with no reload (ThemeSwitch.tsx:36 'applied in place — no reload'). tokenValue() reads getComputedStyle once per token and stores it in a module Map that nothing clears. A player who viewed the scoreboard/profile on the classic look (cache = #c6ff00) and is then switched to Pinaka by the organisers sees gold UI with a lime scoreboard series 0/9 (Scoreboard.tsx seriesColor), a lime ScoreChart gradient/line/dots (SharedComponents TOKEN getters) and a lime first pie slice (UserProfile/TeamProfile COLORS[0]) until a full reload; the reverse (gold charts on the classic look after 'Close Pinaka') also happens. tokens.css explicitly re-points --color-neon to gold, so this is a visible contract miss ('existing utilities re-skin themselves').

**Proposed fix.** Invalidate the cache when the theme changes: export `resetTokenCache()` from brand.ts and call it in applyTheme() right after `document.documentElement.dataset.theme = next` (before notifying listeners), or key the cache by `document.documentElement.dataset.theme`.

### 25. A PostgREST error from public_theme() resolves with data=null, which wipes the server-theme cache and flips the skin, and re-arms the 900 ms first-paint wait on every load

**Scenario.** main.tsx:55 passes `async () => (await supabase.rpc('public_theme')).data`. supabase-js resolves (never rejects) on a 404/401/5xx, so the 'offline or refused: keep the cached/build answer' rejection branch at index.ts:244 is unreachable for server errors; instead noteServerTheme(null) runs: it removes 'cyberhx.theme.server' from localStorage and calls applyTheme(effectiveTheme()). (a) Default build before the migration is applied, or under any persistent RPC failure: `cached` is never set, so EVERY page load on EVERY device blocks first paint for the full 900 ms race (index.ts:247) — a permanent startup regression on the default theme. (b) Event live under Pinaka, device has cached 'pinaka': boot paints Pinaka immediately, then a transient 5xx/rate-limit on the RPC arrives, noteServerTheme(null) applies 'cyberhx' and the whole UI re-skins (environment swap, SetuChain -> ChainExperience remount, icons restored) a moment after first paint. The same happens from the poll if event_settings.theme is ever absent (App.tsx:721 noteServerTheme(data.theme) with theme undefined).

**Proposed fix.** Treat an RPC error as 'no opinion, keep what we had': in main.tsx use `const { data, error } = await supabase.rpc('public_theme'); if (error) throw error; return data;` so the rejection branch runs, and in noteServerTheme() ignore null/unknown values (`if (!t) return;`) instead of clearing serverTheme and the cache.

### 26. AdminThemeControl nav variant records the RPC error but never renders it

**Scenario.** An admin clicks the header 'Open Pinaka' button (App.tsx:983) on a deployment where admin_set_theme() is missing, returns {error:'Unauthorized'}, or the network fails. set() stores the message in `error`, but the `variant === 'nav'` return (lines 46-57) renders only the button, so the click appears to do nothing: no theme change, no message. Only the panel variant (line 95) shows the error.

**Proposed fix.** Render the error in the nav variant too (e.g. a `title`/aria-live span next to the button, or fall back to window.alert for the header), or expose a tooltip with the last error.

### 27. Live theme switch remounts the open chain experience (ChainedBoard picks a different lazy component per render)

**Scenario.** A player is inside a chain series with the Briefing dialog open when the organisers flip the theme (or the player uses Settings -> Look). App re-renders through useTheme(), ChainedBoard re-renders, `ChainExperience` resolves to the other lazy component, React unmounts the old one (showReadme state lost, canvas destroyed, the Suspense 'Initializing chain…' fallback shows again) and mounts the new one. Same series, same nodes afterwards, but the briefing closes under the player.

**Proposed fix.** Acceptable for a presentation-only switch, but if you want it seamless keep `showReadme`/scroll state in ChainedBoard and pass it down, or key the Suspense on the theme so the swap is deliberate and documented.

### 28. B2R chained sub-mode still renders the classic steel ChainExperience under the Pinaka theme

**Scenario.** B2RBoard lazy-loads '../chain/ChainExperience' directly (line 13) and renders it at line 289 for Boot-to-Root chained series; the SetuChain swap lives only in ChainedBoard.tsx. On the Pinaka skin, the Challenges -> Chained board shows the Setu causeway while B2R -> Chained shows the lime-turned-gold steel chain with 'CHAIN 01' / 'ignited' copy. Not a functional regression (controls identical), but an inconsistency the DESIGN_SYSTEM does not list.

**Proposed fix.** Mirror ChainedBoard: `const Experience = isPinaka() ? SetuChainExperience : ClassicChainExperience;` in B2RBoard, or document the exception.

### 29. PodiumFrame Suspense uses the card as its own fallback, so the PodiumCard remounts and replays its entrance/count-up when the chunk arrives

**Scenario.** First themed visit to the scoreboard: `<React.Suspense key={team.id} fallback={card}>` renders the PodiumCard as the fallback, then, once PodiumFrame-*.js loads (~1 round trip), replaces it with `<PodiumFrame>{card}</PodiumFrame>`. The card is now at a different tree position, so React unmounts/remounts it: AnimatedNumber counts up a second time and the motion entrance replays. The default theme never wraps and is unaffected.

**Proposed fix.** Preload PodiumFrame alongside the other motif chunks in bootPinaka() (as done for BowMotifs/CategoryGlyph), or render `<PodiumFrame>` with a null fallback and keep the card outside the Suspense boundary by having PodiumFrame accept the card as a sibling rather than a child.

### 30. shouldShowIntro() is defined twice; App uses intro-gate.ts while README documents the PinakaIntro.tsx export

**Scenario.** intro-gate.ts:11 and components/PinakaIntro.tsx:38 contain identical copies. App.tsx:83 imports the intro-gate one (correct, it avoids downloading the intro chunk), but README 'Components' table lists `shouldShowIntro` as a named export of PinakaIntro.tsx. A future edit to one (e.g. changing the storage key or the ?intro=1 rule) silently diverges from the other.

**Proposed fix.** Delete the copy in PinakaIntro.tsx and have it import from '../intro-gate' (or re-export it), and update the README row.

### 31. Device override outranks the organisers' switch; admin 'Preview on this device' pins the admin's own device and navigates away from the dashboard

**Scenario.** effectiveTheme() (index.ts:131-138) returns the localStorage override before the server value. AdminThemeControl.tsx:91 offers <a href="/?theme=pinaka"> as a 'preview'; following it (a) is a full navigation that discards any unsaved admin-dashboard state in the SPA and (b) persists cyberhx.theme=pinaka via consumeUrlOverride (index.ts:116-128). When the admin later clicks 'Close Pinaka' the panel badge reads 'Closed' (server state) while their own screen stays Pinaka, so the switch looks broken. The same precedence lets any third party pin a victim's device to either skin by sending ctf.cyberhx.com/?theme=pinaka (no user gesture needed, value whitelisted so no XSS), and lets a device that ever chose Pinaka keep it after the organisers close the event unless VITE_THEME_UNTIL is set — contradicting the 'must not outlive its event' intent in index.ts:11-12.

**Proposed fix.** Make the preview non-persistent (e.g. a session-only override or a dedicated ?preview= handled in memory) and open it in a new tab via window.open with noopener, or at least show 'This device is pinned to <theme>' plus a 'Follow organisers' button in AdminThemeControl when getThemeOverride() !== null. Consider letting the server 'cyberhx' value clear a stale pinaka override, and only honour ?theme= from a user action (Settings) rather than from arbitrary inbound links.

### 32. First paint is blocked on Pinaka chunk downloads with no deadline when the theme is cached or server-open

**Scenario.** main.tsx:55-61 defers createRoot().render() until bootTheme() settles. bootTheme bounds the public_theme RPC to 900 ms (index.ts:247) but then awaits applyTheme (index.ts:250) → import('./pinaka/boot') → bootPinaka (boot.ts:12-16), which awaits the CSS chunk plus two JS chunks with no timeout. A rejected chunk is caught (index.ts:210-213) and falls back, but a stalled request (hung connection, captive portal, flaky mobile link) never rejects, so the page stays blank with no HoldScreen because React has not mounted. This only affects devices resolving to Pinaka — i.e. every visitor once the organisers open it.

**Proposed fix.** Race applyTheme against a short deadline in bootTheme (e.g. 2-3 s) and render regardless, letting the theme finish applying in the background through the existing external store; or render immediately and let applyTheme flip data-theme when it lands (the CSS is scoped to html[data-theme], so late application is already safe).

### 33. ?intro=1 is never stripped from the URL, so the full-screen curtain replays on every load of that address and bypasses the once-per-device guard

**Scenario.** shouldShowIntro() returns true for ?intro=1 before the storage check (intro-gate.ts:15, duplicated at PinakaIntro.tsx:41), and unlike ?theme= (deleted at index.ts:125) nothing removes the parameter. A reviewer bookmark or a link sent to a player with ?intro=1 puts the z-index 300 fixed curtain (intro.css:15-18, above ChallengeModal z-[100] and the invite dialog z-[110]) over the board on every reload of that tab for up to ~11.4 s (SEQUENCE_MS 4400 + AUTO_DISMISS_MS 7000, PinakaIntro.tsx:76-78) and moves focus to its button at 3.9 s (PinakaIntro.tsx:250-252). It is skippable in one click/Escape, so no function is lost, and the value is compared, never echoed, so no XSS.

**Proposed fix.** Strip ?intro= in consumeUrlOverride alongside ?theme= (history.replaceState), or gate it behind VITE_THEME_SWITCH / a non-production build flag so the testing hook is not live for every visitor.

### 34. Global 'Open Pinaka' switch is one confirm away in the header on every screen for every admin

**Scenario.** App.tsx:991 renders <AdminThemeControl variant="nav" /> for any profile.is_admin, a btn-primary labelled 'Open Pinaka' beside the Admin nav button. One click plus a native confirm (AdminThemeControl.tsx:33) calls admin_set_theme and flips the skin for every connected visitor within the 30 s poll (App.tsx:716-724). Server-side it is is_admin()-gated, CHECK-constrained and audit-logged (20261008000000_event_theme.sql:17-38), so this is blast-radius, not authorisation: a mis-click mid-event changes every player's UI, which the panel's own copy warns about. Danger styling is preserved (core.css:141, tokens.css:75,112) and errors surface via role=alert (AdminThemeControl.tsx:95), so no admin error is obscured.

**Proposed fix.** Keep the switch only in Admin → Event (the panel variant) or make the nav variant a link to that tab; if a header control is wanted, require a second explicit step (e.g. typed confirmation) as other destructive organiser actions do.

### 35. Confirmed clean: CSP, deps, markdown, blank-target links, DOM sinks, data exposure

**Scenario.** package.json and vercel.json have no diff vs origin/main; the only external resource added is the Google Fonts stylesheet injected in boot.ts:21-27 (host already in style-src/font-src), the cursor data: URIs in core.css:211,217 are covered by img-src data:, and the theme CSS chunk is same-origin. No dangerouslySetInnerHTML/innerHTML/eval/new Function/document.write anywhere under src/themes or lib/brand.ts. SetuChain.tsx:403 renders markdown with ReactMarkdown + remarkGfm only, identical to ChainExperience (no rehype-raw); readmeUrl goes through safeHttpUrl (SetuChain.tsx:184) and every target=_blank carries rel="noopener noreferrer" (PartnerStrip.tsx:20, SetuChain.tsx:239,398). ?theme= is whitelisted via asTheme and the URL is rebuilt from the URL object before replaceState (index.ts:116-128), preserving the OAuth hash. localStorage keys are exactly the four documented in RESTORE.md:80-82 with enum/'0'/'1'/timestamp values. SetuChain shows only ChainSeriesVM fields the classic view or the series list already shows (locked nodes stay 'Locked node' with null points, chainModel.ts:60-62); JourneyMap progress, PodiumFrame, ProfileJourney (own user, UserProfile.tsx:126) and the podium/freeze logic expose nothing new. public_theme() is SECURITY DEFINER with search_path='' returning one whitelisted string; admin_set_theme mirrors admin_set_chain_experience. tsc --noEmit passes.

**Proposed fix.** No action required.
