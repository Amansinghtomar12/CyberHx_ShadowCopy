# Visual QA harness

Screenshots of every screen of the CTF platform, driven by Playwright against the
Vite dev server, with the Supabase backend replaced by a route-level mock. One
command produces a full set for a theme; diff two sets to review a skin.

```
qa/visual/
  harness.cjs   runner + CLI (scene(), page helpers, fonts, report)
  mock.cjs      synthetic backend: PostgREST tables, RPCs, GoTrue, submit-flag
  scenes.cjs    the scene catalogue (one entry per screen / state)
  out/          generated (gitignored): out/<theme>/<viewport>[-rm]/<scene>.png + report[.rm].json
  .cache/       generated (gitignored): Google Fonts bytes fetched once with curl
```

## Run

Prerequisites: Playwright installed globally (`require(npm root -g + '/playwright')`),
a Chromium at `/opt/pw-browsers/chromium` (override with `QA_CHROMIUM`), and a dev
server started with the mock env:

```
cd frontend
VITE_SUPABASE_URL=https://mock.supabase.co VITE_SUPABASE_ANON_KEY=mock-anon-key \
  npx vite --port 5198 --host 127.0.0.1 --strictPort
```

Then:

```
cd frontend/qa/visual
node harness.cjs                                   # theme cyberhx, desktop + mobile, every scene
node harness.cjs --theme pinaka                    # another skin, same scenes
node harness.cjs --viewport mobile --scenes board-live,solve
node harness.cjs --rm --scenes auth-login,board-live,challenge-modal,solve,scoreboard-live
node harness.cjs --base http://127.0.0.1:5199/     # a different server (default 5198, or QA_BASE_URL)
node harness.cjs --list                            # scene names
```

| flag | default | meaning |
| --- | --- | --- |
| `--theme` | `cyberhx` | appended as `?theme=<name>` to the URL; also names the output folder |
| `--viewport` | `desktop,mobile` | desktop 1440×900 @1x, mobile 390×844 @2x (`isMobile`, `hasTouch`) |
| `--scenes` | all | comma-separated scene names |
| `--rm` | off | `prefers-reduced-motion: reduce`; output goes to `<viewport>-rm/` and `report.rm.json` |
| `--base` | `http://127.0.0.1:5198/` | dev server URL |

Every scene gets its own browser context, the clock shifted to the scene's moment
(the app's `Date` reads that instant but keeps ticking, so countdowns and
animations run), the mock session in `localStorage['sb-mock-auth-token']`, and
all routes intercepted: `mock.supabase.co` → mock.cjs, Google Fonts → curl-fetched
cache, `127.0.0.1` → the dev server, anything else → 204. A failing scene is
recorded in the report (with a `<scene>.FAILED.png`) and the run continues; the
process exits 1 if anything failed. Reruns with `--scenes` merge into the existing
report rather than replacing it.

`report.json` carries, per scene and viewport: `status` (`ok` / `failed` /
`skipped` + reason), the shot files, `pageErrors`, `consoleErrors` (minus any the
scene declared expected via `ignoreConsole`), `mockGaps` (tables/RPCs/functions the
mock did not know — they answered `[]` / `null` / `{}`), `failedRequests` to
non-mock hosts, the capability `tier` the app chose, and `durationMs`.

## Theme parameter contract

The harness only ever opens `<base>?theme=<theme>`. The app owns the rest:
`src/themes/index.ts` reads `?theme=`, persists it to `localStorage['cyberhx.theme']`,
strips it from the URL and sets `document.documentElement.dataset.theme`. Since
each scene starts from an empty storage, the query parameter is the only input,
so a run is never contaminated by a previous theme. On a build that does not yet
wire `bootTheme()` the parameter is a harmless no-op and the default look is
captured (that is what the `cyberhx` baseline is).

## Add a scene

Append to the array in `scenes.cjs`:

```js
scene('board-search', {
  // now: '2026-11-14T10:30:00Z',       // scene moment (default: 6 h into the synthetic event)
  // event: { is_paused: true },         // merged over the mock's event_settings row
  // me: { isAdmin: true, teamId: null },// profile overrides (role, "needs team", username)
  // loggedOut: true,                    // no session → AuthPage
  // invite: 'lanka-7f3a2b',             // pending team invite in localStorage['cyberhx.invite']
  // down: true,                         // every backend request fails → HoldScreen "Uplink lost"
  // only: 'mobile',                     // or 'desktop'; the other viewport reports "skipped"
  // ignoreConsole: /ERR_CONNECTION/,    // console errors that are expected for this scene
  before: async (page, h) => { await h.boardReady(); await page.fill('#board-search', 'heap'); },
  shots: [{ waitText: 'Heap of Trouble', at: 600 }, { name: 'full', at: 200, full: true }],
});
```

