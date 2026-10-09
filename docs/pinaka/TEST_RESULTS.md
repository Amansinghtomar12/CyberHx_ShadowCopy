# Pinaka theme — test results

Evidence for the branch `feature/pinaka-ramayana-experience`. Every number
below was measured in this repository; "not run" means exactly that.

## 1. Baseline (before any change) — `main @ ce23b64`, 2026-10-08

| Check | Result |
|---|---|
| `npm run lint` (`tsc --noEmit`) | exit 0, 0 errors (19.0 s) |
| `npm run build` (`vite build`) | exit 0, 3015 modules, 10.8 s |
| `dist/assets/index-*.js` | 1,543,058 B (434.27 KB gzip) |
| `dist/assets/index-*.css` | 110,020 B (19.98 KB gzip) |
| lazy chunks | ChainedBoard 4.3 KB, ChainExperience 13.1 KB, B2RBoard 10.1 KB |
| static assets | chain-strip.png 167 KB, fire.gif 3.6 MB |
| existing automated tests | **none in the repository** (no test runner in `package.json`); the typecheck and the build are the only automated gates |
| baseline screenshots | `qa/visual` harness, theme `cyberhx`, desktop + mobile, every scene — see §4 |

## 2. Static checks on the themed branch — 2026-10-09

| Check | Result |
|---|---|
| `npm run lint` (`tsc --noEmit`) | exit 0, 0 errors |
| `npm run build` | exit 0, 3036 modules, 7.9–10.0 s |
| `dist/assets/index-*.js` | 1,551,637 B (437.63 KB gzip) — **+8,579 B raw, +3.4 KB gzip** against the baseline |
| `dist/assets/index-*.css` | 112,062 B (20.28 KB gzip) — +2,042 B, +0.3 KB gzip (Tailwind utilities first used by theme components; Tailwind emits them once, into the main stylesheet) |
| theme code in the main chunk | `grep -c "pk-env\|pk-intro"` = 0; the Cinzel font URL appears only in `config-*.js` |
| `package.json`, `vercel.json`, `index.html` | no diff against `origin/main` |

The eager cost (+3.4 KB gzip) is the theme resolver with the organisers' switch
(`themes/index.ts`), the lazy entry points, `hooks.ts`, `intro-gate.ts`,
`lib/brand.ts` and the mount-point conditionals. The design target in
`AUDIT.md` was ±1 KB; the server-driven switch (RPC at boot, poll, in-place
apply, tab preview, fallback commit) is what the extra 2 KB buys. Everything
else is fetched only under the theme:

| Chunk (on demand, theme only) | raw | gzip |
|---|---|---|
| `pinaka-*.css` (the whole stylesheet) | 58.70 KB | 11.09 KB |
| `PinakaEnvironment` | 17.08 KB | 6.77 KB |
| `SetuChain` | 11.83 KB | 4.27 KB |
| `BowMotifs` | 7.17 KB | 2.56 KB |
| `PinakaIntro` | 6.13 KB | 2.42 KB |
| `JourneyMap` | 5.40 KB | 2.12 KB |
| `AuthGateway` | 4.72 KB | 1.32 KB |
| `CategoryGlyph` | 3.27 KB | 1.16 KB |
| `AdminThemeControl` (admins only) | 3.22 KB | 1.44 KB |
| `ProfileJourney` | 2.85 KB | 1.43 KB |
| `ThemeSwitch` | 2.56 KB | 1.26 KB |
| `PodiumFrame` | 1.98 KB | 0.81 KB |
| `PartnerStrip` | 1.91 KB | 0.69 KB |
| `config` | 1.66 KB | 1.00 KB |
| `boot` | 1.27 KB | 0.59 KB |

A cold Pinaka visit fetches, with the stylesheet and in the same round trip,
the glyphs, the motifs, the environment, the campaign map and the podium frame
(≈ 25 KB gzip in total). The default theme fetches none of it.

### Server switch (migration `20261008000000_event_theme.sql`)

Verified on a throwaway Postgres 16 with a stub of the `event_settings`,
`profiles`/`is_admin()` and `audit_log` shape (not the production database):

