# Pinaka theme — restoration guide

How to switch the Pinaka CTF 2026 skin on, off, and out of the codebase without
losing any functional change that lands on `main` in the meantime.

The skin is a presentation layer: it never touches Supabase, scoring, auth or
routing. Every one of the switches below only changes what the page looks like.

## 0. How the skin is chosen (per page load)

| Priority | Source | Effect |
|---|---|---|
| 1 | `VITE_THEME_UNTIL` (ISO date) in the build env | after this moment the skin is forced off, overrides ignored |
| 2 | `VITE_THEME_SWITCH=0` in the build env | per-device overrides ignored; the build default rules |
| 3 | `?theme=pinaka` / `?theme=cyberhx` / `?theme=auto` in the URL | persisted to `localStorage['cyberhx.theme']` for that device, then removed from the URL |
| 4 | `localStorage['cyberhx.theme']` | the device's choice (Settings → Experience → Look) |
| 5 | `VITE_THEME` in the build env (`pinaka` or `cyberhx`) | the default for everyone; **unset = `cyberhx`** |

Resolution lives in `frontend/src/themes/index.ts`. The theme never changes
mid-session; choosing one reloads the page.

## Path A — turn it on / off with configuration (minutes, no code change)

The deployment (Vercel, from `main`) reads these at build time.

**Enable for everyone**

1. Vercel → Project → Settings → Environment Variables → Production:
   `VITE_THEME = pinaka`. Optional but recommended:
   `VITE_THEME_UNTIL = 2026-11-05T00:00:00+05:30` (auto-off after results day).
2. Redeploy (`Deployments → ⋯ → Redeploy`, or push). Done.

**Disable immediately (the kill switch)**

1. Set `VITE_THEME = cyberhx` (or delete the variable). To also stop players
   who chose the skin on their device from keeping it, set `VITE_THEME_SWITCH = 0`.
2. Redeploy. Every visitor is back on the standard CyberHX look on their next
   page load. No database, no cache, no CDN purge involved.

**Preview before enabling**: open any deployment with `?theme=pinaka` appended.
That device keeps the skin until it opens `?theme=auto` or picks "Classic" in
Settings → Experience.

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

The theme writes three localStorage keys and nothing else:
`cyberhx.theme`, `cyberhx.pinaka.intro.v1`, `cyberhx.pinaka.journey.collapsed`.
They are ignored once the theme is gone.

## What is NOT touched by any path

Supabase schema, migrations, RPCs, edge functions, environment secrets,
`vercel.json` (CSP unchanged), `package.json` dependencies, challenge data,
scores, users, teams.