A shot waits for `waitText` / `waitSelector` / `waitHidden` (each capped at 25 s),
runs its own optional `before(page, h)`, then settles for `at` ms and captures
either the viewport, the full page (`full`) or a clipped region (`clip`: a
selector or `{x, y, width, height}`, padded by `pad`, default 24 px). Files are
`<scene>.png`, or `<scene>-<shotname>.png` when the shot is named. Helpers on `h`:
`nav(label)` (Users/Teams/Challenges/Scoreboard/Admin/Team/Profile/Settings, via the
hamburger on mobile), `openChallenge(title)` → dialog locator, `boardTab(name, list)`,
`boardReady()`, `waitText`, `clickText`, `park()` (moves the pointer off the UI).

If a screen needs data the mock does not have, add it to `mock.cjs`: tables are
plain arrays in `tables`, RPCs are values or `(args) => value` in `rpc`. Every
row is synthetic; keep it that way (fictional teams, `*.example.test` hosts).

## What the mock covers

- `event_settings` (start/end/is_active/is_paused/mode/team_size/chain & B2R flags/freeze/hide),
  `profiles`, `safe_profiles`, `public_teams`/`teams` (14 fictional teams),
  `team_scores`, `user_scores` (42 players; derived from a seeded ledger so the
  standings, the progression graph, team pages and first-blood credits agree),
  `public_challenges` (39: 24 on the free board across all 10 categories and 4
  difficulties, 9 in two chain series, 6 B2R flags for 3 boxes; hints at 0 and 500
  pts, attachments, `connection_info` links), `challenges`, `challenge_files`,
  `hints`, `hint_unlocks`, `submissions` (with embedded `challenges`),
  `notifications`, `public_chain_*`, `public_b2r_*`.
- RPCs: `get_team_solves`, `get_solve_data`, `get_my_hint_texts`, `scoreboard_state`,
  `get_score_progression` (ledger rows with `event_key`), `get_challenge_solvers`,
  `registration_is_open`, `get_challenges_count`, `get_my_team_invite`,
  `get_team_hint_unlocks`, `team_invite_preview`, `get_challenge_hints`, `unlock_hint`
  (`{ ok, text }`), `join_team`/`create_team`/`leave_team`, `verify_current_password`,
  `admin_list_users`, `admin_list_submissions`, `admin_list_chain_series`,
  `admin_list_b2r_boxes`, `admin_list_b2r_series`, `admin_allowlist_count`,
  `admin_challenges_needing_flag_reset`, `admin_team_members`.
- Filters: `eq/neq/gt/gte/lt/lte/in/is/not/like/ilike`, `or=()`/`and=()` with nesting,
  `order` (incl. `nullslast`), `limit`/`offset`, `Accept: vnd.pgrst.object+json`
  (single row or 406 `PGRST116`), `content-range` for HEAD/count queries.
- Time: everything before `now` counts; before `start_time` the board is empty
  (as the real view withholds it), after `end_time` `scoreboard_state.ended` is true.
- `/functions/v1/submit-flag` → `{ correct: true, points, maxAttempts, attemptsLeft }`
  (override per scene with `submitResult`).

## Known limitations

- Writes are echoed, never applied: creating a team, sending a notification or
  saving event settings returns success but changes nothing.
- Admin write RPCs (`admin_set_*`, `admin_upsert_*`, `admin_start_new_event`,
  `admin_reset_event`, owner flag vault) are not mocked; they answer `null` and
  show up in `mockGaps`. The Chains/B2R admin managers render from minimal
  `{ series: [...] }` / `{ boxes: [...] }` shapes.
- Google sign-in, Turnstile (no `VITE_TURNSTILE_SITE_KEY` → "Unavailable" badge,
  which is what the screenshot shows) and e-mail flows are not exercised.
- The scoreboard jitters its first fetch by up to 15 s; scoreboard scenes press
  the refresh button and wait for the leader's name instead of guessing.
- Timing-based shots (`solve-breach`, `challenge-modal-insane`) capture a moment
  inside an animation; expect small frame-to-frame variance. `--rm` removes it.
- WebGL runs on SwiftShader (`tier: high` on desktop, `medium` on mobile); the
  ambient lattice is therefore present but its exact particle positions differ
  between runs. Compare layout, not pixels, in those regions.
- The harness pins `navigator.hardwareConcurrency`/`deviceMemory` to 8 so the
  capability tier does not depend on the host machine.
- The dev server must serve a compiling tree: a Vite error overlay fails every
  scene. When the working tree is mid-edit, serve a clean copy (for example
  `git archive HEAD frontend | tar -x -C <dir>`, symlink `node_modules`, run Vite
  there with its own `cacheDir`) and pass `--base`.