| Case | Result |
|---|---|
| apply twice | idempotent (`IF NOT EXISTS`, `CREATE OR REPLACE`) |
| anon `select public_theme()` | `cyberhx` (the default) |
| player calls `admin_set_theme('pinaka')` | `{"error":"Unauthorized"}`, no change |
| admin calls `admin_set_theme('PINAKA')` | `{"success":true,"theme":"pinaka"}`, `audit_log` row `set_theme`, `public_theme()` → `pinaka` |
| admin calls `admin_set_theme('neon')` | `{"error":"Unknown theme"}` |
| anon calls `admin_set_theme` | `permission denied for function` (EXECUTE revoked) |

**Not applied to production.** The deploy-supabase workflow applies
`supabase/**` on push to `main`; until then the "Open Pinaka" button returns
"Could not change the look" and the sign-in page's `public_theme()` call is
treated as "no opinion".

## 3. Functional preservation

Executed with the visual harness (`frontend/qa/visual`) against the route-level
Supabase mock, in both themes, at desktop (1440×900) and phone (390×844, DPR 2).
Each scene drives the real UI: navigation, tabs, dialogs, hint confirmation,
flag submission through the mocked edge function, and reads the result from the
DOM. A scene fails if a wait times out, a page error is thrown, or the mock is
asked for an endpoint it does not know (`mockGaps`).

| Area (AUDIT.md section) | Scenes | What is exercised |
|---|---|---|
| Boot, uplink hold (1) | `uplink-down` | hold screen when the backend is unreachable |
| Login, registration, Turnstile, Google (2, 3, 4, 6) | `auth-login`, `auth-register`, `intro` | both forms, the "unavailable" verification state, the pre-auth invite copy, the intro's Skip/Escape/Enter |
| App shell, header, footer, mobile menu (3) | every logged-in scene, `mobile-menu`, `mobile-filter` | nav items, clock, bell, sound/motion toggles, admin button, partner strip |
| Event status matrix (18) | `board-waiting`, `board-live`, `board-ended`, `board-inactive`, `board-paused`, `board-admin-paused`, `scoreboard-waiting/frozen/hidden/live` | every `eventStatus`/`is_paused`/scoreboard-visibility branch |
| Team requirement, invite (7) | `board-needs-team`, `invite-dialog`, `team-profile` | join-first gate, invite dialog, invite link + code copy |
| Challenge listing, search, categories, difficulty (8) | `board-live` (+ `full`), `mobile-filter` | sidebar counts, category chips with the theme's glyphs, search |
| FREE / CHAINED / B2R and chain rules (9, 10) | `board-chained`, `chain-experience`, `board-b2r`, `b2r-chained` | mode tabs, series list, back button, briefing dialog, download link, locked-node exposure (unchanged: only `ChainSeriesVM` fields) |
| Flag submission and hints (11, 12) | `challenge-modal`, `challenge-modal-insane`, `hint-confirm`, `hint-unlocked`, `solve`, `solves-tab` | open, the 15-attempt counter, hint confirm → unlock, submit → "Operation compromised", solves tab |
| Scoreboard (8 in the inventory) | `scoreboard-*` | podium, chart, standings, freeze and hidden states |
| Profiles, settings (11, 12, 14) | `user-profile`, `team-profile`, `settings`, `settings-security`, `teams-list`, `users-list` | identity header, stats, solves table, settings forms, the Look switch |
| Admin (15) | `admin-dashboard` (challenges + event tabs), `board-admin-paused` | guards, stats, tabs, the Pinaka panel, danger styling on "Reset event scores" |

Result: every scene passed in both themes, at both viewports, with 0 page errors, 0 console errors, 0 mock gaps and 0 failed requests (`report.json`: Pinaka 68 ok / 0 failed / 2 skipped (phone-only scenes on desktop); classic 66 ok / 0 failed / 4 skipped (the two phone-only scenes and the two intro scenes, which do not exist on the classic look)). The reduced-motion pass (9 scenes × 2 viewports) also passed 18 / 18.

### Default-theme DOM parity against `main`

The same 17 scenes were driven on `main @ ce23b64` (served on a second port) and on this branch with the classic look, and the body HTML compared after normalising clocks, React ids and inline styles. Identical except:

| Scene | Difference | Why |
|---|---|---|
| `admin-dashboard` | +22 lines | the admins' "Open Pinaka" button and the *Pinaka experience* panel (intended) |
| `board-live`, `challenge-modal`, `hint-confirm`, `solve` | the challenge cards' glow class name | `shadow-[0_0_14px_rgba(198,255,0,0.18)]` → `shadow-[0_0_14px_color-mix(in_srgb,var(--color-neon)_18%,transparent)]`; `--color-neon` is `#c6ff00` on the classic look, so the computed shadow is the same |
| `chain-experience`, `b2r-chained` | the chain nodes' glow class name | same substitution in `ChainExperience` |
| every scene | the dev-server script tag's `?t=` and the running clock | noise |

`auth-login`, `board-waiting`, `scoreboard-live`, `settings`, `teams-list`, `users-list`, `team-profile`, `user-profile`, `invite-dialog`, `uplink-down`: no difference at all.

What this does **not** cover, because the harness replaces the backend: the
real `submit-flag` edge function, real Turnstile and Google OAuth round trips,
real-time channels and the admin mutations. None of that code changed on this
branch (`git diff origin/main -- frontend/src/api frontend/src/lib/supabase.ts
supabase/functions` is empty); the theme only wraps what renders.

## 4. Visual regression

Full runs of `node harness.cjs --theme cyberhx` and `--theme pinaka` (desktop +
mobile) and `--theme pinaka --rm` (reduced motion) on the final commit. Every
screenshot was opened and read; the defects found on the way, and their fixes,
are in §4.1.

| Run | Scenes | ok | failed | skipped | page errors | console errors | mock gaps |
|---|---|---|---|---|---|---|---|
| classic, desktop + phone | 35 × 2 | 66 | 0 | 4 | 0 | 0 | 0 |
| Pinaka, desktop + phone | 35 × 2 | 68 | 0 | 2 | 0 | 0 | 0 |
| Pinaka, reduced motion, desktop + phone | 9 × 2 | 18 | 0 | 0 | 0 | 0 | 0 |

Capability tiers seen by the harness: `high` on desktop, `medium` on the phone profile (coarse pointer), `still` under reduced motion — so the canvas environment, the static fallback and the no-motion path were all rendered. Screenshots live in `frontend/qa/visual/out/` (not committed; regenerate with the commands in `qa/visual/README.md`). The scenes touched by the last code changes (intro, sign-in, board, settings, scoreboard, profile, admin, chain) were re-run on the final commit in both themes.

### 4.1 Defects found by reading the screenshots, all fixed

| Defect | Fix |
|---|---|
| Two stacked headers on the board (chapter plate + command header both named the event and both counted down) | the chapter plate is gone; the campaign map names the chapter in every board state |
| Admin header: the wordmark overlapped the "Pinaka CTF" badge (five tabs + the switch + the hold clock) | the badge hides until the header has room (`xl`, `2xl` for admins); the brand never shrinks |
| Phone profile page rendered zoomed out with the header content off-screen | the solves row's scroller is `contain: inline-size`; Chrome on a phone was sizing the layout viewport to its max-content width (same guard on the campaign map) |
| Phone podium: the rank cartouche sat on the frame above | 0.75 rem of headroom per frame when stacked |
| Phone campaign map: eyebrow truncated to "THE CAMPAIGN · CHA…", the lit station could be off-screen | shorter eyebrow on phones; the map scrolls the current chapter into the middle |
| Profile journey: the category label hugged the next column | left-aligned beside the points |
| No "Open Pinaka" on phones | added to the phone menu |

## 5. Performance

Measured with Playwright on the mock backend, desktop viewport, both skins on the same software-rendered headless Chromium (no GPU, `swiftshader`), after ten view changes (Challenges ↔ Scoreboard, i.e. ten world changes under the theme):

| | classic | Pinaka |
|---|---|---|
| tier | high | high |
| JS heap before / after ten view changes | 28.7 MB → 69.2 MB | 40.3 MB → 34.4 MB |
| long tasks (> 50 ms) during the ten changes | 17 | 13 |
| wall time for the ten changes (incl. 700 ms waits) | 15.1 s | 15.3 s |

Frame-rate figures from this container are not reported: without a GPU both skins render at a handful of frames per second, which says nothing about devices. What the table shows is that the theme is not heavier than the classic look on the same machine, and that ten world changes release their canvases (the heap settles lower than it started).

