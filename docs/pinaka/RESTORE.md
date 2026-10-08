# Pinaka theme — restoration guide

How to switch the Pinaka CTF 2026 skin on, off, and out of the codebase without
losing any functional change that lands on `main` in the meantime.

The skin is a presentation layer: it never touches Supabase, scoring, auth or
routing. Every one of the switches below only changes what the page looks like.

## 0. How the skin is chosen (per page load, then live)

| Priority | Source | Effect |
|---|---|---|
| 1 | `VITE_THEME_UNTIL` (ISO date) in the build env | after this moment the skin is forced off, every other source ignored |
| 2 | `VITE_THEME_SWITCH=0` in the build env | per-device overrides ignored |
| 3 | `?theme=pinaka` / `?theme=cyberhx` / `?theme=auto` in the URL | persisted to `localStorage['cyberhx.theme']` for that device, then removed from the URL |
| 4 | `localStorage['cyberhx.theme']` | the device's own choice (Settings → Experience → Look) |
| 5 | **`event_settings.theme` on the server** | **the organisers' switch** — read anonymously through `public_theme()` at boot (cached per device in `localStorage['cyberhx.theme.server']`) and refreshed by the 30-second event-settings poll, so every open tab follows a change live, without a reload |
| 6 | `VITE_THEME` in the build env | the default when the server has no opinion; **unset = `cyberhx`** |

Resolution lives in `frontend/src/themes/index.ts`. A switch is applied in
place: the stylesheet is fetched once, `<html data-theme>` flips, and every
component re-renders. A half-typed flag, an open modal, a running countdown
all survive it.

## Path A — the organisers' switch (seconds, no deploy)

**Open for everyone**: Admin → Event → *Pinaka experience* → **Open Pinaka for
everyone** (or the **Open Pinaka** button in the header, visible to admins
only). Confirm. The dashboard applies it at once; every other visitor follows
on their next event-settings poll (≤ 30 s). Written through the audited
`admin_set_theme('pinaka')` RPC — admins only.

**Close**: the same panel → **Close Pinaka** (or the header button, which now
reads *Close Pinaka*). Everyone returns to the classic look on their next poll.

**Preview first**: *Preview on this device* in the same panel (it opens
`/?theme=pinaka`). Only that device sees it; `/?theme=auto` or Settings →
Experience → *Classic* ends the preview.

**Kill switch that ignores every device choice**: set `VITE_THEME_SWITCH=0`
(and, if wanted, `VITE_THEME_UNTIL=<date>`) in the Vercel environment and
redeploy; then only the server value counts, and after the date nothing does.

## Path B — roll back the release (git)

The theme was delivered as one squash-merged pull request from
`feature/pinaka-ramayana-experience`. To remove its code while keeping every
later commit:

```bash
git fetch origin main
git checkout -b chore/remove-pinaka-theme origin/main
git revert -m 1 <merge-commit-sha>      # or `git revert <squash-commit-sha>`
cd frontend && npm ci && npm run lint && npm run build   # tsc + vite build must pass
```

Open a PR, merge, deploy. If a later commit edited one of the mount-point
files (`App.tsx`, `AuthPage.tsx`, `Scoreboard.tsx`, `ChainedBoard.tsx`,
`Settings.tsx`, `UserProfile.tsx`, `main.tsx`), resolve the conflict by keeping
the later change and dropping only the `isPinaka()` branches — they are all
marked with a comment that says "Event skin".

Never `git reset --hard` or force-push `main` to restore the look: Path A is
faster and loses nothing; Path B is a forward revert.

## Path C — delete the theme from the codebase (after the event)

The manual version of Path B, useful once the event is over for good.

1. Delete `frontend/src/themes/pinaka/` and `frontend/qa/visual/` (optional).
2. In `frontend/src/themes/index.ts` remove the `pinaka` branch of `bootTheme`
   (or delete the file and the import in `main.tsx` and restore
   `createRoot(...).render(...)` unwrapped).
3. Remove each `isPinaka()` branch listed in `CHANGE_MANIFEST.md` — every one is
   a self-contained conditional around an otherwise unchanged element.
4. `npm run lint && npm run build`.

## Device-side residue (harmless)

The theme writes four localStorage keys and nothing else:
`cyberhx.theme`, `cyberhx.theme.server`, `cyberhx.pinaka.intro.v1`,
`cyberhx.pinaka.journey.collapsed`.
They are ignored once the theme is gone.

## What is NOT touched by any path

Scores, users, teams, challenges, submissions, sessions, edge functions, the
CSP (`vercel.json`), `package.json`. The one schema change is additive and
isolated: `supabase/migrations/20261008000000_event_theme.sql` adds
`event_settings.theme` (default `'cyberhx'`), `admin_set_theme(text)` and
`public_theme()`; dropping those three restores the previous schema.
Everything else on the server — environment secrets,
`vercel.json` (CSP unchanged), `package.json` dependencies, challenge data,
scores, users, teams.