Lighthouse: **not run** — the mock backend is a Playwright route handler, so
a Lighthouse pass could only measure the sign-in page, and the container has
no GPU (software rendering), which makes paint timings meaningless as absolute
numbers. The comparison above is between the two skins on the same machine.

Design-side guarantees, by inspection of the final code:

* Environment tiers: `high` (three strip canvases at ≤ 1.5×, motes at 1×, 90
  motes at 30 fps), `medium` (strips at 1×, 36 motes), `low`/`still` (static
  SVG silhouettes, no canvas, no loop; `still` also drops every transition).
  Reduced motion wins over the tier. The mote loop allocates nothing per frame;
  the transient population after rapid world flips is capped at three.
* Height-only viewport changes (phone toolbar, keyboard) do not rebuild the
  scene. Off-screen campaign maps and causeways pause their animations.
* The default theme adds one bounded anonymous RPC (≤ 700 ms on a device with
  nothing cached, then never again) before the first paint; the skin's own
  chunks get ≤ 2.5 s, after which the page paints and the skin lands in place.

## 6. Accessibility

### Contrast (WCAG 2.x, computed from the tokens)

Text colours against the three surfaces they appear on. The ground is
`#0a0e17`, cards `#111727`, overlays `#171b2c`; inputs sit on `#0b0f1b`.

| Token | Value | on ground | on card | on overlay | AA (4.5) |
|---|---|---|---|---|---|
| `--color-text-primary` | #f3e8d1 | 15.9 | 14.7 | 14.1 | ✓ |
| `--color-text-secondary` | #cdc0a6 | 10.7 | 9.9 | 9.5 | ✓ |
| `--color-text-muted` | #a69a84 | 7.0 | 6.4 | 6.2 | ✓ |
| `--color-text-faint` (placeholders) | #8f8370 | 5.2 | 4.8 | 4.6 | ✓ (5.1 on the input surface) |
| `--color-neon` / gold | #e3bb66 | 10.6 | 9.8 | 9.4 | ✓ |
| `--pk-gold-deep` | #c49a45 | 7.4 | 6.9 | 6.6 | ✓ |
| `--pk-gold-soft` | #ebcb84 | 12.3 | 11.4 | 10.9 | ✓ |
| `--color-danger-fg` | #ffb8ae | 11.7 | 10.8 | 10.3 | ✓ |
| `--color-status-live` | #ff7a6b | 7.6 | 7.0 | 6.7 | ✓ |
| `--color-status-info` | #7ea7d8 | 7.7 | 7.2 | 6.8 | ✓ |
| `--color-status-locked` (badge text) | #938fa3 | 6.2 | 5.7 | — | ✓ (4.8 on its own wash) |
| difficulty easy / medium / hard / insane | #8ccb9c / #e0b34a / #e07a63 / #bf98f5 | 10.2 / 9.9 / 6.6 / 8.3 | ≥ 6.1 | ≥ 5.8 | ✓ |
| category web / forensic / misc | #5fb8a8 / #7aa6d9 / #a3aab5 | 8.2 / 7.6 / 8.3 | ≥ 7.1 | ≥ 6.7 | ✓ |
| `--pk-sandstone` (eyebrows) | #b58b62 | 6.3 | 5.8 | 5.6 | ✓ |
| gold ink on a gold button | #1a1206 on #e3bb66 | 10.2 | | | ✓ |

Two tokens were raised during the review to get here: `--color-text-faint`
(was 3.5:1) and `--color-status-locked` (was 3.4:1 on its wash).

### Contrast over the photographic plates (measured on screenshots) — 2026-10-09

Method: the harness scene is run through `runScene` at 1440×900, the text
layer is hidden with `visibility: hidden` once the plate reports
`data-ready="true"`, the bare backdrop is screenshotted, and every pixel under
each text element's bounding box is compared (PIL, WCAG relative luminance)
with that element's own computed colour. The minimum is the number reported.
The gateway was measured twice: during the drift (~3 s in, scale 1.054) and
under `prefers-reduced-motion` (the resting transform, which is also the
state after the 40 s drift has ended).

| Screen | Element (colour) | min during drift | min at rest |
|---|---|---|---|
| Sign-in hero | "The Gateway to Ayodhya" eyebrow (gold-deep `#c49a45`) | 7.29 | 7.35 |
| Sign-in hero | पिनाक (gold-soft) | 12.39 | 12.40 |
| Sign-in hero | PINAKA (foil; measured against parchment `#f3e8d1`) | 13.80 | 13.94 |
| Sign-in hero | CTF 2026 (gold-deep) | 7.29 | 7.29 |
| Sign-in hero | tagline (parchment) | 12.81 | 12.95 |
| Sign-in hero | secondary tagline (text-secondary `#cdc0a6`) | 8.36 | 8.55 |
| Sign-in hero | fact labels (gold-deep), three rows | 7.07–7.29 | 7.05–7.28 |
| Sign-in hero | fact values (parchment), three rows | 10.92–12.75 | 10.62–12.88 |
| Sign-in hero | partner plate: eyebrow (gold-deep, over the dawn glow) | **4.69** | **4.70** |
| Sign-in hero | partner plate: organiser line / marks / platform line / credits | 7.10 / 6.13 / 6.79 / 7.06 | 7.24 / 6.18 / 6.84 / 7.06 |
| Intro | पिनाक / CTF 2026 / tagline / platform line / Skip | 11.26 / 10.25 / 9.42 / **6.10** / 10.67 | — (same frame) |

Every line clears 4.5:1 in its own colour; the lowest point is the gold-deep
eyebrow at the top of the partner plate, which sits on the existing dawn
glow as well as the photograph. The drift state was also read from the DOM:
`data-drift="on"`, `animation-name: pk-gateway-plate-drift`,
`will-change: transform`, `matrix(1.0538, …)` at 3 s; `data-drift="done"`,
`animation-name: none`, `will-change: auto`, `transform: none` at 44.5 s;
under reduced motion `data-drift="off"` from the first frame with the plate
at opacity 1. The default theme was re-shot (`auth-login`, `board-live`,
desktop) after the change: zero `pk-*` elements, zero plate images and zero
theme stylesheet or preload links in its DOM, and the pixel difference
against the previous run (4.8 % / 2.1 %) equals the run-to-run noise of two
consecutive default-theme runs (4.9 % / 2.1 %: the animated hero radar and
the lattice).

### Keyboard and focus (automated, on the mock)

Sixteen automated checks (Playwright, mock backend, desktop), all passing on the final commit:

| Check | Result |
|---|---|
| Intro: the page behind the curtain is `inert` while it is up | pass |
| Intro: six Tabs keep focus on the curtain's own buttons (Tab wraps) | pass |
| Intro: Skip is the first button in DOM order | pass |
| Intro: Escape closes it and focus lands on the nav brand button | pass |
| Intro: the page is no longer `inert` afterwards | pass |
| Settings → Look: exactly one radio is in the tab order | pass |
| Settings → Look: ArrowRight picks Classic, applies it in place, focus stays on the radio | pass |
| Settings → Look: ArrowLeft returns to Pinaka in place | pass |
| Settings → Look: no page reload (one navigation entry) | pass |
| Admin → Event: the preview link is `/?preview=pinaka`, `target="_blank"`, `rel="noopener"` | pass |
| Header: the organisers' switch is present and focusable | pass |
| `?preview=pinaka`: skin on in that tab, parameter stripped, only the session key written, and it outranks a device pin | pass |
| Setu causeway: opening the briefing moves focus to its Close button | pass |
| Setu causeway: the briefing sits at the modal tier (`z-index: 110`) | pass |
| Setu causeway: Escape closes the briefing and focus returns to the Briefing button | pass |
| Setu causeway: Tab from the Back button reaches the next control (the briefing download) | pass |

### Semantics, by inspection

* Intro: `role="dialog"`, the page behind it is `inert`, Skip is first in DOM
  order, Escape and backdrop (after 800 ms) dismiss, auto-dismisses, focus
  returns to the nav brand. Shown once per device; without storage, never.
* Campaign map: `<section aria-label="Campaign map">`, the SVG is `role="img"`
  with a sentence that carries chapter and progress; the toggle has
  `aria-expanded`/`aria-controls`.
* Setu causeway: the same `sr-only` ordered list of chain state as the classic
  renderer; stone buttons keep their labels; the briefing is a focused,
  Escape-closable dialog at the modal tier.
* Podium frames and the solve light are `aria-hidden` ornament; the cards and
  the acknowledgement underneath are unchanged.
* Forced colours: foil text falls back to `CanvasText`.
* Reduced motion: every animation and transition is gated (`prefers-reduced-
  motion`, the `still` tier, and the components' own `is-still` so the two
  never disagree); the reduced-motion screenshot pass renders every scene at
  rest.

Screen-reader pass with a real AT: **not run** (no assistive technology in the
container). Semantics were checked against the DOM.

## 7. Security

| Item | Finding |
|---|---|
| CSP (`vercel.json`, unchanged) | new resources: the Google Fonts stylesheet (`style-src fonts.googleapis.com`, `font-src fonts.gstatic.com`, both already listed; Inter and JetBrains Mono load the same way), same-origin JS/CSS chunks, two `data:` SVG cursors (`img-src data:` already listed). Nothing inline, no `eval`, no new hosts. |
| Dependencies | `package.json` has no diff against `origin/main`; no new packages, no CDN scripts. |
| Storage | localStorage `cyberhx.theme`, `cyberhx.theme.server`, `cyberhx.pinaka.intro.v1`, `cyberhx.pinaka.journey.collapsed`; sessionStorage `cyberhx.theme.preview`. Values are enums, `'0'`/`'1'` or a timestamp. Nothing user-identifying. |
| URL parameters read | `theme`, `preview`, `intro` — whitelisted, never echoed, stripped from the URL at boot with `history.replaceState` on a URL rebuilt from the `URL` object (the OAuth hash is preserved). |
| Markdown | the Setu briefing renders with `ReactMarkdown` + `remarkGfm`, exactly as `ChainExperience` (no `rehype-raw`); the download link goes through `safeHttpUrl`. |
| External links | every `target="_blank"` carries `rel="noopener noreferrer"` (partners, briefing download, admin preview). |
| DOM sinks | no `dangerouslySetInnerHTML`, `innerHTML`, `document.write` or `new Function` anywhere under `src/themes` or `src/lib/brand.ts`. |
| Data exposure | the themed components read only what the classic views already render (`ChainSeriesVM`, podium rows, the viewer's own solves). Locked chain nodes stay "Locked node" with null points. |
| Server | `admin_set_theme` is `SECURITY DEFINER` with `search_path = ''`, checks `is_admin()`, whitelists the value with a CHECK and an explicit test, writes `audit_log`; EXECUTE revoked from `PUBLIC` and `anon`. `public_theme()` returns one whitelisted string. |
| Blast radius | the header "Open Pinaka" button changes every visitor's skin after one native confirm. It is admin-only, server-gated and audited, and it was asked for; the panel in Admin → Event carries the explanation. |
| Secrets | none touched; `.env` is not committed; the harness's mock keys are placeholders. |

## 8. Known limitations and what was not verified

* **The migration has not been applied to production.** It was tested on a
  stub of the schema, not on a dump of the real database. Until it is applied,
  the switch button reports an error and the site stays classic.
* No automated test suite existed before this branch and none was added to
  `package.json`; the harness is a developer tool run by hand, not a CI gate.
* All functional evidence is against a mock backend. The real edge function,
  Turnstile, Google OAuth and real-time channels were not exercised; their
  code is unchanged.
* Performance numbers come from a software-rendered headless Chromium with no
  GPU; they compare the two skins, they do not predict device frame rates.
  Canvas memory figures are computed from the sizes, not measured on devices.
* No real-device run (iOS Safari, Android Chrome). Container queries and
  `@starting-style` are used; browsers without them get the stacked map layout
  and a scene that appears without its fade, nothing broken.
* No screen-reader pass with real assistive technology.
* The brand/cultural review lens returned no findings; the copy, the single
  Devanagari word (पिनाक) and the Devanagari numerals should still be approved
  by the organisers before the event.
* `BowstringCountdown` and `ChapterNumeral` are built but not mounted on any
  screen (the command header already has the clock); they are there for the
  finale build.
* A live switch while a chain experience is open remounts it (the briefing
  closes); presentation-only, documented in REVIEW.md #27.
* A device that chose a look in Settings keeps it until it chooses otherwise
  (or `VITE_THEME_UNTIL` passes); the admin panel says so and offers "Follow
  the organisers".
