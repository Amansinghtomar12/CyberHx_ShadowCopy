# Pinaka theme — pre-implementation audit of the CyberHX frontend

Generated on 2026-10-08 against `main @ ce23b64` by four independent read-only audits of `frontend/src` (routes/screens, feature flows, environment/performance/styling, admin/security). Every file path is relative to `frontend/`. This is the inventory the theme was built against and the checklist QA runs after it.

## Contents

- [Route, view and screen inventory](#routes)
- [Feature and flow preservation contracts](#flows)
- [Environment, motion, performance and styling system](#environment)
- [Admin and security inventory](#admin-security)
- [Consolidated preservation checklist](#consolidated-preservation-checklist)
- [Consolidated risks for a presentation layer](#consolidated-risks-for-a-presentation-layer)

<a id="routes"></a>
## Route, view and screen inventory

# CyberHX Frontend — Route / View / Screen Inventory (pre-"Pinaka" skin audit)

**Scope:** `/home/user/CyberHx_ShadowCopy/frontend/src` (20,701 lines; React 19 + Vite 6 + Tailwind v4 `@theme static` + Supabase JS + `motion/react` + `lucide-react` + `recharts` + `react-markdown`). Read-only audit; every file under `src/` was read in full. All paths below are relative to `frontend/`.

**Routing model:** there is **no client router**. `index.html` ships one `<div id="root">` and `/src/main.tsx` (`index.html:108-110`). `vercel.json` only sets security headers (CSP allows scripts from self + `challenges.cloudflare.com`, styles from self + `fonts.googleapis.com`, connect to `*.supabase.co`). The only URLs that matter are `/?invite=<code>` (consumed by `src/lib/invite.ts:20-39` before React renders — `main.tsx:14`) and static `public/{privacy,terms,support,404}.html` opened in new tabs. Everything else is in-memory state:

| Layer | State owner | Values | File:line |
|---|---|---|---|
| Root gate | `Root()` | `uplink.down` → hold; `loading` → boot text; `!user` → `AuthPage`; else `App` | `src/main.tsx:16-48` |
| Main view | `App.currentView` | `challenges` (default) \| `scoreboard` \| `teams` \| `users` \| `teamProfile` \| `userProfile` \| `settings` \| `admin` | `src/App.tsx:387` |
| Board mode | `App.boardMode` | `free` \| `chained` \| `b2r` | `src/App.tsx:395` |
| B2R sub-mode | `App.b2rSubMode` | `free` \| `chained` | `src/App.tsx:399` |
| Difficulty rail | `App.selectedDiff` | `'all'` \| `Easy` \| `Medium` \| `Hard` \| `Insane` | `src/App.tsx:331` |
| Category chip | `App.selectedCat` | `'all'` \| category id | `src/App.tsx:339` |
| Search | `App.query` | string | `src/App.tsx:379` |
| Event status | `App.eventStatus` | `waiting` \| `live` \| `ended` \| `inactive` (derived every 1 s from `event_settings`) | `src/App.tsx:403, 714-729` |
| Paused | `eventSettings.is_paused` | boolean (polled every 30 s + on visibility) | `src/App.tsx:700-710, 871` |
| Challenge modal | `App.selectedChallenge` + `selectedOrigin` | `Challenge \| null` | `src/App.tsx:321, 330` |
| Modal tab | `ChallengeModal.activeTab` | `challenge` \| `solves` | `src/App.tsx:2031` |
| Submit stage | `ChallengeModal.stage` | `idle` \| `validating` \| `hold` | `src/App.tsx:2062` |
| Invite dialog | `App.invite` | preview \| null | `src/App.tsx:346` |
| Milestone queue | `App.milestones` | `Milestone[]` (shows `[0]`) | `src/App.tsx:386` |
| Mobile menus | `mobileMenuOpen`, `mobileFilterOpen` | boolean | `src/App.tsx:388-389` |
| Settings tab | `Settings.tab` | `profile` \| `tokens` (labelled "Security") | `src/Settings.tsx:84` |
| Admin tab | `AdminDashboardInner.activeTab` | `challenges` \| `chains` \| `b2r` \| `users` \| `teams` \| `submissions` \| `notifications` \| `event` | `src/components/admin/AdminDashboard.tsx:983` |
| Team page mode | `TeamProfile.mode` | `none` \| `create` \| `join` (only when no team) | `src/TeamProfile.tsx:83` |
| Auth mode | `AuthPage.mode` / `phase` | `login` \| `register`; `idle` \| `verifying` \| `granted` | `src/components/AuthPage.tsx:151, 202` |

**Global persisted keys (localStorage) a skin must not collide with:** `cyberhx.invite` (`lib/invite.ts:15`), `cyberhx.sound` (`audio/preferences.ts:302`), `cyberhx.fx` (`environment/fx.ts:360`), `cyberhx.fx.prev` (`MotionToggle.tsx:104`), `notif_last_seen` (`App.tsx:184, 211, 227`).

**z-index ladder (must be preserved in order):** `.ambient-root` 0 (`index.css:955`) → `.page-shell` 1 (`index.css:948`) → header `<nav>` `z-50` (`App.tsx:905`) → mobile difficulty dropdown `z-20`/`z-30` (`App.tsx:1340, 1359`) → notification popover `z-50` (`App.tsx:266`) → ChallengeModal `z-[100]` (`App.tsx:2241`) → invite dialog `z-[110]` (`App.tsx:1556`) → OwnerFlagVault `z-[120]` (`OwnerFlagVault.tsx:132`) → `.cursor-ring` 140 (`index.css:1503`) → `.milestone-root` 200 (`index.css:1697`) → chain readme dialog `z-[4000]` (`ChainExperience.tsx:183`) → B2R box overlay `z-[4500]` (`B2RBoard.tsx:249`) → admin chain preview `z-[5000]` (`ChainManager.tsx:375`, `B2RManager.tsx:562`). Inside the modal: `.op-intro` z 15, `.breach-root` z 20 (`index.css:1654, 1166`); inside auth card `.access-root` z 30 (`index.css:1377`).

---

## 1. Entry & root states — `src/main.tsx`

### 1.1 Uplink hold (backend unreachable)
- **(a)** `Root` branch `uplink.down` → `<HoldScreen reason="uplink" since attempts />` — `main.tsx:22-31`; `HoldScreen` at `src/components/HoldScreen.tsx:62-150`.
- **(b)** wrappers: `min-h-screen bg-cyber-bg text-cyber-text font-sans` → `<AmbientBackground intensity="normal"/>` → `page-shell min-h-screen flex flex-col` (`main.tsx:24-26`). Panel: `hold flex-1 … px-4 py-12 sm:py-20` (`HoldScreen.tsx:90`) > `hold-panel surface-overlay relative w-full max-w-2xl overflow-hidden p-6 sm:p-10` (`:96`); decorative `hold-scan` (`:98`), `hold-dot` (`:101`), `hold-log/hold-line/hold-caret` (`:128-140`). CSS in `index.css:1989-2021, 2048-2060`.
- **(c)** data: `uplinkState()` store (`lib/uplink.ts:295-331`) — `since` (ms), `attempts`; LINES copy `HoldScreen.tsx:39-44`; elapsed `useElapsed` (`:49-60`). Trigger: 2 gateway failures (502/503/504 or network error) within 40 s (`lib/uplink.ts:303-308, 367-381`).
- **(d)** presentational: whole panel. May restyle colours/typography. **Keep** `role="status" aria-live="polite" aria-label` (`:87-89`).
- **(e)** business-critical: there are no controls; the screen must *clear itself* when `recordSuccess()` flips `down=false` (`uplink.ts:383-390`). The 380 ms typing cadence (`:75`) and `reduce ? lines.length : 0` initial shown (`:65`) are behaviour.

### 1.2 Boot / loading
- **(a)** `main.tsx:33-41`: `<div className="min-h-screen bg-cyber-bg flex items-center justify-center"><div className="label-micro text-cyber-neon animate-pulse" role="status">Initializing Terminal...</div></div>`.
- **(c)** `useAuth().loading` true until `getSession()` resolves (`hooks/useAuth.ts:112-126`).
- **(d)** fully presentational; keep `role="status"`.

### 1.3 Signed-out → AuthPage (section 2); signed-in → App (section 3).

---

## 2. Auth page — `src/components/AuthPage.tsx`

**Page frame (a/b):** root `min-h-screen bg-cyber-bg overflow-x-hidden relative` (`:405`); `<AmbientBackground intensity="normal"/>`, `<SurfaceLight/>`, `<CursorRing/>` (`:406-408`); fixed `MotionToggle className="surface"` top-right `z-50` (`:413-415`); four `CornerBracket` (`lg:` only, `:418-423`, component `:31-46`, `border-cyber-neon/40`); `page-shell min-h-screen flex items-center justify-center px-4 py-8 sm:py-10` (`:425`); inner `w-full max-w-lg lg:max-w-[82rem]` (`:426`); grid `lg:grid-cols-[minmax(0,1fr)_31rem]` (`:428`). Mood set to `'auth'` on mount (`:210`).

### 2.1 Hero column (desktop only, `hidden lg:flex`, `:431-499`) — **purely presentational**
- `BackgroundRadar` (`:49-75`) — rotating SVG with **hard-coded `#c6ff00`** strokes (`:60-71`), `opacity-[0.09]`.
- Status pills (`:441-457`): "Operations live" uses Tailwind **`emerald-500/30`, `emerald-500/10`, `emerald-400`, `emerald-300`** (off-token); "Secure channel · TLS 1.3" (`Wifi`), "v2.0" (`Radio`).
- Wordmark (`:460-479`): Flag mark in `bg-neon-wash border-border-neon shadow-neon`, h1 `CYBER<span class="text-cyber-neon text-glow">HX</span>` with inline `fontSize: clamp(3.25rem, 6.6vw, 6rem)`.
- `StatTile` ×4 (`:482-487`, component `:114-127`, `text-emerald-400` for `tone='live'`): static strings "10 Categories / 4 Difficulties / LIVE Event / 24/7 Uptime".
- `CategoryTicker` (`:78-112`, used `:490-492`): marquee of 10 hard-coded category names, `motion` x-loop 42 s.
- `BuildCredit` (`:135-146`; used `:496` and again `:943` for `lg:hidden`).

### 2.2 Auth card (`:502-944`)
- **(b)** compact logo `lg:hidden` (`:509-522`); glow `absolute -inset-4 rounded-card opacity-60 blur-2xl` (`:527-531`); **card `auth-scale surface shadow-e5 relative overflow-hidden`** (`:534`) — `.auth-scale` *redefines the type tokens* `--text-micro/--text-small/--text-body` inside the card (`index.css:605-614`); top hairline (`:548-552`).
- **Tab bar** (`:555-586`): `role="group" aria-label="Authentication mode"`, two `<button aria-pressed>` "Sign In"/"Register" with `motion.span layoutId="auth-tab-underline"`. Business-critical: `setMode(m); setError('')` (`:566`); mode also resets captcha (`:292-297`). Default mode is `register` when an invite is pending (`:151`).
- **Header** (`:590-605`): eyebrow "Auth Gateway"/"New Operative", h2 "Access terminal"/"Enter the arena".
- **Invite banner** (`role="status"`, `:607-650`): data from `supabase.rpc('team_invite_preview', {p_code})` (`:169`). Three variants: `error==='unavailable'`, other error (`clearInvite()` on "Invalid invite", `:172`), valid (shows `invite.name`, `members/size`, `Full` badge `badge badge-locked`). Inline style colours (`:611-613`).
- **Registration closed banner** (`:653-667`): shown when `mode==='register' && !registrationOpen`; `registrationOpen` from `supabase.rpc('registration_is_open')` (`:304-308`) and re-asked at submit (`:368-374`).
- **Form** `<form onSubmit={handleSubmit} className="space-y-4">` (`:669`):
  - Username (register only, animated height, `:671-694`): `#auth-username`, `autoComplete="username"`, helper "3–30 characters · letters, numbers, _ or -".
  - Email `#auth-email` (`:697-708`); Password `#auth-password` with show/hide toggle button `aria-pressed` `focus-ring tap-target` (`:710-733`, `.tap-target` CSS `index.css:1528-1536`), `minLength={6}` in register; "Minimum 6 characters" (`:735-737`).
  - No-reset note `role="note"` (`:742-752`) — copy from `lib/support.ts` (`REGISTER_NO_RESET`, `FORGOT_NO_RESET`, `ADMIN_EMAIL` mailto).
  - **Captcha box** (`:755-826`): badge `badge badge-solved|badge-locked` with `aria-live="polite"` text Verified/Unavailable/Failed/Pending (`:761-775`); `<div ref={turnstileRef}/>` (`:779`) — Turnstile renders *into* this (theme `'dark'`, `:244`); explanation box for `blocked|error|unconfigured` (`:786-825`) with **"Try again" button** (`:815-822`, calls `retryCaptcha` `:284-289`). Captcha state machine `:194-199`; script loader `:215-228`; render/poll with 20 s timeout `:231-282`.
  - Error `role="alert"` (`:828-844`, inline danger colours).
  - **Primary CTA** inside `MagneticElement radius=140 strength=5` (`:850-872`): `btn btn-primary btn-lg btn-block group !py-4 !text-body !tracking-[0.2em]`, `disabled={loading || !captchaToken}`, label "Authenticating..." / "Access Terminal" / "Enlist Operative".
  - Divider "or continue with" (`:875-879`).
  - **Google button** `btn btn-secondary btn-block` (`:882-913`) with inline Google SVG; handler `:884-902` (refuses when register && !registrationOpen).
- **AccessSequence overlay** (`:538-546`, component `src/components/AccessSequence.tsx:195-272`): mounted while `phase !== 'idle'`; `.access-root` covers the card and *locks the form by taking pointer events* (`index.css:1374-1383`); steps `STEPS[mode]` (`:188-191`) advance every 420 ms; `granted` → `.access-grant` check + ring, `onDone` after 600 ms (`GRANTED_MS` `:193`) calls `onSuccess` (a no-op in `main.tsx:44`; the real transition is `useAuth` state change).
- **Card footer** (`:918-929`): "ctf.cyberhx.com" and "v2.0 · CTF-EDITION".
- **Terms line** (`:933-939`): `<a href="/terms.html" target="_blank" rel="noopener noreferrer">fair-play rules</a>`.
- **(c)** data: `useAuth().login/register/loginWithGoogle` (`hooks/useAuth.ts:143-194`); error mapping `authErrorMessage` (`:38-53`); Google hash-error mapping `AuthPage.tsx:313-328`.
- **(e) business-critical:** tab toggle; three inputs (ids/autocomplete/types); show-password; captcha container ref + badge state text; Try again; submit button `disabled` logic; Google button; mailto links; terms link; AccessSequence gating (`aria-busy`). Do **not** change `TURNSTILE_SITE_KEY` wiring or the `#cf-turnstile-script` id (`:219-223`).

---

## 3. App shell — `src/App.tsx:897-1727`

### 3.1 Root & environment
- `<div className="min-h-screen bg-cyber-bg text-cyber-text font-sans" data-tier={getCapability().tier}>` (`:898`) — **`data-tier` gates idle card animations in CSS** (`index.css:1591, 1606, 1630`). `<AmbientBackground/>` (`:899`, default `intensity='subtle'`), `<SurfaceLight/>` (`:900`), `<CursorRing/>` (`:901`), `page-shell min-h-screen flex flex-col` (`:903`).
- Mood per view (`:616-625`): challenges/admin → `focus`; scoreboard/teams/users → `compete`; others → `calm` (`environment/mood.ts:148-153`). `setDifficultyFocus` (`:649-651`), `setProgress` (`:638-642`), `setSignals` (`:604-614`) feed the WebGL lattice.

### 3.2 Header `<nav>` (`:905-1042`)
- **(b)** `bg-cyber-bg/85 backdrop-blur-xl border-b border-border-base sticky top-0 z-50` > `max-w-screen-2xl mx-auto px-3 sm:px-5 lg:px-6 h-16 flex items-center justify-between gap-2`.
- Mobile hamburger `btn btn-ghost btn-sm btn-icon lg:hidden` `aria-label` Open/Close menu, `aria-expanded` (`:908-915`).
- Brand button (`:917-928`): `group flex items-center gap-2.5 focus-ring rounded-inset`, Flag mark `w-7 h-7 bg-neon-wash border-border-neon rounded-inset shadow-neon`, text "CYBERHX" `hidden sm:inline text-h3`. **Click → `setCurrentView('challenges')`.**
- Desktop nav (`:930-950`): `navItems` Users/Teams/Challenges/Scoreboard (`:890-895`) as `tab` + `is-active`, `aria-current="page"`; Admin tab only for `profile?.is_admin` with `text-cyber-neon/70` (`:941-949`).
- Right rail (`:953-986`): `EventClock` (`hidden md:inline-flex`, `:954-962`), `NotificationBell` (`:963`), `SoundToggle` (`:964`), `MotionToggle` (`:965`), `divider-vertical hidden lg:block` (`:966`), then `hidden lg:flex`: Team (`aria-label="My team"`, `:968-971`), Profile (username, `max-w-[10rem]`, `:972-976`), Settings icon (`:977-980`), Log out (`hover:text-status-live`, `:981-984` → `handleLogout` `:865-868` = `signOut()` + `location.reload()`).
- **Mobile menu** (`AnimatePresence`, `:990-1041`): `lg:hidden border-t … bg-cyber-bg/95 backdrop-blur-xl max-h-[calc(100vh-4rem)] overflow-y-auto custom-scrollbar`; "Navigate" buttons Users/Teams/Scoreboard/Challenges/(Admin) with `rounded-control px-3 py-3 text-label uppercase` active `bg-surface-raised text-cyber-neon`; "Account" 2×2 grid of `surface` tiles My Team/Profile/Settings/Log Out (`:1019-1037`). Every button also `setMobileMenuOpen(false)`.
- **(e)** all nav buttons are business-critical (view switching); `aria-current`, `aria-expanded`, `aria-label` must stay.

### 3.3 Admin paused banner (`:1044-1055`)
- Shown only when `paused && profile?.is_admin`. `rounded-control border px-4 py-3` with **inline** `borderColor: rgba(224,179,74,0.45)`, `backgroundColor: var(--color-diff-medium-wash)`; `badge badge-medium` "Paused"; inline link button "Admin → Event" → `setCurrentView('admin')`.

### 3.4 Content switch (`:1056-1551`)
- `flex flex-1 max-w-screen-2xl mx-auto w-full relative` (`:1056`). If `paused && !is_admin` → `<HoldScreen reason="paused" message={pause_message} since={paused_at}/>` **replaces every view, including scoreboard** (`:1057-1058`). Otherwise `AnimatePresence mode="wait"` > `AnimatedView viewKey={currentView}` (`:1060-1061`; `environment/AnimatedView.tsx:306-342` — `flex flex-1 w-full min-w-0`, scrolls to top + `triggerWarp(1)` on key change). Every view component roots at `flex-1` and relies on this flex parent.

### 3.5 Team-invite dialog (`:1554-1623`)
- `fixed inset-0 z-[110] flex items-center justify-center p-4`; `.scrim` (click = dismiss); panel `role="dialog" aria-modal aria-label="Team invite"` `surface-overlay relative w-full max-w-md overflow-hidden p-6 sm:p-7` + neon hairline. Three bodies: **error** (`unavailable` vs invalid; one "OK" `btn btn-secondary btn-md`, `:1571-1584`), **already on a team** ("OK" + "Team page" `btn-outline`, `:1585-1596`), **join** (members/size, full/locked copy, `inviteError role="alert"`, "Not now" `btn-ghost`, "Join team" `btn btn-primary btn-md` `disabled={inviteBusy||full||locked}` with `is-loading`, `:1597-1619`).
- **(c)** `team_invite_preview` RPC (`:354-360`), `join_team` RPC (`:370`), then `refreshProfile()` and `setCurrentView('teamProfile')` (`:375-377`), `play('success')`.

### 3.6 Milestone banner (`:1698-1706`; `src/components/MilestoneBanner.tsx`)
- `.milestone-root` fixed top 4.75 rem z 200 `pointer-events:none` (`index.css:1692-1703`); `.milestone-plate` with inline `borderColor/backgroundColor` from `TONE` map (`MilestoneBanner.tsx:87-91`: neon→cyber-neon/neon-wash, gold→diff-medium, violet→diff-insane); `Award` icon; `milestone-sweep`. Auto-dismiss 2.6 s (2.0 s reduced) (`:102-105`). Queued 1.9 s/2.5 s after solve (`App.tsx:1681-1686`), `play('milestone')`. Rules in `lib/milestones.ts:127-206` (first-breach, first-blood, first-insane, tier cleared, category cleared, full compromise, every 5th).
- `role="status" aria-live="polite"`.

### 3.7 Footer (`:1708-1723`)
- `mt-auto border-t border-border-base py-8 px-4 sm:px-6` > `max-w-screen-2xl`; Flag mark + "Cyberhx CTF Framework v2.0" `label-micro`; links Privacy/Terms/Support → `/privacy.html`, `/terms.html`, `/support.html` with `target="_blank" rel="noopener noreferrer"` (**must stay new-tab**, comment `:1717`).

### 3.8 NotificationBell (`:179-300`)
- Button `btn btn-ghost btn-sm relative` `aria-label="Notifications" aria-expanded` (`:244-257`); unread pill `absolute -top-1 -right-1 … rounded-pill bg-status-live text-cyber-bg text-micro` shows `9+` cap (`:250-256`).
- Popover `surface-overlay absolute right-0 top-full mt-2 w-[min(21rem,calc(100vw-1.5rem))] z-50 overflow-hidden origin-top-right` (`:266`); header `px-4 py-3 border-b border-border-base bg-surface-rail` + close `btn btn-ghost btn-sm btn-icon` (`:268-274`); list `max-h-[min(24rem,60vh)] overflow-y-auto custom-scrollbar divide-y divide-border-subtle` (`:275`); empty "No notifications yet" (`:276-280`); item unread wash `bg-neon-wash` + left neon bar (`:282-285`); type badge via `typeStyle` (`:232-237`: info→`badge-info`, success→`badge-solved`, warning→`badge-medium`, danger→`badge-hard`) and `typeIcon` glyphs ℹ ✓ ⚠ ⊘ (`:238`).
- **(c)** `supabase.from('notifications')…limit(20)` every 120 s (`:204-223`) and on open; unread computed vs `localStorage notif_last_seen`; opening marks all read (`:225-230`); beep via raw `AudioContext` 880 Hz (`:188-202`, bypasses AudioManager).
- **(e)** open/close/mark-read behaviour; the 9+ cap; chronological order.

---

## 4. Challenges view — `src/App.tsx:1062-1532`

### 4.1 Desktop sidebar `<aside>` (`:1065-1166`)
- **(b)** `hidden lg:block w-64 xl:w-72 border-r border-border-base px-5 xl:px-6 py-8 shrink-0 text-left` > `sticky top-24 space-y-8`.
- **Operations rail** (`:1067-1097`): h3 `label-micro` "Operations"; "All Operations" and one item per `DIFFICULTIES` (from `DIFFICULTY_ORDER`, `:117-118`) as `rail-item group relative flex w-full items-center gap-3 rounded-control px-3 py-2 text-left` + `is-active bg-surface-raised text-cyber-neon`, `aria-current`, inline **`--rail-hue`** = `var(--color-neon)` or `var(--color-diff-<id>)` (`:1075, 1088`; CSS `index.css:661-704`), `rail-dot`, count `font-mono text-small text-text-muted` (`filteredChallenges.length` / `challengesByDiff[id].length`).
- **Progress** (`:1100-1115`, only when `challenges.length>0`): `surface p-4`; `{totalSolvedCount}/{challenges.length}`; track `surface-inset h-1.5 … rounded-pill` with `bg-cyber-neon` fill width %.
- **Your team** (`:1119-1140`, only when `profile.team_id && teamRoster.length`): `surface p-4`; per member dot colour `var(--color-status-solved)` or `var(--color-border-strong)` by solve count; `me` → `text-cyber-neon` + "you" `label-micro !text-cyber-neon`; count = solves attributed via `solvedByMap`.
- **Event** (`:1143-1164`, when `eventSettings`): `pt-6 border-t border-border-subtle`; event name `text-small font-bold`; `badge ${eventBadgeClass}` + `eventLabel` (`:879-886`); "Ends …" when live & `end_time`; "Starts …" when waiting; "Team mode" `label-micro` when `mode !== 'individual'` (`:873`).
- **(e)** rail buttons set `selectedDiff` (filters the FREE grid, `challengesByCat` `:795-805`; also drives `setDifficultyFocus`).

### 4.2 Main column `<main>` (`:1169`) `flex-1 min-w-0 px-4 sm:px-6 lg:px-8 py-8 lg:py-10 w-full`

#### 4.2.1 Team-disqualified alert (`:1170-1190`)
- `teamBanned && !is_admin` → `role="alert"` `mb-6 rounded-card border p-5 sm:p-6` inline `borderColor: var(--color-diff-hard)`, `background: var(--color-blood-wash)`; `TriangleAlert`; team name mono; mailto `support@cyberhx.com` (`text-cyber-text underline`). Data: `public_teams.is_banned` (`:544, 548`).

#### 4.2.2 CommandHeader (`:1191-1204`; `src/components/CommandHeader.tsx:374-480`)
- **(b)** `<header className="holo surface relative mb-8 overflow-hidden p-5 sm:p-6 lg:mb-10">` — `.holo` opts into cursor light/tilt via SurfaceLight (`index.css:1048-1108`; `SurfaceLight.tsx:34-38`). Status edge `absolute inset-y-0 left-0 w-[2px]` with `statusTone` (`:381-386`).
- Badges by state (`:400-404`): paused→`badge-medium` "Paused"; live→`badge-live` "Live"; waiting→`badge-locked` "Standby"; ended→`badge-hard` "Closed"; inactive→`badge-locked` "Offline". h2 `eventName || 'CyberHX CTF'`.
- Copy line (`:410-419`) per state; countdown (`:424-442`) only `status==='live' && !paused && endTime` — `readout mt-1 text-h1 … tabular-nums`, colour `var(--color-status-live)` when `<1h` else `var(--color-cyber-neon)`, `aria-label` h/m only.
- Four `Readout`s (`:447-466`): "Team score"/"Your score" (`AnimatedNumber value={score}` — `myScore` derived `App.tsx:438-450` = Σpoints(solved by me or team) − Σhint costs, floored at 0), "Solved n / total", "Progress %", "Your solves n / solved" or "Team: None" (`text-diff-medium`).
- Progress rail (`:469-477`) `scaleX` transform.
- **(d)** all presentational; **(e)** numbers and state copy are user-facing truth — keep formulas and `AnimatedNumber` (first paint static, `AnimatedNumber.tsx:359-401`).

#### 4.2.3 Board tools (`:1208-1337`) — rendered only when `challenges.length > 0 && canSeeChallenges && !needsTeam`
- Container `board-tools mb-6 flex flex-col gap-3 lg:flex-row lg:items-center`.
- **Mode tablist** (`:1210-1246`, only if `chainEnabled || b2rEnabled`): `role="tablist" aria-label="Challenge mode"` `inline-flex shrink-0 rounded-md border border-border-subtle bg-surface-sunken p-0.5`; buttons `role="tab" aria-selected` `btn btn-sm btn-secondary|btn-ghost`: "Free"; "Chained" (`Link2`, only `chainEnabled`, `play('open')` on switch); "B2R" (`Server`, only `b2rEnabled` = flag **or admin**, `:420-421`) with admin-only "off" pill `rounded-full bg-surface-sunken px-1.5 text-micro` when `!b2rFlagOn` (`:1242`).
- **B2R sub-tablist** (`:1247-1270`, when `boardMode==='b2r'`): `aria-label="B2R mode"`, "Free"/"Chained".
- **Search** (`:1271-1298`): `relative min-w-0 shrink-0 lg:w-72 xl:w-80`; `Search` icon; `<label for="board-search" class="sr-only">`; `<input id="board-search" className="input h-[2.375rem] pl-9 pr-10" placeholder="Search operations" autoComplete=off spellCheck=false>`; Escape clears+blurs (`:1280`); clear button `btn btn-ghost btn-sm btn-icon absolute right-1` `aria-label="Clear search"` or `<kbd class="board-kbd">/</kbd>` (`index.css:707-725`, hides on focus). Global `/` hotkey (`:808-819`) only on challenges view with no modal.
- **Category chips** (`:1299-1335`): `role="group" aria-label="Filter by category"` `board-chips flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto` (scrollbar hidden `index.css:728-733`); "All" `chip shrink-0 is-active` with mode-aware count (`:1310-1315`); per category `chip` with `aria-pressed`, icon from `CATEGORY_ICON` (fallback `Boxes`), inline `color: catVar(cat.id)` when inactive (`:1327`), count. Categories list is **mode-derived** (`:759-771`) and ordered by `Object.keys(CATEGORY_ICON)`.
- **(e)** every control here is business-critical (filters, mode switching, hotkey, aria).

#### 4.2.4 Mobile/tablet difficulty dropdown (`:1340-1389`)
- `lg:hidden relative mb-6 z-20`; trigger `btn btn-secondary btn-md btn-block justify-between` with `SlidersHorizontal` + `activeDiffLabel` (`:887`) + rotating `ChevronDown`, `aria-expanded`; panel `surface-overlay absolute left-0 right-0 z-30 mt-2 p-2`; items `rounded-control px-3 py-2.5 text-left text-label uppercase` active `bg-surface-raised text-cyber-neon`, dot inline `var(--color-diff-<id>)`, counts. Note: this dropdown renders **regardless** of `canSeeChallenges`/`needsTeam` (no gate), unlike board tools.

#### 4.2.5 Board states (mutually exclusive chain, `:1391-1529`)
| # | Condition | Markup | Lines |
|---|---|---|---|
| 1 | `challengesLoading` | `sr-only role=status` "Loading challenges…" + 6 `surface p-5` skeleton cards (`skeleton`, `skeleton-text`) in `grid sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5` | `:1391-1407` |
| 2 | `!canSeeChallenges` (`inactive` and not admin) | `surface flex flex-col items-center text-center px-6 py-16`; Lock in `h-12 w-12 rounded-full border-border-strong bg-surface-inset`; "Event is not active yet" | `:1408-1418` |
| 3 | `needsTeam` (`!profile.team_id`, admins included — `:875`) | same surface; `badge badge-neon` "Team Required"; h2 "Join or Create a Team First"; **button `btn btn-primary btn-lg` "Go to Teams" → `setCurrentView('teamProfile')`** | `:1419-1430` |
| 4 | `challenges.length===0` | Terminal icon; "No challenges yet" | `:1431-1441` |
| 5 | `boardMode==='chained'` | `React.Suspense` fallback `flex h-[50vh] … text-text-tertiary` + sr-only "Loading chains…" → `<ChainedBoard vms category onOpenChallenge/>` | `:1442-1451` |
| 6 | `boardMode==='b2r'` | Suspense fallback "Loading B2R…" → `<B2RBoard boxes seriesVMs subMode category onOpenChallenge/>` | `:1452-1469` |
| 7 | filtered empty | `role="status"`; Search icon; "Nothing matches"; quoted query/category in mono; **"Clear filters" `btn btn-secondary btn-md`** (`clearFilters` `:784`) | `:1470-1484` |
| 8 | FREE grid | per category `<section class="mb-8 sm:mb-section">`: header row (icon tile `h-7 w-7 rounded-inset border` inline `color: hue`, `borderColor: var(--color-border-base)`, `bg: var(--color-surface-inset)`; h3 `text-h2 uppercase` = category id; count `badge font-mono` inline `color/borderColor: hue`; `diff-rule flex-1`), then `stagger grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3.5 sm:gap-4` with inline `--stagger-step: 40ms`, `--stagger-dur: 350ms` | `:1486-1529` |

Note: `text-text-tertiary` (`:1445, 1455`) is **not a defined token** in `index.css` — it currently resolves to nothing (harmless; the fallback is an empty box with sr-only text).

#### 4.2.6 ChallengeCard (`:1742-1895`)
- **(b)** outer `h-full [perspective:1100px]` with inline `--i` = index (`:1776`, consumed by `.stagger > *` `index.css:1328-1331`); tilt wrapper with inline `transform: rotateX(var(--tilt-x)) rotateY(var(--tilt-y))`, `transition: transform ${diff.tiltMs}ms` (`:1777-1787`; pointer handler `:1756-1773` writes `--tilt-x/--tilt-y/--spec-x/--spec-y`); **`<button type="button" data-selflit="" data-diff={challenge.difficulty} className="card-interactive group relative flex h-full w-full flex-col overflow-hidden p-3.5 text-left">`** + solved extras `border-border-neon shadow-[0_0_14px_rgba(198,255,0,0.18)]` (`:1788-1805`). `data-selflit` excludes it from SurfaceLight; `data-diff` drives `[data-diff]` frame personalities (`index.css:1560-1636`).
- Decorations: category hairline (`:1807-1811`, inline gradient with `hue`), solved wash inline `rgba(198,255,0,0.06)` (`:1813-1819`), specular blob `group-hover:opacity-70` (`:1821-1828`).
- Content: icon tile + category `label-micro` inline `color: hue` (`:1830-1846`); points `font-mono text-h3 text-cyber-neon` + "pts" (`:1847-1850`); title `text-h3 … truncate group-hover:text-cyber-neon` (`:1853-1855`); badges row (`:1857-1870`): `badge ${DIFF_BADGE[difficulty]}`, `badge badge-solved` "Compromised" (Check), `badge badge-blood` "First blood open" (Droplet, when `solvedCount===0 && !isSolved`); footer (`:1872-1890`): Users icon + `solvedCount` "solve(s)"; right: solver name `text-status-solved` or first-blood name `text-blood` with `title`.
- **(c)** `challenge` from `public_challenges` via `useChallenges` (`hooks/useData.ts:104-130`, polled 5 min) mapped by `dbToChallenge` (`:92-108`); `solvedCount`/`firstBlood` from `get_solve_data` RPC (`:569-578`); `isSolved` = own or team solve (`:855-856`); `solvedBy` from `get_team_solves` RPC (`:542, 553-558`).
- **(e)** click → `play('tick')`, computes origin, `setSelectedChallenge` (`:1790-1797, 1523`). Keep it a `<button>` for keyboard focus.

---

## 5. Chained board — `src/components/chain/ChainedBoard.tsx` (lazy, `App.tsx:87`)
- **List** (`:96-165`): `grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3`; card `card-interactive group flex flex-col items-start gap-3 rounded-lg border border-border-subtle bg-surface-raised p-5` (note `rounded-lg` + explicit border override the `.card-interactive` defaults) wrapping a full-width `<button>` (`:106-140`) and a bottom row with "Enter chain" text button (`:143-148`) and optional "Briefing" `<a download target=_blank>` (`:149-159`, `safeHttpUrl`). Inside: eyebrow `{category} / chained`, title `text-h3 font-bold`, difficulty label inline `DIFF_COLOR[vm.difficulty]` (`:16-21` — `var(--color-diff-*, <tailwind-ish hex fallback>)`), description `line-clamp-2`, `MiniChain` (`:23-46`: solved dot `bg-cyber-neon shadow-[0_0_8px_rgba(198,255,0,0.6)]`, inactive `bg-surface-sunken ring-1 ring-border-subtle`; active segment **`bg-gradient-to-r from-orange-400 to-red-500 shadow-[0_0_8px_rgba(255,120,24,0.7)]`**), progress text + bar with inline gradient `#8fb800,#c6ff00,#ddff6b` (`:136`).
- **Empty** (`:77-94`): standard plate, `Layers` icon, "No chains here yet".
- **Selected** → `Suspense` fallback `flex h-[60vh] … Loader2 animate-spin "Initializing chain…"` → `ChainExperience` (`:58-75`).
- **(c)** `chainVMs` built in `App.tsx:460-469` from `public_chain_series`/`public_chain_members` (`hooks/useData.ts:142-172`) + solve sets; `buildChainSeriesVM` `chain/chainModel.ts:42-91`.

### 5.1 ChainExperience — `src/components/chain/ChainExperience.tsx:40-205`
- Root `overflow-hidden rounded-lg border border-border-subtle bg-black/70 backdrop-blur-xl` (`:94`). Header (`:96-123`): **Back** `btn btn-ghost btn-sm` `aria-label="Back to chains"` (`onBack`); eyebrow + title; "n ignited" pill **`bg-orange-500/15 text-orange-300`** (`:107-111`); "Download briefing" `btn btn-primary btn-sm` `<a download>` (`:112-116`); "Briefing" `btn btn-secondary btn-sm` opens readme dialog (`:117-121`).
- Stage (`:126-162`): horizontally scrollable `custom-scrollbar` box height `STAGE_HEIGHT` (200, `Chain2D.ts:32`); `<canvas>` drawn by `createChain2D` (steel strip + fire gif assets `src/assets/chain/*`); node chips are absolutely positioned `<button>`s (`w-[150px] … rounded-md border px-3 py-2 backdrop-blur-sm`, solved `border-border-neon bg-cyber-neon/10 shadow-[0_0_18px_rgba(198,255,0,0.25)]`, else `border-border-strong bg-surface-raised/90 hover:border-border-neon`), positioned by canvas callback writing `style.transform` (`:64-71`) — **the chip starts `opacity:0` inline and is revealed by JS** (`:146`); `disabled` when `!node.challenge`; `aria-label` with position/title/state; click → `play('open'); onOpenChallenge(id)`.
- Progress strip (`:165-173`) inline gradient `#8fb800,#c6ff00`; sr-only `<ol>` (`:176-180`).
- **Readme dialog** (`:182-202`): `fixed inset-0 z-[4000] … bg-black/70` `role="dialog" aria-modal aria-label="Chain briefing"`; panel `surface-raised relative max-h-[80%] w-full max-w-2xl overflow-y-auto rounded-lg border border-border-subtle p-6`; close `btn btn-ghost btn-sm absolute right-3 top-3`; download link; `README_PROSE` markdown (`:20-31`).
- Plays `'legendary'` when `activeSegmentCount` increases (`:83-89`).

---

## 6. B2R board — `src/components/b2r/B2RBoard.tsx` (lazy, `App.tsx:90`)
- **FREE sub-mode** (`:358-369`): grid of `BoxCard` (`:113-177`): `card-interactive group flex flex-col items-start gap-3 rounded-lg border p-5` + rooted `border-border-neon bg-cyber-neon/5` else `border-border-subtle bg-surface-raised`; eyebrow `{category} / b2r`; title with `Server` icon; difficulty inline `DIFF_COLOR`; "ROOTED" pill `bg-cyber-neon/15 … text-cyber-neon` (`:137-141`); description; **`BoxFlags`** (`:90-111`) = two `FlagRow`s (`:33-87`): `rounded-md border px-3 py-2` solved `border-border-neon bg-cyber-neon/10` else `border-border-subtle bg-surface-sunken`; icon circle (`User`/`Crown`); label "USER FLAG"/"ROOT FLAG"; points `{n}p`; state copy Captured/Captured by teammate/Unavailable/"Get a foothold"/"Escalate to root"; **"Submit user" `btn btn-sm btn-secondary` / "Submit root" `btn btn-sm btn-primary`** → `onOpenChallenge(challengeId)` (opens the ordinary ChallengeModal). Status line + progress bar (`:151-162`, inline gradient); optional "Briefing" download link (`:164-174`).
- **CHAINED sub-mode** (`:276-355`): series cards identical in structure to ChainedBoard (eyebrow `/ b2r chain`, "n machines", "x / y rooted"); selecting → `ChainExperience` whose node click opens the **box overlay** instead of a challenge (`:289-296`).
- **Box overlay** (`:247-273`): `fixed inset-0 z-[4500] … bg-black/70` `role="dialog" aria-modal aria-label="<title> flags"`, click-outside closes; panel `surface-raised relative w-full max-w-lg rounded-lg border border-border-subtle p-6`; close `btn btn-ghost btn-sm absolute right-3 top-3 aria-label="Close"`; `BoxFlags` whose submit closes overlay then opens the modal (`:269`).
- **Empty** (`EmptyBoard` `:179-196`): `Layers`/`Server` icon, "No B2R chains/boxes here yet".
- **(c)** `b2rBoxVMs`/`b2rSeriesVMs` `App.tsx:474-486` from `public_b2r_boxes/series/members` (`useData.ts:184-219`), `b2rModel.ts:32-121`.

---

## 7. Challenge modal — `src/App.tsx:2009-2615`
- **Frame** (`:2241-2274`): `fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6`; `.scrim` (click closes, `:2242-2249`); panel `motion.div role="dialog" aria-modal aria-label={title}` `surface-overlay relative w-full max-w-2xl overflow-hidden` with origin-based entrance (`:2256-2269`). Escape closes unless `submitting` (`:2131-2139`). `play('open')` on mount, `play('close')` on unmount (`:2078-2087`).
- **OperationIntro** (`:2277`; `src/components/OperationIntro.tsx`): Insane only; `.op-intro` pointer-transparent 780 ms (`:369`); sweep/label/rule classes `index.css:1651-1687`; nothing under reduced motion.
- **BreachConfirm** (`:2278-2282`; `src/components/BreachConfirm.tsx`): `.breach-root` (+`is-legendary`) over panel after a fresh solve; click dismisses (`onClick={onDone}` `:227`); shells/struts/wave/scan/plate classes `index.css:1163-1310`; `useCountUp(points, …, 0)` (`:209`); auto-dismiss 1.9 s / 2.5 s legendary / 0.9 s reduced (`:213`).
- **Tab bar** (`:2283-2304`): `flex items-center justify-between gap-3 px-3 sm:px-5 py-3 border-b border-border-base bg-surface-rail`; tabs `tab`+`is-active` with `aria-current`: "Challenge"; "Solves (n)" (count switches to `realSolveCount` once loaded); close `btn btn-ghost btn-sm btn-icon` `aria-label="Close challenge"`.
- **Body** `p-4 sm:p-6 md:p-8 max-h-[calc(100vh-10rem)] overflow-y-auto custom-scrollbar` (`:2306`).

### 7.1 Challenge tab (`:2307-2564`)
1. **Title block** (`:2310-2322`): category eyebrow with icon inline `color: hue`; h2 `text-h2 sm:text-h1 break-words`; points `font-mono text-h1 text-cyber-neon text-glow` + "points".
2. **Meta strip** (`:2325-2342`): `badge ${DIFF_BADGE}`; `badge badge-solved` Compromised; `badge badge-locked` Locked (`isLocked`); `badge` "n solves"; `badge` "By {author}"; `badge badge-live` "First Blood: {name}" (Zap) **or** `badge badge-blood` "First blood open".
3. `<hr className="divider my-6">`.
4. **Description** (`:2347-2353`): `surface-inset rounded-card p-4 sm:p-5 text-left` > `MARKDOWN_PROSE` (`:150-174`, arbitrary-variant Tailwind) > `ReactMarkdown remarkGfm`.
5. **Attachments** (`:2356-2412`): h3 `label-micro` "Attachments"; files as `<a target=_blank rel=noopener href={safeHttpUrl(url)}>` `group flex items-center gap-3 rounded-control border border-border-base bg-surface-card px-4 py-3 hover:border-border-neon hover:bg-surface-raised` with Download tile `bg-neon-wash text-cyber-neon`, label "Download Attachment [n]", size in MB; `connection_info` JSON links as `btn btn-outline btn-md btn-block justify-start gap-3` with `ExternalLink` (`:2397-2408`). JSON parse is try/caught (`:2359-2367`).
6. **Hints — "Strategic Intelligence"** (`:2415-2476`): each hint `overflow-hidden rounded-control border border-border-base bg-surface-card`. Three states: **unlocked+text** (`border-l-2 border-cyber-neon bg-neon-wash p-4`, Lightbulb, `:2425-2428`); **armed confirm** (`role="alertdialog" aria-labelledby` `border-l-2 p-4` inline `borderColor: var(--color-diff-hard)`; "Confirm decryption"; mono `> unlock_hint --cost n`; copy about team score; **"Abort" `btn btn-outline btn-sm`** and **"Decrypt −n pts" `btn btn-primary btn-sm autoFocus`** → `confirmHint`, `:2430-2447`); **locked button** (`flex w-full … p-4 text-left text-label uppercase text-text-muted hover:bg-surface-raised`, Lock, "Encrypted Intel Segment"/"Loading hint...", cost `badge badge-medium shrink-0 font-mono`, click arms if cost>0 else unlocks, `:2449-2458`). Spent summary (`:2464-2471`); `hintError role="alert"` (`:2472-2474`, from `handleUnlockHint` `:824-847`, RPC `unlock_hint`).
7. **Submit slot** (`:2479-2563`) — exactly one of:
   - **Solved** (`:2480-2493`): `flex items-center gap-3 rounded-card border border-border-neon bg-neon-wash p-5`; check in `rounded-pill bg-cyber-neon` with `text-neon-ink`; `successMsg || 'Operation compromised ✓'` + "by you/{solvedBy}".
   - **Locked** (`:2494-2498`): inline `borderColor: var(--color-border-danger)`, `bg: var(--color-diff-hard-wash)`; "Terminal Locked: Maximum Brute-Force Attempts Reached".
   - **ClosedPanel** (`submitClosed`, `:1932-1971`): waiting → Clock `text-diff-medium`, "Submissions open in HH:MM:SS" (`readout`), "Opens …"; ended → "Event Ended — Submissions Closed"; inactive → "No Event Running — Submissions Closed". Both use `rounded-card border border-border-base bg-surface-inset p-5`.
   - **Form** (`:2502-2561`): `<form ref data-stage={stage} className="surface submit-form p-4 sm:p-5">` with inline `--deny-shake/--deny-dur/--deny-fade` from `DENY_LADDER` (`:1912-1918`); `span.submit-trace` (`:2517`); `span.deny-mark` keyed on `denySeq` (`:2518`); `span.deny-stamp` "Access Denied" when `fade > 0.5` (`:2519-2521`); `<label class="field-label" for={flag-input-<id>}>Submit Access Key</label>`; `.submit-controls flex flex-col gap-2 sm:flex-row` > `<input type=text placeholder="FLAG{ACCESS_KEY}" className="input h-[2.875rem] flex-1 [is-invalid]" aria-invalid disabled={isLocked||submitting}>` + `<button type=submit className="btn btn-primary btn-lg shrink-0 [is-loading]" disabled>` "Execute"/"..."; below: `error role="alert" text-label uppercase text-diff-hard`; attempts meter `hidden sm:block h-1 w-20 … bg-surface-inset` fill `var(--color-diff-hard)` when `attemptsCritical` (`attempts >= max-5`) else `var(--color-border-strong)`; "Attempts n/max|∞" `label-micro`. The `.deny` class is toggled imperatively on the form (`:2092-2101`); stage CSS `index.css:1757-1851`.
   - **(c)** `submitFlag` → Edge Function `submit-flag` (`src/api/submitFlag.ts:16-74`); stage machine `:2141-2230` (`VALIDATE_MIN_MS` 620, `HOLD_MS` 260, `playValidating()`); `onAttempt` only from server counts (`:2171-2173`); `onSolve(id, fresh)` → `pulseChallenge`, state updates, milestones (`:1647-1687`). `maxAttempts<=0` = unlimited (`:2125`).

### 7.2 Solves tab (`:2566-2609`)
- `mx-auto max-w-md`; h3 `label-micro` "Operatives Solved (n)"; loading → sr-only + 4 `surface-inset … p-4` skeleton rows (`:2571-2580`); empty → `surface … py-16` Zap "No solves yet / Be the first to land this flag." (`:2581-2591`); rows `surface-inset flex items-center justify-between gap-3 p-4 text-small` with index, Zap for first, name `text-status-live` (first) or `text-cyber-neon`, badges `badge-live` "First Blood" (`hidden sm:inline-flex`), `badge-neon` "You", `badge-solved` "Teammate", `solved_at` (en-GB) (`:2593-2606`).
- **(c)** `supabase.rpc('get_challenge_solvers', {p_challenge_id})` on tab open (`:2103-2121`).

---

## 8. Scoreboard — `src/Scoreboard.tsx:379-1109`
- **Frame** `flex-1 w-full min-w-0 mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-8 sm:py-12` (`:711`).
- **Header** (`:713-779`): eyebrow with `Radio` "Pre-event"/"Standby"/"Live telemetry" (`:717`); h2 `text-h1` "Scoreboard"; gradient underline (`:720-724`). Right: status badge chain (`:728-744`): hidden→`badge-hard` EyeOff "Hidden"; frozen→`badge-medium` Lock "Final"(if ended)/"Frozen"; waiting→`badge-medium` Clock "Starts soon"; inactive→`badge-locked` "Inactive"; else `badge-live` "Live". Team count `badge badge-neon font-mono` (`:745-749`); status text with `<RelativeTime at={lastRefresh}/>` "Updated Ns ago" (`:750-762`); **refresh button** `btn btn-ghost btn-sm btn-icon` `aria-label="Refresh the scoreboard now"` `RefreshCw animate-spin` when busy (`:763-777`, throttled 8 s `:537-550`).
- **Hidden blackout** (`:782-800`): `surface p-10 sm:p-16 text-center`; icon tile `w-14 h-14 rounded-card border` inline danger colours; "Scoreboard hidden".
- **Podium** (`:805-845`): loading → 3 `surface p-5 space-y-3` skeletons (`aria-hidden`); `!podiumReady` (leader has 0 pts) → `surface` + `EmptyState` (Trophy, waiting vs not copy); else `section aria-label="Top three teams"` h3 `label-micro` "Podium" + `grid gap-4 sm:grid-cols-3 sm:items-end` of `PodiumCard` (`:167-235`: `surface relative overflow-hidden p-5 flex flex-col gap-3`, rank-1 `sm:order-2 sm:-translate-y-2` + inline `borderColor: var(--color-border-neon)`, `boxShadow: var(--shadow-e3), var(--shadow-neon)`; tone neon/text-secondary/cat-rev (`:170-173`); `RankMark` crown/medal (`:77-102`); hairline; points `font-mono text-h2`; bar `scaleX pct`; solves + `formatClock(last_solve)`).
- **Graph** (`:848-954`): `surface overflow-hidden`; header `px-4 sm:px-6 py-4 border-b border-border-subtle` with `TrendingUp` "Score progression", "Cumulative points, top 10 teams", "n series"; body `px-1 sm:px-3 pb-2 pt-4 h-[300px] sm:h-[380px] lg:h-[440px]`; loading → 8 skeleton bars (`:866-871`); empty → `EmptyState` Activity (`:872-879`); recharts `AreaChart` with per-series gradients from **hard-coded `COLORS` hex array** (`:17-20`), grid/axes using `var(--color-*)` strings (`:891-912`), tooltip `ChartTooltip` (`:135-164`, `surface-overlay px-3 py-2.5`), `Legend` with `label-micro` formatter.
- **"You" strip** (`:957-1047`, `mine && !loading`): `section aria-label="Your team's position" mb-4` > `surface flex flex-wrap items-center gap-x-6 gap-y-4 px-4 sm:px-6 py-4` inline `boxShadow: inset 2px 0 0 var(--color-neon), var(--shadow-e2)`; `badge badge-neon` "You"; team name; "outside the top N"; `Stat`s Place/Score/Solves/gap (`:368-377`); **"Team breakdown" `btn btn-secondary btn-sm`** `aria-expanded aria-controls="team-breakdown"` (`:981-991`). Breakdown panel `#team-breakdown` `surface mt-2 grid gap-0 overflow-hidden lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]` (`:995-1044`): "Members" column (header `border-b border-border-base bg-surface-rail px-4 py-2.5`, rows `divide-y`, dot colour by solves, mono) and "Who took what" (`max-h-[22rem] overflow-y-auto custom-scrollbar`, category dot inline `var(--color-cat-<cat>, var(--color-cat-misc))`, `+pts text-cyber-neon`, time); skeletons while busy. Data `:407-442` (`get_team_solves`, `safe_profiles`, `public_challenges`).
- **Standings** (`:1050-1103`): `section aria-label="Team standings"` > `surface overflow-hidden`; header "Standings" + "Ties broken by earliest solve"; **scroll box `max-h-[28rem] overflow-auto custom-scrollbar`**; `<table class="w-full min-w-[30rem] text-left border-collapse">` with sr-only `<caption>`, `thead sticky top-0 z-10` row `bg-surface-rail border-b border-border-base`, `th label-micro px-5 py-3.5` Place/Team/Last solve (`hidden md:table-cell`)/Solves/Score; loading → 5 skeleton rows; empty → `EmptyState` colSpan 5; rows `StandingsRows` (`:241-335`): `motion.tr layout="position"` **`className="standings-row …"` with `data-moved="up|down"` and `data-me`** (`:280-282`; CSS `index.css:1347-1368`), `RankMark plain={!scored}`, `RankDelta` (`:105-132`, colours status-solved/status-live), name (`text-cyber-neon font-semibold` for #1) + `badge badge-neon ml-2` "You", mini bar `max-w-[12rem] h-0.5` with `seriesColor(0)` for top 3 else `var(--color-border-strong)`, `AnimatedNumber` score.
- **(c)** `scoreboard_state` RPC (`:556-564`: `scores_hidden`, `masked`, `freeze_time`, `ended`), `team_scores` view top 10 (`:609-620`), `fetchMine` (`:625-638`), `get_score_progression` RPC (`:648-649`); cadences `STANDINGS_MS` 15 s / `GRAPH_MS` 120 s (`:495-496`) with jitter & visibility handling (`:498-529`).
- **Event status inputs** from App: `eventStatus`, `startTime` (`App.tsx:1534`).

---

## 9. Teams list — `src/TeamsList.tsx:44-291`
- Frame `flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14`; header eyebrow "Directory", h1 "Teams", `badge badge-neon` Trophy "{total} registered", `hr.divider mt-5` (`:112-123`).
- Hidden blackout (`:125-143`) "Team standings hidden" (same plate as scoreboard).
- Toolbar (`:148-170`): `<label sr-only for="teams-search">`; `<input id="teams-search" className="input w-full pl-9" placeholder="Search for matching teams">` (debounced 300 ms, server `ilike` prefix with escaping `:57, 90`); **search button `btn btn-primary btn-icon btn-md` `aria-label="Search teams"` has no `onClick` (decorative)** (`:164-169`).
- Table (`:173-246`): `surface overflow-hidden` > `overflow-x-auto custom-scrollbar` > `table w-full min-w-[19rem]`; header Team/Members/Score; loading → 5 `SkeletonRow` (`:27-42`); empty → `SearchX` "No teams found"; rows `motion.tr … hover:bg-surface-raised` with `TeamMonogram` (`:16-25`, `hidden sm:flex … shadow-well`), name `text-cyber-neon group-hover:text-neon-bright`, members with Users icon, points `font-mono text-body font-bold` + "pts" (`hidden sm:inline`).
- Pagination (`:249-280`): "Showing a–b of n [matching]"; buttons First/Prev/Next/Last `btn btn-ghost|btn-secondary btn-sm btn-icon` with `aria-label`/`title`, `disabled` at bounds, "Page x / y". `PAGE_SIZE` 50.
- Footer line "Ranked by total points" (`:282-285`).
- **(c)** `team_scores` counts and `.range()` pages (`:60-101`); `scoreboard_state` gate (`:85-86`). Team names are **not links** (no team public profile route exists).

## 10. Users list — `src/UsersList.tsx:71-369`
- Same frame/header/hidden/toolbar pattern (`:150-212`; search `#users-search`, decorative search button `:206-211`).
- Desktop table `hidden … sm:block` (`:216-277`): `#`, User, Solves, Country, Score; `RankBadge` (`:33-48`, `rankAccent` `:24-31`: #1 neon, #2 text-secondary, #3 **diff-medium** (differs from Scoreboard's cat-rev for bronze), else text-muted; `color-mix` borders), `Avatar` initial circle (`:50-57`), name `text-cyber-neon`.
- Mobile list `sm:hidden` (`:280-327`): rows with rank, avatar, name, Flag+solves, Globe2+country, points + "pts".
- Loading `SkeletonRow` (`:59-67`) inside `role="status" aria-label="Loading users"`; empty `UserX` "No users found".
- Pagination identical to Teams (`:331-362`).
- **(c)** `user_scores` view (`:88-134`).

## 11. Team profile — `src/TeamProfile.tsx:70-722`
- **Loading** (`:385-393`): `flex-1 flex flex-col items-center justify-center gap-4 px-6 py-24`; spinner `w-9 h-9 rounded-full border-2 border-border-strong border-t-cyber-neon animate-spin`; `label-micro role="status"` "Loading team...".
- **No team** (`:396-487`): centred `w-full max-w-md`; icon in `surface-raised rounded-full … shadow-e3` with `bg-neon-wash blur-xl` halo; eyebrow "Team", h2 `text-h1` "No Team Yet". `mode==='none'` → **"Create Team" `btn btn-primary btn-lg btn-block`** and **"Join Team" `btn btn-secondary btn-lg btn-block`** (`:416-427`). `create` → `surface p-gutter space-y-4`: `#team-name` input `maxLength=40` (+`is-invalid`), helper "2–40 characters", `FormError` (`:59-68`, `role="alert"` `border-border-danger bg-diff-hard-wash text-diff-hard`), "Cancel" `btn btn-ghost btn-md flex-1`, "Create" `btn btn-primary btn-md flex-1` `disabled={actionLoading||!teamName.trim()}` (`:429-456`). `join` → `#invite-code` input `font-mono tracking-code` `autoCapitalize=none` `maxLength=64`, Cancel/Join (`:458-484`). RPCs `create_team` / `join_team` (`:300, 315`), then `fetchTeam()`.
- **Has team** (`:491-720`): frame `flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-10 sm:py-14`.
  - Hero (`:493-511`): eyebrow "Team profile"; h1 team name; `badge badge-neon` Trophy "{rank}st/nd/rd/th place"; 3 `StatTile` (`:22-46`, `surface-inset flex items-center gap-3 px-4 py-3.5`) Rank/Points(accent, "pts")/Members.
  - **Invite section** (`section aria-label="Team invite code"` `surface p-gutter mb-8 sm:mb-section overflow-hidden`, `:514-580`): KeyRound tile `hidden sm:flex … border-border-neon bg-neon-wash shadow-neon`; "Invite link" `surface-inset flex items-center gap-2 px-3 py-2.5 overflow-x-auto custom-scrollbar` > `<code class="font-mono text-small text-cyber-neon whitespace-nowrap">` (origin-stripped link, `inviteLink` `lib/invite.ts:55-57`); warning with ShieldAlert; **"Copy link" `btn btn-md btn-primary` → `btn-success` "Copied" for 2 s** with `aria-label` swap (`:546-554`, `navigator.clipboard`); **"Share" `btn btn-secondary btn-md`** only when `navigator.share` exists (`:555-559`); sr-only `role="status" aria-live` (`:560-562`); "Or by code" row: `<code class="font-mono text-small font-bold text-text-secondary tracking-code">{invite_code}</code>` + **"Copy code" `btn btn-ghost btn-sm`** (`:567-579`). Code from `get_my_team_invite` RPC (`:122`).
  - **Members** (`:583-658`): h3 `text-h2` + count; `surface overflow-hidden` table `min-w-[19rem]` columns User Name/Solves/Points Contributed; empty row (Users icon, "No members"); rows with `MemberMonogram` (`:48-57`), name `text-cyber-neon group-hover:text-neon-bright`, `badge badge-neon` Crown "Captain"; footnote "* Team score counts each challenge once…"; `FormError` for `actionError`; **"Leave Team" `btn btn-ghost btn-sm text-text-muted hover:text-diff-hard`** (`:649-656`, `window.confirm` `:332`, RPC `leave_team`).
  - **Solves** (`:661-715`): `SolvesTable` (shared), **"Hints used"** table (`surface overflow-x-auto` > `table min-w-[520px]`, cost in inline `var(--color-diff-hard)`, explanatory arithmetic line, `:664-700`), `ProgressBars`, `ScoreChart` (if data). Empty → `surface px-6 py-16 text-center` Target "No solves yet" (`:705-714`).
  - Footer "Cyberhx Platform © 2026" (`:717-719`).
- **(c)** `fetchTeam` (`:96-279`): `profiles.team_id`, `public_teams`, `get_my_team_invite`, `get_team_solves`, `public_challenges`, `team_scores` row + rank count, `safe_profiles` roster, `user_scores`, `get_team_hint_unlocks`, `submissions` fail count. Category colours for ProgressBars from **hard-coded `COLORS`** (`:371`).

## 12. User profile — `src/UserProfile.tsx:104-399`
- Loading `ProfileSkeleton` (`:75-100`).
- Frame `flex-1` > `mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-8 lg:py-page` (`:203`).
- **Identity header** `surface relative overflow-hidden p-5 sm:p-gutter` (`:206-323`): hairline + blurred halo; avatar circle (`safeHttpUrl(avatar_url)` img or initial `font-mono text-h1 text-cyber-neon`), inline neon border/shadow; "Player" `badge … bg-surface-overlay` pinned (`:250-255`); eyebrow "Operator profile"; h1 username; badges: `badge-neon` Users "Team member", `badge-info` ShieldCheck "Admin", `badge` Globe2 country, `badge` Layers affiliation, `badge` CalendarDays "Since {date}" (`:265-296`); bio (`:298-302`); headline solves tile inline `var(--color-border-neon)`/`var(--color-neon-wash)` with `text-glow` (`:306-321`).
- **Stat rail** (`section aria-label="Performance summary"`, `:326-355`): 4 `StatTile` (`:29-73`, `surface relative overflow-hidden p-4 sm:p-5`, inline `--tile-accent` + `color-mix`) Solves/Failed/Accuracy/Categories.
- **Body** (`:358-391`): empty → `surface … py-16` Crosshair "No solves yet" + `badge badge-locked` "Awaiting first flag"; else `SolvesTable`, "Breakdown" divider row (`:380-384`), `ProgressBars`, `ScoreChart`.
- Footer "CyberHX · Operator record" (`:393-395`).
- **(c)** `submissions` joined to `challenges(title, category, points)` (`:120-125`), fail count (`:136-142`); `COLORS` hex (`:174`). Uses `matchMedia` directly for reduced motion (`:24-27`), not `useReducedMotion`.

## 13. Shared telemetry — `src/SharedComponents.tsx`
- `ProgressBars` (`:193-322`): `mb-8 sm:mb-section grid grid-cols-1 gap-4 lg:grid-cols-2`; two `section.surface p-5 sm:p-gutter`: "Submission accuracy" (`BlockHeader` `:52-74`, percentage readout, `Meter` `:103-145` `h-2.5 … rounded-pill border border-border-subtle bg-surface-inset shadow-well` + `mix-blend-overlay` tick overlay, `dl` Solves/Fails tiles `surface-inset`), "Category spread" (`Meter` + `LegendItem` `:148-168`). Empty plates (`EmptyPlate` `:77-100`).
- `SolvesTable` (`:328-448`): h3 `text-h2` Flag "Solves" + `badge badge-solved` "{n} captured"; empty `surface` > `EmptyPlate` Inbox; mobile `ul … md:hidden` of `SolveCard` (`:171-187`, `surface relative overflow-hidden p-4`, category left bar via `catColor` `:46-49`); desktop `hidden md:block` > `surface overflow-hidden` > `overflow-x-auto custom-scrollbar` > `table min-w-[36rem]` Challenge/Category/Value/[Solver]/Time, title `text-cyber-neon group-hover:underline`.
- `ScoreChart` (`:467-525`): `section.surface relative mb-8 sm:mb-section overflow-hidden p-5 sm:p-gutter`; recharts `AreaChart` with **literal `TOKEN` hex** (`:32-41`) and `#060b10` dot strokes (`:516-517`); `ChartTooltip` uses `.tooltip` class (`:457`); `isAnimationActive={false}`.

## 14. Settings — `src/Settings.tsx:82-476`
- Frame `flex-1 w-full max-w-4xl mx-auto px-4 sm:px-6 py-10 sm:py-12` (`:272`); header eyebrow "Account", h1 "Settings", intro (`:273-279`).
- **Sidebar nav** (`aside w-full lg:w-48 shrink-0` > `nav aria-label="Settings sections"` `flex lg:flex-col gap-1 overflow-x-auto custom-scrollbar rounded-card border border-border-subtle bg-surface-rail p-1.5 lg:sticky lg:top-6`, `:283-302`): two `tab` buttons `aria-current="page"` "Profile" (User icon) / "Security" (ShieldCheck; state id `tokens`).
- **Profile tab** (`:307-404`): `surface p-5 sm:p-gutter space-y-6`; `PanelHeader` (`:57-80`, IdCard "Operative Profile"); fields via `inp()` (`:110-150`, `field-label` + icon + `input pl-9` + hint `aria-describedby`): `#field-username`; **Email** disabled `#settings-email` `input pl-9 pr-10 cursor-not-allowed` with Lock and hover `role="tooltip"` `.tooltip` "Locked — contact an organiser to change it" (`:320-355`); Affiliation `#field-affiliation`; **Country `<select id="field-country" className="input appearance-none pl-9 pr-9">`** with `COUNTRIES` (`:362-381`); Website `#field-website` type=url; `feedback` banner (`role="status" aria-live`, inline ok/err colours, `:236-264`); footer "Changes apply immediately…" + **"Save Changes" `btn btn-primary btn-md btn-block sm:w-auto`** (`:395-402`, `handleProfileSave` `:171-195` → `updateProfile` `hooks/useAuth.ts:201-219`, validation `lib/validation.ts`).
- **Experience panel** (profile tab, `:411-419`): `surface p-5 sm:p-gutter space-y-5`; `PanelHeader` Volume2 "Experience"; `<SoundToggle variant="row"/>` (`SoundToggle.tsx:34-71`: `surface flex w-full items-center justify-between gap-4 p-4 … hover:bg-surface-raised` `aria-pressed`, icon tile, text, visual switch); `<FxToggle/>` (`FxToggle.tsx:161-206`: `surface p-4` `role="radiogroup" aria-label="Visual effects"`, 3 `role="radio" aria-checked` cards Cinematic/Calm/Off, active `border-border-neon bg-neon-wash`).
- **Security tab** (`:423-470`): `PanelHeader` KeyRound "Change Password"; Current Password `#field-current-password` + no-reset note (`:434-437`), New `#field-new-password`, Confirm `#field-confirm-new-password`; **Requirements** `surface-inset rounded-control p-4` with `Requirement` rows (`:37-54`); feedback; **"Update Password" `btn btn-primary btn-md btn-block sm:w-auto`** (`:461-468`, `handlePasswordChange` `:197-233` → `verify_current_password` RPC then `auth.updateUser`).

## 15. Admin — `src/components/admin/AdminDashboard.tsx`
### 15.1 Guards (`:907-971`)
- `loading || profileLoading` → `flex-1 flex items-center justify-center p-8` spinner `w-4 h-4 rounded-pill border-2 border-border-strong border-t-cyber-neon animate-spin` + "Verifying access..." (`:914-923`).
- `profileError` → `surface max-w-sm w-full p-8 text-center` "Could not verify your account" + **"Retry" `btn btn-secondary btn-md`** (`location.reload`, `:928-950`).
- not admin → `surface max-w-sm … p-8` Lock in danger tile, "Access Denied" (`:952-968`).
### 15.2 Shell (`AdminDashboardInner` `:974-1305`)
- Frame `flex-1 w-full min-w-0 max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-10`; header (`:1079-1107`): Shield in danger tile, h1 "Admin Panel", eyebrow "CyberHX Control Center"; **"Reset Event Scores" `btn btn-danger btn-md`** (`:1095-1102`, `confirm()` then `admin_reset_event` RPC via `resetEventScores`, `alert()` result).
- `StatsBar` (`:118-171`): 4 `surface relative overflow-hidden p-4 sm:p-5` tiles with per-tile tone hairline (cat-forensic/cat-crypto/neon/cat-web) — data `profiles` count, `teams` count, `get_challenges_count`, `submissions` count.
- **Tab strip** (`:1112-1127`): `mb-8 -mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto custom-scrollbar` > `role="group" aria-label="Admin sections"` `inline-flex w-max gap-1 p-1 rounded-control border border-border-subtle bg-surface-rail`; 8 `tab` buttons with `aria-pressed` and icons (`:1065-1074`).
- `OwnerFlagVault` mounted via `AnimatePresence` when `vaultFor` (`:1293-1302`).
### 15.3 Challenges tab (`:1130-1278`)
- Catalogue header + **"Add Challenge" `btn btn-primary btn-md`** (`:1139-1150`) or `ChallengeForm`.
- Desktop `TableFrame hidden md:block` (`:36-42` = `surface overflow-hidden` > `overflow-x-auto custom-scrollbar`) table `min-w-[860px]` Title/Category/Difficulty/Points/Max Attempts/Visible/Actions; category dot + `badge` inline `var(--color-cat-<cat>)`; `badge ${DIFF_BADGE}` (`:28-33`); **Visible toggle `chip [is-active]` `aria-pressed`** Eye/EyeOff Live/Hidden (`:1184-1190`, `admin_set_challenge_visibility`; B2R flag rows refused with `alert`, `:1005-1011`); actions: owner-only **vault** `btn btn-ghost btn-sm btn-icon text-cyber-neon` KeyRound (`:1194-1201`), **Edit** `btn btn-ghost btn-sm btn-icon` (`:1202-1205`), **Delete** `btn btn-ghost btn-sm btn-icon text-diff-hard hover:text-danger-fg` (`:1206-1209`, `confirm`, `admin_delete_challenge`, storage sweep `:1037-1046`). Empty `EmptyState` (`:56-69`). Mobile cards `surface p-4` (`:1224-1276`).
- **ChallengeForm** (`:182-902`): `surface p-5 sm:p-gutter lg:p-8 mb-8`; header tile Edit3/Plus, title "Edit Challenge"/"New Challenge", `badge badge-info|badge-neon` "Editing"/"Draft" (`:530-543`). Sections via `FormSection` (`:88-113`): **Placement** `role="radiogroup"` 4 cards Free/Chain/B2R Free/B2R Chain (`:559-577`, create only) + chain/B2R series `select.select` (`#chal-chain-series`, `#chal-b2r-series`) + B2R explainer; **Identity** (Title*, Author, Category `#chal-category` select, Difficulty `#chal-difficulty` select); **Scoring & limits** (Points/User flag points, Root flag points `#chal-root-points`, Max Attempts, Tags); **Description** `textarea#chal-description` `textarea min-h-[9rem]`; **Flag** danger panel (inline `var(--color-border-danger)`/`var(--color-diff-hard-wash)`, `#chal-flag`, `#chal-root-flag`, `flagClobbered` alert `:671-685`), **Visible** checkbox `#visible` `accent-cyber-neon` + `badge badge-solved|badge-locked` Live/Hidden (`:708-717`); **Hints** (+Add Hint `btn btn-outline btn-sm`, rows `surface-inset p-3 sm:p-4` with `badge` "Hint n", remove `btn btn-ghost btn-sm btn-icon text-diff-hard`, `textarea#hint-text-i`, `input#hint-cost-i`); **Attachments** (hidden `input#chal-files-<id>` `sr-only` + `<label class="btn btn-outline btn-sm cursor-pointer">Add files`, rows `surface-inset` with `badge badge-solved` "Uploaded" / `badge` "Uploads on save", remove buttons, `fileError role=alert`); **Resource Links** (+Add Link, label/url inputs `#link-label-i`/`#link-url-i`). Error `role="alert"` (`:873-882`); footer **"Save Challenge" `btn btn-primary btn-md [is-loading]`**, **"Cancel" `btn btn-ghost btn-md`** (`:883-899`). RPCs: `admin_upsert_challenge`, `admin_upsert_b2r_box`, `admin_set_chain_members`, `admin_set_b2r_members`, `hints` table, `challenge_files` + storage bucket `challenge-files` (`:258-327`).
### 15.4 Chains tab — `ChainManager.tsx:197-396`
- Master toggle `surface flex … rounded-lg border border-border-subtle p-5` with **"Enable/Disable Chain Experience" `btn btn-md btn-primary|btn-danger`** (`:214-221`, `admin_set_chain_experience`). Series list (`:226-268`): **"New chain" `btn btn-primary btn-sm`**; rows `rounded-lg border p-3` (selected `border-border-neon bg-cyber-neon/5`), pills Published (`bg-cyber-neon/15 text-cyber-neon`)/Draft (`bg-surface-sunken`), publish toggle & delete icon buttons. Editor (`:271-370`, `rounded-lg border border-border-subtle bg-surface-raised p-5`): Name/Category/Difficulty/Display order, Short description, Briefing file URL, Inline briefing textarea, **Chain order** `select select-sm w-56` "+ Add challenge…", ordered list with up/down/remove `btn btn-ghost btn-sm btn-icon`; **"Save draft" `btn-secondary`, "Save & publish" `btn-primary`, "Preview chain" `btn-ghost`**. Preview modal (`:374-394`, `z-[5000] bg-black/80`, range input "Simulate solved", `ChainExperience`). Uses **`text-orange-400`** (`:381`).
### 15.5 B2R tab — `B2RManager.tsx:275-583`
- Master toggle "Enable/Disable B2R" (`:293-296`, `admin_set_b2r_enabled`); error strip (`:299`); Boxes list (`:304-347`, pills Published/Draft/chained/free, user/root points); Series list + **"New B2R chain"** (`:350-387`); Box editor (`:391-468`: Name/Category/Difficulty/Display order, Description, Briefing URL, USER FLAG / ROOT FLAG panels `rounded-md border border-border-subtle bg-surface-sunken p-3` with points, Max attempts, Published checkbox, **"Save box" `btn btn-primary btn-md`**); Series editor (`:471-558`) mirrors ChainManager; preview modal (`:561-581`).
### 15.6 Users tab (`:1312-1649`)
- Title "Players" + policy copy; search `input w-full pl-9` `aria-label="Search players"` + clear (`:1419-1436`); table `min-w-[880px]` #/Username/Email/Role/Points/Solved/Status/Action: banned name `line-through text-diff-hard`; `badge badge-solved` Shield "Owner"; **role `select.select w-[8.5rem] py-1.5`** `aria-label="Role for …"` (`admin_set_user_role`, `confirm`); `badge badge-hard|badge-solved` Banned/Active; **"Hand over" `btn btn-outline btn-sm`** (owner only, `prompt()` username, `admin_transfer_ownership`); **Ban/Unban `btn btn-danger|btn-success btn-sm`** (`admin_set_user_ban`, `confirm`), disabled with Lock for owner/admins. Mobile cards (`:1536-1614`); pagination (`:1617-1646`, client-side 50/page). Data `admin_list_users` RPC.
### 15.7 Teams tab (`:2471-2901`)
- Search (`aria-label="Search teams"`) + **"Sort by rank" toggle `btn btn-sm btn-primary|btn-secondary`** (`:2660-2666`); table `min-w-[720px]` (rows clickable → `setSelected`, `badge badge-neon` "Selected", rank `text-cyber-neon` for top 3, status badge, protected `badge badge-neon` Owner/Admin, `banControl` Ban/Unban); mobile cards; pagination; **detail `<aside class="surface p-5 flex flex-col gap-4 min-w-0 lg:sticky lg:top-6">`** (`:2803-2897`): close button, `dl.surface-inset` Rank/Score/Solves/Status/Invite Code (`admin_team_invite` RPC, masked `••••••••` until loaded)/Members/Created; members list `max-h-56 overflow-y-auto custom-scrollbar` (`admin_team_members`), `badge badge-neon` Captain; `StatusLine`; "Danger zone": **Ban/Unban Team `btn btn-danger|btn-success btn-sm btn-block`**, **Delete Team `btn btn-danger btn-sm btn-block`** (`confirm`, `admin_delete_team`).
### 15.8 Submissions tab (`:1654-1747`)
- Table `min-w-[820px]` User/Challenge/Submitted (flag + hash prefix, `title` attr full)/Result (`badge badge-solved|badge-hard` "✓ Correct"/"✗ Wrong")/Time; mobile cards; empty Inbox. Data `admin_list_submissions` (limit 100).
### 15.9 Notifications tab (`:1752-1861`)
- `grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]`; form `surface p-5 sm:p-gutter space-y-5`: Megaphone header "Broadcast"; **type chips `chip` + `typeColors[t]`** (Tailwind utility strings `bg-status-info-wash text-status-info border-status-info/40` etc., `:1784-1789`) `aria-pressed`; `#notif-title` input; `#notif-message` textarea; `StatusLine` (`:72-85` — **colour decided by `msg.startsWith('❌')`**; copy prefixes are load-bearing); **"Send to All Users" `btn btn-primary btn-lg btn-block`** (`notifications.insert`). History (`:1837-1858`): "Recent Notifications" `label-micro`, cards `relative rounded-card border p-3.5 pr-10 ${typeColors}` with delete `btn btn-ghost btn-sm btn-icon absolute top-2 right-2` (`aria-label="Delete notification: …"`).
### 15.10 Event tab (`:1866-2464`)
- Loading `surface max-w-2xl p-gutter` skeletons (`:2095-2102`). Frame `max-w-2xl space-y-6` > `surface p-5 sm:p-gutter`:
  - Header Settings2 "Event Settings" + status `badge badge-live|badge-locked|badge-info` from `status` string (`:2107, 2122-2124`: 'Inactive' / 'Active (no time set)' / '⏳ Scheduled' / '🏁 Ended' / '🟢 LIVE').
  - `#event-name` input; two `DateTimeField` (`#event-start`, `#event-end`; component `src/components/DateTimeField.tsx:266-328` — `input type=datetime-local className="input w-full cursor-pointer pr-10"` + CalendarClock button `tabIndex=-1` calling `showPicker()`, preview line with timezone).
  - **Switches** (`:2151-2180`): checkboxes `#active` Event Active, `#registration` Registration Open, `#allow-team-changes`, `#allowlist-only` Restrict Play to Allowlist (`accent-cyber-neon`, wrapper `rounded-control border border-border-subtle bg-surface-inset px-4 py-3`).
  - **Registration Allowlist** (`:2183-2207`): raw `textarea` (not `.textarea`), **"Add to allowlist" `btn btn-secondary btn-md`** (`admin_allowlist_add`, count `admin_allowlist_count`).
  - **Scoreboard freeze** (`:2210-2252`): panel inline colours by `freeze_scoreboard`; **"Freeze Scoreboard"/"Unfreeze Scoreboard" `btn btn-md btn-primary|btn-secondary`** (`admin_set_scoreboard_freeze`, `confirm`). **Hide** (`:2255-2288`): **"Hide Scoreboard" `btn-danger` / "Show Scoreboard" `btn-secondary`** (`admin_set_scoreboard_hidden`). Auto-freeze notes (`:2290-2301`).
  - **Clock / Pause** (`:2305-2351`): panel inline `rgba(224,179,74,0.45)` when paused; `badge badge-medium` "Paused" / `badge badge-neon` "Running"; **"Pause Event" `btn-danger` / "Resume Event" `btn-primary`** (`admin_set_paused` with optional `p_message`); pause note `input` `aria-label="Message shown to players while paused"` (`:2342-2349`). **Quick extend** +15/+30/+60 `btn btn-outline btn-sm` (`:2353-2364`, direct `event_settings.update`).
  - **"Save Event Settings" `btn btn-primary btn-md`** + `StatusLine` (`:2367-2374`; diff-only patch `:1980-1999`).
  - **Start a new event** (`:2377-2460`, `border-t-2` inline danger): `#new-event-name` (required, `maxLength=80`), 3 checkboxes `#cc/#ct/#cn`, `#confirm-new-event` typed "START NEW EVENT" (disabled until name), **"Start New Event" `btn btn-danger btn-md`** (exports CSV first via `lib/scoreboardExport.ts:326-392` then `admin_start_new_event`), owner-only **"Export scoreboard (CSV)" `btn btn-secondary btn-md`**.
### 15.11 OwnerFlagVault — `OwnerFlagVault.tsx:52-265`
- `fixed inset-0 z-[120]`; `.scrim`; `role="dialog" aria-modal aria-label="Owner vault — …"` `surface-overlay relative w-full max-w-lg overflow-hidden`; header `border-b border-border-base bg-surface-rail px-5 py-4` Shield tile + close `aria-label="Close vault"`; views: loading skeleton (`role=status`), **flag** (`surface-inset flex items-center gap-3 rounded-inset p-4` > `<code id="vault-flag-value" class="… select-all break-all font-mono text-body text-cyber-neon">` + **"Copy" `btn btn-secondary btn-sm`** with fallback selection, "Closing in Ns" 45 s auto-close), **missing** (explanation + `#vault-capture` input + **"Verify & store" `btn btn-primary btn-lg`**, Enter submits, `captureError role=alert`), **error**. RPCs `owner_reveal_flag`, `owner_capture_flag`. Escape closes.

## 16. Header utilities & environment components
- **EventClock** (`src/components/EventClock.tsx:30-71`): `null` when `inactive` or no target; `.event-clock` pill (`index.css:2032-2046`) with `data-tone="paused|live|urgent"`; copy "HOLD {elapsed}", "CLOSED", "T−{left}", "{left}"; `title` and `aria-label`. Presentational except the state→text mapping.
- **SoundToggle icon** (`SoundToggle.tsx:74-85`): `btn btn-ghost btn-sm btn-icon text-cyber-neon|text-text-muted` `aria-pressed aria-label title`; `play('open')` only when turning on.
- **MotionToggle** (`MotionToggle.tsx:110-142`): same button shape, Orbit/CircleOff; flips `fx` between `off` and remembered level.
- **AmbientBackground** (`AmbientBackground.tsx:466-553`): `aria-hidden` `.ambient-root` `data-mode="high|medium|static"` with inline `--ambient-grid-opacity`; layers `.ambient-wash`, `.ambient-grid` (static only), `<canvas class="ambient-canvas">` (WebGL lattice `environment/lattice.ts`), `.ambient-veil`, `.ambient-vignette` (`index.css:952-1007`). Entirely decorative; tier from `environment/performance.ts:434-482`.
- **SurfaceLight** (`SurfaceLight.tsx:40-109`): writes `--mx/--my/--tx/--ty` + `data-tilt` onto `.holo`, `.card-interactive`, `.surface-overlay` not `[data-selflit]` (`:34-38`). Any skin that renames these classes loses the effect but not function.
- **CursorRing** (`CursorRing.tsx:136-174`): `.cursor-ring` with `data-active/data-hot`; hot selector `a, button, [role="button"], summary, label[for], select, .btn, .card-interactive, .tab, .chip` (`:133-134`). Custom SVG cursor on `html, body` and interactive selectors for `(pointer: fine)` (`index.css:1472-1487`).
- **MagneticElement** (`MagneticElement.tsx:215-280`): `.magnetic` inline-block wrapper (only the auth CTA uses it).
- **AnimatedView** (`AnimatedView.tsx:306-342`): `flex flex-1 w-full min-w-0` motion wrapper; scroll-to-top + warp on view change.

---

## 17. Mappings a skin must reproduce exactly (or deliberately re-skin while keeping keys)

### 17.1 Category → lucide icon (`src/App.tsx:126-137`, fallback `Boxes` at `:1318, 1489, 1745, 2235`)
| category | icon | hue token (`catVar` `App.tsx:140`; `index.css:92-101`) |
|---|---|---|
| web | `Globe` | `--color-cat-web` #4fb3a4 |
| crypto | `KeyRound` | `--color-cat-crypto` #8e86d6 |
| steg | `Image` (as `ImageIcon`) | `--color-cat-steg` #c97fa0 |
| rev | `Binary` | `--color-cat-rev` #cfa15c |
| pwn | `Bug` | `--color-cat-pwn` #d96a5c |
| forensic | `Fingerprint` | `--color-cat-forensic` #6d9fd4 |
| osint | `Search` | `--color-cat-osint` #8fb573 |
| mobile | `Smartphone` | `--color-cat-mobile` #e0894f |
| b2r | `Server` | `--color-cat-b2r` #e05a8d |
| misc | `Boxes` | `--color-cat-misc` #93a1ad |
The key order of `CATEGORY_ICON` is also the **chip/section display order** (`App.tsx:768-770`). `SharedComponents.catColor` (`:43-49`) and Scoreboard breakdown (`:1033`) use the same `--color-cat-*` with `misc` fallback. Admin tables use `var(--color-cat-${c.category})` **without** fallback (`AdminDashboard.tsx:1171, 1176, 1230, 1234`).

### 17.2 Difficulty → style
| tier | badge class (`difficulty.ts:49-97`, `App.tsx:142-147`, `AdminDashboard.tsx:28-33`) | hue token | `[data-diff]` frame behaviour (`index.css:1560-1636`) | tilt/stagger (`difficulty.ts`) | chain `DIFF_COLOR` fallback hex (`ChainedBoard.tsx:16-21`, `ChainExperience.tsx:33-38`, `B2RBoard.tsx:25-30`) |
|---|---|---|---|---|---|
| Easy | `badge-easy` | `--color-diff-easy` #7ecb8f | hover-only hairline | tilt 2.5/3°, 260 ms; stagger 62/460 | `#7dd3fc` |
| Medium | `badge-medium` | `--color-diff-medium` #e0b34a | 9 s breathe (`data-tier=high`) | 4/5°, 190 ms; 48/400 | `#fcd34d` |
| Hard | `badge-hard` | `--color-diff-hard` #e0705f | 2.6 s charge + inner edge | 6/7.5°, 120 ms; 36/340 | `#fb923c` |
| Insane | `badge-insane` | `--color-diff-insane` #b98cf7 | 1.9 s charge + 9 s shear + violet bloom; OperationIntro; legendary BreachConfirm; `play('legendary')` | 8/9.5°, 90 ms; 26/300 | `#c084fc` |
Unknown tier → `profileFor` falls back to Medium (`difficulty.ts:107-109`); `DIFF_BADGE[...] ?? ''`. Rail hue uses `var(--color-diff-${id.toLowerCase()})` (`App.tsx:1088, 1378`). Mood lean per tier `mood.ts:175-180`.

### 17.3 Badge class catalogue (`index.css:617-654`) and every use site
| class | meaning | used at |
|---|---|---|
| `badge` (base) | neutral pill | author/solves meta `App.tsx:2329-2332`; UserProfile meta `:279-295`; admin Hint n/Link n/Uploads on save `:740, 811, 845`; admin category `:1176, 1234`; UserProfile "Player" `:252` |
| `badge-neon` | accent | Team Required `App.tsx:1421`; "You" `App.tsx:2601`, `Scoreboard.tsx:298, 970`; counts `Scoreboard.tsx:746`, `TeamsList.tsx:116`, `UsersList.tsx:158`; rank/Captain `TeamProfile.tsx:498, 622`; Team member `UserProfile.tsx:267`; admin Draft/Selected/Owner-Admin/Captain/Running `AdminDashboard.tsx:540, 2693, 2713, 2860, 2319`; `TeamProfile` captain |
| `badge-easy/medium/hard/insane` | difficulty | cards/modal/admin (17.2) |
| `badge-medium` (also) | warning/paused/frozen/waiting/hint cost | `App.tsx:881, 1048, 2457`; `CommandHeader.tsx:400`; `HoldScreen.tsx:100`; `Scoreboard.tsx:733, 737`; `AdminDashboard.tsx:2319`; notif warning `App.tsx:235` |
| `badge-hard` (also) | ended/hidden/banned/wrong/danger | `App.tsx:882, 236`; `CommandHeader.tsx:403`; `Scoreboard.tsx:729`; admin Banned/Wrong `:1488, 1555, 1698, 1725, 2709, 2751, 2833` |
| `badge-solved` | solved/success/active/verified | `App.tsx:1860, 2327, 2602, 234`; `AuthPage.tsx:762`; `SharedComponents.tsx:336`; admin Live/Uploaded/Owner/Active/Correct `:714, 799, 1463, 1488, …` |
| `badge-locked` | inactive/locked/standby/hidden/pending | `App.tsx:882, 2328`; `CommandHeader.tsx:402, 404`; `AuthPage.tsx:637, 762`; `Scoreboard.tsx:741`; `UserProfile.tsx:375`; admin Hidden/Inactive `:714, 2122` |
| `badge-live` | live / first blood taken | `App.tsx:880, 2334, 2599`; `CommandHeader.tsx:401`; `Scoreboard.tsx:743`; admin LIVE `:2122` (pulsing dot via `::before`) |
| `badge-info` | info/admin/editing/scheduled | `App.tsx:233`; `UserProfile.tsx:273`; `AdminDashboard.tsx:540, 2122` |
| `badge-blood` | first blood open | `App.tsx:1866, 2338` (pulsing Droplet) |

### 17.4 Other colour maps
- Notification type → badge: `App.tsx:232-237`; → admin Tailwind strings `AdminDashboard.tsx:1784-1789`.
- Milestone tone → tokens: `MilestoneBanner.tsx:87-91`.
- Rank marks: Scoreboard #1 neon / #2 text-secondary / #3 **cat-rev** (`Scoreboard.tsx:85-88, 170-173`); UsersList #3 **diff-medium** (`UsersList.tsx:24-31`).
- Event status → `eventBadgeClass`/`eventLabel` (`App.tsx:879-886`); → CommandHeader badges/tones (`CommandHeader.tsx:381-404`); → EventClock `data-tone`; → Scoreboard badges (`Scoreboard.tsx:728-744`); → admin status string (`AdminDashboard.tsx:2107`).
- Mood per view (`App.tsx:617-623`).
- Sound names (`audio/AudioManager.ts:202-`): `tick`, `open`, `close`, `success`, `legendary`, `failure`, `milestone` + `playValidating()`; call sites: card click `App.tsx:1791`, mode tabs `:1228, 1238, 1264`, modal mount/unmount `:2079-2081`, solve `:2197`, failure `:2215, 2228`, milestone `:1684`, invite `:374`, chain node `ChainExperience.tsx:136`, ignition `:86`, SoundToggle on `:31`.

### 17.5 Literal (non-token) colours that a theme cannot override via CSS variables
- recharts: `Scoreboard.tsx:17-20` (`COLORS`), `SharedComponents.tsx:32-41` (`TOKEN`), `:516-517` (`#060b10`); `TeamProfile.tsx:371`, `UserProfile.tsx:174` (`COLORS`).
- SVG: `AuthPage.tsx:60-71` (`#c6ff00` radar), Google logo `:907-910` (brand, keep).
- Tailwind off-palette utilities: `emerald-*` (`AuthPage.tsx:118, 442-447`), `orange-400/red-500/orange-500/orange-300` (`ChainedBoard.tsx:37`, `ChainExperience.tsx:108`, `B2RBoard.tsx:212`, `ChainManager.tsx:381`, `B2RManager.tsx:568`), `bg-black/70|80` (`ChainExperience.tsx:94, 183`, `B2RBoard.tsx:249`, `ChainManager.tsx:375`, `B2RManager.tsx:562`).
- Inline rgba: `App.tsx:1047, 1803, 1817`; `AdminDashboard.tsx:2312`; chain progress gradients `ChainedBoard.tsx:136`, `ChainExperience.tsx:171`, `B2RBoard.tsx:159, 336`; shadows `ChainedBoard.tsx:30, 37`, `ChainExperience.tsx:142`, `B2RBoard.tsx:205, 212`; `index.css` hard-codes `rgba(198,255,0,…)` in `.btn-primary`, `.card-interactive::before`, `.holo::before`, depth hairline, breach, cursor SVG, deny-stamp etc.
- Fonts: Google Fonts import `index.css:1`; `index.html:43` `theme-color #060b10`.

---

## 18. Event status matrix — every UI site that reads `eventStatus` / `is_paused` / scoreboard state

| Signal | Where it changes UI | Lines |
|---|---|---|
| `inactive` | `canSeeChallenges=false` (non-admin) → "Event is not active yet" plate; board tools hidden; EventClock hidden; sidebar badge `badge-locked` "Inactive"; CommandHeader "Offline"; ClosedPanel "No Event Running"; Scoreboard "Standby"/`badge-locked`/"No event running" | `App.tsx:876, 1408-1418, 1208, 879-886`; `EventClock.tsx:37`; `CommandHeader.tsx:404, 418`; `App.tsx:1967`; `Scoreboard.tsx:704, 717, 741, 760` |
| `waiting` | `canSubmit=false` (non-admin) → ClosedPanel countdown; sidebar "Starting Soon" `badge-medium` + "Starts …"; CommandHeader "Standby" + "Opens …"; EventClock "T−…"; Scoreboard "Pre-event", `badge-medium` "Starts soon", "Opens …", podium/graph waiting copy; refetch on waiting→live | `App.tsx:872, 1944-1961, 1155-1159`; `CommandHeader.tsx:402, 411-414`; `EventClock.tsx:55-69`; `Scoreboard.tsx:703, 717, 737, 758, 820-824, 876-877`; `App.tsx:748-756` |
| `live` | submit form shown; sidebar `badge-live` "Live" + "Ends …"; CommandHeader "Live" + countdown (red <1h); EventClock remaining (`data-tone=live|urgent`) | `App.tsx:880, 1150-1154`; `CommandHeader.tsx:401, 424-442`; `EventClock.tsx:59-63` |
| `ended` | ClosedPanel "Event Ended"; sidebar `badge-hard` "Ended"; CommandHeader "Closed"; EventClock "CLOSED"; server `eventEnded` message | `App.tsx:1967, 882`; `CommandHeader.tsx:403, 417`; `EventClock.tsx:48-54`; `submitFlag.ts:46-48` |
| `is_paused` | non-admin: **entire content area replaced by HoldScreen(paused)** (all views); admin: amber banner; `canSubmit=false` for non-admin; CommandHeader "Paused" badge/tone/copy, countdown hidden; EventClock "HOLD"; refetch on resume; admin Event tab Clock panel | `App.tsx:1057-1058, 1044-1055, 872`; `CommandHeader.tsx:378, 382, 400, 415`; `EventClock.tsx:39-47`; `App.tsx:737-746`; `AdminDashboard.tsx:2305-2351` |
| `scores_hidden` | Scoreboard blackout; TeamsList/UsersList blackout; "Hidden" badge | `Scoreboard.tsx:567-572, 728-731, 782-800`; `TeamsList.tsx:86, 125-143`; `UsersList.tsx:114, 167-185` |
| `masked` (frozen) + `ended` | `badge-medium` Lock "Frozen"/"Final"; status text; skip heavy fetch | `Scoreboard.tsx:732-735, 753-756, 578` |
| `is_admin` | sees board regardless of status, Admin tab, paused banner, B2R tab preview "off" pill, vault (owner) | `App.tsx:872, 876, 941, 1044, 421, 1242`; `AdminDashboard.tsx:1194` |
| `teamBanned` | disqualified alert | `App.tsx:1170-1190` |
| `needsTeam` | "Join or Create a Team First" (hides board tools) | `App.tsx:875, 1419-1430, 1208` |
| `chain_experience_enabled` / `b2r_enabled` | mode tablist appears; FREE board excludes chained/B2R challenges; falls back to free when disabled | `App.tsx:410-431, 492-509, 1210-1246` |

---

## 19. CSS classes/attributes that carry behaviour (not just looks)

| Hook | Consumed by | Why it must survive |
|---|---|---|
| `.page-shell` | stacking above `.ambient-root` | without it content sits under the fixed canvas (`index.css:946-949`) |
| `data-tier` on App root | gates idle `[data-diff]` animations | `index.css:1591, 1606, 1630` |
| `data-diff`, `data-selflit` on ChallengeCard | frame personalities; SurfaceLight exclusion | `index.css:1560-1636`; `SurfaceLight.tsx:34-38` |
| `.holo`, `.card-interactive`, `.surface-overlay` + `data-tilt`, `--mx/--my/--tx/--ty` | SurfaceLight | `SurfaceLight.tsx:34-38, 58-62` |
| `.btn/.card-interactive/.tab/.chip` + native selectors | CursorRing hot test, custom cursor | `CursorRing.tsx:133-134`; `index.css:1476-1480` |
| `.is-active` (`tab`, `chip`, `rail-item`), `.is-loading` (`btn`), `.is-invalid` (`input`), `:disabled` | state styling | `index.css:437-452, 566-571, 688-703, 769-774, 823-828` |
| `.stagger > *` + `--i`, `--stagger-step`, `--stagger-dur` | card entrance | `App.tsx:1508-1512, 1776`; `index.css:1328-1336` |
| `.submit-form[data-stage]`, `.submit-trace`, `.submit-controls`, `.deny`, `.deny-mark`, `.deny-stamp`, `--deny-*` | submit cinematic & wrong-flag ladder | `App.tsx:2502-2521`; `index.css:1757-1851` |
| `.standings-row[data-moved][data-me]` | rank movement marks | `Scoreboard.tsx:280-282`; `index.css:1347-1368` |
| `.event-clock[data-tone]` | clock colour | `EventClock.tsx:42, 63`; `index.css:2044-2046` |
| `.access-root/.access-step[data-state]` | locks auth form; step colours | `AccessSequence.tsx:222-268`; `index.css:1374-1456` |
| `.breach-*`, `.is-legendary`, `.op-intro-*`, `.milestone-*`, `.hold-*`, `.boot`, `.cursor-ring[data-active/hot]`, `.magnetic`, `.readout`, `.tap-target`, `.board-kbd` (hidden via `.input:focus ~ .board-kbd`), `.board-chips` | component-specific | see sections above |
| `.auth-scale` | redefines `--text-*` tokens on the auth card | `index.css:605-614` |
| `.scrim` | modal backdrop + click-to-close targets | `App.tsx:2248, 1559`; `OwnerFlagVault.tsx:139` |
| `@media (prefers-reduced-motion: reduce)` block | accessibility contract | `index.css:1938-1982, 2061-2065` |
| `:focus-visible` ring | keyboard a11y | `index.css:200-204, 228-234` |
| `.tooltip` positioned by parent `group-hover` | Settings email lock | `Settings.tsx:345-350` |
| **Unused but defined**: `.nav-link-active`, `.scan-in`, `.uplink-dot`, `.kbd` (only `.board-kbd` used) | safe to restyle/remove | `index.css:831-846, 1115-1118, 2022-2031` |
| **Undefined but referenced**: `text-text-tertiary` | no-op | `App.tsx:1445, 1455` |

---

## 20. Consolidated business-critical controls (must work byte-for-byte)

**Auth:** Sign In/Register tabs; username/email/password inputs (ids, `autoComplete`, `type`, `minLength`); show/hide password; Turnstile mount `div ref` + badge + "Try again"; submit (`disabled={loading || !captchaToken}`); Continue with Google; mailto links; terms link (new tab); AccessSequence lock.
**Header:** brand → challenges; 4 nav tabs (+Admin); Team/Profile/Settings/Log out; hamburger + mobile menu (all 8 buttons); NotificationBell open/close/mark-read; SoundToggle; MotionToggle; EventClock text.
**Board:** rail (5 buttons) + mobile dropdown; mode tablist (Free/Chained/B2R) + B2R sub-tabs; search input (+Escape, clear, `/` hotkey); category chips (toggle semantics `:1324`); "Go to Teams"; "Clear filters"; ChallengeCard click; Chained: Enter chain, Briefing download, Back, Download briefing, Briefing dialog + close, node chips (disabled state); B2R: Submit user/root, Briefing, box overlay + close, Enter chain.
**Modal:** Challenge/Solves tabs; close (button, scrim, Escape); attachment links (`target=_blank`, `safeHttpUrl`); resource links; hint arm → Abort / Decrypt; flag input + Execute (disabled while locked/submitting); attempts readout; BreachConfirm click-dismiss; solves list.
**Invite dialog:** OK / Team page / Not now / Join team (disabled rules).
**Scoreboard:** Refresh; Team breakdown toggle (`aria-controls`); standings scroll box; chart tooltip/legend.
**Teams/Users lists:** search inputs (debounced server search); pagination (4 buttons + text).
**Team profile:** Create Team / Join Team; create form (input, Cancel, Create); join form (input, Cancel, Join); Copy link / Share / Copy code (clipboard + 2 s state); Leave Team (confirm).
**Settings:** Profile/Security tabs; username/affiliation/country(select)/website; Save Changes; current/new/confirm password; Update Password; Sound row toggle; Fx radio group.
**Admin:** Reset Event Scores; 8 tabs; Add Challenge; every ChallengeForm field, Placement radios, series selects, Add Hint/remove, Add files (label→hidden input)/remove, Add Link/remove, Visible checkbox, Save/Cancel; table Visible chip, vault, edit, delete; Chains/B2R master toggles, New, publish/delete icons, editors (all inputs, add select, reorder, remove), Save draft/Save & publish/Preview/Close + simulate range; Users search/clear, role select, Hand over, Ban/Unban, pagination; Teams search/clear, Sort by rank, row select, aside close, Ban/Unban/Delete Team; Notifications type chips, title/message, Send, delete; Event name, DateTimeFields (+picker buttons), 4 switches, allowlist textarea + Add, Freeze/Unfreeze, Hide/Show, Pause/Resume + note, +15/+30/+60, Save Event Settings, new event name/checkboxes/confirm text/Start New Event, Export CSV; OwnerFlagVault Copy / Verify & store / close / Escape / 45 s auto-close.
**Footer:** Privacy/Terms/Support new-tab links.
**Native dialogs:** 34 `confirm/alert/prompt` call sites (admin + Leave Team) — must not be intercepted.

All `aria-*` attributes, `role`s, `sr-only` captions/status nodes, `title`s and element ids listed above are part of the contract (QA and screen readers key off them).

---

<a id="flows"></a>
## Feature and flow preservation contracts

# CyberHX CTF Frontend — Feature-and-Flow Inventory for the Pinaka Theme Layer

**Scope:** `/home/user/CyberHx_ShadowCopy/frontend/src` (React 19, Vite 6, Tailwind v4 `@theme static`, `motion`, `recharts`, `lucide-react`, Supabase JS). Read-only audit; no files were modified, no builds run.
**Purpose:** a code-mapped contract of every protected behaviour so the Pinaka skin can be layered on as *presentation only* and QA can prove zero functional regression.
**Governing rule already in the repo:** `src/styles/DESIGN_SYSTEM.md:371` — "Presentation only: never touch supabase calls, hooks, handlers, props or routing." and `:365` — "Never rename or delete a `--color-cyber-*` token."

---

## 0. Architecture map (what renders what)

| Layer | File | Responsibility |
|---|---|---|
| Entry | `src/main.tsx:14` `captureInvite()` runs **before React renders**; `Root()` at `:16-48` chooses HoldScreen (uplink down) → "Initializing Terminal..." (loading) → `AuthPage` (no user) → `App`. |
| Backend client | `src/lib/supabase.ts:16-18` — single `createClient` with `global.fetch = uplinkFetch`. Env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (`:5-10` throws if missing). |
| Uplink monitor | `src/lib/uplink.ts` — 2 gateway failures (502/503/504 or network error) inside 40 s → `down` (`:28-33`, `:92-106`); probes `/auth/v1/health` at 8/16/32/60 s jittered (`:60-87`); recovery spread 10 s; request timeouts READ 15 s / WRITE 60 s / UPLOAD 10 min (`:121-130`). |
| Auth state | `src/hooks/useAuth.ts` (per-call hook instance; `App`, `AuthPage`, `Settings`, `TeamProfile`, `UserProfile`, `AdminDashboard` each call it independently). |
| Data hooks | `src/hooks/useData.ts` — `usePolling` (visibility-aware, exponential backoff capped 300 s), `useThrottled`, `useChallenges`, `useChains`, `useB2R`, `useTeamActions`. |
| App shell | `src/App.tsx` — nav, views, board, `ChallengeCard`, `ChallengeModal`, `ClosedPanel`, `NotificationBell`, invite modal, milestones. |
| Views | `Scoreboard.tsx`, `TeamsList.tsx`, `UsersList.tsx`, `TeamProfile.tsx`, `UserProfile.tsx`, `Settings.tsx`, `components/admin/*`. |
| Boards | `components/chain/{ChainedBoard,ChainExperience,Chain2D,chainModel}`, `components/b2r/{B2RBoard,b2rModel}` (lazy chunks, `App.tsx:87-90`). |
| Environment | `components/AmbientBackground.tsx`, `components/environment/{lattice,mood,signals,performance,cursor,fx,difficulty,SurfaceLight,CursorRing,MagneticElement,AnimatedView}`. |
| Styles | `src/index.css` (2065 lines; tokens `@theme static` `:12-180`, components `:225-1852`, keyframes, reduced-motion block `:1938-1982`, hold/event-clock `:1988-2065`). |
| Hosting | `vercel.json` CSP: `script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; connect-src 'self' https://*.supabase.co wss://*.supabase.co; img-src 'self' https: data:; font-src 'self' https://fonts.gstatic.com; frame-src https://challenges.cloudflare.com`. |

### Complete Supabase surface (tables/views, RPCs, edge functions, storage, auth)

| Kind | Name | Call sites (file:line) |
|---|---|---|
| Edge function | `submit-flag` | `api/submitFlag.ts:19` |
| RPC | `unlock_hint` | `api/submitFlag.ts:78` |
| RPC | `admin_reset_event` | `api/submitFlag.ts:93` (exported, unused by UI) |
| RPC | `registration_is_open` | `AuthPage.tsx:305`, `:368` |
| RPC | `team_invite_preview` | `AuthPage.tsx:169`, `App.tsx:354` |
| RPC | `join_team` | `App.tsx:370`, `TeamProfile.tsx:315`, `useData.ts:290` |
| RPC | `create_team` / `leave_team` | `TeamProfile.tsx:300/335`, `useData.ts:282/298` |
| RPC | `get_my_team_invite` | `TeamProfile.tsx:122` |
| RPC | `get_team_solves` | `App.tsx:542`, `Scoreboard.tsx:412`, `TeamProfile.tsx:127` |
| RPC | `get_team_hint_unlocks` | `TeamProfile.tsx:240` |
| RPC | `get_solve_data` | `App.tsx:569` |
| RPC | `get_my_hint_texts` | `App.tsx:673` |
| RPC | `get_challenge_solvers` | `App.tsx:2107` |
| RPC | `scoreboard_state` | `Scoreboard.tsx:556`, `TeamsList.tsx:85`, `UsersList.tsx:113` |
| RPC | `get_score_progression` | `Scoreboard.tsx:649` |
| RPC | `verify_current_password` | `Settings.tsx:212` |
| RPC (admin) | `admin_*` (set_paused, set_scoreboard_hidden/freeze, allowlist_add/count, start_new_event, upsert_challenge, set_chain_members, set_chain_experience, set_b2r_enabled, upsert_b2r_box/series, list_users, set_user_ban/role, transfer_ownership, team_members/invite, set_team_ban, delete_team, …) | `components/admin/AdminDashboard.tsx`, `ChainManager.tsx`, `B2RManager.tsx` (see grep list: `AdminDashboard.tsx:125,213,214,232,332,387,409,418,441,1012,1029,1345,1354,1371,1398,1661,1897,1948,1963,2025,2058,2080,2581,2582,2615,2623`) |
| RPC (owner) | `owner_reveal_flag`, `owner_capture_flag` | `OwnerFlagVault.tsx:73/119` |
| Table/view | `public_challenges` | `useData.ts:111`, `Scoreboard.tsx:414`, `TeamProfile.tsx:140` |
| View | `public_chain_series`, `public_chain_members` | `useData.ts:151/155` |
| View | `public_b2r_boxes`, `public_b2r_series`, `public_b2r_members` | `useData.ts:194/198/202` |
| Table | `profiles` (own row) | `useAuth.ts:78/212`, `App.tsx:535`, `TeamProfile.tsx:103` |
| View | `safe_profiles` | `App.tsx:543`, `Scoreboard.tsx:413`, `TeamProfile.tsx:188` |
| View | `public_teams` | `App.tsx:544`, `TeamProfile.tsx:118` |
| View | `team_scores` | `Scoreboard.tsx:611/627/636`, `TeamProfile.tsx:166/179`, `TeamsList.tsx:62/73/89`, `useData.ts:239/264` |
| View | `user_scores` | `TeamProfile.tsx:197`, `UsersList.tsx:90/101/118`, `useData.ts:234` |
| Table | `submissions` | `App.tsx:517`, `TeamProfile.tsx:268`, `UserProfile.tsx:121/137` |
| Table | `hint_unlocks` | `api/submitFlag.ts:109` |
| Table | `event_settings` | `App.tsx:701`, `AdminDashboard.tsx:1917/1942/1994`, `ChainManager.tsx:64`, `B2RManager.tsx:101` |
| Table | `notifications` | `App.tsx:206`, `AdminDashboard.tsx:1761-1780` |
| Storage | bucket `challenge-files` | `AdminDashboard.tsx:298-321`, `:1038` |
| Auth | `getSession`, `onAuthStateChange`, `signUp`, `signInWithPassword`, `signInWithOAuth`, `signOut`, `updateUser` | `useAuth.ts:112,128,157,174,186,197`; `App.tsx:866`; `Settings.tsx:229` |

### Polling / timer cadence (all must survive the theme untouched)

| What | Interval | Where |
|---|---|---|
| Challenges (`public_challenges`) | 5 min, paused when tab hidden, refetch on visible | `useData.ts:102,127` |
| Chain / B2R views | 5 min, **only when enabled** | `useData.ts:169,216` |
| Solve data (`fetchAllSolveData`) | 5 min + on tab visible; plus throttled (20 s) refresh on arriving at Challenges | `App.tsx:584,589-596` |
| `event_settings` | 30 s + on tab visible | `App.tsx:700-710` |
| Event status derivation | every 1 s from cached settings | `App.tsx:714-729` |
| Post-unpause / waiting→live refetch | random 0–8 s spread | `App.tsx:737-756` |
| Notifications | 120 s + on panel open | `App.tsx:218-223,244` |
| Scoreboard standings / graph / "mine" | 15 s / 120 s / 120 s; first fetch jittered 0–15 s; manual refresh throttled 8 s; backoff cap 300 s | `Scoreboard.tsx:495-529,536-550` |
| Profile fetch retries | 3 attempts, 400/800 ms backoff, abort on `PGRST116` | `useAuth.ts:75-107` |
| Uplink probe | 8→16→32→60 s jittered | `uplink.ts:30-31,83-87` |

---

## 1. Boot, uplink hold and loading

| Aspect | Code |
|---|---|
| Invite capture before render | `main.tsx:14` → `lib/invite.ts:20-39` |
| Uplink down → HoldScreen | `main.tsx:22-31` renders `<AmbientBackground intensity="normal"/>` + `.page-shell` + `<HoldScreen reason="uplink" …/>` |
| Loading | `main.tsx:33-41` — `<div role="status" class="label-micro text-cyber-neon animate-pulse">Initializing Terminal...</div>` |
| Unauthenticated | `main.tsx:43-45` `<AuthPage onSuccess={() => {}}/>` (the actual transition is `onAuthStateChange` in `useAuth`, not `onSuccess`) |

**HoldScreen contract** (`components/HoldScreen.tsx`): `role="status" aria-live="polite"`; title "Operations suspended" (paused) / "Uplink lost" (uplink) `:80`; sub copy `:81-83`; typed log lines `LINES` `:31-45` typed at 380 ms (`:69-77`, immediate under reduced motion); badge "Paused by control" / "Reconnecting" `:102`; elapsed "On hold HH:MM:SS" / "Down HH:MM:SS" `:104-108`; "attempt N" for uplink `:109-111`; organiser `message` rendered as `control: …` `:135-139`; footer reassurance copy `:142-146`. Classes the CSS keys on: `.hold`, `.hold-panel`, `.hold-scan`, `.hold-dot`, `.hold-log`, `.hold-line`, `.hold-line--control`, `.hold-caret`, `.hold-title` (`index.css:1989-2021`).

**Theme must not:** render anything that intercepts the uplink/hold branch in `main.tsx`; change `role`/`aria-live`; add interactive controls to HoldScreen ("there is nothing to click", `:14-15`).

---

## 2. Login (email + password)

| Aspect | Code |
|---|---|
| Mode state | `AuthPage.tsx:151` — defaults to `'register'` if an invite is pending, else `'login'` |
| Tab toggle | `:555-586` two `<button type="button" aria-pressed>` "Sign In" / "Register"; switching clears `error` |
| Header copy | `:590-605` "Auth Gateway / Access terminal / Authenticate to resume your run." vs "New Operative / Enter the arena / Register a handle to enter the competition." |
| Inputs | `#auth-email` (`type=email autoComplete=email` `:698-707`), `#auth-password` (`:711-731`, show/hide button `aria-pressed`, `aria-label` "Show/Hide password", `autoComplete` current/new-password) |
| Submit | `:851-871` `<button type="submit" disabled={loading || !captchaToken} class="btn btn-primary btn-lg btn-block …">` — label "Access Terminal" (login) / "Enlist Operative" (register) / "Authenticating..." (loading); wrapped in `MagneticElement` `:850` |
| Handler | `handleSubmit` `:330-400`: captcha gate first (`:334-347`), `setLoading`, `setPhase('verifying')`, `setMood('compete')` `:348-352`; client refusals via `abort()` keep the captcha token (`:356`): "Email is required." / "Password is required." `:358-359` |
| Auth call | `useAuth.login` `:173-183` → `supabase.auth.signInWithPassword({email, password, options:{captchaToken}})` |
| Error mapping | `authErrorMessage` `useAuth.ts:38-53`: "Invalid email or password.", "Human verification expired or failed. Complete the captcha again and retry.", "Too many attempts from your network. Wait a minute and try again.", "Enter a valid email address.", "An account already exists for this email. Sign in instead.", else raw |
| On error | `:385-394` phase idle, mood auth, `setError`, **Turnstile reset + token cleared** |
| On success | `:398` `setPhase('granted')` → `AccessSequence` (`:538-546`) shows "Access granted" then calls `onDone` after 600 ms (`AccessSequence.tsx:43,62-67`); session arrives via `onAuthStateChange` |
| Error display | `:828-844` `<motion.p role="alert">` with `AlertTriangle` |
| No-reset note | `:747-751` `FORGOT_NO_RESET` + `mailto:support@cyberhx.com` (`lib/support.ts:7,16-17`) |
| Terms line | `:933-939` link to `/terms.html` (new tab) "By continuing you agree to the fair-play rules · No solutions may be shared" |

**Preservation contract:** empty email → "Email is required." (no network); wrong creds → "Invalid email or password." + captcha reset; success → AccessSequence then App. **Theme must not:** change `type="submit"`, the `disabled` expression, input `id`s/`autoComplete`, the `role="alert"`, or wrap the form in anything that swallows the native submit (Enter key).

---

## 3. Registration

| Aspect | Code |
|---|---|
| Registration-open probe | `AuthPage.tsx:304-308` (`registration_is_open` on mount) and re-asked at submit `:368-374` |
| Closed banner | `:653-667` `role="status"` "Registration is currently closed." (only in register mode when closed) |
| Username field | `#auth-username` `:681-691`, hint "3–30 characters · letters, numbers, _ or -" |
| Client rules (AuthPage) | `:375-378` "Username required", "Username must be at least 3 characters", "Password must be at least 6 characters"; `<input minLength={6}>` `:718`; "Minimum 6 characters" hint `:735-737` |
| Client rules (hook) | `useAuth.register` `:143-171`: trims; regex `/^[a-zA-Z0-9_\-]+$/` → "Username can only contain letters, numbers, underscores, and hyphens"; 3–30 → "Username must be between 3 and 30 characters" |
| Sign-up call | `supabase.auth.signUp({email,password,options:{data:{username}, emailRedirectTo: returnUrl(), captchaToken}})` `:157-167` — `returnUrl()` carries the pending invite |
| Error mapping | "Database error saving new user" → long actionable message (`useAuth.ts:40-42`) |
| No-reset warning | `:742-746` `REGISTER_NO_RESET` ("[ NO RESET PROTOCOL ] …") + mailto |
| Google path when closed | `:887-890` refuses with "Registration is currently closed." before leaving the page |

**Theme must not** remove `minLength`, the hint text, or reorder so the username field is present in login mode (the field is conditionally mounted via `AnimatePresence mode="wait"` `:670-695`).

---

## 4. Google OAuth (redirect + hash error handling)

| Aspect | Code |
|---|---|
| Button | `AuthPage.tsx:882-913` `type="button"` "Continue with Google", `disabled={loading}`, inline Google SVG |
| Call | `useAuth.loginWithGoogle` `:185-194` → `signInWithOAuth({provider:'google', options:{redirectTo: returnUrl()}})` |
| Stuck-navigation release | `:899-901` `setTimeout(() => setLoading(false), 4000)` |
| Hash error handling | `:313-328` — regex `/(^#|&)error(_description|_code)?=/`; **never echoes the fragment**; maps to three fixed strings: "Google sign-in could not create your account. …", "Google sign-in was cancelled. …", "Google sign-in did not complete. …"; strips the hash with `history.replaceState` |
| Invite vs OAuth hash | `lib/invite.ts:25,32` touches only a hash that literally starts with `#invite=`; everything else is left for supabase-js |

**Theme must not** add its own hash/query handling, or a client-side router that consumes `window.location.hash` before supabase-js/`AuthPage` see it.

---

## 5. Session persistence (`useAuth`)

| Aspect | Code |
|---|---|
| State shape | `useAuth.ts:8-19` `{user, profile, session, loading, profileLoading, profileError}` |
| Initial | `getSession()` `:112-126` — `loading` flips false only here; `profileLoading = !!session.user` |
| Live | `onAuthStateChange` `:128-138` — on sign-out clears profile |
| Profile fetch | `:75-107` select `id, username, avatar_url, country, bio, role, is_owner, is_banned, is_hidden, team_id, affiliation, website, created_at`; 3 retries; `is_admin = role==='admin'`, `is_moderator`, `is_owner` cosmetic (`:84-91`); failure → `profileError` "Could not load your profile. Check your connection and reload." |
| updateProfile | `:201-219` allowlist `username,bio,country,avatar_url,affiliation,website` then re-fetch |
| refreshProfile | `:223-225` (used after invite join `App.tsx:375`) |
| Logout | `App.tsx:865-868` `signOut()` + `window.location.reload()`; header button `aria-label="Log out"` `:981-984`; mobile `:1033-1036` |

**Theme must not** introduce a context provider that replaces the independent `useAuth()` instances with different timing (AdminDashboard relies on `loading || profileLoading` to avoid flashing "Access Denied", `AdminDashboard.tsx:914`).

---

## 6. Cloudflare Turnstile

| Aspect | Code |
|---|---|
| Site key | `AuthPage.tsx:22` `import.meta.env.VITE_TURNSTILE_SITE_KEY`; CSP allows `challenges.cloudflare.com` for script + frame (`vercel.json`) |
| State machine | `:194-199` `'loading' | 'ready' | 'error' | 'blocked' | 'unconfigured'`; `captchaToken`, `captchaCode`, `captchaAttempt` |
| Script load | `:215-228` — `<script id="cf-turnstile-script" async defer>` appended to `<head>`, `onerror → 'blocked'`; stale tag removed first; keyed on `captchaAttempt` |
| Render | `:231-282` — polls `window.turnstile` every 200 ms, **20 s timeout → 'blocked'**; `turnstile.render(turnstileRef.current, {sitekey, theme:'dark', callback, 'expired-callback', 'error-callback'})`; removes a previous widget id first |
| Callbacks | token → `ready`; expired → token null, `loading`; error → token null, `captchaCode`, `error` (does **not** return `true`, so Cloudflare's own error box stays visible `:254-256`) |
| Retry | `retryCaptcha` `:284-289` bumps `captchaAttempt` |
| Reset | on mode change `:292-297`; on auth error `:391-394` |
| Container | `:777-781` `<div class="custom-scrollbar w-full overflow-x-auto"><div class="flex min-w-fit justify-center"><div ref={turnstileRef}/></div></div>` inside the "Human verification" box `:755-826` |
| Badge | `:761-775` `aria-live="polite"`: "Verified" / "Unavailable" (blocked, unconfigured) / "Failed" (error) / "Pending" |
| Explanation + retry | `:786-825` three explanations (blocked / error with `code N` / unconfigured) + "Try again" button (hidden when unconfigured) |
| Gating | submit `disabled={loading || !captchaToken}` `:853`; `handleSubmit` refuses with four context-specific messages `:334-347` |

**Theme must not:** (a) unmount/remount the `turnstileRef` node (e.g. by key-changing the card, conditional wrappers or switching layouts between breakpoints) — the widget id is held in a ref and only re-rendered on `captchaAttempt`; (b) place any element with a higher stacking order over the widget (only `AccessSequence` `.access-root z-index:30` `index.css:1374-1383` may cover it, and only while `phase !== 'idle'`); (c) apply `transform`, `filter`, `opacity<1`, `pointer-events:none` or `overflow:hidden` with a fixed height to ancestors of the widget container (the iframe needs its ~300×65 px box and clickable surface); (d) change `theme:'dark'` unless the Pinaka skin is intentionally light (presentational, but QA must re-verify contrast); (e) alter the CSP.

---

## 7. Teams: create / join / leave / invite links + codes

### 7.1 Invite link lifecycle (`src/lib/invite.ts`)
- Storage key `'cyberhx.invite'` `:15`; param `invite` `:16`; shape `/^[0-9A-Za-z_-]{6,64}$/` `:17`.
- `captureInvite()` `:20-39`: reads `?invite=` or `#invite=`, parks valid code, strips it from URL via `replaceState`.
- `pendingInvite()` `:41-48`, `clearInvite()` `:50-52`, `inviteLink(code)` `:55-57` = `${origin}/?invite=${code}`, `returnUrl()` `:61-64`.

### 7.2 Pre-auth preview (AuthPage)
`AuthPage.tsx:164-176` `team_invite_preview(p_code)`; `'Invalid invite'` → `clearInvite()`. Card `:607-650`: "Team invite", "You're invited to join **{name}** {members}/{size}", `Full` badge, three guidance strings (full / login / register), or "Could not check this invite right now." / "This invite link is no longer valid."

### 7.3 Post-auth join modal (App)
`App.tsx:346-378` state; preview once per `profile.id`; `mine = !!profile.team_id`. Modal `:1553-1623` (`fixed inset-0 z-[110]`, `role="dialog" aria-modal aria-label="Team invite"`):
- error: "Could not check this invite" / "This invite is no longer valid" + "OK".
- mine: "You're already on a team" + "OK" / "Team page".
- join: "Join **{name}**?", "{members}/{size} members", suffix " — the team is currently full." / " — team changes are locked while the event is live." / ". Your solves will count for the team from here on."; `inviteError` `role="alert"`; buttons "Not now" / "Join team" `disabled={inviteBusy || invite.full || invite.locked}`.
- `acceptInvite` `:367-378`: `join_team(p_invite_code: code.toLowerCase())`, then `clearInvite()`, `play('success')`, `refreshProfile()`, navigate to `teamProfile`.

### 7.4 TeamProfile (`src/TeamProfile.tsx`)
| Flow | Code | Controls / messages |
|---|---|---|
| Load | `fetchTeam` `:96-279` — `profiles.team_id` → `public_teams` (`id,name,captain_id,website,affiliation,country,created_at,is_banned`) + `get_my_team_invite` → `get_team_solves` → `public_challenges` → `team_scores` own row + rank by `.or('total_points.gt.X,and(total_points.eq.X,last_solve.lt.T)')` count (`:165-183`) → `safe_profiles` roster → `user_scores` member stats → `get_team_hint_unlocks` → `submissions` fail count (`select('id',{count:'exact',head:true})` — **never `*`**, `:268-273`) | Loading: spinner + "Loading team..." `role="status"` |
| No team | `:396-487` | "No Team Yet"; buttons "Create Team" / "Join Team"; create panel `#team-name` (maxLength 40, hint "2–40 characters"), "Cancel" / "Create" (`disabled={actionLoading || !teamName.trim()}`, "Creating..."); join panel `#invite-code` (`autoCapitalize=none`, maxLength 64, `font-mono tracking-code`), "Cancel" / "Join" ("Joining...") |
| Create validation | `:286-307` | "Team name must be 2 to 40 characters.", "Team name cannot contain < > { } or control characters."; RPC `create_team`; fallback "Unable to create the team right now. Please try again." |
| Join | `:309-322` | lowercases code; RPC `join_team`; fallback "Unable to join the team right now. Please try again." |
| Leave | `:324-341` | native `confirm()` with three variants (captain hand-over / last member removal / plain); RPC `leave_team`; "Leave Team" / "Leaving..." button `:649-656` |
| Invite surface | `:513-580` | "Invite link" shows link without scheme; warning copy; "Copy link"/"Copied" (`btn-success` when copied), "Share" (only if `navigator.share`), `sr-only role=status aria-live` announcer; "Or by code" + `tracking-code` code + "Copy code"/"Copied" |
| Members table | `:582-658` | columns "User Name / Solves / Points Contributed", "Captain" badge, footnote "* Team score counts each challenge once regardless of who solved it" |
| Hints used | `:664-700` | table + "Solve points X − hints Y = score Z. A hint is charged once per team." |
| Stat tiles | `:506-510` | Rank `#N`, Points (= `team_scores.total_points`), Members |

### 7.5 TeamsList (`src/TeamsList.tsx`)
`scoreboard_state` hidden check first (`:81-87`) → "Team standings hidden" plate (`:125-143`); paginated `team_scores` 50/page with escaped `ilike('name', term%)` (`:56-57,89-95`); ids `#teams-search`; empty "No teams found"; pagination buttons with `aria-label`s First/Previous/Next/Last; footer "Ranked by total points".

### 7.6 Team requirement on the board
`App.tsx:873-875` `isTeamMode`, `hasTeam`, `needsTeam = !hasTeam`; empty state `:1419-1430` badge "Team Required", "Join or Create a Team First", "This event is in team mode. You must be part of a team to access challenges.", button "Go to Teams" → `teamProfile`. Sidebar "Team mode" label `:1160-1162`.

**Theme must not:** change `.toLowerCase()`/`trim()` normalisation, the `confirm()` dialogs, the `localStorage` key, or any RPC argument; the invite modal must stay above the challenge modal (`z-[110]` > `z-[100]`).

---

## 8. Challenge listing, filters, search, categories

| Aspect | Code |
|---|---|
| Fetch | `useChallenges` `useData.ts:104-130`: `public_challenges` select incl. `files:challenge_files(id,name,url,size_bytes)`, `hints(id,cost)`, `.eq('is_visible',true)`, `.order('difficulty')` |
| Mapping | `dbToChallenge` `App.tsx:92-108` (hint `text:''`, `flag:''`, `connection_info`) |
| Category constants | `types.ts:3-13`; `CATEGORY_ICON` `App.tsx:126-137` (web/crypto/steg/rev/pwn/forensic/osint/mobile/b2r/misc → lucide); `catVar()` `:140` → `var(--color-cat-{cat}, var(--color-cat-misc))` |
| Difficulty constants | `environment/difficulty.ts:49-100` `DIFFICULTY_ORDER = ['Easy','Medium','Hard','Insane']`, badges `badge-easy|medium|hard|insane`, tilt/stagger numbers; `profileFor()` falls back to Medium |
| Filter state | `selectedDiff` `:331`, `selectedCat` `:339`, `query` `:379`, `mobileFilterOpen` `:389` |
| Derivations | `categories` (present cats with counts, ordered by icon map) `:759-771`; `filteredChallenges` (cat + query on title/category/tags) `:773-782`; `challengesByDiff` `:786-793`; `challengesByCat` (sorted by diff rank, then points) `:795-805`; `clearFilters` `:784` |
| `/` shortcut | `:808-819` focuses `#board-search` unless typing, not on challenges view, or modal open; `Escape` in the input clears + blurs `:1280` |
| Desktop rail | `:1065-1096` `.rail-item` buttons "All Operations", "{Tier} Operations" with counts, `aria-current`, `--rail-hue` inline var, `.rail-dot` |
| Progress card | `:1100-1115` "{solved}/{total}" + bar |
| Your team card | `:1119-1140` roster with per-member solve counts from `solvedByMap` |
| Event sidebar | `:1143-1164` name, badge (`eventBadgeClass`/`eventLabel` `:879-886`), "Ends …"/"Starts …" |
| Board tools | `:1208-1337` (rendered only when `challenges.length > 0 && canSeeChallenges && !needsTeam`): mode tablist, search (`#board-search`, placeholder "Search operations", `.board-kbd` "/" hint, "Clear search" button), category chips (`.chip.is-active`, `aria-pressed`, "All {n}") |
| Mobile difficulty filter | `:1340-1389` `btn-secondary` with `aria-expanded`, dropdown `surface-overlay z-30` |
| Empty/gated states | `:1391-1484` skeletons (`role="status"` "Loading challenges…"), "Event is not active yet", team gate, "No challenges yet", "Nothing matches … Clear filters" |
| Grid | `:1486-1529` per-category `<section>` with header icon/hue/count, `.stagger` grid with `--stagger-step/--stagger-dur`, `ChallengeCard` with `index` → `--i` |
| ChallengeCard | `:1742-1895`: outer `[perspective:1100px]`, tilt wrapper writing `--tilt-x/--tilt-y/--spec-x/--spec-y` (`:1756-1773`), `<button type="button" data-selflit data-diff={difficulty} class="card-interactive …">`, `play('tick')` and origin capture on click (`:1790-1797`), badges difficulty / "Compromised" / "First blood open", "{n} solve(s)", solver or first-blood name |

**Theme must not:** change filter predicates, sort order, the `/` key handler, the `id="board-search"`, `aria-pressed/aria-current`, or the conditions that hide the toolbar; may restyle but must keep `.chip`, `.rail-item`, `.card-interactive` class names (JS/CSS selectors depend on them — §23).

---

## 9. FREE vs CHAINED vs B2R boards and server flags

| Aspect | Code |
|---|---|
| Flags | `chainEnabled = !!eventSettings?.chain_experience_enabled` `App.tsx:410`; `b2rFlagOn = !!eventSettings?.b2r_enabled` `:420`; `b2rEnabled = b2rFlagOn || !!profile?.is_admin` `:421` (admin preview) |
| Gated fetches | `useChains(chainEnabled)` `:411`, `useB2R(b2rEnabled)` `:422` — **zero requests when off** (`useData.ts:142-172,184-219`) |
| Fallback | `:426-431` if a flag turns off mid-session, `boardMode` snaps to `'free'`, `activeSeriesId`/`b2rSubMode` reset |
| Placement | `chainedChallengeIds` `:492-495`, `b2rChallengeIds` `:496-499`, `freeChallenges` excludes both **and any challenge tagged `'b2r'`** `:503-509` |
| Mode tablist | `:1210-1246` `role="tablist" aria-label="Challenge mode"`; tabs "Free", "Chained" (if `chainEnabled`), "B2R" (if `b2rEnabled`, with `off` pill when `!b2rFlagOn` `:1242`); `play('open')` on entering chained/b2r |
| B2R sub-tablist | `:1247-1270` "Free" / "Chained" |
| Counts in "All" chip | `:1310-1315` depends on mode |
| Rendering | `ChainedBoard` `:1443-1451`, `B2RBoard` `:1452-1469` inside `React.Suspense` (`sr-only role=status` fallbacks) |
| Lazy chunks | `:87-90` |

**ChainedBoard** (`components/chain/ChainedBoard.tsx`): category filter `:51-54`; series card `.card-interactive` with `MiniChain` (solved dots, active segments orange→red), "{n} operations", "{solved} / {total}", progress bar; "Enter chain" → `ChainExperience`; "Briefing" download (`safeHttpUrl`, `download`, new tab); empty "No chains here yet" (`role="status"`).

**B2RBoard** (`components/b2r/B2RBoard.tsx`): `FlagRow` "USER FLAG"/"ROOT FLAG", "{p}p", states "Captured"/"Captured by teammate"/"Unavailable"/"Get a foothold"/"Escalate to root", buttons "Submit user"/"Submit root" → `onOpenChallenge(challengeId)` (`:77-84`); `BoxCard` "ROOTED" pill, status line "Machine fully compromised" / "User owned — root next" / "Not yet breached", "{earned} / {points}p"; chained sub-mode reuses `ChainExperience` with nodes = boxes and a box overlay dialog `fixed inset-0 z-[4500]` (`:247-273`, outer click closes, inner `stopPropagation`); empty boards `:179-196`.

**Theme must not** alter which challenges appear on FREE (placement is "that place only"), the admin-preview `b2rEnabled` rule, or make the mode tabs visible when both flags are off.

---

## 10. Chain dependency / unlock rules and locked-node exposure

- `chainModel.ts:42-91` `buildChainSeriesVM`: members sorted by `position`; node `challenge = challengeById.get(id) ?? null`; **`title: 'Locked node'` when null** (`:60`), `difficulty/points null`, `solveCount 0`; `solved = isSolved(id)` (own OR teammate — predicate passed in from App `:467`); `solvedByTeammate`; **segment `active = a.solved && b.solved`** (`:73`); totals `:76-90`.
- `b2rModel.ts:32-65` `buildB2RBoxVM` (`rooted = userSolved && rootSolved`, `earned`); `:72-121` `buildB2RSeriesVM`: node `title 'Locked box'`, `solved = rooted`, segments active when both adjacent boxes rooted.
- **There is no client-side sequential lock**: a node is "locked" only because the server's gated views hid the challenge (not in `public_challenges`). The client exposes nothing beyond `title='Locked node'`, `position`, and `challengeId`. `ChainExperience.tsx:131,136-137` disables the chip (`disabled={locked}`, `cursor-not-allowed opacity-70`) and `aria-label` ends with ", unavailable".
- Ignition sound: `ChainExperience.tsx:83-89` `play('legendary')` when `activeSegmentCount` increases.
- Canvas: `Chain2D.createChain2D` appends an off-screen animated GIF `<img>` to `document.body` (`Chain2D.ts:86-92`) — must keep `pointer-events:none; left:-99999px`.
- Readme dialog `:182-202` `fixed inset-0 z-[4000] role=dialog aria-modal`; "Download briefing (file)", markdown prose.

**Theme must not** invent "locked until previous solved" visuals that contradict the server (nodes are independently submittable), hide the `sr-only` chain state `<ol>` (`:176-180`), or reposition chips (positions are written by `onNodes` → `el.style.transform` `:64-71`).

---

## 11. Flag submission

### 11.1 Client API (`src/api/submitFlag.ts`)
- `:16-74` `submitFlag(challengeId, flag)` → `functions.invoke('submit-flag', {body:{challengeId, flag}})`.
- Non-2xx: reads `error.context.json()` `:28-33`; if unreadable → `{correct:false, message: 401 ? 'Your session has expired — sign in again.' : 'The server could not check that flag. Try again in a moment.'}` `:34-41`.
- `eventEnded && !correct` → `'The event has ended — submissions are closed.'` `:46-48`.
- `data.error` → `message: themePlayGate(error)`, plus `attemptsLeft, maxAttempts, locked, alreadySolved, eventEnded` `:50-60`.
- Success/failure messages `'Operation compromised'` / `'Access Denied: Invalid Key Sequence'` `:62-73`.
- Play-gate sentinel `:9-13`: server string `'Your email is not on the registration list to play this event'` → `'ACCESS DENIED :: identity not on the roster — your email is not registered for this event.'`.

### 11.2 Modal state machine (`App.tsx` `ChallengeModal` `:2009-2615`)
| Rule | Code |
|---|---|
| `unlimited = maxAttempts <= 0`; `isLocked = !unlimited && attempts >= maxAttempts && !isSolved`; `submitClosed = !canSubmit && !isSolved && !isLocked` | `:2123-2127` |
| `Escape` closes (not while `submitting`) | `:2131-2139` |
| Guard: no submit if locked/solved/submitting/empty | `:2146` |
| Stage 1 `validating` + `playValidating()` tone | `:2151-2152` |
| Thrown request → "Connection failed. Try again." | `:2155-2165` |
| Attempt meter moves **only** from server counts (`!alreadySolved && maxAttempts!==undefined && attemptsLeft!==undefined`) | `:2171-2173` |
| Fresh correct: hold stage-1 to `VALIDATE_MIN_MS=620`, `hold` for `HOLD_MS=260`, then `onSolve(id,true)`, `successMsg`, `justBreached`, `play('legendary'|'success')` | `:1921-1923`, `:2183-2201` |
| `alreadySolved` correct → `onSolve(id,false)`, no ceremony | `:2207-2211` |
| `locked` → "Terminal Locked: Maximum attempts reached.", `play('failure',{intensity:0.35})` | `:2213-2217` |
| Wrong → `error = result.message`; deny ladder only when server counted (`DENY_LADDER` `:1912-1918`, rung from `used`), `classList` add/remove `'deny'` with reflow trick | `:2219-2229`, `:2092-2101` |
| Solves tab → `get_challenge_solvers`, badges "First Blood"/"You"/"Teammate" | `:2103-2121`, `:2566-2609` |

### 11.3 Markup the behaviour depends on
- `<form ref={formRef} data-stage={stage} class="surface submit-form …" style="--deny-shake --deny-dur --deny-fade">` `:2502-2512`.
- `<span class="submit-trace"/>`, `<span key={denySeq} class="deny-mark"/>`, `<span class="deny-stamp">Access Denied</span>` (rungs with `fade > 0.5`) `:2517-2521`.
- `<label for="flag-input-{id}" class="field-label">Submit Access Key</label>`; `<input id=… placeholder="FLAG{ACCESS_KEY}" disabled={isLocked||submitting} aria-invalid class="input … is-invalid">`; `<button type="submit" disabled={isLocked||submitting} class="btn btn-primary btn-lg … is-loading">{submitting ? '...' : 'Execute'}</button>` inside `.submit-controls` `:2522-2541`.
- `<p role="alert">` error; attempts meter "Attempts {n}/{max|∞}" with `attemptsCritical` (within 5 of max) `:2236-2237,2542-2559`.
- Solved panel "Operation compromised ✓" + "by you/{name}" `:2480-2493`; locked panel "Terminal Locked: Maximum Brute-Force Attempts Reached" `:2494-2498`; `ClosedPanel` `:1932-1971` (waiting: "Submissions open in HH:MM:SS", "Opens {date}. Read the brief now — the form appears the moment the clock hits zero."; ended: "Event Ended — Submissions Closed"; inactive: "No Event Running — Submissions Closed").
- Overlays inside the panel: `OperationIntro` (Insane only, `.op-intro` z-15 pointer-events none, 780 ms) `:2277`; `BreachConfirm` (`.breach-root` z-20, click dismisses, self-dismiss 1900/2500 ms) `:2278-2282`.
- Modal shell `fixed inset-0 z-[100]` + `.scrim` (click closes) + `surface-overlay role=dialog aria-modal aria-label={title}` `:2241-2273`; tabs "Challenge"/"Solves (n)"; close `aria-label="Close challenge"`.
- `onSolve` in App `:1647-1687`: `pulseChallenge`, updates `solvedIds`, `teamSolvedIds`, `solvedByMap`, `solveCounts`; milestones only when `fresh`.
- Attempts seeded from own `submissions` rows (`:516-528`).

**Theme must not** rename `.submit-form`, `.deny`, `.deny-mark`, `.deny-stamp`, `.submit-trace`, `.submit-controls`, `data-stage` values, the `--deny-*` vars; must not key/remount the `<form>` (would lose typed input and the shake trick); must not block `Escape` or intercept the scrim click; must not layer anything with pointer-events over the input/button during `idle`.

---

## 12. Scoring

- `myScore` `App.tsx:438-450`: `earned` = Σ points of challenges in `solvedIds ∪ teamSolvedIds`; `spent` = Σ `hint.cost` for hints in `usedHintIds`; `max(0, earned - spent)` — mirrors DB `GREATEST(total_points - hint_spend, 0)`.
- `getPoints(challenge) = challenge.points` `:852` — full points always shown; hint cost is charged once at unlock (copy at `:2464-2471` "Hints used on this challenge: −N pts, already taken from your team's score once. Solving still awards the full N pts.").
- `CommandHeader` (`components/CommandHeader.tsx:176-193`): "Team score"/"Your score" (`AnimatedNumber`), "Solved n / total", "Progress %", "Your solves n / solved" or "Team: None"; countdown "Remaining HH:MM:SS" red under 1 h `:107,153-170`; badges "Paused"/"Live"/"Standby"/"Closed"/"Offline" `:128-133`; copy lines `:138-148`; `.holo surface` root `:118`.
- Team page total = `team_scores.total_points` (`TeamProfile.tsx:170-173`) with the breakdown equation; `UserProfile` shows solve count, not points (`UserProfile.tsx:313-321`).
- Team solve attribution: first solver per challenge (`App.tsx:553-558`, `Scoreboard.tsx:419-424`, `TeamProfile.tsx:217-224`).

---

## 13. Scoreboard (`src/Scoreboard.tsx`)

| Aspect | Code |
|---|---|
| Props | `myTeamId`, `eventStatus`, `startTime` (`App.tsx:1534`) |
| State RPC | `scoreboard_state` → `scores_hidden`, `masked` (frozen), `freeze_time`, `ended` `:556-564` |
| Hidden | clears everything, no further reads `:567-572`; UI "Scoreboard hidden" + "The organisers have taken the standings offline for now. Keep solving — …" `:782-800`; badge "Hidden"; text "Hidden by the organisers" |
| Frozen | skip heavy calls when `fetchedFor.current === freeze_time` unless `force` `:578`; badge "Final" (ended) / "Frozen"; text "Final standings as of HH:MM" / "Frozen at HH:MM — final standings hidden until the reveal" `:732-735,753-756` |
| Waiting / inactive | badge "Starts soon" / "Inactive"; text "Opens {when}" / "No event running"; empty-state copy `:816-827,872-879` |
| Live | badge "Live", "Updated {RelativeTime}" `:743,761` |
| Standings order | `team_scores` `.order('total_points',desc).order('last_solve',{ascending:true,nullsFirst:false}).limit(10)` `:609-620`; caption "ordered by total points then earliest last solve"; header note "Ties broken by earliest solve" `:1057` |
| Own rank outside top 10 | `fetchMine` count with `.or(...)` mirroring tie-break `:625-638` |
| Graph | `get_score_progression(p_team_ids)`; running totals per team, dedupe by `event_key`, clamp ≥0, baseline point 60 s before first event, "now" point `:640-697`; recharts with literal `COLORS` hex `:17-20` and CSS-var ticks `:891-912` |
| "You" strip | `:957-1047` badge "You", Place/Score/Solves/Lead|Behind #n|To #n, "Team breakdown" button `aria-expanded aria-controls="team-breakdown"`; breakdown fetch `:407-442` (`get_team_solves`, `safe_profiles`, `public_challenges`), members sorted by points/solves/name, "Who took what" |
| Table | `:1050-1103` sticky `<thead class="sticky top-0 z-10">`, columns Place/Team/Last solve/Solves/Score; `StandingsRows` with `motion.tr layout`, `data-moved="up|down"`, `data-me`, `RankMark` (crown/medals only when `scored`), `RankDelta`, `AnimatedNumber` |
| Refresh button | `aria-label="Refresh the scoreboard now"`, `title="Refresh now"`, `animate-spin` while refreshing `:764-777` |
| Related hidden checks | `TeamsList.tsx:85-86`, `UsersList.tsx:113-114` ("Team standings hidden" / "Player standings hidden") |
| Users order | `UsersList.tsx:119-121` `total_points desc, last_solve asc` |

**Theme must not** change ordering clauses, intervals, the `.or()` strings, `data-moved/data-me` (CSS `index.css:1350-1368`), the sticky header, or replace recharts series colours with `var()` (SVG attributes need literals, `:14-16`).

---

## 14. Hint unlocking

| Aspect | Code |
|---|---|
| Load | `getUnlockedHints` (`hint_unlocks` by `user_id`) + `get_my_hint_texts` (includes teammates' unlocks) `App.tsx:667-678`; grouped per challenge `:679-689` |
| Unlock | `handleUnlockHint` `:824-847` → `unlockHint` (`api/submitFlag.ts:77-89`, RPC `unlock_hint(p_hint_id)`), play-gate theming; error mapping "Too many hint requests. Wait a minute and try again." / raw server text / "Could not unlock this hint right now. Try again in a moment." (filters SQL-ish text) |
| Modal UI | `:2414-2476` "Strategic Intelligence"; locked row button "Encrypted Intel Segment" + badge "-{cost} pts"; **cost>0 arms first** (`:2450`), cost 0 unlocks immediately; armed → `role="alertdialog" aria-labelledby="hint-confirm-{id}"` "Confirm decryption", "> unlock_hint --cost N", "This takes **N points** from your team's score and can't be undone. If a teammate already unlocked this hint, it opens for free.", buttons "Abort" / "Decrypt −N pts" (`autoFocus`, "Decrypting…"); unlocked → Lightbulb + text; "Loading hint..." when id known but text missing; spent summary; `hintError` `role="alert"` |
| Close resets | `onClose` clears `hintError` `:1636` |

**Theme must not** collapse the two-step confirm into one click, remove `autoFocus`, or change the `alertdialog` semantics.

---

## 15. Attachments and `connection_info` links (`safeHttpUrl`)

- `lib/url.ts:7-11` — only `/^https?:\/\//i` passes; everything else → `undefined` (inert anchor).
- Files: `dbToChallenge` `App.tsx:103` maps `size_bytes → size`; render `:2373-2396` `<a href={safeHttpUrl(file.url) || undefined} target="_blank" rel="noopener noreferrer">` "Download Attachment [n]" / "Click to download" / "{MB} MB".
- `connection_info`: JSON-parsed inside try/catch, must be an array of `{url: string}` `:2356-2367`; rendered as `btn btn-outline btn-md btn-block` links with `ExternalLink` icon, label `link.label || 'Download'` `:2397-2408`.
- Other `safeHttpUrl` sinks: avatar `<img>` `UserProfile.tsx:235-239`; chain/B2R `readmeUrl` (`ChainedBoard.tsx:100`, `ChainExperience.tsx:54`, `B2RBoard.tsx:114,307`).
- Footer links `/privacy.html`, `/terms.html`, `/support.html` open in a new tab (`App.tsx:1717-1720`).

**Theme must not** render any admin/user-supplied URL without `safeHttpUrl`, or drop `rel="noopener noreferrer"`/`target="_blank"`.

---

## 16. Event status derivation, pause / hold

| Aspect | Code |
|---|---|
| Settings poll | `loadEventSettings` `App.tsx:700-710` (`event_settings` latest row, 30 s + visibility) |
| Derivation | `:714-729`: `!is_active → 'inactive'`; `now < start_time → 'waiting'`; `now > end_time → 'ended'`; else `'live'`; re-evaluated every second |
| Flags | `paused = !!is_paused` `:871`; `canSubmit = is_admin || (live && !paused)` `:872`; `canSeeChallenges = is_admin || status !== 'inactive'` `:876`; `isTeamMode = mode !== 'individual'` `:873` |
| Transitions | unpause → refetch challenges + solve data (0–8 s jitter) `:737-746`; waiting→live → refetch challenges `:748-756` |
| Player pause | `:1057-1058` `<HoldScreen reason="paused" message={pause_message} since={paused_at}/>` replaces **all views** (not just the board) |
| Admin pause banner | `:1044-1055` "Paused" badge + "Players see the hold screen; submissions and hints are sealed for them. You still see everything. Resume from Admin → Event." |
| Header clock | `EventClock` `components/EventClock.tsx`: waiting "T−{d}d HH:MM:SS", live countdown (`data-tone="live"|"urgent"` under 1 h), paused "HOLD {elapsed}" `data-tone="paused"`, ended "CLOSED", inactive → null; CSS `.event-clock[data-tone]` `index.css:2032-2046`; hidden below `md` (`App.tsx:954`) |
| Board header | `CommandHeader` statuses (§12) |
| Submit panel | `ClosedPanel` (§11.3) |
| Admin side | `admin_set_paused` with `p_message` (`AdminDashboard.tsx:1890-1908`), `confirm()` dialogs |

**Theme must not** derive status differently, show the board to paused players, or hide the admin banner.

---

## 17. Notifications bell (`App.tsx:179-300`)

- Fetch `notifications` (`order created_at desc limit 20`), poll 120 s, refetch on open; unread = rows newer than `localStorage['notif_last_seen']` (`:183-184,211-213`); **`playBeep()` uses a raw `AudioContext` 880 Hz sine and ignores the sound preference** (`:188-202`).
- Button `aria-label="Notifications" aria-expanded`, text "Notifications" at `xl`, red count pill "9+" cap `:244-257`.
- Panel `surface-overlay … z-50` `:259-296`: header "Notifications" + close (`aria-label="Close notifications"`), empty "No notifications yet", rows with type badge (`badge-info|solved|medium|hard` via `typeStyle`), title, message, `toLocaleString()` time; unread rows `bg-neon-wash` + neon edge.
- Opening marks all read (`markAllRead` writes `notif_last_seen`).

**Theme must not** change the storage key or the open→markAllRead side effect; the panel must remain above the sticky nav content (`nav z-50`).

---

## 18. Roles / admin gating

| Check | Code |
|---|---|
| `profile.is_admin` derived from `role === 'admin'` | `useAuth.ts:86`; `isAdmin` `:235` |
| Admin nav tab (desktop + mobile) | `App.tsx:941-949`, `:1013-1017` |
| Admin privileges on the board | `canSubmit` `:872`, `canSeeChallenges` `:876`, `b2rEnabled` `:421`, pause banner `:1044`, bypass HoldScreen `:1057`, bypass banned notice `:1170` |
| AdminDashboard gate | `AdminDashboard.tsx:907-972`: `loading || profileLoading` → "Verifying access..."; `profileError` → "Could not verify your account" + "This is a connection problem, not a permissions one — your role has not changed." + "Retry" (reload); `!profile || role !== 'admin'` → "Access Denied" / "Admin privileges required."; else `AdminDashboardInner` |
| Admin tabs | `:1066-1073` Challenges, Chains, B2R, Users, Teams, Submissions, Notifications, Event |
| Owner-only vault | `is_owner` cosmetic gate `:1194,1252,2444`; `OwnerFlagVault` `fixed inset-0 z-[120]` (`OwnerFlagVault.tsx:132`), `#vault-flag-value` used for selection fallback `:103-110`, `#vault-capture` |
| Profile badge | `UserProfile.tsx:272-277` "Admin" |

**Theme must not** short-circuit the three-state gate or render admin controls for non-admins (even hidden via CSS).

---

## 19. Allowlist / play-gate messages

- Registration is open to all; the allowlist is enforced server-side at play time only (`AuthPage.tsx:379-380`).
- Sentinel translation `api/submitFlag.ts:9-13` applied to flag submission (`:53`) and hint unlock (`:85`): **"ACCESS DENIED :: identity not on the roster — your email is not registered for this event."**
- Admin management: `admin_allowlist_count` / `admin_allowlist_add` (`AdminDashboard.tsx:1947-1975`), event toggle `#allowlist-only` (`:2173-2176`).

---

## 20. Banned team notice

- Source: `public_teams.is_banned` for own team (`App.tsx:544-548` → `teamBanned`, `teamName`).
- Render `:1170-1190` (players only, above `CommandHeader`): `role="alert"`, "Team disqualified", "Your team `{name}` has been removed from the competition", explanation, appeal line with `mailto:support@cyberhx.com` and Discord mention. Server still refuses submissions/hints; the client does not additionally disable the form.

---

## 21. Milestones (`src/lib/milestones.ts`)

- Pure function `detectMilestones({solved, all, solvedIds, firstBlood})` `:53-132`; rules: `first-breach` (count===1), `first-blood-{id}`, `first-insane`, `tier-{difficulty}` (all of tier, >1), `category-{cat}` (all of category, >1), `full-compromise`, and `count-{n}` every 5th solve only when nothing else fired. Tones `neon|gold|violet`.
- Single call site `App.tsx:1665-1686`: only when `fresh === true`; `firstBlood = !firstBloodMap[id] && chal.solvedCount === 0`; queued after the showcase (2500 ms Insane / 1900 ms), `play('milestone')`; timers in `milestoneTimers` ref cleared on unmount `:656-660`.
- Display `MilestoneBanner` one at a time `:1698-1706`; `components/MilestoneBanner.tsx` `role="status" aria-live="polite"`, auto-dismiss 2600/2000 ms; `.milestone-root` fixed top 4.75rem `z-index:200` `pointer-events:none` (`index.css:1692-1703`).

**Theme must not** call `detectMilestones` anywhere else (poll/page-load), or give the banner pointer events (it sits over the modal's dismiss area).

---

## 22. Sound / motion / fx preferences and storage keys

| Key | Values / default | Owner |
|---|---|---|
| `cyberhx.sound` | `'1'`/`'0'`, default **on** when unset | `audio/preferences.ts:22-53`; `useSound` |
| `cyberhx.fx` | `'cinematic'`(default) `'calm'` `'off'` | `environment/fx.ts:18-41` |
| `cyberhx.fx.prev` | last non-off fx level for one-click restore | `components/MotionToggle.tsx:18,30-41` |
| `cyberhx.invite` | pending invite code | `lib/invite.ts:15` |
| `notif_last_seen` | ISO timestamp | `App.tsx:184,211,227` |

- `SoundToggle` (`components/SoundToggle.tsx`): header icon variant `aria-pressed`, `aria-label` "Mute/Unmute interface sound"; Settings row variant with copy; plays `'open'` only when turning on.
- `MotionToggle`: header + AuthPage (`AuthPage.tsx:413-415` fixed top-right `z-50`), `aria-pressed`, labels "Turn off/on background motion".
- `FxToggle` (Settings): `role="radiogroup" aria-label="Visual effects"`, three `role="radio"` options Cinematic/Calm/Off.
- `performance.ts:46-94` tiers `high|medium|low|still`; `prefers-reduced-motion` or `fx==='off'` → `still` (no WebGL, no pointer fx); cache invalidated on fx change `:107`. `data-tier` attribute on the App root `App.tsx:898` gates idle CSS animations (`index.css:1591,1606,1630`).
- `AudioManager` sound names `'tick'|'open'|'close'|'success'|'legendary'|'failure'|'milestone'` (`:202-209`), `play()` no-ops when sound off `:317-318`, `playValidating()` `:335`, `initAudioLifecycle()` suspends on hidden tab / pref off `:399-421`.
- All `motion` components check `useReducedMotion()`; CSS global reduced-motion block `index.css:1938-1982`.
- `DESIGN_SYSTEM.md:294-297`: "Never add an effect that bypasses this dial or `prefers-reduced-motion`."

**Theme must not** introduce its own motion/sound without routing through `getFx()`/`getCapability()`/`soundEnabled()` and `prefers-reduced-motion`; must not change storage keys or defaults.

---

## 23. Cross-cutting DOM contract the theme must respect

### 23.1 `data-*` attributes read by CSS or JS
| Attribute | Set by | Read by |
|---|---|---|
| `data-tier` | `App.tsx:898` | `index.css:1591,1606,1630` idle animations |
| `data-diff` | `ChallengeCard` `App.tsx:1801`; `.stagger[data-diff]` selector exists `index.css:1335` | `index.css:1560-1636` frame/hue personalities |
| `data-selflit` | `App.tsx:1799` | `SurfaceLight.tsx:34-38` (exclusion), `index.css:1080-1098` |
| `data-tilt` | **written/removed at runtime** by `SurfaceLight.tsx:66,79` | `index.css:1080-1108,1960` |
| `data-stage` | submit form `App.tsx:2505` | `index.css:1762-1801` |
| `data-moved`, `data-me` | `Scoreboard.tsx:280-281` | `index.css:1350-1368,1978` |
| `data-state` | `AccessSequence.tsx:111` | `index.css:1408-1420` |
| `data-active`, `data-hot` | `CursorRing.tsx:37-50,64` (dataset) | `index.css:1511-1521` |
| `data-tone` | `EventClock.tsx:42,63` | `index.css:2044-2046` |
| `data-mode` | `AmbientBackground.tsx:120` | `index.css:1007` |
| `data-down` | (uplink dot, CSS only) | `index.css:2027,2064` |

### 23.2 Class names JS depends on
- `.deny` toggled via `classList` (`App.tsx:2092-2101`).
- `SurfaceLight` `LIGHTABLE = '.holo:not([data-selflit]), .card-interactive:not([data-selflit]), .surface-overlay:not([data-selflit])'` (`SurfaceLight.tsx:34-38`).
- `CursorRing` `INTERACTIVE = 'a, button, [role="button"], summary, label[for], select, .btn, .card-interactive, .tab, .chip'` (`CursorRing.tsx:24-25`); same list drives the pointer cursor in `index.css:1476-1480`.
- `.magnetic` wrapper (`MagneticElement.tsx:102`), `.cursor-ring`, `.ambient-root/.ambient-*`, `.page-shell` (required stacking context, `index.css:946-949`).

### 23.3 CSS custom properties written inline by JS
`--tilt-x --tilt-y --spec-x --spec-y` (card), `--mx --my --tx --ty` (SurfaceLight), `--i --stagger-step --stagger-dur` (grid), `--deny-shake --deny-dur --deny-fade` (form), `--rail-hue` (rail), `--tile-accent` (UserProfile), `--ambient-grid-opacity` (ambient), `--btn-fg` (CSS).

### 23.4 Element ids / `htmlFor` / `aria-controls`
`auth-username`, `auth-email`, `auth-password`, `cf-turnstile-script` (script tag), `board-search`, `flag-input-{challengeId}`, `hint-confirm-{hintId}`, `team-breakdown`, `team-name`, `invite-code`, `teams-search`, `users-search`, `settings-email`, `settings-email-hint`, `field-country`, `field-country-hint`, `field-*` (Settings generated), `vault-flag-value`, `vault-capture`, admin form ids (`chal-*`, `hint-text-*`, `link-*`, `event-*`, `active`, `registration`, `allow-team-changes`, `allowlist-only`, `notif-*`, `new-event-name`, `confirm-new-event`), SVG gradient ids `scanline`, `sb-grad-{i}`, `colorPoints`.

### 23.5 Stacking order (must be preserved relative to each other)
| z | Element |
|---|---|
| 0 | `.ambient-root` (fixed, `pointer-events:none`) |
| 1 | `.page-shell` |
| 10 | notification unread pill; scoreboard sticky `<thead>` |
| 15 / 20 / 30 (local) | `.op-intro` / `.breach-root` inside modal; `.access-root` inside auth card |
| 20 / 30 | mobile difficulty filter wrapper / dropdown |
| 50 | sticky `<nav>`, notification panel, AuthPage `MotionToggle` |
| 100 | challenge modal |
| 110 | team invite modal |
| 120 | OwnerFlagVault |
| 140 | `.cursor-ring` |
| 200 | `.milestone-root` (pointer-events none) |
| 4000 / 4500 / 5000 | chain readme dialog / B2R box overlay / admin chain & B2R previews |

### 23.6 Tokens and hard-coded colours
- Frozen tokens `--color-cyber-bg/sidebar/card/border/neon/muted/text` (`index.css:17-24`, `DESIGN_SYSTEM.md:19,365`) — never rename; Pinaka may **re-value** them at a scope but must keep names.
- `@theme static` means every token is emitted; theme overrides should be applied via a scoped selector (e.g. `[data-theme="pinaka"]`) rather than editing the `@theme` block.
- Literal hex outside tokens that will *not* follow a token override: `Scoreboard.tsx:17-20` `COLORS`, `SharedComponents.tsx:32-41` `TOKEN`, `TeamProfile.tsx:371`, `UserProfile.tsx:174`, chain/B2R gradients (`ChainedBoard.tsx:137`, `ChainExperience.tsx:171`, `B2RBoard.tsx:159,336`), `ChallengeCard` solved wash `App.tsx:1803,1817`, cursor SVG data URIs `index.css:1474,1479`, `Chain2D.ts` canvas colours, `index.html` `theme-color #060b10`.

### 23.7 Copy strings that tests should assert verbatim
"Initializing Terminal...", "Access Terminal", "Enlist Operative", "Authenticating...", "Continue with Google", "Please complete the captcha verification.", "Registration is currently closed.", "Invalid email or password.", "Human verification", "Verified"/"Pending"/"Failed"/"Unavailable", "Try again", "Team invite", "Join team", "Not now", "No Team Yet", "Create Team", "Join Team", "Leave Team", "Copy link", "Copy code", "Join or Create a Team First", "Go to Teams", "Event is not active yet", "No challenges yet", "Nothing matches", "Clear filters", "Search operations", "All Operations", "Free"/"Chained"/"B2R", "Enter chain", "Submit user"/"Submit root", "ROOTED", "Locked node"/"Locked box", "Submit Access Key", "FLAG{ACCESS_KEY}", "Execute", "Attempts", "Access Denied: Invalid Key Sequence", "Operation compromised", "Terminal Locked: Maximum attempts reached.", "Terminal Locked: Maximum Brute-Force Attempts Reached", "Submissions open in", "Event Ended — Submissions Closed", "No Event Running — Submissions Closed", "The event has ended — submissions are closed.", "Your session has expired — sign in again.", "Connection failed. Try again.", "ACCESS DENIED :: identity not on the roster — your email is not registered for this event.", "Strategic Intelligence", "Encrypted Intel Segment", "Confirm decryption", "Abort", "Decrypt −N pts", "Attachments", "Download Attachment", "Scoreboard", "Hidden by the organisers", "Scoreboard hidden", "Frozen", "Final", "Ties broken by earliest solve", "Team breakdown", "You", "Notifications", "No notifications yet", "Operations suspended", "Paused by control", "Uplink lost", "Reconnecting", "Team disqualified", "Verifying access...", "Access Denied", "Admin privileges required.", "First breach", "First blood", "Insane operation compromised", "Interface sound", "Visual effects", "Cinematic"/"Calm"/"Off".

---

## 24. Preservation contracts — one-line summary per feature

| Feature | Input → Output | Theme is NOT allowed to touch |
|---|---|---|
| Boot | URL `?invite=` → stored + stripped; backend down → HoldScreen | `main.tsx` branch order, `captureInvite` timing |
| Login | creds + token → `signInWithPassword`; errors mapped; token reset on failure | submit button `disabled`, form semantics, error strings |
| Register | username/password rules → `signUp` with `emailRedirectTo: returnUrl()` | validation order and strings, `registration_is_open` double-check |
| Google | click → `signInWithOAuth`; `#error=` → fixed message + hash strip | hash parsing, redirect URL |
| Session | `getSession`/`onAuthStateChange`; profile with retries | `loading`/`profileLoading` semantics |
| Turnstile | script → render → token gates submit; 5 states with copy | widget container identity, stacking, CSP, callbacks |
| Teams | create/join/leave RPCs with client validation; invite link/code copy/share | normalisation, `confirm()`s, storage key, modal z-order |
| Listing | `public_challenges` → category sections, filtered by tier/category/query | predicates, sort, `/` shortcut, ids |
| Boards | `chain_experience_enabled` / `b2r_enabled` (+admin) → tabs + placement | flag logic, FREE exclusion rules, lazy loading |
| Chains | members + solve predicate → nodes/segments; locked = not in catalog | VM builders, disabled chips, sr-only list |
| Submit | flag → edge fn → stage machine → attempts/deny/solved/locked/closed | state machine, class/attr hooks, Escape, scrim |
| Scoring | solves − hint costs, floored | formula, full-points display |
| Scoreboard | `scoreboard_state` → hidden/frozen/live; 15 s/120 s; tie-break | query order, intervals, data attrs |
| Hints | arm → confirm → `unlock_hint`; team-shared texts | two-step confirm, alertdialog |
| Links | `safeHttpUrl` on every href/src | guard usage, `rel`/`target` |
| Event | `event_settings` → status + pause; players see HoldScreen | derivation, admin/player split |
| Bell | poll 120 s; unread via `notif_last_seen`; open marks read | key, side effects |
| Roles | `role==='admin'` gates; owner vault | three-state admin gate |
| Play-gate | sentinel → themed denial | string match |
| Banned | `public_teams.is_banned` → alert | copy, admin bypass |
| Milestones | fresh solve → rules → queued banner | single call site, pointer-events none |
| Prefs | localStorage keys → sound/fx/tier | keys, defaults, capability gating |

---

<a id="environment"></a>
## Environment, motion, performance and styling system

# CyberHX frontend — environment, motion, performance & styling-system inventory

Audit scope: `/home/user/CyberHx_ShadowCopy/frontend` (React 19.2.8, Vite 6.4.3, Tailwind 4.3.3 via `@tailwindcss/vite`, motion 12.43.0, recharts 3.10.1, @supabase/supabase-js 2.112.4, lucide-react 0.546.0, react-markdown 10.1.0, remark-gfm 4.0.1). Read-only; nothing was built, installed or edited.

**State of the tree at audit time (important for QA):**

- `dist/` was built 2026-10-08 20:34 from a source tree **without** the theme (`grep -c pinaka dist/assets/*` = 0, `data-theme` = 0 in both dist JS and CSS). It is a valid **pre-theme baseline** for visual/perf diffing.
- `src/main.tsx` has an uncommitted change (`git diff`: `bootTheme().finally(() => createRoot(...).render(...))`, lines 12 and 51-59) and `src/themes/` is untracked. Both were being edited concurrently while this audit ran (`src/themes/pinaka/styles/` grew from 2 to 10 files; `src/themes/pinaka/boot.ts` gained `overrideCategoryIcons`; `src/App.tsx` anchors shifted by ~+27 lines above `<AnimatedView>` between two reads). Treat `src/themes/**` as in-flux scaffolding, not as audited code. All `App.tsx` line numbers below are from my first full read; grep the quoted anchor text to relocate.
- Last commits on the base: `ce23b64 Remove the Grand Finale decoration (#39)` … `d85f5ee Add RootHunters to the finalist list (#32)`.

---

## 1. Design-token system — `src/index.css` `@theme static` (L12–L180)

### 1.1 Token groups (all emitted as CSS custom properties on `:root,:host`)

| Group | Lines | Tokens (value) |
|---|---|---|
| Typefaces | 14–15 | `--font-sans: "Inter", ui-sans-serif, system-ui, sans-serif`; `--font-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, monospace` |
| **Frozen legacy palette** (7, never rename) | 18–24 | `--color-cyber-bg #060b10`, `--color-cyber-sidebar #0a1118`, `--color-cyber-card #0d161f`, `--color-cyber-border #1a242d`, `--color-cyber-neon #c6ff00`, `--color-cyber-muted #8a949d`, `--color-cyber-text #e1e7ec` |
| Surface ramp | 27–34 | `surface-sunken #04080c`, `surface-base #060b10`, `surface-rail #0a1118`, `surface-card rgba(13,22,31,.72)`, `surface-raised rgba(18,29,40,.72)`, `surface-overlay #17232f`, `surface-inset #08111a`, `surface-veil rgba(6,11,16,.72)` |
| Border ramp | 37–42 | `border-subtle #131c25`, `border-base #1a242d`, `border-strong #27343f`, `border-hover #3a4855`, `border-neon rgba(198,255,0,.6)`, `border-danger rgba(224,112,95,.38)` |
| Neon ramp + glow | 45–50 | `neon-dim #8fb800`, `neon #c6ff00`, `neon-bright #ddff6b`, `neon-ink #0a1000`, `neon-glow rgba(198,255,0,.35)`, `neon-wash rgba(198,255,0,.12)` |
| Text ramp | 53–56 | `text-primary #e1e7ec`, `text-secondary #aab5bf`, `text-muted #8a949d`, `text-faint #667381` |
| Difficulty | 59–71 | `diff-easy #7ecb8f`, `diff-medium #e0b34a`, `diff-hard #e0705f`, `diff-insane #b98cf7` + `-wash` (12%) each |
| Status | 74–85 | `status-solved #a6e04a`, `status-locked #6b7681`, `status-live #ff6a5e`, `status-info #6d9fd4`, `blood #ff5c7a` + `-wash` each |
| Foregrounds on washes | 88–89 | `danger-fg #ffb3ab`, `success-fg #bfeaa7` |
| Category hues (10) | 92–101 | `cat-web #4fb3a4`, `cat-crypto #8e86d6`, `cat-steg #c97fa0`, `cat-rev #cfa15c`, `cat-pwn #d96a5c`, `cat-forensic #6d9fd4`, `cat-osint #8fb573`, `cat-mobile #e0894f`, `cat-b2r #e05a8d`, `cat-misc #93a1ad` |
| Type scale (8 sizes, each with `--line-height`, `--letter-spacing`, some `--font-weight`) | 104–140 | `display 3.25rem/1.02/-.035em/800`, `h1 2.125rem`, `h2 1.5rem`, `h3 1.125rem`, `body .875rem`, `small .8125rem`, `micro .625rem/.18em/700`, `label .6875rem/.14em/700` |
| Spacing | 143–146 | `--spacing .25rem` (4px base), `gutter 1.5rem`, `section 2.5rem`, `page 4rem` |
| Radius | 149–153 | `inset .375rem`, `control .5rem`, `card .875rem`, `panel 1.125rem`, `pill 999px` |
| Tracking | 156 | `--tracking-code .28em` |
| Elevation | 159–166 | `shadow-e1…e5` (all `rgba(2,6,11,…)` tinted), `shadow-well` (inset), `shadow-neon`, `shadow-neon-strong` (lime rgba) |
| Motion | 169–174 | `duration-fast 120ms`, `base 200ms`, `slow 360ms`; `ease-standard`, `ease-out-quint cubic-bezier(.22,1,.36,1)`, `ease-spring` |
| Focus | 177–179 | `--focus-ring-width 2px`, `--focus-ring-offset 2px`, `--focus-ring-color rgba(198,255,0,.75)` |

Also scoped token re-declarations: `.auth-scale` (L605–610) bumps `--text-micro/--text-small/--text-body` on the sign-in card only.

### 1.2 How the generated CSS emits utilities (verified in `dist/assets/index-Cdozh24t.css`)

Layer order: `@layer properties, theme, base, components, utilities`. The `:root,:host{…}` block in `@layer theme` contains **every** token (static mode), e.g. `--color-cyber-neon:#c6ff00;--color-neon-glow:#c6ff0059;--color-surface-card:#0d161fb8;…` (rgba values are rewritten to 8-digit hex by Lightning CSS).

| Utility (source) | Emitted rule | Re-skinnable by overriding `--color-*` under `html[data-theme]`? |
|---|---|---|
| `bg-cyber-neon` | `.bg-cyber-neon{background-color:var(--color-cyber-neon)}` | **Yes** |
| `text-cyber-neon` | `.text-cyber-neon{color:var(--color-cyber-neon)}` | **Yes** |
| `bg-cyber-bg`, `text-cyber-text`, `border-cyber-border`, `bg-cyber-card`, `text-cyber-muted`, `bg-surface-card`, `border-border-neon`, `bg-neon-wash`, `text-status-live`, `text-neon-ink`, `rounded-card`, `font-sans`, `font-mono` | all `var(--…)` | **Yes** |
| `hover:text-cyber-neon`, `hover:border-cyber-neon` | `…:hover{color:var(--color-cyber-neon)}` | **Yes** |
| `bg-cyber-neon/10` (and `/5`, `/15`, `text-cyber-neon/70`, `border-cyber-neon/40`, `bg-cyber-bg/85`, `/95`, `bg-neon-wash/40`) | **Dual emission**: `.bg-cyber-neon\/10{background-color:#c6ff001a}` followed by, inside `@supports (color:color-mix(in lab,red,red))` (38 such blocks), `.bg-cyber-neon\/10{background-color:color-mix(in oklab,var(--color-cyber-neon) 10%,transparent)}` | **Yes on every browser with `color-mix`** (all current evergreen). The literal `#c6ff00xx` fallback is what a browser without `color-mix` would show — lime would leak there. |
| `shadow-neon`, `shadow-neon-strong` | `.shadow-neon{--tw-shadow:0 0 0 1px var(--tw-shadow-color,#c6ff0029), 0 6px 22px -8px var(--tw-shadow-color,#c6ff0066);…}` | **No** — the token value is inlined at build time (shadow tokens are resolved, not referenced). Must be overridden by class (`src/themes/pinaka/styles/core.css:174-176` already does this for `.shadow-neon`; `.shadow-neon-strong` is not yet covered). |
| `selection:bg-cyber-neon selection:text-black` (body `@apply`, L192) | `::selection{background-color:var(--color-cyber-neon)}`, `::selection{color:var(--color-black)}` | Background yes; text is literal black (`--color-black:#000`). `core.css:14-17` overrides both. |
| Preflight font | `--default-font-family:var(--font-sans)`; `.font-sans{font-family:var(--font-sans)}` | **Yes** (override `--font-sans` on `html[data-theme]`). Pinaka deliberately leaves `--font-sans/--font-mono` untouched (`tokens.css:47-48`) and re-fonts headings by class (`core.css:21-32`). |

Counts in dist CSS: `var(--color-cyber-neon)` ×20; literal `#c6ff00` ×42 (token declarations + `/opacity` fallbacks + inlined shadows + component-layer literals listed in §2.1); literal `#060b10` ×9; `color-mix(in oklab …)` ×22, `color-mix(in srgb …)` ×16 (the latter from the component layer's `color-mix(in srgb, var(--diff-hue) …)` rules, which are var-driven and therefore theme-safe).

**Conclusion:** overriding `--color-*` (and `--shadow-*`, `--focus-ring-color`) under `html[data-theme="pinaka"]` re-skins every Tailwind colour utility and every `var()`-based component rule. An unlayered rule in a separately loaded stylesheet (the dynamically imported `pinaka.css`) beats the layered `:root` declaration regardless of order. What it does **not** re-skin is enumerated in §2.

---

## 2. Hardcoded brand colours outside the tokens

Brand literals: lime `#c6ff00` = `rgb(198,255,0)`, bright `#ddff6b`, dim `#8fb800`, gradient end `#b2e600`, ground `#060b10` = `rgb(6,11,16)`, sunken `#04080c` = `rgb(4,8,12)`, shadow tint `rgb(2,6,11)`.

### 2.1 `src/index.css` — literals in the component layer (grouped by selector)

**Lime family (must be overridden by the theme):**

| Selector | Line(s) | Literal |
|---|---|---|
| `.btn-primary` background-image | 323 | gradient end stop `#b2e600` (other stops are tokens) |
| `.card-interactive::before` (hover top-sheen) | 506 | `rgba(198,255,0,.07)` → transparent |
| `.input:focus, .select:focus, .textarea:focus` box-shadow ring | 558 | `0 0 0 3px rgba(198,255,0,.14)` |
| `.ambient-wash` | 967 | `rgba(198,255,0,.05)` top radial |
| `.ambient-grid` | 973–974 | `rgba(198,255,0,.16)` ×2 grid lines |
| `.surface::after, .surface-raised::after, .surface-overlay::after, .card-interactive::after` top hairline | 1034–1035 | `rgba(198,255,0,.16)` ×2 |
| `.holo::before` | 1065 | `rgba(198,255,0,.09)` |
| `.card-interactive[data-tilt]:not([data-selflit])` | 1084 | `rgba(198,255,0,.075)` |
| `.surface-overlay[data-tilt]:not([data-selflit])` | 1097 | `rgba(198,255,0,.05)` |
| `.holo[data-tilt]:hover` | 1106 | `0 0 0 1px rgba(198,255,0,.10)` |
| `.boot::before` | 1141 | `border-right-color: rgba(198,255,0,.32)` |
| `.boot::after` | 1146 | `border-bottom-color: rgba(198,255,0,.55)` |
| `.breach-score` text-shadow | 1301 | `rgba(198,255,0,.28)` |
| `html, body` reticle cursor (SVG data URI) | 1474 | `stroke='%23c6ff00'`, `fill='%23c6ff00'`, `fill='%23ddff6b'` |
| interactive cursor (`a, button, [role=button], summary, label[for], checkbox, radio, select, .btn, .card-interactive, .tab, .chip`) | 1479 | `stroke='%23ddff6b'`, `fill='%23ddff6b'`, `fill='%23ffffff'` |
| `.cursor-ring[data-hot="1"]` | 1520 | `inset 0 0 12px rgba(198,255,0,.12)` |
| `.hold-panel` | 1991 | `0 0 0 1px rgba(198,255,0,.08), 0 0 80px -30px rgba(198,255,0,.35)` |

**Ground / blue-black family (theme should re-tint to its own ground):**

| Selector | Line(s) | Literal |
|---|---|---|
| `.btn-primary:active` inset | 343 | `rgba(2,6,11,.35)` |
| `.ambient-wash` | 968–969 | `rgba(64,120,160,.07)`, `rgba(120,90,200,.05)` |
| `.ambient-vignette` | 992 | `rgba(4,8,12,.55)` |
| `.ambient-veil` | 1003–1005 | `rgba(6,11,16,.55)`, `rgba(6,11,16,.5)`, `rgba(6,11,16,.42)`, `rgba(4,8,12,.6)` |
| `.breach-root` | 1171–1172 | `rgba(6,11,16,.72)` → `rgba(4,8,12,.93)` |
| `.breach-root.is-legendary` | 1237–1238 | `rgba(14,8,22,.74)` → `rgba(4,6,12,.94)` |
| `.breach-plate::before` | 1273 | `rgba(4,8,12,.92)` |
| `.access-root` | 1381 | `rgba(8,14,20,.94)` → `rgba(4,8,12,.97)` |

**Semantic (non-brand) literals — the theme may leave these; listed for completeness:** `.btn-danger` 401–409 (`rgba(224,112,95,…)`, `#ffd6d1`), `.btn-success` 415–423 (`rgba(126,203,143,…)`, `#dcf6cf`), `.is-invalid` 569–570, badge borders 634–643 (`rgba(126,203,143,.35)`, `rgba(224,179,74,.35)`, `rgba(224,112,95,.35)`, `rgba(185,140,247,.42)`, `rgba(166,224,74,.5/.18)`, `rgba(107,118,129,.35)`, `rgba(255,106,94,.35)`, `rgba(109,159,212,.35)`, `rgba(255,92,122,.4)`), `.boot::after` 1147 (`rgba(109,159,212,.4)`), insane violet 1229/1247/1251/1620/1628/1666/1677 (`rgba(185,140,247,…)`), `.uplink-dot` 2025/2029, `.event-clock[data-tone]` 2045–2046, white sheens 324/332/357/372/378/624/816/860/1022/1082/1095.

**Coverage by the in-progress Pinaka `core.css` (read at 271 lines):** overrides exist for surface hairlines (L60–68), `[data-tilt]` specular (82–91), `.holo` (92–97), `.btn-primary` (115–128), input focus (156–161), boot rings (179–180), `.breach-root` (184–186), `.hold-panel` (188–190), `.uplink-dot` (191), cursors (206–215), `.cursor-ring` border (217), `.ambient-wash` + hides `.ambient-grid` (221–226), `.shadow-neon` (174–176). **Not yet covered** (will leak lime under the theme): `.card-interactive::before` L506 hover sheen, `.breach-score` text-shadow L1301, `.cursor-ring[data-hot]` inset L1520, `.shadow-neon-strong`, `.btn-primary:active` inset L343, and the `color-mix` fallback hexes in `/opacity` utilities on non-`color-mix` browsers.

### 2.2 `.tsx` / `.ts` — literals (inline styles, SVG attributes, arbitrary utilities)

CSS cascade **cannot** override inline `style=` or SVG presentation attributes without `!important` or a code path; these need either a theme-aware code change or a documented accepted leak.

| File:line | Context | Literal | Override route |
|---|---|---|---|
| `src/SharedComponents.tsx:33-40` | `TOKEN` object for recharts (`neon #c6ff00`, `neonDim #8fb800`, `neonBright #ddff6b`, `solved #a6e04a`, `fail #e0705f`, `border #1a242d`, `borderSubtle #131c25`, `muted #8a949d`) | hex | Used at L489–517: `<stop stopColor={TOKEN.neon/neonDim}>`, `CartesianGrid stroke`, axis `stroke/tick.fill`, `Tooltip cursor`, `Area stroke`, `dot/activeDot fill` with `stroke:'#060b10'` (L516–517). SVG attrs → needs runtime token read (e.g. `getComputedStyle(document.documentElement).getPropertyValue('--color-neon')`) or `currentColor`. |
| `src/SharedComponents.tsx:140` | decorative tick overlay | `repeating-linear-gradient(90deg, rgba(6,11,16,.55) …)` inline | inline style |
| `src/Scoreboard.tsx:17-20` | `COLORS` for recharts line series | `#c6ff00` first, `#ddff6b` last (+ category hexes) | SVG stroke props |
| `src/UserProfile.tsx:174` | category pie `COLORS` | `#c6ff00` first (+9 category hexes) | SVG fill props |
| `src/TeamProfile.tsx:371` | category pie `COLORS` | `#c6ff00` first (+7) | SVG fill props |
| `src/components/AuthPage.tsx:60-70` | rotating radar logo SVG | `stopColor="#c6ff00"` ×2, `stroke="#c6ff00"` ×7 | SVG attrs (could become `currentColor`) |
| `src/components/AuthPage.tsx:907-910` | Google "G" logo | `#4285F4 #34A853 #FBBC05 #EA4335` | **Must NOT be themed** (brand mark) |
| `src/App.tsx:1803` (anchor `isSolved ? 'border-border-neon shadow-[0_0_14px_rgba(198,255,0,0.18)]'`) | solved challenge card glow | arbitrary utility → emitted as literal class | override the escaped class in theme CSS, or target `html[data-theme] .card-interactive.border-border-neon` |
| `src/App.tsx:1817` (anchor `style={{ background: 'rgba(198, 255, 0, 0.06)' }}`) | solved wash span | inline | inline style — needs `!important` theme rule on `.card-interactive > span[aria-hidden].absolute.inset-0` or code change |
| `src/App.tsx:1047` (anchor `borderColor: 'rgba(224, 179, 74, 0.45)'`) | paused banner | amber inline | not lime; optional |
| `src/components/admin/AdminDashboard.tsx:2312` | paused toggle border | `rgba(224, 179, 74, 0.45)` inline | not lime; optional |
| `src/components/b2r/B2RBoard.tsx:159`, `:336`; `src/components/chain/ChainedBoard.tsx:136` | progress bars | `linear-gradient(90deg,#8fb800,#c6ff00,#ddff6b)` inline | inline style |
| `src/components/chain/ChainExperience.tsx:171` | progress bar | `linear-gradient(90deg,#8fb800,#c6ff00)` inline | inline style |
| `src/components/b2r/B2RBoard.tsx:205`, `ChainedBoard.tsx:30` | solved chain node | `bg-cyber-neon shadow-[0_0_8px_rgba(198,255,0,0.6)]` | `bg-` is token-driven; shadow is a literal class |
| `src/components/chain/ChainExperience.tsx:142` | selected chip | `shadow-[0_0_18px_rgba(198,255,0,0.25)]` | literal class |
| `B2RBoard.tsx:212`, `ChainedBoard.tsx:37` | burning node | `from-orange-400 to-red-500 shadow-[0_0_8px_rgba(255,120,24,0.7)]` | fire, not lime |
| `B2RBoard.tsx:26-29`, `ChainedBoard.tsx:17-20`, `ChainExperience.tsx:34-37` | `DIFF_COLOR` | `var(--color-diff-*, #7dd3fc/#fcd34d/#fb923c/#c084fc)` | token-driven; fallbacks only fire if the var is missing — safe |
| `src/components/chain/Chain2D.ts:11-12` | raster assets | `chain-strip.png` (167 KB), `fire.gif` (3.6 MB) drawn on a 2D canvas; heat glow colour comes from a `glow:[r,g,b]` parameter (L131–143) | raster; cannot be recoloured by CSS |
| Tailwind default palette in TSX | `bg-black/70` ×3, `bg-black/80` ×2 (lazy-chunk modal scrims), `from-orange-400/to-red-500` ×2, `text-orange-300/400`, `bg-emerald-400` ×2, `text-emerald-300/400`, `border-emerald-500/30`, `bg-orange-500/15`, `bg-emerald-500/10` | oklch literals | not brand; fine |

Inline **token-driven** colour usage (theme-safe, 170+ sites): `var(--color-diff-hard)` ×28, `var(--color-neon)` ×21, `var(--color-border-danger)` ×17, `var(--color-cyber-neon)` ×5, etc.

### 2.3 Static files outside React (theme never reaches them)

`public/legal.css` L6,10,12,20,21,26,39,44,46,48,52,53,55,62 (lime + ground), `public/404.html:53` (`#c6ff00`), `public/site.webmanifest:7-8` (`#060b10` ×2). `privacy.html`, `support.html`, `terms.html` share `legal.css`.

---

## 3. Environment subsystem

### 3.1 Module map and public API

| Module | Exports | Notes |
|---|---|---|
| `src/components/environment/performance.ts` | `type Tier = 'high'|'medium'|'low'|'still'`; `interface Capability { tier, webgl, pointerFx, motion, dpr, cinematic }`; `getCapability()` (cached, L97–100); `resetCapability()` (L103) | `measure()` L46–94: SSR → still; `prefers-reduced-motion` → **still** (L52–54: webgl false, pointerFx false, motion false, dpr 1); `getFx()==='off'` → still (L58–60); `deviceMemory<=2 || cores<=2` → **low** (L69–71: no WebGL, pointerFx false, motion true); WebGL probe (L76–85) fails → low with `pointerFx:!coarse`; `coarse || mem<=4 || cores<=4` → **medium** (dpr 1.5, `pointerFx:!coarse`, `cinematic: fx==='cinematic'`); else **high** (dpr 2). Cache invalidated only on fx change (L107) — an OS reduced-motion flip mid-session is not re-measured. |
| `environment/fx.ts` | `type FxLevel = 'cinematic'|'calm'|'off'`; `getFx()`, `setFx()`, `subscribeFx()` | localStorage key `cyberhx.fx`, default `cinematic` (L21–27). |
| `environment/mood.ts` | `type Mood = 'auth'|'calm'|'focus'|'compete'`; `interface MoodProfile { presence, drift, traffic, horizon }`; `setMood()`, `setDifficultyFocus()`, `setProgress()`, `moodProfile()`, `subscribeMood()`, `triggerWarp(strength=1)`, `subscribeWarp()` | `PROFILES` L39–44 (auth 1/1/1/1, calm .6/.6/.65/.28, focus .7/.8/.85/.22, compete .86/1.25/1.45/.34); `DIFFICULTY_LEAN` L66–71; progress multiplier L87–89 (quantised to 1/20, L126). |
| `environment/signals.ts` | `interface ChallengeSignal { id, solved, heat }`; `interface SignalFrame { kind, heat, solved: Float32Array }`; `setLatticeCapacity()`, `latticeCapacity()`, `setSignals()`, `nodeForChallenge()`, `pulseChallenge()`, `subscribeSignals()`, `subscribePulse()` | No-op when capacity 0 (static tier). Challenges sorted by id, spread by stride (L76–83). |
| `environment/cursor.ts` | `interface CursorState { x,y,nx,ny,vx,vy,speed,active }`; `subscribeCursor()`, `cursor()` | One `pointermove` listener + one rAF loop started on first subscriber, stopped on last unsubscribe (L127–135); paused on `visibilitychange` (L121–124); damping `1-exp(-9·dt)` (L77). |
| `environment/difficulty.ts` | `type Difficulty`; `interface DifficultyProfile { id, label, badge, tiltX, tiltY, tiltMs, stagger, enterMs, atmosphere }`; `DIFFICULTY_PROFILES` (L49–97), `DIFFICULTY_ORDER` (L100), `profileFor()` (L107) | Numeric half of the tier personalities; visual half is `[data-diff]` CSS (index.css L1560–1645). |
| `environment/lattice.ts` | `type Tier = 'high'|'medium'`; `interface LatticeOptions { tier, presence, cinematic? }`; `interface LatticeHandle { nodeCount, resize(), setPointer(x,y), setScroll(fraction), setRunning(on), destroy() }`; `createLattice(canvas, opts) → LatticeHandle | null` | See §3.2. |
| `components/AmbientBackground.tsx` | default `AmbientBackground({ intensity?: 'subtle'|'normal', className? })`; `interface AmbientBackgroundProps` | See §3.3. |
| `environment/CursorRing.tsx` | default `CursorRing()` | Renders `<div class="cursor-ring" aria-hidden data-active data-hot>`; bails if `!getCapability().pointerFx` (L32); writes `style.transform` from `subscribeCursor` (L41); hot test on `pointerover` against `INTERACTIVE` selector (L24–25). Cleans all listeners (L56–61). |
| `environment/SurfaceLight.tsx` | default `SurfaceLight()` (renders null) | One passive `pointermove`; finds nearest `.holo:not([data-selflit]), .card-interactive:not([data-selflit]), .surface-overlay:not([data-selflit])` (L34–38); sets `data-tilt` and writes `--mx/--my` (%) and `--tx/--ty` (−1..1) in one rAF (L50–63); bails if `!pointerFx` (L44); cleanup L99–105. |
| `environment/MagneticElement.tsx` | default `MagneticElement({ children, radius=120, strength=6, className })` | Wrapper `<div class="magnetic">`; chases cursor with `0.18` lerp; bails if `!pointerFx` (L50–51); resets transform on unmount (L92–96). Used once: `AuthPage.tsx:850` (Google button, radius 140, strength 5). |
| `environment/AnimatedView.tsx` | default `AnimatedView({ viewKey, children })` | `motion.div` with `transformPerspective:1400`; in 300 ms (`opacity/scale .99/y -6/rotateX .7`), out 150 ms; `useReducedMotion()` → `initial={false}`, `0.001s` transitions (L43, 64–73); scrolls to top and `triggerWarp(1)` unless reduced (L47–52). |

**Audio** (`src/audio/`): `AudioManager.ts` exports `type SoundName`, `interface PlayOpts`, `play(name, opts)` (L317), `playValidating() → stop` (L335), `initAudioLifecycle() → cleanup` (L399–421: suspends `AudioContext` on hidden tab, resumes if sound on; subscribes to the preference). Context is created lazily on first `play()` after a gesture (L65–72). `preferences.ts`: `soundEnabled()`, `setSoundEnabled()`, `subscribeSoundPref()`; key `cyberhx.sound`, **default ON** (L28). `useSound.ts`: `useSound() → { enabled, setEnabled, toggle }`. Call sites: `App.tsx` ×10 (`open` ×6, `failure` ×2, `success`, `legendary`, `milestone`, `close`, `tick`), `ChainExperience.tsx` ×2, `SoundToggle.tsx` ×1. Everything is synthesised (no audio files) — no asset for a theme to swap; a theme that wants different sounds must add recipes to `AudioManager.ts`.

**Player controls:** `MotionToggle.tsx` (header `App.tsx:965`, auth `AuthPage.tsx:414`; flips fx `off` ↔ previous, key `cyberhx.fx.prev`), `FxToggle.tsx` (Settings `Settings.tsx:418`, radiogroup cinematic/calm/off), `SoundToggle.tsx` (header `App.tsx:964`, Settings `:417`).

### 3.2 `lattice.ts` — WebGL engine details

- Context: `canvas.getContext('webgl', { alpha:false, antialias:false, depth:false, powerPreference:'low-power', preserveDrawingBuffer:false })` with `experimental-webgl` fallback (L545–548). Additive blending `SRC_ALPHA, ONE` (L810); field pass is opaque and clears the frame (L859–866).
- Tiers (L72–75): `high { nodes 420, links 3, pulses 72, dpr 2, stars 1400, octaves 3 }`, `medium { nodes 240, links 2, pulses 40, dpr 1.5, stars 800, octaves 2 }`. `calm` (non-cinematic) → stars ×0.6 (L678), no warp (L785), no roll (L830–832), no scroll pitch (L930).
- Six programs: field (fullscreen noise/nebula/planet/rings), stars, streaks (only while `warp>0.015`, L878), edges, pulses, nodes. Geometry uploaded once (STATIC_DRAW); three DYNAMIC_DRAW identity buffers `aKind/aHeat/aSolved` updated via `bufferSubData` from `subscribeSignals` (L735–744).
- Uniforms (L88–90, 180–182, 356–357, 434): `uTime, uCamZ, uAspect, uPresence, uTraffic, uRoll, uPitch, uWarp, uMouse(vec2), uHorizon, uOctaves, uDpr, uSurgeAt, uSurgeOrigin(vec3)`. **There is no colour uniform.** Every colour is a GLSL literal compiled into the shader strings:
  - field ground `vec3(0.012,0.020,0.028)→(0.020,0.032,0.042)` L217; ring 1 lime `(0.32,0.52,0.12)` L224; ring 2 blue `(0.24,0.34,0.58)` L228; strata `(0.30,0.46,0.16)` L235; cold pool `(0.10,0.20,0.34)` L238; beams `(0.26,0.40,0.14)` L250; nebula A lime-teal `(0.16,0.36,0.20)`, B violet `(0.22,0.13,0.38)` L261–262; dust `(0.55,0.75,0.6)` L265; planet rim `(0.20,0.50,0.62)→(0.62,0.95,0.35)` L274, body `(0.02,0.05,0.06)` L276; warp flare `(0.35,0.55,0.85)` L280; grain L286–287.
  - edges `(0.62,0.82,0.30)` L311; pulses `(0.85,1.0,0.45)` L343; nodes cool `(0.55,0.74,0.42)` / hot `(0.86,1.0,0.42)` / solved `(1,1,0.82)` L420–424; stars `(0.78,0.86,1.0)` / lime `(0.80,1.0,0.55)` / warm `(1.0,0.85,0.65)` L457–459; streaks `(0.70,0.88,1.0)` L490.
  - ⇒ A theme **cannot** recolour the lattice via CSS; options are (a) add palette uniforms, (b) fork, or (c) not mount `AmbientBackground` under the theme and provide its own environment (the Pinaka README's stated plan: `PinakaEnvironment` replaces `<AmbientBackground/>`).
- Frame loop (L812–923): rAF always scheduled; `running=false` early-returns (no GPU work) — `setRunning(!document.hidden)` is wired by `AmbientBackground.tsx:88`. Mood/pointer/scroll/warp are eased per frame (L833–842).
- `destroy()` (L932–945): unsubscribes mood/signals/pulse/warp, `cancelAnimationFrame`, `deleteBuffer` for all tracked buffers, `deleteProgram` ×6, `WEBGL_lose_context.loseContext()`. No `webglcontextlost` listener (context loss mid-session leaves the canvas blank over `.ambient-wash`).
- Initial geometry build is O(n²) neighbour search (L604–617): 420² ≈ 176k distance calcs on `high` — runs on every mount/remount (including each fx change, since the `useEffect` deps include `fx`).

### 3.3 `AmbientBackground.tsx` — DOM, modes, lifecycle

- `Mode = 'high'|'medium'|'static'`; `detectMode()` L40–44: `!cap.webgl → static`, `tier==='high' → high` else `medium` (so `low` and `still` both render static).
- DOM (L117–132): `<div aria-hidden class="ambient-root" data-mode={mode} style="--ambient-grid-opacity: .075|.045">` → `.ambient-layer.ambient-wash` (always), `.ambient-layer.ambient-grid` (static only), `<canvas class="ambient-canvas">` (high/medium), `.ambient-veil`, `.ambient-vignette`.
- Listeners (L100–104): window `pointermove` (normalised to −1..1 → `setPointer`), `resize` (rAF-coalesced), `scroll` (`scrollY/innerHeight` → `setScroll`), document `visibilitychange` → `setRunning`. Cleanup (L106–113) removes all, `destroy()`s the lattice, `setLatticeCapacity(0)`.
- Effect deps `[mode, intensity, fx]` (L114) → changing the fx dial rebuilds the lattice in place. `setLatticeCapacity(handle.nodeCount)` L80 feeds `signals.ts`.
- CSS (`index.css`): `.ambient-root` L952–959 `position:fixed; inset:0; z-index:0; pointer-events:none; overflow:hidden; contain:strict`; `.ambient-layer` L960–964 `inset:-10%; will-change:transform`; `.ambient-grid` L971–981 (perspective-rotated grid, masked); `.ambient-canvas` L982–988; `.ambient-vignette` L989–993; `.ambient-veil` L995–1006 (readability contract; `[data-mode="static"]` → opacity .45, L1007). `.page-shell` L946–949 `position:relative; z-index:1` is the required sibling wrapper.
- Mount points: `App.tsx:898-901` (`<div … data-tier={getCapability().tier}><AmbientBackground /><SurfaceLight /><CursorRing />`), `AuthPage.tsx:406-408` (`intensity="normal"` + SurfaceLight + CursorRing), `main.tsx:26` (uplink hold screen, `intensity="normal"`). `data-tier` is read once per App render; idle card animations are gated on `[data-tier="high"]` (index.css L1591, 1606, 1630–1632).
- Store consumers in `App.tsx`: `MOODS` map L617–624 (`challenges→focus, scoreboard/teams/users→compete, admin→focus, else calm`), `setSignals` L609, `setProgress` L641, `setDifficultyFocus` L650, `pulseChallenge` L1650 (on fresh solve), `initAudioLifecycle` L629, `DIFFICULTY_*` L118/143–146/796, `profileFor` L1753. `AuthPage.tsx:210/352/356/389` `setMood('auth'|'compete')`.

### 3.4 CSS cursor rules (`index.css` L1458–1521)

- `@media (pointer: fine)` L1472: `html, body { cursor: url("data:image/svg+xml,…") 16 16, crosshair }` (L1474); interactive selector list (L1476–1478) gets a brighter reticle with `pointer` fallback (L1479); `input:not([type=checkbox]):not([type=radio]), textarea { cursor:text }` (L1483–1485); `:disabled, [aria-disabled=true] { cursor:not-allowed }` (L1486).
- `.cursor-ring` L1492–1521: `position:fixed; 38px; z-index:140; will-change:transform,opacity`; `[data-active="1"]` opacity .42; `[data-hot="1"]` 60px, `border-color: var(--color-neon-bright)`, glow.
- Verified in dist: `cursor:url` ×2, one `@media (pointer:fine)` block. CSP `img-src … data:` permits the SVG cursor. `src/themes/pinaka/styles/core.css:206-217` re-declares both cursors in gold with the same selector list.
- Stale comment: `index.css:1042` references a `useSpotlight` hook that does not exist; `--mx/--my` are written by `SurfaceLight.tsx`.

---

## 4. Reduced-motion handling

### 4.1 CSS

`src/index.css:1938-1982` `@media (prefers-reduced-motion: reduce)`: universal `animation-duration/transition-duration: .001ms !important`, `animation-iteration-count:1`, `scroll-behavior:auto`; then explicit kills: `.btn:hover/.card-interactive:hover/.chip:active/.btn:active transform:none`, `.skeleton::after display:none`, `.badge-live::before`, `.ambient-root { --ambient-gx/gy: 0 }`, `.ambient-layer transform:none`, `.holo[data-tilt]:hover`, `.holo::before display:none`, `.scan-in`, `.boot::*`, `.breach-stage/.breach-scan display:none`, `.op-intro display:none`, `.milestone-sweep display:none`, `.card-interactive[data-diff]::after`, `.submit-trace::before`, `.deny/.deny-mark/.deny-stamp`, `.badge-blood > svg`, `.rail-item*`, `.tab/.btn-ghost/.chip hover transforms`, `.tab::after`, `.rail-item::before/.rail-dot`, `.stagger > *`, `.standings-row[data-moved]::after`, `.access-ring display:none`, **`.cursor-ring display:none`**, `.magnetic transform:none`. Second block `index.css:2061-2065` for `.hold-scan/.hold-caret/.hold-line/.hold-dot/.uplink-dot[data-down]`. Both blocks survive the build (2 `@media (prefers-reduced-motion:reduce)` in dist CSS). Pinaka `core.css:269-271` adds `.pk-diamond { box-shadow:none }`.

### 4.2 JS

- `performance.ts:52-54` — reduced motion ⇒ tier `still` ⇒ no WebGL, no pointer FX, `data-tier="still"` on the App root (so `[data-tier="high"]` idle animations never arm).
- `useReducedMotion()` from `motion/react` (19 files import `motion/react`): `AnimatedView.tsx:43`, `App.tsx:186, 433, 1743, 2233`, `AuthPage.tsx:206`, `AccessSequence.tsx:46`, `BreachConfirm.tsx:64`, `OperationIntro.tsx:29`, `MilestoneBanner.tsx:28`, `HoldScreen.tsx:63`, `AnimatedNumber.tsx:32`, `ChainExperience.tsx:41` (passed into `createChain2D` as `reducedMotion`, `Chain2D.ts:24/106/163/177` — sway/bob zeroed, fire frozen), `SharedComponents.tsx:110, 172`, `Scoreboard.tsx:700` (disables `layout` springs and stagger), `TeamsList.tsx:107`, `Settings.tsx:108`, `TeamProfile.tsx:376`, `AdminDashboard.tsx:132`, `OwnerFlagVault.tsx:53`.
- Manual `matchMedia('(prefers-reduced-motion: reduce)')`: `UserProfile.tsx:25-27`, `UsersList.tsx:19-21`.
- Design rule (`src/styles/DESIGN_SYSTEM.md:367-369`): CSS animation is handled globally; JS-driven motion must check itself.

---

## 5. Bundle composition

### 5.1 Dependencies vs. actual imports (`package.json`)

| Dependency | Imported in `src/`? | Evidence |
|---|---|---|
| `@google/genai` ^1.29 (14 MB on disk) | **No** | 0 imports in `src/`, 0 `GoogleGenAI/genai` markers in dist JS |
| `express` ^4.21 | **No** | 0 imports; `api/ctftime.js` is a plain Vercel handler `(req,res)` with no express import |
| `dotenv` ^17 | **No** | 0 imports, 0 markers in dist |
| `recharts` ^3.8 | Yes | `SharedComponents.tsx:10`, `Scoreboard.tsx:5` |
| `motion` ^12 | Yes | 19 files `from 'motion/react'` |
| `@supabase/supabase-js` | Yes | `lib/supabase.ts:2`, `hooks/useAuth.ts:3` |
| `react-markdown` + `remark-gfm` | Yes | `App.tsx:42-43`, `ChainExperience.tsx:3-4` |
| `lucide-react` | Yes | 26 files; 106 `createLucideIcon` instances in dist |
| `@tailwindcss/vite`, `@vitejs/plugin-react`, `vite` | build-time | `vite.config.ts:1-2,6` |

The three unused deps have **zero bundle impact** (tree-shaken absent imports); they are only install weight.

### 5.2 Output (`dist/assets/`)

| Chunk | Raw | Gzip | Loaded |
|---|---|---|---|
| `index-CHdDcwJs.js` | 1,543,058 B | 433,155 B | eager (`dist/index.html:106`, single `<script type="module" crossorigin>`) |
| `index-Cdozh24t.css` | 110,020 B | 19,907 B | eager (`:107`) |
| `ChainedBoard-DVkNFA4z.js` | 4,327 B | 1,782 B | lazy — `App.tsx:87 React.lazy(() => import('./components/chain/ChainedBoard'))` |
| `B2RBoard-BhrnBGo4.js` | 10,051 B | 3,042 B | lazy — `App.tsx:90` |
| `ChainExperience-CrKEM90l.js` | 13,145 B | 5,195 B | lazy — `ChainedBoard.tsx:8`, `B2RBoard.tsx:13`, `B2RManager.tsx:10`, `ChainManager.tsx:11` |
| `chain-strip-DJESy3fN.png` | 166,926 B | — | fetched by `Chain2D.ts:11` at runtime |
| `fire-BtNaZYJd.gif` | **3,633,661 B** | — | fetched by `Chain2D.ts:12` only when the chain canvas mounts |

Suspense boundaries: `App.tsx:1443/1453`, `ChainedBoard.tsx:60`, `B2RBoard.tsx:282`, `B2RManager.tsx:576`, `ChainManager.tsx:389`. No `modulepreload` hints are emitted for the lazy chunks.

### 5.3 What dominates the 1.54 MB index chunk (estimates; minified, pre-gzip, from marker counts + known library sizes)

| Contributor | Evidence in dist | Est. share |
|---|---|---|
| **recharts 3.10** + its runtime (immer ×9, redux ×8 markers, decimal.js-light ×7, d3-shape/scale/array/interpolate, victory-vendor) | `recharts` ×76 | ~450–550 KB — the largest single dependency |
| **react-dom 19.2** (+ scheduler) | `react-dom` ×3, `scheduler` ×1 | ~170–190 KB |
| **@supabase/supabase-js 2.112** (auth-js ×48, realtime/phoenix ×3, `websocket` ×6, postgrest, storage, functions) | `supabase` ×73 | ~180–230 KB |
| **motion / framer-motion 12** | `motion` ×39, `framer` ×2 | ~150–200 KB |
| **react-markdown 10 + remark-gfm 4 + micromark/mdast/hast/unified** | `micromark` ×3, `remark` ×7, `ccount` ×16 | ~120–160 KB |
| **lucide-react** (106 icons, tree-shaken) | `lucide` ×109 | ~40–60 KB |
| **First-party code** — 18,270 lines: `AdminDashboard.tsx` 2,901, `App.tsx` 2,615, `Scoreboard.tsx` 1,109, `AuthPage.tsx` 950, `lattice.ts` 947 (GLSL strings ship verbatim: `uTime` ×22, `gl_FragColor` ×6), `TeamProfile.tsx` 722, `B2RManager.tsx` 584, `SharedComponents.tsx` 525, `Settings.tsx` 476, `AudioManager.ts` 421, … | — | ~250–350 KB |

Observation (pre-existing, out of theme scope): all admin surfaces (`AdminDashboard`, `B2RManager`, `ChainManager`, `OwnerFlagVault` ≈ 4,150 lines) are in the eager chunk; only the chain/B2R boards are lazy.

### 5.4 What the theme layer adds to the load path

`main.tsx:53` now awaits `bootTheme()` before `createRoot(...).render(...)`. On the default build this is one resolved microtask; under `?theme=pinaka`/`VITE_THEME=pinaka` it awaits `import('./pinaka/boot')` (new JS chunk) → `await import('./pinaka.css')` (new CSS chunk, `boot.ts:13`) → appends a Google Fonts `<link id="pinaka-fonts">` (`boot.ts:17-23`, non-blocking) → rewrites `<meta name="theme-color">` (`boot.ts:25-26`) → (latest read) `Promise.all([import('./components/CategoryGlyph'), import('./components/BowMotifs')])` and `overrideCategoryIcons(...)`. Failure of the CSS/JS import falls back to `cyberhx` (`themes/index.ts:116-126`). The theme therefore **delays first paint by the pinaka CSS+JS round trip** by design (no FOUC), and must keep the default build's path a no-op.

---

## 6. Fonts and CSP

### 6.1 Font loading

- `src/index.css:1`: `@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap')` — preserved verbatim at the top of `dist/assets/index-Cdozh24t.css` (`@import"https://fonts.googleapis.com/css2?family=Inter…"`). This is a render-blocking chain: HTML → app CSS → Google CSS → `fonts.gstatic.com` woff2 (`display=swap` mitigates FOIT). `index.html` has **no** `preconnect`/`dns-prefetch` for `fonts.googleapis.com` or `fonts.gstatic.com` (only Supabase, `index.html:173-174`).
- Tokens: `--font-sans`, `--font-mono` (`index.css:14-15`); preflight `--default-font-family: var(--font-sans)`.
- Pinaka adds Cinzel 500/600/700 + EB Garamond 400/500/600/400i via a runtime `<link rel="stylesheet">` (`src/themes/pinaka/config.ts:13-14`, `boot.ts:17-23`) — same two hosts, no CSP change needed; UI stays on Inter/JetBrains Mono (`tokens.css:47-48`).

### 6.2 `vercel.json:90` Content-Security-Policy (applies to `/(.*)`)

| Directive | Allowed | Implication for a theme |
|---|---|---|
| `default-src` | `'self'` | Anything not listed (media, worker, manifest, object) must be same-origin. Audio is synthesised (no files) so `media-src` never matters. |
| `script-src` | `'self' 'unsafe-inline' https://challenges.cloudflare.com` | No CDN scripts (no three.js from a CDN); Turnstile only. Inline JSON-LD/`unsafe-inline` allowed. |
| `style-src` | `'self' 'unsafe-inline' https://fonts.googleapis.com` | Inline `style=` and motion's inline styles OK; Google Fonts CSS OK. |
| `connect-src` | `'self' https://*.supabase.co wss://*.supabase.co` | No other XHR/fetch/WebSocket. A theme must not fetch anything remote. |
| `img-src` | `'self' https: data:` | Any https image, data URIs (the SVG cursors), bundled assets. |
| `font-src` | `'self' https://fonts.gstatic.com` | Only Google-hosted or bundled fonts. |
| `frame-src` | `https://challenges.cloudflare.com` | Turnstile iframe only. |
| `frame-ancestors` / `base-uri` / `form-action` | `'none'` / `'self'` / `'self'` | — |

Other headers (`vercel.json:65-87`): `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `X-XSS-Protection: 1; mode=block`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`.

---

## 7. `index.html` and manifest

`index.html` (239 lines after the tool's offset; original file lines = shown − 127):

- Viewport `width=device-width, initial-scale=1.0`; `<title>` "CyberHX CTF – Free Capture The Flag Platform | …"; description/keywords/author; `<meta name="cyberhx-build" content="2026-09-24.2">`; robots; canonical `https://ctf.cyberhx.com/`.
- Open Graph (`og:type website`, `og:site_name`, `og:url`, `og:title`, `og:description`, `og:image https://ctf.cyberhx.com/og-image.jpg` 1200×630 + alt, `og:locale`) and Twitter card (`summary_large_image`, `@cyberhx`). Note: `og-image.jpg` is **not** present in `public/` (pre-existing).
- Favicons: `/favicon.ico` (any), `/favicon.svg`, `/apple-touch-icon.png` 180, `/favicon-32x32.png`, `/favicon-16x16.png`; `<link rel="manifest" href="/site.webmanifest">`.
- `<meta name="theme-color" content="#060b10">` — single value, no `media` light/dark variants, no `<meta name="color-scheme">`. Pinaka rewrites it at runtime to `#0a0e17` (`config.ts:10`, `boot.ts:25-26`).
- `preconnect` + `dns-prefetch` to `https://ikdyrqwdltinghuecvsb.supabase.co`.
- Three JSON-LD blocks: `WebSite` (with `SearchAction` → `?q={search_term_string}`), `Organization` (logo = og-image), `SportsEvent` (online, free offer).
- Body: `<div id="root">` + `<script type="module" src="/src/main.tsx">` (rewritten by Vite to the hashed chunk).

`public/site.webmanifest`: `name "CyberHX CTF"`, `short_name "CyberHX"`, `display standalone`, `start_url /`, `background_color #060b10`, `theme_color #060b10`, `lang en`, icons `favicon.svg` (any), `icon-192.png`/`icon-512.png` (any maskable), `categories [education, games, utilities]`, `screenshots [/og-image.jpg]`. The manifest is static — the PWA splash/background stays `#060b10` under any runtime theme.

---

## 8. Fixed layers, `backdrop-filter`, and z-index stacking inventory

### 8.1 z-index (source) — confirmed in dist CSS (`z-index:-1,0,1,2,10,15,20,30,50,100,110,120,140,200,4000,4500,5000`)

| Layer | Where | z | Position |
|---|---|---|---|
| `.holo::before` light | `index.css:1069` | −1 | absolute (inside `isolation:isolate`) |
| `.ambient-root` | `index.css:955` | 0 | **fixed**, `contain:strict`, `pointer-events:none` |
| `.btn-primary::after` | `:331` | 0 | absolute |
| `.page-shell` | `:948` | 1 | relative — stacking context for all page UI |
| `.btn > *`, `.card-interactive::after`, `.breach-plate` | `:288, 1079, 1279` | 1 | — |
| `.btn.is-loading::before`, `.deny-stamp` | `:445, 1835` | 2 | absolute |
| Notification badge; Scoreboard sticky `<thead>` | `App.tsx:253`; `Scoreboard.tsx:1066` | 10 | absolute / sticky |
| `.op-intro` | `:1654` | 15 | absolute (in modal) |
| `.breach-root`; mobile difficulty picker | `:1166`; `App.tsx:1340` | 20 | absolute / relative |
| `.access-root`; mobile dropdown | `:1377`; `App.tsx:1359` | 30 | absolute |
| Nav (`sticky top-0 backdrop-blur-xl`); notifications dropdown; auth MotionToggle | `App.tsx:905, 266`; `AuthPage.tsx:413` | 50 | sticky / absolute / **fixed** |
| Challenge modal | `App.tsx:2241` (`ChallengeModal`, mounted at `App.tsx:1677` — **outside** `AnimatedView`) | 100 | **fixed inset-0** |
| Team-invite modal | `App.tsx:1556` (outside `AnimatedView`) | 110 | **fixed inset-0** |
| OwnerFlagVault | `OwnerFlagVault.tsx:132` | 120 | **fixed inset-0** |
| `.cursor-ring` | `:1503` | 140 | **fixed** |
| `.milestone-root` | `:1697` | 200 | **fixed**, `pointer-events:none` |
| ChainExperience modal | `ChainExperience.tsx:183` | 4000 | **fixed inset-0** `bg-black/70` |
| B2RBoard modal | `B2RBoard.tsx:249` | 4500 | **fixed inset-0** `bg-black/70` |
| B2RManager / ChainManager modals | `B2RManager.tsx:562`, `ChainManager.tsx:375` | 5000 | **fixed inset-0** `bg-black/80` |

Stacking-context creators to respect: `.page-shell` (z-index on relative), the nav (`backdrop-blur-xl` + sticky + z-50), `.btn`/`.holo`/`.card-interactive` (`isolation:isolate`, `transform-style:preserve-3d`, L258/1050/1076), `AnimatedView`'s `motion.div` (perspective/transform during the 150–300 ms transition — any `position:fixed` descendant would then be positioned relative to it; today all fixed modals/banners mount **after** `</AnimatedView>` at `App.tsx:1597/1603/1675/1747`, which the theme must preserve).

### 8.2 `backdrop-filter` sites (GPU-expensive; each creates a compositing layer and repaints on scroll)

`index.css:457-458` `.surface` blur(12px); `:465-466` `.surface-raised` blur(12px); `:488-489` `.card-interactive` blur(12px) (**every challenge card** — 100+ on a board); `:915-916` `.scrim` blur(6px) saturate(.9) (full-screen modal veil); `:1382` `.access-root` blur(2px); `:1716` `.milestone-plate` blur(14px). TSX: `App.tsx:905` nav `backdrop-blur-xl` (full-width sticky, over the lattice); `App.tsx:997` mobile menu `backdrop-blur-xl`; `ChainExperience.tsx:94` `backdrop-blur-xl`, `:140` `backdrop-blur-sm`. Pinaka README rule 5 forbids `backdrop-filter` on full-screen layers.

Other compositing hints: `will-change` on `.ambient-layer`, `.holo`, `.breach-*`, `.magnetic`, `.cursor-ring`, `.milestone-root`, `.op-intro-*` (index.css L963, 1056, 1190–1262, 1318, 1437, 1504, 1575, 1668–1749); `contain:strict` on `.ambient-root` (L958). Blur filters in TSX (paint-heavy): `UserProfile.tsx:220` `blur-3xl`, `AuthPage.tsx:529` `blur-2xl`, `TeamProfile.tsx:403` `blur-xl`, `SharedComponents.tsx:137` `mix-blend-overlay`.

---

## 9. Storage keys and attributes a theme must not collide with

`localStorage`: `cyberhx.fx` (fx.ts:18), `cyberhx.fx.prev` (MotionToggle.tsx:18), `cyberhx.sound` (preferences.ts:22), plus Supabase auth storage; Pinaka adds `cyberhx.theme` (themes/index.ts:31), `cyberhx.pinaka.intro.v1`, `cyberhx.pinaka.journey.collapsed` (config.ts:97-100). DOM attributes already in use: `data-tier` (App root), `data-mode` (`.ambient-root`), `data-diff`, `data-tilt`, `data-selflit`, `data-active`/`data-hot` (`.cursor-ring`), `data-moved`/`data-me` (standings), `data-stage` (submit form), `data-state` (access steps), `data-tone` (event clock), `data-down` (uplink dot). Pinaka adds `data-theme`, `data-world`, `data-phase` on `<html>` (`themes/index.ts:115`, `hooks.ts:55-65`).

---

## 10. Documented invariants the theme implementers inherit

From `src/styles/DESIGN_SYSTEM.md`: never rename `--color-cyber-*` (L365); no new npm deps (L366); animate only transform/opacity, everything non-essential dies under reduced motion (L367–369); keep `aria-label`s, semantic elements and focus outlines (L370); presentation only — never touch Supabase calls, hooks, handlers, props or routing (L371); `.page-shell` is required whenever `<AmbientBackground/>` is on the page (L265–268, 280–282); `<FxToggle/>` is the single dial and no effect may bypass it or `prefers-reduced-motion` (L292–295). Note the doc's §5 prose describes an older 2D ambient (30 fps, ≤42 nodes) — the shipped implementation is the WebGL lattice described in §3.2 of this report.

---

<a id="admin-security"></a>
## Admin and security inventory

# CyberHX frontend — Admin & Security Inventory (for the Pinaka presentation skin)

Scope: `/home/user/CyberHx_ShadowCopy/frontend` (branch `feature/pinaka-ramayana-experience`, HEAD `ce23b64`). Read-only audit of `src/components/admin/AdminDashboard.tsx` (2901 lines), `admin/B2RManager.tsx` (584), `admin/ChainManager.tsx` (397), `admin/OwnerFlagVault.tsx` (265), plus `vercel.json`, `index.html`, `src/index.css`, `src/lib/url.ts`, `src/hooks/useAuth.ts`, `src/lib/supabase.ts`, `src/api/submitFlag.ts`, `src/lib/scoreboardExport.ts`, `src/components/AuthPage.tsx`, `src/App.tsx`, `src/themes/*`, `src/styles/DESIGN_SYSTEM.md`. No files were modified, no builds run.

Note: a theme scaffold already exists on this branch (`src/themes/index.ts`, `src/themes/pinaka/{boot,config,hooks}.ts`, `pinaka.css` + `styles/*.css`) and `src/themes/index.ts` was being edited on disk while this audit ran. Section 5 describes what it does today so QA knows the mount points.

---

## 1. Admin surface inventory

### 1.1 Mount point and access gate

| Item | File:line | Behaviour the theme must not alter |
|---|---|---|
| Admin nav tab (desktop) | `src/App.tsx:941-945` | Rendered only when `profile?.is_admin`; class `tab is-active text-cyber-neon` / `text-cyber-neon/70` (the only coloured nav tab). |
| Admin entry (mobile menu) | `src/App.tsx:1013-1014` | Same gate. |
| Paused banner link "Admin → Event" | `src/App.tsx:1044-1055` | Shown to admins only while `is_paused`; amber inline style `rgba(224, 179, 74, 0.45)` + `var(--color-diff-medium-wash)`. |
| View switch | `src/App.tsx:1543-1544` | `currentView === 'admin'` renders `<AdminDashboard />` inside `AnimatedView`. |
| Outer gate component | `AdminDashboard.tsx:907-971` | Three pre-render states: (a) **Verifying access** spinner while `loading || profileLoading` (914-923); (b) **Could not verify your account** card with `Retry` → `window.location.reload()` when `profileError` (928-950, deliberately non-danger styling: `--color-border-strong`); (c) **Access Denied** card when `!profile || profile.role !== 'admin'` (952-968, danger tokens `--color-border-danger`, `--color-diff-hard-wash`, `--color-diff-hard`). Comment at 908: "HARDENED: Auth guard — server-confirmed role check". |
| Inner dashboard | `AdminDashboard.tsx:974-1305` | Reads `me = useAuth().profile` for `is_owner` (978, comment 975-977 says this is cosmetic; `owner_reveal_flag()` re-checks in DB). |

### 1.2 Header (always visible on every tab)

| Element | File:line | Classes / styling |
|---|---|---|
| Admin shield mark | `AdminDashboard.tsx:1081-1087` | Inline `borderColor: var(--color-border-danger)`, `backgroundColor: var(--color-diff-hard-wash)`, icon `color: var(--color-diff-hard)` — the admin identity mark deliberately uses danger tokens. |
| Title "Admin Panel" / "CyberHX Control Center" | 1089-1090 | `text-h1 text-cyber-text`, `label-micro`. |
| **Reset Event Scores** button | 1095-1102 | `btn btn-danger btn-md w-full sm:w-auto` + `is-loading` while `resetting`; icon `RotateCcw`. Helper text 1103-1105 "Deletes every submission and zeroes the scoreboard. You will be asked to confirm." |
| StatsBar | 118-171 | Four `surface` tiles (Users/Teams/Challenges/Submissions) via `profiles`, `teams`, `get_challenges_count`, `submissions`; `motion.div` entrance honours `useReducedMotion`. Gradient hairline uses `var(--color-cat-*)` / `var(--color-neon)`. |

### 1.3 Tabs

Tab list `AdminDashboard.tsx:1065-1074`, renderer 1112-1127 (`role="group" aria-label="Admin sections"`, each `button.tab` with `aria-pressed`, `.is-active`; container `inline-flex w-max … rounded-control border border-border-subtle bg-surface-rail` inside a horizontally scrolling `overflow-x-auto custom-scrollbar` strip).

| id | Label | Icon | Rendered by |
|---|---|---|---|
| `challenges` | Challenges | Flag | inline, 1130-1278 |
| `chains` | Chains | Link2 | `<ChainManager challenges={challenges} />` 1281 |
| `b2r` | B2R | Server | `<B2RManager challenges onChanged={loadChallenges} />` 1282 |
| `users` | Users | Users | `<UsersTab />` 1283 (1312-1649) |
| `teams` | Teams | Shield | `<TeamsTab />` 1284 (2471-2901) |
| `submissions` | Submissions | Activity | `<SubmissionsTab />` 1287 (1654-1747) |
| `notifications` | Notifications | Megaphone | `<NotificationsTab />` 1290 (1752-1861) |
| `event` | Event | Zap | `<EventTab />` 1291 (1866-2464) |

Default tab `'challenges'` (983). The OwnerFlagVault is portal-less: rendered at 1293-1302 inside `<AnimatePresence>` at the dashboard root.

### 1.4 Challenges tab

**Catalogue header** 1139-1149: "Challenge catalogue", count, `Add Challenge` (`btn btn-primary btn-md`). Replaced by the editor when `showForm || editChallenge` (1132-1137).

**Desktop table** 1153-1221 (`TableFrame` = `surface overflow-hidden` > `overflow-x-auto custom-scrollbar`, 36-42; `Th` = `px-5 py-3.5 label-micro`, 44-53; `min-w-[860px]`):

| Column | Cell | Line |
|---|---|---|
| Title | category dot `var(--color-cat-${c.category})` + `text-body font-semibold` | 1169-1174 |
| Category | `badge` with inline `color: var(--color-cat-…)` | 1175-1177 |
| Difficulty | `badge badge-easy|medium|hard|insane` via `DIFF_BADGE` (28-33) | 1178-1180 |
| Points | `font-mono text-cyber-neon` | 1181 |
| Max Attempts | `(c as any).max_attempts ?? 15` | 1182 |
| Visible | `button.chip` + `.is-active` when live, `aria-pressed`, text Live/Hidden, Eye/EyeOff | 1184-1190 |
| Actions | owner-only vault key (`btn btn-ghost btn-sm btn-icon text-cyber-neon`, 1194-1201), Edit (`btn btn-ghost btn-sm btn-icon`, 1202-1205), **Delete** (`btn btn-ghost btn-sm btn-icon text-diff-hard hover:text-danger-fg`, 1206-1209) | 1192-1211 |

Empty state 1214-1218 (`EmptyState`, 56-69). **Mobile card list** 1224-1276 duplicates every control (`md:hidden`); both DOM trees are always present and switched purely by `hidden md:block` / `md:hidden` (1153, 1224).

**ChallengeForm** (182-902), root `surface p-5 sm:p-gutter lg:p-8 mb-8`:

| Section | Lines | Fields / controls |
|---|---|---|
| Header | 530-543 | Edit3/Plus icon in `border-border-neon bg-neon-wash`, "Changes go live the moment you save." / "Saved hidden by default…", badge `badge-info` Editing / `badge-neon` Draft |
| Placement (create only) | 546-607 | `role="radiogroup"` of 4 `role="radio"` buttons (Free / Chain / B2R Free / B2R Chain, 216-221); selected = `border-border-neon bg-neon-wash`; chain select `#chal-chain-series` (580-586); B2R chain select `#chal-b2r-series` (590-596); B2R explainer 598-604 |
| Identity | 609-628 | `field()` helper 505-525 (`input`, `is-invalid` + `aria-invalid` when required+error); Title*, Author (hidden for B2R), Category `#chal-category` `select`, Difficulty `#chal-difficulty` |
| Scoring & limits | 630-643 | Points / User flag points, Root flag points `#chal-root-points` (B2R), Max Attempts, Tags |
| Description | 645-650 | `textarea#chal-description`, "Markdown is rendered on the player-facing challenge page." |
| **Flag panel** | 652-718 | Danger-tinted card via inline `borderColor: var(--color-border-danger)`, `backgroundColor: var(--color-diff-hard-wash)` (656); AlertTriangle `var(--color-diff-hard)` (659); label text `var(--color-diff-hard)` (661); `flagClobbered` `role="alert"` box 671-685 (same tokens + `color: var(--color-diff-hard)`); `input#chal-flag` with inline `style={{ borderColor: 'var(--color-border-danger)' }}` (686-690); B2R `input#chal-root-flag` (699-703, same inline border); Visible checkbox `#visible` `accent-cyber-neon` + badge `badge-solved` Live / `badge-locked` Hidden (708-717) |
| Hints | 721-766 | `Add Hint` `btn btn-outline btn-sm`; per hint `surface-inset`, badge, remove `btn btn-ghost btn-sm btn-icon text-diff-hard hover:text-danger-fg` (741-745), `textarea#hint-text-i`, `input#hint-cost-i` |
| Attachments | 769-823 | `input[type=file]#chal-files-<id>` `sr-only` (775-781) + `label.btn.btn-outline.btn-sm` "Add files" (782-784); uploaded rows with `<a href={safeHttpUrl(file.url) || undefined} target=_blank rel=noopener noreferrer>` (797), `badge badge-solved` Uploaded, remove (800-803 danger ghost); pending rows `badge` "Uploads on save", remove (812-815); `fileError` `role="alert"` `color: var(--color-danger-fg)` (820-822). Limits 50 MB/file, 200 MB/challenge (259-260) |
| Resource Links | 826-870 | `Add Link` outline; per link label/url inputs; remove danger ghost (846-850) |
| Error banner | 873-882 | `role="alert"`, inline `var(--color-border-danger)` / `var(--color-diff-hard-wash)` / `color: var(--color-danger-fg)` |
| Footer | 883-899 | `Save Challenge` `btn btn-primary btn-md` + `is-loading`; `Cancel` `btn btn-ghost btn-md`; requirement hint |

Save path (346-503): `admin_upsert_b2r_box` (387-400) or `admin_upsert_challenge` (418-431), then `admin_set_chain_members` / `admin_set_b2r_members` append (406-415, 438-447), hints updated in place (456-485), attachments uploaded last to bucket `challenge-files` (308-327). Error strings surface through `setError` / `setFileError` only — the editor stays open on failure (491-498).

### 1.5 Chains tab — `ChainManager.tsx`

| Element | Lines | Classes |
|---|---|---|
| Master toggle card "Chain Experience Engine" | 200-222 | `surface … border-border-subtle`; button `btn btn-md shrink-0` + **`btn-danger` when enabled ("Disable Chain Experience") / `btn-primary` when disabled**; Loader2 spin while busy |
| Series list | 226-268 | `ul` rows `rounded-lg border p-3`, selected `border-border-neon bg-cyber-neon/5`; Published pill `bg-cyber-neon/15 text-cyber-neon`, Draft `bg-surface-sunken`; per row publish toggle `btn btn-ghost btn-sm btn-icon` (257-259) and **Delete** `btn btn-ghost btn-sm btn-icon text-diff-hard` (260-262); `New chain` `btn btn-primary btn-sm` (229-231) |
| Editor form | 271-370 | Error box `rounded-md border border-border-danger bg-diff-hard-wash … text-diff-hard` (278); fields Name, Category (`select`), Difficulty, Display order, Short description (`maxLength 2000`), Briefing file URL (`type=url`, 2048), Inline briefing textarea (`maxLength 20000`, "Markdown — no HTML is rendered"); members `select.select-sm` add (324-331), ordered list with up/down/remove (`btn btn-ghost btn-sm btn-icon`, remove has `text-diff-hard`, 348-350); actions `Save draft` `btn btn-secondary btn-md`, `Save & publish` `btn btn-primary btn-md`, `Preview chain` `btn btn-ghost btn-md` (358-368) |
| 3D preview modal | 374-394 | `fixed inset-0 z-[5000] … bg-black/80`, `role="dialog" aria-modal`, range slider "Simulate solved", `Close` ghost; lazy `ChainExperience` in `Suspense` |

RPCs: `admin_list_chain_series`, `admin_set_chain_experience`, `admin_upsert_chain_series` (three-step save 126-152, publish state applied last — "server re-checks >= 2 members" 147), `admin_set_chain_members` ("validated server-side" 140), `admin_delete_chain_series`.

### 1.6 B2R tab — `B2RManager.tsx`

| Element | Lines | Classes |
|---|---|---|
| Master toggle "B2R — Boot-to-Root" | 278-297 | Same pattern: **`btn-danger` when enabled ("Disable B2R") / `btn-primary` when disabled** |
| Error box | 299 | `border-border-danger bg-diff-hard-wash text-diff-hard` |
| Boxes list | 304-347 | Rows with Published/Draft pill, `chained`/`free` pill, user/root points; publish toggle ghost icon (336-338); **Delete** `btn btn-ghost btn-sm btn-icon text-diff-hard` (339-341). Hint text "Create new boxes in Challenges → Placement" (307) |
| B2R chains list | 350-387 | `New B2R chain` `btn btn-primary btn-sm`; publish toggle; **Delete** ghost danger (379-381) |
| Box editor | 391-468 | Name, Category, Difficulty, Display order, Description (Markdown, 10000), Briefing URL; **USER FLAG** / **ROOT FLAG** inputs (435, 443) placeholder "Unchanged — type a new flag to replace it" (blank = keep hash, 48, 139-141); user/root points; Max attempts "(0 = unlimited)"; Published checkbox `accent-cyber-neon` (457); `Save box` `btn btn-primary btn-md` (463-465) |
| Series editor | 471-558 | Mirrors ChainManager editor; add box select (518-521); Save draft / Save & publish / Preview |
| Preview modal | 561-581 | `fixed inset-0 z-[5000] bg-black/80`, "Simulate rooted" slider |

RPCs: `admin_list_b2r_boxes`, `admin_list_b2r_series`, `admin_set_b2r_enabled`, `admin_upsert_b2r_box`, `admin_delete_b2r_box`, `admin_upsert_b2r_series`, `admin_set_b2r_members`, `admin_delete_b2r_series`. `onChanged` (→ `loadChallenges` in the dashboard) fires after box save/publish/delete (149, 157, 165).

### 1.7 Users tab — `AdminDashboard.tsx:1312-1649`

- Data: `admin_list_users` RPC (1344-1346; comment 1341-1343 explains why not `user_scores`: banned users must stay listable).
- Search `input.input.w-full.pl-9` with Search icon + clear button (1419-1436); client-side filter (1321-1328); pagination 50/page (1310, 1330-1334, 1616-1646: first/prev/next/last, `btn btn-ghost|btn-secondary btn-sm btn-icon`).
- **Table** 1439-1533 (`min-w-[880px]`): `#`, Username (strike-through `line-through text-diff-hard` when banned 1459; `badge badge-solved` Owner 1462-1467), Email, Role `select.select.w-[8.5rem].py-1.5` (1472-1483, disabled for owner / busy), Points, Solved, Status `badge badge-hard` Banned / `badge-solved` Active (1488-1490), Action column (1492-1522): **Hand over** `btn btn-outline btn-sm` (only `iAmOwner && !u.is_owner && u.role === 'admin' && !u.is_banned`, 1494-1503), **Ban** `btn btn-danger btn-sm` (1513-1521; disabled + Lock icon + title when target is admin), owner row shows a permanently disabled `btn btn-danger btn-sm` with Lock (1506-1509), **Unban** `btn btn-success btn-sm` (1511-1512). Rows dim `opacity-60` while busy (1455).
- **Mobile cards** 1536-1614 duplicate all of the above.

### 1.8 Teams tab — `AdminDashboard.tsx:2471-2901`

- Data: paginated `teams`, `team_scores`, admin `profiles`, member `profiles` (2503-2575); protected teams map (owner/admin members) 2484, 2547-2553.
- Controls: search (2642-2658), `Sort by rank` toggle `btn btn-sm btn-primary|btn-secondary` (2660-2666), pagination 50/page (2770-2800).
- **Table** 2670-2732 (`min-w-[720px]`): `#`, Team Name (`badge badge-neon` Selected), Rank (`text-cyber-neon` top 3), Score, Solves, Members, Status (`badge-hard`/`badge-solved` + `badge-neon` Owner/Admin protected marker 2712-2716), Actions = `banControl` (2591-2604): Unban `btn btn-success btn-sm`; locked `btn btn-danger btn-sm` disabled with Lock + `title`; Ban `btn btn-danger btn-sm`. Row `onClick` selects; buttons `stopPropagation`.
- **Mobile cards** 2735-2768.
- **Detail aside** 2803-2898 (`surface p-5 … lg:sticky lg:top-6`): close ghost icon; `<dl class="surface-inset">` Rank/Score/Solves/Status/Invite Code (`admin_team_invite`, masked `••••••••` until loaded, 2837)/Members/Created; member list (`admin_team_members`, 2851-2871); `StatusLine` msg; **Danger zone** (`label-micro` 2877): Ban/Unban Team `btn btn-danger|btn-success btn-sm btn-block` (2878-2883), **Delete Team** `btn btn-danger btn-sm btn-block` (2884-2888), explanatory copy 2889-2895.

### 1.9 Submissions tab — 1654-1747

`admin_list_submissions` (`p_limit: 100`, 1661; comment 1658-1660: raw `submitted_flag` reachable only through this admin-gated RPC). Table 1673-1714 (`min-w-[820px]`): User, Challenge, Submitted (plaintext `submitted_flag` truncated with `title`, plus hash prefix `text-micro text-text-faint`), Result `badge badge-solved` "✓ Correct" / `badge-hard` "✗ Wrong", Time `toLocaleString()`. Mobile cards 1717-1744. No pagination/refresh.

### 1.10 Notifications tab — 1752-1861

Broadcast form (`surface p-5 sm:p-gutter`, 1793-1835): type chips `chip` + `typeColors[t]` when selected (1784-1789, 1807-1813: info/success/warning/danger washes), `input#notif-title`, `textarea#notif-message`, `StatusLine`, **Send to All Users** `btn btn-primary btn-lg btn-block` + `is-loading` (1830-1834). Inserts directly into `notifications` (1770). History (last 10, 1760-1763) cards with per-type wash class (1845) and **delete** `btn btn-ghost btn-sm btn-icon absolute top-2 right-2 text-current opacity-60 hover:opacity-100` (1846-1850).

### 1.11 Event tab — 1866-2464 (`max-w-2xl`)

| Block | Lines | Controls |
|---|---|---|
| Header + status badge | 2111-2125 | status string 2107 (`Inactive` / `Active (no time set)` / `⏳ Scheduled` / `🏁 Ended` / `🟢 LIVE`) → `badge-live` / `badge-locked` / `badge-info` |
| Name / Start / End | 2127-2149 | `input#event-name`; `DateTimeField` `#event-start`, `#event-end` (`src/components/DateTimeField.tsx`: `input[type=datetime-local]` with `showPicker()`, absolute calendar button `tabIndex=-1`, preview line of resolved local time + zone) |
| Switches | 2151-2180 | checkboxes `#active` Event Active, `#registration` Registration Open, `#allow-team-changes`, `#allowlist-only` Restrict Play to Allowlist (`accent-cyber-neon`) — applied on Save |
| Registration allowlist | 2183-2207 | raw-utility `textarea` (2193-2199), **Add to allowlist** `btn btn-secondary btn-md` (2201-2204), `allowMsg` muted span; RPCs `admin_allowlist_count`, `admin_allowlist_add` |
| Scoreboard **Freeze** | 2209-2252 | panel border `var(--color-border-neon)` + `color-mix(... var(--color-neon) 8%)` when frozen, else subtle/inset (2214-2223); button `btn btn-md` + `btn-secondary` when frozen ("Unfreeze Scoreboard") / **`btn-primary` when live ("Freeze Scoreboard")** (2242-2251) |
| Scoreboard **Hide** | 2254-2288 | panel border `var(--color-border-danger)` + `var(--color-diff-hard-wash)` when hidden (2255-2263); button **`btn-danger` when visible ("Hide Scoreboard")** / `btn-secondary` when hidden ("Show Scoreboard") (2278-2287) |
| Auto-freeze notes | 2290-2301 | text only |
| Clock / **Pause** | 2304-2351 | panel border hard-coded `rgba(224, 179, 74, 0.45)` + `var(--color-diff-medium-wash)` when paused (2311-2314); `badge badge-medium` Paused / `badge-neon` Running; button **`btn-danger` when running ("Pause Event")** / `btn-primary` when paused ("Resume Event") (2331-2339); pause note `input.input.mt-3` (2342-2349, 300 chars) |
| Quick extend | 2353-2364 | `+15 / +30 / +60 min` `btn btn-outline btn-sm` |
| Save | 2367-2374 | **Save Event Settings** `btn btn-primary btn-md` + `StatusLine` |
| **Start a new event** | 2376-2460 | section `border-t-2` with inline `borderColor: var(--color-border-danger)` (2377); heading `color: var(--color-diff-hard)` (2378); `input#new-event-name` (required, `maxLength 80`); three checkboxes `#cc` Delete all challenges, `#ct` Delete all teams, `#cn` Clear notifications (2405-2423); `input#confirm-new-event` placeholder `START NEW EVENT`, disabled until a name exists (2429-2432); **Start New Event** `btn btn-danger btn-md` disabled until `confirmText.trim() === 'START NEW EVENT'` (2436-2443); owner-only **Export scoreboard (CSV)** `btn btn-secondary btn-md` (2444-2454) |

### 1.12 OwnerFlagVault — `OwnerFlagVault.tsx`

- Opened from the Challenges key button (owner only). Root `fixed inset-0 z-[120] flex items-center justify-center p-4` (132); `motion.div.scrim` with `onClick={onClose}` (133-140); panel `surface-overlay relative w-full max-w-lg overflow-hidden` with `role="dialog" aria-modal aria-label` (141-150).
- On mount calls `owner_reveal_flag` (71-83). States: loading skeleton (170-176); `flag` view with `<code id="vault-flag-value" class="select-all break-all font-mono text-cyber-neon">` (188-193), **Copy** `btn btn-secondary btn-sm` (194-201, clipboard with DOM-range fallback 95-112), countdown "Closing in Ns" (203-206), **auto-close after 45 s** only while a flag is on screen (38, 87-93); `missing` view with TriangleAlert `text-diff-medium`, `input#vault-capture` (`input … is-invalid` on error, 226-238), **Verify & store** `btn btn-primary btn-lg` + `is-loading` (239-246) calling `owner_capture_flag` (114-129), `role="alert"` `text-diff-hard` error (248-250); `error` view box with inline `var(--color-border-danger)` / `var(--color-diff-hard-wash)` (254-260).
- Escape closes (65-69, listener on `window`). Close `btn btn-ghost btn-sm btn-icon` (164-166).

### 1.13 Master table — dangerous / irreversible actions and their confirmation UX

| # | Action | File:line (handler) | Trigger UI (file:line, classes) | Confirmation UX | Server call |
|---|---|---|---|---|---|
| 1 | **Reset Event Scores** (deletes all submissions) | `AdminDashboard.tsx:1050-1063` | 1095-1102 `btn btn-danger btn-md` (+`is-loading`) | native `confirm('⚠️ Are you sure? This will DELETE all submissions and reset scores to ZERO!')`; result via `alert()` | `admin_reset_event` (`src/api/submitFlag.ts:92-104`) |
| 2 | **Start New Event** (wipes submissions/challenges/teams/notifs) | 2004-2047 | 2436-2443 `btn btn-danger btn-md` | typed phrase `START NEW EVENT` (2011, 2438) + required name (2006); **CSV export must succeed first, else nothing is cleared** (2014-2024); feedback via `StatusLine` | `admin_start_new_event` |
| 3 | **Delete challenge** | 1023-1048 | 1206-1209 / 1263-1266 `btn btn-ghost btn-sm btn-icon text-diff-hard hover:text-danger-fg` | `confirm('Delete this challenge? This cannot be undone.')`; B2R rows blocked by `alert()` (1024-1027); failure `alert()`; best-effort storage sweep | `admin_delete_challenge` |
| 4 | Toggle challenge visibility (publish/hide) | 1007-1020 | 1184-1190 / 1244-1249 `chip` + `is-active` | **no confirm**; B2R rows blocked by `alert()`; failure `alert()` | `admin_set_challenge_visibility` |
| 5 | Replace a live flag (edit form) | 346-503 (flag at 371, 424) | 686-690 danger-bordered `input#chal-flag` | **no confirm** — a non-blank flag on edit overwrites the hash (copy at 666) | `admin_upsert_challenge` |
| 6 | Remove existing attachment | 294-304 | 800-803 danger ghost | `confirm('Remove attachment "…"? Players will no longer see it.')`; error via `setFileError` | storage `remove` + `challenge_files` delete |
| 7 | **Owner flag reveal** | `OwnerFlagVault.tsx:71-83` | `AdminDashboard.tsx:1194-1201` / 1252-1258 `btn btn-ghost btn-sm btn-icon text-cyber-neon` (owner only) | no confirm; audited server-side; 45 s auto-close | `owner_reveal_flag` |
| 8 | **Owner flag capture** (writes plaintext to vault) | `OwnerFlagVault.tsx:114-129` | 239-246 `btn btn-primary btn-lg` | no confirm; server verifies hash before storing | `owner_capture_flag` |
| 9 | Disable/Enable Chain Experience | `ChainManager.tsx:73-80` | 214-221 `btn btn-md btn-danger` (enabled) / `btn-primary` | **no confirm**; failure `alert()` | `admin_set_chain_experience` |
| 10 | Publish/unpublish chain | 163-169 | 257-259 ghost icon | **no confirm**; failure `alert()` | `admin_upsert_chain_series` |
| 11 | **Delete chain** | 171-177 | 260-262 `btn btn-ghost btn-sm btn-icon text-diff-hard` | `confirm('Delete chain "…"? Challenges and solves are NOT affected.')` | `admin_delete_chain_series` |
| 12 | Save & publish chain | 118-161 | 362-364 `btn btn-primary btn-md` | client validation (109-116), no confirm | three RPCs |
| 13 | Disable/Enable B2R | `B2RManager.tsx:113-120` | 293-296 `btn-danger` / `btn-primary` | **no confirm**; `alert()` | `admin_set_b2r_enabled` |
| 14 | **Delete B2R box** (deletes both flag challenges + submissions) | 160-166 | 339-341 ghost `text-diff-hard` | `confirm('Delete B2R box "…"? This removes BOTH its user and root flag challenges and their submissions. This cannot be undone.')` | `admin_delete_b2r_box` |
| 15 | Replace B2R user/root flag | 125-152 | 435, 443 `input.input` | **no confirm**; blank keeps | `admin_upsert_b2r_box` |
| 16 | Publish/unpublish box or B2R series | 154-158, 231-235 | 336-338, 376-378 ghost icons; 457 checkbox | **no confirm**; `alert()` | `admin_upsert_b2r_box` / `_series` |
| 17 | **Delete B2R chain** | 237-243 | 379-381 ghost `text-diff-hard` | `confirm('Delete B2R chain "…"? Boxes, flags and solves are NOT affected.')` | `admin_delete_b2r_series` |
| 18 | **Ban / Unban user** | `AdminDashboard.tsx:1350-1364` | 1513-1521 `btn btn-danger btn-sm`; 1511-1512 `btn btn-success btn-sm`; owner row disabled `btn-danger` 1506-1509 | `confirm('Ban <user>?' / 'Unban <user>?')`; failure `alert()` | `admin_set_user_ban` |
| 19 | **Change role** (player/moderator/admin) | 1368-1381 | 1472-1483 / 1570-1581 `select.select` | `confirm('Change <user> from <role> to <role>?')`; failure `alert()` | `admin_set_user_role` |
| 20 | **Transfer ownership** | 1386-1405 | 1495-1503 / 1583-1587 `btn btn-outline btn-sm` "Hand over" (owner viewing a non-banned admin) | native `prompt()` requiring the exact username (1387-1396); mismatch `alert()`; failure `alert()` | `admin_transfer_ownership` |
| 21 | **Ban / Unban team** | 2606-2631 (`act`) | 2598-2603 / 2881-2882 `btn btn-danger btn-sm[ btn-block]`; 2594 / 2879 `btn-success` | **no confirm** (only `StatusLine` result) | `admin_set_team_ban` |
| 22 | **Delete team** | 2617-2626 | 2886-2888 `btn btn-danger btn-sm btn-block` | `confirm('Delete this team permanently? Members will be removed from the team.')` | `admin_delete_team` |
| 23 | Send broadcast notification | 1767-1777 | 1830-1834 `btn btn-primary btn-lg btn-block` | no confirm; `StatusLine` | insert `notifications` |
| 24 | Delete notification | 1779-1782 | 1846-1850 ghost icon `text-current` | **no confirm, no error handling** | delete `notifications` |
| 25 | **Pause / Resume event** | 1889-1909 | 2331-2339 `btn-danger` (Pause) / `btn-primary` (Resume) | `confirm(warn)` multi-line text (1892-1894); `StatusLine` | `admin_set_paused` |
| 26 | Quick extend +15/+30/+60 | 1912-1922 | 2356-2361 `btn btn-outline btn-sm` | `confirm('Extend the event by N minutes?\n\nNew end: …')` | direct `event_settings` update |
| 27 | **Freeze / Unfreeze scoreboard** | 2071-2093 | 2242-2251 `btn-primary` (Freeze) / `btn-secondary` (Unfreeze) | `confirm(warn)` (2074-2077) | `admin_set_scoreboard_freeze` |
| 28 | **Hide / Show scoreboard** | 2049-2069 | 2278-2287 `btn-danger` (Hide) / `btn-secondary` (Show) | `confirm(warn)` (2052-2055) | `admin_set_scoreboard_hidden` |
| 29 | Save event settings (activate/deactivate, registration, rosters, allowlist mode, dates) | 1980-1999 | 2368-2372 `btn btn-primary btn-md` | no confirm; diff-only patch vs `loadedEvent` (1937-1939, 1985-1987); `freeze_scoreboard` deliberately excluded (1976-1979) | direct `event_settings` update |
| 30 | Add emails to allowlist | 1953-1974 | 2201-2204 `btn btn-secondary btn-md` | no confirm | `admin_allowlist_add` |
| 31 | Export scoreboard CSV (owner) | 1925-1935 | 2444-2454 `btn btn-secondary btn-md` | no confirm; triggers a download via a transient `<a download>` appended to `document.body` (`scoreboardExport.ts:131-135`) | reads `team_scores`, `profiles`, `public_teams` |

Native dialogs are the confirmation mechanism everywhere: `confirm()` ×16, `prompt()` ×1, `alert()` ×22 across the four files (full list from grep: `AdminDashboard.tsx:295,1009,1017,1025,1028,1031,1051,1059,1061,1352,1360,1369,1377,1387,1394,1401,1895,1915,2055,2077,2618`; `ChainManager.tsx:78,167,172,174`; `B2RManager.tsx:118,156,161,163,233,238,240`). A theme that replaces or wraps `window.confirm/alert/prompt` changes behaviour.

### 1.14 Danger styling vocabulary (what keeps destructive controls visually distinct)

**Tokens** (`src/index.css`): `--color-border-danger: rgba(224,112,95,0.38)` (42); `--color-diff-hard: #e0705f` (63); `--color-diff-hard-wash: rgba(224,112,95,0.12)` (64); `--color-danger-fg: #ffb3ab` (88); `--color-success-fg: #bfeaa7` (89); `--color-status-live: #ff6a5e` (78); amber family `--color-diff-medium #e0b34a` / `-wash` (61-62) used for Pause.

**Component classes** (`src/index.css`):
- `.btn-danger` 399-411: `--btn-fg: var(--color-danger-fg)`, bg `rgba(224,112,95,.12)`, border `rgba(224,112,95,.4)`; hover bg `.2`, border `.7`, `color:#ffd6d1`, red glow shadow. Documented as "tinted, never shouty" (398; DESIGN_SYSTEM.md 199).
- `.btn-success` 413-425 (green tint).
- `.btn:disabled / [disabled] / [aria-disabled]` 428-436: `opacity:.45; filter:saturate(.65); cursor:not-allowed` — the **locked** Ban buttons (owner row, admin row, protected teams) depend on this to read as locked.
- `.btn.is-loading` 437-451: hides label, spinner in `--btn-fg`, `pointer-events:none`.
- `.input.is-invalid / .select.is-invalid / .textarea.is-invalid` 566-571: red border + ring.
- `.badge-hard` 636 (Banned, ✗ Wrong), `.badge-medium` 635 (Paused), `.badge-live` 640, `.badge-locked` 639.
- `.chip.is-active` 769-774: solid lime fill + `--color-neon-ink` — the Live/Hidden visibility chip relies on it.

**Utility usage in admin files**: `text-diff-hard` (danger icon buttons, strike-through banned names 1459/1543/2692/2743, unknown-member warnings ChainManager 345 / B2RManager 533), `hover:text-danger-fg`, `border-border-danger` + `bg-diff-hard-wash` (ChainManager 278, B2RManager 299), `text-status-solved` (StatusLine success 79).

**Inline `style` with tokens** (cannot be overridden by class-level theme CSS; a theme must redefine the variables, not the selectors): `AdminDashboard.tsx:656, 659, 661, 676-678, 690, 694-695, 703, 821, 877, 935, 959-963, 1084-1086, 2217-2221, 2258-2261, 2312-2313, 2377-2378, 2392`; `OwnerFlagVault.tsx:256`; `App.tsx:1047`.

**Non-token hard-codes** (will not follow a token swap): `rgba(224, 179, 74, 0.45)` pause border (`AdminDashboard.tsx:2312`, `App.tsx:1047`); `text-orange-400` Flame icons (`ChainManager.tsx:381`, `B2RManager.tsx:568`); `bg-black/80` preview backdrops (`ChainManager.tsx:375`, `B2RManager.tsx:562`) instead of `.scrim`.

**Danger semantics map** (so a theme keeps meaning intact): `btn-danger` = destructive or player-impacting negative switch (Reset, Start New Event, Ban, Delete Team, Hide Scoreboard, Pause, Disable Chain/B2R); `btn-success` = reversal (Unban); `btn-primary` = constructive/primary (Save, Publish, Resume, Freeze, Enable, Verify & store); `btn-secondary` = neutral revert (Unfreeze, Show, Export, Add to allowlist); `btn-outline` = secondary accent (Hand over, Add Hint/Link/files, +N min); ghost icon + `text-diff-hard` = inline delete/remove.

### 1.15 Feedback conventions

- `StatusLine` (72-85): `role="status" aria-live="polite"`; colour chosen by `msg.startsWith('❌')` → `text-diff-hard`, otherwise `text-status-solved`. Used by Notifications (1829), Event (2373), Teams aside (2874).
- `role="alert"` blocks: 673, 821, 875 (ChallengeForm), `OwnerFlagVault.tsx:249`.
- Everything else is `alert()`.

### 1.16 Admin overlay / z-index stack

| Layer | File:line | z |
|---|---|---|
| Ambient canvas `.ambient-root` | `index.css:952-958` (fixed, `pointer-events:none`) | 0 (content lives in `.page-shell` z 1, 946-949) |
| Sticky nav | `App.tsx:905` | 50 |
| Challenge modal | `App.tsx:2241` | 100 |
| Team invite modal | `App.tsx:1556` | 110 |
| **OwnerFlagVault** | `OwnerFlagVault.tsx:132` | 120 |
| Cursor ring `.cursor-ring` | `index.css:1492-1503` (fixed, pointer-events none) | 140 |
| Milestone banner `.milestone-root` | `index.css:1692-1701` (fixed, pointer-events none) | 200 |
| Chain briefing dialog | `ChainExperience.tsx:183` | 4000 |
| B2R box dialog | `B2RBoard.tsx:249` | 4500 |
| **Admin chain / B2R preview modals** | `ChainManager.tsx:375`, `B2RManager.tsx:562` | 5000 |

All admin modals are `position: fixed; inset: 0` descendants of the app tree (no portals). Any `transform`, `filter`, `perspective`, `contain: paint/layout` or `will-change: transform` a theme places on an ancestor (e.g. a world wrapper around `.page-shell`) turns that ancestor into the containing block and breaks every one of these.

---

## 2. Security posture relevant to a presentation layer

### 2.1 `vercel.json` headers (applies to `/(.*)`)

```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
Content-Security-Policy (vercel.json:32):
  default-src 'self';
  script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com;
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
  connect-src 'self' https://*.supabase.co wss://*.supabase.co;
  img-src 'self' https: data:;
  font-src 'self' https://fonts.gstatic.com;
  frame-src https://challenges.cloudflare.com;
  frame-ancestors 'none';
  base-uri 'self';
  form-action 'self'
```

Consequences for a theme:
- **Scripts**: only same-origin bundles and `challenges.cloudflare.com`. No CDN libraries, no analytics, no web fonts via JS from other hosts. (`'unsafe-inline'` is present but nothing in `src/` relies on inline handlers — `index.html` has only `application/ld+json` blocks at 50-105 and the Vite module at 110.)
- **Styles**: self + inline + `fonts.googleapis.com` (`index.css:1` imports Inter/JetBrains Mono; `themes/pinaka/boot.ts:17-23` appends `<link id="pinaka-fonts">` to `fonts.googleapis.com` — allowed).
- **Fonts**: self + `fonts.gstatic.com` only. Self-hosted `.woff2` under `src/` is fine; any other host is blocked.
- **Images**: any `https:` origin plus `data:` URIs (SVG cursors in `themes/pinaka/styles/core.css:208-214` are `data:` — allowed). Theme README (`src/themes/pinaka/README.md:47-48`) further restricts to bundled/inline assets.
- **connect-src**: Supabase only. No `fetch()` of remote JSON, manifests, Lottie, etc.
- **No `media-src`, `worker-src`, `object-src`, `manifest-src`** → fall back to `default-src 'self'`: audio/video/workers must be same-origin (`src/audio/AudioManager.ts` uses `window.AudioContext`, no remote media).
- **frame-src**: only Cloudflare — the Turnstile widget is an iframe; no other iframes (YouTube embeds, etc.) will load.
- `frame-ancestors 'none'` + `X-Frame-Options: DENY`: the site cannot be embedded; preview harnesses must open it top-level.

`api/ctftime.js` is a Vercel function (scoreboard feed proxy, 30 s edge cache) — unrelated to the SPA.

### 2.2 `dangerouslySetInnerHTML` / raw HTML sinks

None. `grep -rn "dangerouslySetInnerHTML|innerHTML|outerHTML|insertAdjacentHTML|document.write" src index.html` returns nothing. The only DOM-construction code: `AuthPage.tsx:221-227` (script tag, fixed `src`), `scoreboardExport.ts:132-134` (download anchor), `Chain2D.ts:87-92` (fire `<img>` appended to `document.body`), `performance.ts:78` / `Chain2D.ts:157-159` (offscreen canvases), `themes/pinaka/boot.ts:18-22` (font `<link>`).

### 2.3 URL sanitisation — `src/lib/url.ts`

```ts
export function safeHttpUrl(url: unknown): string | undefined {   // url.ts:7-11
  if (typeof url !== 'string') return undefined;
  const trimmed = url.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : undefined;
}
```
Rationale comment (2-6): React does not strip `javascript:`/`data:` on `href`/`src`, so every admin- or user-supplied URL passes through this before reaching a sink; non-http(s) → `undefined` → inert link/image. Call sites: `AdminDashboard.tsx:797` (attachment link), `App.tsx:2376` (attachment), `App.tsx:2400` (resource link), `UserProfile.tsx:235-237` (avatar `src`), `B2RBoard.tsx:114,307` (briefing download), `ChainedBoard.tsx:100`, `ChainExperience.tsx:54` (memoised briefing URL). All external anchors carry `target="_blank" rel="noopener noreferrer"`. A theme that renders any of these URLs elsewhere (e.g. a decorative "briefing scroll") must route through `safeHttpUrl` too.

### 2.4 Markdown rendering

- Library: `react-markdown ^10.1.0` + `remark-gfm ^4.0.1` (`package.json:24,26`). No `rehype-raw`, no `rehypePlugins`, no `skipHtml`/`allowedElements`/`disallowedElements`/`urlTransform`/`components` overrides anywhere (grep returned only the two imports/usages). Therefore: raw HTML inside markdown is **not** rendered (react-markdown never emits HTML without rehype-raw), and the library's default `urlTransform` drops unsafe protocols on links/images.
- Usages: challenge description `App.tsx:2349-2351` wrapped in `MARKDOWN_PROSE` (150-174; Tailwind arbitrary-variant selectors `[&_a]`, `[&_code]`, `[&_pre]`, `[&_table]`…); chain briefing `ChainExperience.tsx:196-198` with `README_PROSE`; fallback text `_No briefing provided for this operation._` (197). Admin editors label the fields as Markdown and `ChainManager.tsx:316` tells admins "no HTML is rendered".
- Links produced by markdown have no `target`/`rel` (they navigate in-tab). The theme may restyle via the prose wrapper classes only; passing a `components` map that re-introduces HTML or changing `urlTransform` would reopen XSS.

### 2.5 Turnstile DOM requirements — `src/components/AuthPage.tsx`

| Requirement | Line |
|---|---|
| Site key from `import.meta.env.VITE_TURNSTILE_SITE_KEY` | 22 |
| Script tag: `document.createElement('script')`, **`id = 'cf-turnstile-script'`**, `src = https://challenges.cloudflare.com/turnstile/v0/api.js`, `async`, `defer`, `onerror → 'blocked'`, appended to `document.head`; a stale tag with that id is removed first; effect keyed on `captchaAttempt` for "Try again" | 215-228 |
| Polls `window.turnstile` every 200 ms for ≤ 20 s, then `blocked` | 265-279 |
| Renders into **`<div ref={turnstileRef} />`** inside `.flex.min-w-fit.justify-center` inside `.custom-scrollbar.w-full.overflow-x-auto` inside `.rounded-control.border.border-border-subtle.bg-surface-inset.px-3.py-2.5` | 755-781 |
| Options `theme: 'dark'`, callbacks `callback` / `expired-callback` / `error-callback` (sets state `ready` / `loading` / `error` + code) | 242-262 |
| Badge Verified/Pending/Unavailable/Failed (`badge badge-solved|badge-locked`, `aria-live`) | 761-775 |
| Explanatory messages for blocked / error / unconfigured | 786-810 |
| Widget reset on mode change and after submit | 292-297, 391-392 |
| Submit is hard-gated on a token | 179, 334 |

The widget is a cross-origin iframe (`frame-src`), ~300×65 px, must stay clickable, unclipped (the wrapper intentionally allows horizontal scroll), and must not be covered by any theme layer; the theme must not remove or re-id the script tag, must not define its own `window.turnstile`, and should not restyle inside the iframe (impossible) or hide Turnstile's own error box (comment 254-256).

### 2.6 Google OAuth DOM requirements

- Button `AuthPage.tsx:882-913`: `type="button"`, `className="btn btn-secondary btn-block"`, inline Google "G" SVG with brand fills `#4285F4 #34A853 #FBBC05 #EA4335` (906-911), label "Continue with Google". Disabled while `loading`; releases itself after 4 s if no navigation (899-901). Registration-closed guard (887-890).
- Flow: `useAuth.loginWithGoogle` → `supabase.auth.signInWithOAuth({ provider:'google', options:{ redirectTo: returnUrl() } })` (`useAuth.ts:185-194`; `returnUrl` from `lib/invite.ts:56-63` builds `${window.location.origin}/?invite=…`). It is a full-page redirect, no GSI script, no popup container.
- Return-path error handling reads `window.location.hash` for `#error=…` and replaces fixed copy (never echoes the fragment), then `history.replaceState` to clear it (310-328).
- No other DOM dependency. A theme must keep the button a real `<button>` in the form, keep the brand SVG colours, and must not intercept the click.

### 2.7 Web storage keys (localStorage only; no `sessionStorage` anywhere)

| Key | Owner | Read / write lines | Purpose |
|---|---|---|---|
| `notif_last_seen` | `src/App.tsx` | get 184, 211; set 227 | Notification bell unread marker (ISO timestamp) |
| `cyberhx.fx` | `src/components/environment/fx.ts:18` | get 23; set 39 | Visual-effects dial `cinematic|calm|off` (DESIGN_SYSTEM.md 292-295) |
| `cyberhx.fx.prev` | `src/components/MotionToggle.tsx:18` | set 32; get 37 | Previous fx value for the motion toggle |
| `cyberhx.sound` | `src/audio/preferences.ts:22` | get 27; set 48 (`'1'`/`'0'`) | Sound preference |
| `cyberhx.invite` | `src/lib/invite.ts:15` | set 30; get 43; remove 51 | Parked `?invite=` code across auth redirects |
| `cyberhx.theme` | `src/themes/index.ts:31` | get 60; set/remove 66-67 | Per-device theme override (`pinaka|cyberhx`) |
| `cyberhx.pinaka.intro.v1`, `cyberhx.pinaka.journey.collapsed` | `src/themes/pinaka/config.ts:97-100` | (declared; components not yet present) | Only keys the theme is allowed to write (README rule 1) |
| `sb-<project-ref>-auth-token` | supabase-js default (`lib/supabase.ts:16-18`, no `storageKey` override) | implicit | Auth session — never touch |

All reads/writes are wrapped in `try/catch` in the helpers; `App.tsx:184,211,227` are not wrapped.

### 2.8 `window` globals read (outside `themes/pinaka`)

`window.turnstile` (AuthPage 217, 236-242, 268, 294, 391); `window.location` (AuthPage 314, 327; AdminDashboard 944 reload; App 867 reload after logout; themes/index 84; invite 23, 56, 63); `window.history` (AuthPage 327; themes/index 91); `window.matchMedia` (UserProfile 26-27, UsersList 20-21, performance.ts 52, 65); `window.innerWidth/innerHeight` (cursor.ts 66-67, 81-82, 99-100; lattice.ts 797-798; AmbientBackground 83-84, 91; App 1794-1795); `window.devicePixelRatio` (lattice 794; ChainExperience 74, 77); `window.scrollY` / `window.scrollTo` (AmbientBackground 91; AnimatedView 48); `window.getSelection` (OwnerFlagVault 107); `window.AudioContext` (audio); `window.localStorage` (preferences 27, 48); `window.addEventListener/removeEventListener` ×12 (keydown in OwnerFlagVault 67-68 and App 2133; resize/scroll/pointermove in environment code). `document.hidden` is used by Scoreboard (520) and the environment loop. `import.meta.env` keys: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (supabase.ts 5-6), `VITE_TURNSTILE_SITE_KEY` (AuthPage 22), `VITE_THEME`, `VITE_THEME_UNTIL`, `VITE_THEME_SWITCH` (themes/index 33-57).

### 2.9 DOM ids and attributes the code depends on

`#root` (main.tsx 54); `#cf-turnstile-script` (AuthPage 219-222); `#vault-flag-value` (OwnerFlagVault 103, 189); `meta[name="theme-color"]` (index.html 43, rewritten by boot.ts 25-26); `#pinaka-fonts` (boot.ts 17-19); `html[data-theme]` (themes/index 115, 125), `html[data-world]` / `[data-phase]` (hooks.ts 57-62). Label-bound form ids (must stay unique and stable): `chal-title|author|points|max_attempts|tags`, `chal-category`, `chal-difficulty`, `chal-root-points`, `chal-description`, `chal-flag`, `chal-root-flag`, `chal-chain-series`, `chal-b2r-series`, `chal-files-<id>`, `visible`, `hint-text-i`, `hint-cost-i`, `link-label-i`, `link-url-i`, `notif-title`, `notif-message`, `event-name`, `event-start`, `event-end`, `active`, `registration`, `allow-team-changes`, `allowlist-only`, `new-event-name`, `confirm-new-event`, `cc`, `ct`, `cn`, `vault-capture`.

### 2.10 Other posture notes

- Supabase client routes every request through `uplinkFetch` (`lib/supabase.ts:12-18`; `lib/uplink.ts`): two gateway failures in 40 s → `HoldScreen reason="uplink"` replaces the app (`main.tsx:22-32`). Themes must not swallow or replace this hold state.
- No `eval`, no `new Function`, no dynamic `import()` of remote code; the only lazy imports are local (`ChainExperience`, `themes/pinaka/boot`, `pinaka.css`).
- `index.html` preconnects to the Supabase project (46-47) and declares `theme-color #060b10` (43).

---

## 3. RLS / server-authority assumptions documented in the client

| Flag / value | Where read | Documented as render-only | Server gate named in comment |
|---|---|---|---|
| `event_settings.chain_experience_enabled` | `App.tsx:410`; `ChainManager.tsx:64-67` | `App.tsx:407-409`: "Master feature flag, server-authoritative (event_settings, admin-only UPDATE). The client reads it for rendering only; every chain read is independently gated in the DB views, so flipping this in the browser exposes nothing." | `public_chain_series` / `public_chain_members` views (`useData.ts:151-155`; `supabase.ts:76-78` "gated … views. Structure only — never flags") |
| `event_settings.b2r_enabled` | `App.tsx:420-421`; `B2RManager.tsx:101-105` | `App.tsx:413-419`: "same server-authoritative posture; every B2R read is independently gated in the DB views… Admins can always open the B2R tab (the DB views already let admins read published boxes regardless of the flag)" | `public_b2r_boxes/series/members` (`useData.ts:194-202`; `supabase.ts:97-101`) |
| `profile.is_admin` (derived from `role === 'admin'`) | `useAuth.ts:86`, `App.tsx:872, 876, 941, 1013, 1044, 1057`, `UserProfile.tsx:272` | `supabase.ts:33` "computed from role for backward compat"; `App.tsx:875` "Server refuses teamless solves; admins included"; `AdminDashboard.tsx:908` "HARDENED: Auth guard — server-confirmed role check" | all `admin_*` RPCs are SECURITY DEFINER with their own checks (`AdminDashboard.tsx:20-21, 417, 1022, 1054; 2609-2612`) |
| `profile.is_owner` | `useAuth.ts:88-90`; `AdminDashboard.tsx:978, 1194, 1252, 2444`; `UsersTab` 1339 | `useAuth.ts:88-89` "Cosmetic only: it decides whether the vault control is drawn. Every read of a flag is authorised again in the database."; `supabase.ts:34-36` "Gates the flag vault in the UI; the server re-checks it in is_owner() and never trusts this field."; `AdminDashboard.tsx:975-977`; `OwnerFlagVault.tsx:21-26` "Both RPCs check is_owner() in the database, the vault table has RLS with no policies and every privilege revoked, and each read is logged." | `owner_reveal_flag`, `owner_capture_flag` |
| `is_paused` | `App.tsx:739, 871-872, 1044, 1057` | client swaps in `HoldScreen` for non-admins (1057-1058); `AdminDashboard.tsx:1893` "Submissions and hints are refused for them" | `submit_flag_tx` / `unlock_hint` |
| `hide_scores`, `freeze_scoreboard` | **not read client-side on the player path**; `Scoreboard.tsx:555-569` calls `scoreboard_state` RPC (`scores_hidden`, `masked`, `freeze_time`); comment 568 "Hidden: the views return no rows for us anyway, so do not ask." | admin tab writes only via `admin_set_scoreboard_hidden` / `admin_set_scoreboard_freeze` and keeps `freeze_scoreboard` out of the generic Save (1976-1979) | DB views |
| `registration_open` | `AuthPage.tsx:299-308` via `registration_is_open` RPC (comment: anon has no SELECT on `event_settings`) | — | `handle_new_user` trigger (`useAuth.ts:28-37`) |
| `registration_allowlist_only` | admin only (2173-2176) | `submitFlag.ts:6-12` matches the server sentinel sentence to re-theme the refusal | `submit_flag_tx` / `unlock_hint` |
| Challenge visibility (`is_visible`) | admin table only; players read `public_challenges` (`useData.ts:111`) | `AdminDashboard.tsx:996-1005` explains the dedicated visibility RPC | `admin_set_challenge_visibility` |
| Flags | never sent to the browser except through the owner vault; edit form keeps blank = unchanged (223-224, 666) | `OwnerFlagVault.tsx:4-19` | hashing in `admin_upsert_challenge` |
| Submissions `submitted_flag` | `SubmissionsTab` via `admin_list_submissions` only (1658-1660: per-column grant excludes it) | — | RPC |
| Team ban/delete | `TeamsTab` 2609-2612: "SECURITY DEFINER RPCs rather than direct table writes: authenticated no longer holds UPDATE on teams.is_banned or DELETE on teams" | — | `admin_set_team_ban`, `admin_delete_team` |
| Profile updates | `useAuth.ts:200-209` "HARDENED: Only safe fields can be updated. RLS also enforces this." | — | RLS |
| Max attempts `0` = unlimited | `App.tsx:2123` | — | server |

Summary: every client flag is a rendering hint; the theme may consume `chainEnabled`, `b2rEnabled`, `is_admin`, `is_owner`, `eventStatus`, `paused` as props for which chrome to draw (as `themes/pinaka/hooks.ts:13-20` already does) but must never derive access, data visibility, or counts from them, and must never show "winner"/"ended" states that the server-derived `eventStatus` does not hold (README rule 3).

---

## 4. Existing UI defects / inconsistencies noticed (documented only, not fixed)

1. **Stale section comments**: `AdminDashboard.tsx:1280` says `{/* Users Tab */}` above the Chains/B2R mounts; `1289` says `{/* Event Tab */}` above the Notifications mount.
2. **`StatusLine` colour heuristic**: success/informational decided by `'❌'` prefix (73). Neutral messages — `Nothing changed.` (1989), `⏸ Event paused…` (1905), `🙈 Scoreboard hidden…` (2067), `🔒 Scoreboard frozen…` (2090) — render in green `text-status-solved`. `allowMsg` (2205) ignores the prefix entirely and is always muted.
3. **Delete notification has no confirmation and swallows errors** (1779-1782, 1846-1850).
4. **Team ban/unban has no `confirm()`** (2613-2616) while user ban/unban does (1352) — inconsistent for an equally player-impacting action.
5. **Transfer ownership is `btn-outline`** (1499, 1584), i.e. the single most irreversible Users action is not danger-styled; safety rests on the `prompt()` username match.
6. **`btn-danger` used for non-destructive toggles**: Disable Chain Experience / Disable B2R (`ChainManager.tsx:217`, `B2RManager.tsx:293`) although both panels say turning off "never deletes" — danger semantics overloaded; and **Freeze** (a player-visible lock) is `btn-primary` while **Hide** is `btn-danger` (2245 vs 2281) — asymmetric.
7. **Hard-coded colours bypass tokens**: pause border `rgba(224, 179, 74, 0.45)` (`AdminDashboard.tsx:2312`, `App.tsx:1047`) contradicts `DESIGN_SYSTEM.md:58-59`; `text-orange-400` Flame icons (`ChainManager.tsx:381`, `B2RManager.tsx:568`); preview modals use `bg-black/80` instead of `.scrim` / `--color-surface-veil` (`ChainManager.tsx:375`, `B2RManager.tsx:562`).
8. **Allowlist textarea uses raw utilities** (2193-2199) instead of `.textarea`, so its focus ring/hover differ from every other field.
9. **Flag inputs lose their focus border**: inline `style={{ borderColor: 'var(--color-border-danger)' }}` (690, 703) beats `.input:focus` (`index.css:553-559`), so the lime focus border never shows; `is-invalid` is never applied to them (only `aria-invalid`).
10. **Admin preview modals (z 5000) have no Escape handler and no backdrop click-to-close** (`ChainManager.tsx:374-394`, `B2RManager.tsx:561-581`); they also sit above the milestone banner (200) and cursor ring (140).
11. **Dual-rendered tables and card lists** (1153/1224, 1439/1536, 1673/1717, 2670/2735): both trees always exist in the DOM; duplicate `aria-label`s and double network of event listeners; display is purely CSS-gated.
12. **Max Attempts column** shows `max_attempts ?? 15` (1182, 1251) while `0` means unlimited (`B2RManager.tsx:453`, `App.tsx:2123`) — "0" renders literally and an undefined column shows a possibly wrong "15".
13. **Edit button on a B2R flag row** (1202-1205) opens the single-flag `ChallengeForm`; visibility and delete are guarded by `isB2RFlagRow` (1008, 1024) but edit is not, so half a box can be edited from the Challenges tab.
14. **Notification type chips** apply `typeColors[t]` instead of `chip.is-active` when selected (1810) — the selected state differs from every other chip in the app.
15. **`B2RManager` ignores its `challenges` prop** (`challenges: _challenges`, 77) though the dashboard passes it (1282).
16. **Event status badge text contains emoji** (2107: `⏳ Scheduled`, `🏁 Ended`, `🟢 LIVE`) inside an uppercase micro-caps badge.
17. **Quick extend writes `event_settings` directly** (1917) while pause/freeze/hide go through RPCs — mixed authority paths in one panel (comment at 1937-1939 explains the Save guard that compensates).
18. **`OwnerFlagVault` listens for Escape on `window`** (65-69) with no `stopPropagation`; if the challenge modal's Escape handler (`App.tsx:2133`) were ever mounted concurrently both would fire. Not reachable today (admin view ≠ challenge view) but worth knowing before adding theme-level key handlers.
19. **Ad-hoc z-index values** (50/100/110/120/140/200/4000/4500/5000) with no tokens; the theme has nothing to slot into.
20. `localStorage` access at `App.tsx:184, 211, 227` is not wrapped in `try/catch` (every helper elsewhere is).

---

## 5. Theme scaffolding already on the branch (for QA orientation)

- `src/main.tsx:51-59`: `bootTheme().finally(() => createRoot(...).render(...))` — the theme resolves **before first paint**; failure falls back to `cyberhx` (`themes/index.ts:112-129`).
- `themes/index.ts`: resolution order `VITE_THEME_UNTIL` expiry → `VITE_THEME_SWITCH='0'` → `?theme=` query (persisted to `cyberhx.theme`, then stripped via `history.replaceState`) → stored override → `VITE_THEME`. Sets `html[data-theme]`.
- `themes/pinaka/boot.ts`: dynamic-imports `pinaka.css`, appends `<link id="pinaka-fonts">` (Cinzel / EB Garamond from Google Fonts — inside CSP), rewrites `meta[name=theme-color]` to `#0a0e17`.
- `themes/pinaka/styles/core.css:208-214`: a custom SVG `cursor` (`data:` URI) is applied — must not override `cursor: not-allowed` on `.btn:disabled`, `text` on inputs, or `pointer` semantics on links.
- README non-negotiables (`src/themes/pinaka/README.md:8-48`) already encode most of the constraints below; this inventory is the admin-side evidence for them.

---

## Consolidated preservation checklist

### From the route, view and screen inventory audit

1. ROOT/UPLINK: Block *.supabase.co in devtools (offline) and reload → within ~40 s the 'Uplink lost' HoldScreen (reason=uplink) appears with typing log, 'Reconnecting' badge, 'Down HH:MM:SS' elapsed and 'attempt N'; the ambient background is still visible behind it; unblock → screen clears by itself (no reload) and the previous state (auth or app) returns.
2. ROOT/BOOT: Hard reload → 'Initializing Terminal...' pulse text with role=status appears before auth/app; no flash of Access Denied on the Admin tab afterwards.
3. AUTH/TABS: Click 'Register' then 'Sign In' → username field animates in/out, header copy switches ('Enter the arena' / 'Access terminal'), error text clears, captcha token resets (badge returns to Pending).
4. AUTH/INVITE: Open /?invite=<valid code> signed out → URL is cleaned, page opens on Register tab, 'Team invite' banner names the team and members/size; with an invalid code the banner says 'no longer valid' and the stored invite is cleared (reload shows no banner).
5. AUTH/CAPTCHA: Turnstile widget renders inside the 'Human verification' box; badge flips Pending→Verified on solve; submit button is disabled until Verified; block challenges.cloudflare.com → after ≤20 s badge reads Unavailable, explanation box appears, 'Try again' re-injects the script.
6. AUTH/LOGIN: Wrong password → red alert with mapped message ('Invalid email or password.'), AccessSequence disappears, captcha resets; correct credentials → AccessSequence steps (Credentials received → Verifying signature → Restoring session) then 'Access granted' check, then App renders without a second loading flash.
7. AUTH/REGISTER: Username <3 chars or invalid characters → inline error from client validation before any request; valid registration shows 'Identity issued'.
8. AUTH/MISC: 'Continue with Google' is disabled while loading and shows mapped error for a cancelled OAuth hash; show/hide password toggles input type and aria-pressed; mailto support link and 'fair-play rules' (new tab to /terms.html) work; MotionToggle in top-right stops the WebGL field immediately.
9. HEADER/NAV: Click Users, Teams, Challenges, Scoreboard (and Admin as admin) → view switches with scroll-to-top, aria-current=page on active tab; brand mark returns to Challenges; Team/Profile/Settings/Log out buttons work; Log out ends at the auth page after reload.
10. HEADER/MOBILE: At <1024 px the hamburger shows/hides the menu (aria-expanded), all four nav items + Admin (admin only) and the 2×2 account grid navigate and close the menu.
11. HEADER/BELL: Bell shows unread count (9+ cap) and beeps once when new rows arrive; click opens popover, marks all read (badge disappears), lists ≤20 notifications newest first with type badges; close button and re-click close it; items newer than last_seen show neon wash.
12. HEADER/TOGGLES: SoundToggle aria-pressed flips and persists across reload (cyberhx.sound); MotionToggle turns the field off/on and restores previous level (cyberhx.fx.prev); EventClock shows T−… when waiting, countdown when live (red under 1 h), HOLD when paused, CLOSED when ended, nothing when inactive.
13. BOARD/RAIL: Click each of All/Easy/Medium/Hard/Insane in the sidebar → grid filters, counts in the rail match card totals, aria-current moves; at <1024 px the dropdown button shows the active label and the overlay list performs the same filtering.
14. BOARD/TOOLS: Type in search → cards filter by title/category/tag live; Escape clears and blurs; the ✕ clears and refocuses; pressing '/' anywhere on the board (no modal, not in an input) focuses the search; the kbd hint hides while focused.
15. BOARD/CHIPS: Click a category chip → only that category's section remains, chip becomes solid lime (aria-pressed=true); clicking it again returns to All; 'All' count equals the number of free challenges; with no matches the 'Nothing matches' plate appears and 'Clear filters' resets both chip and query.
16. BOARD/MODES: With chain_experience_enabled → 'Chained' tab appears; with b2r_enabled (or as admin, with an 'off' pill) → 'B2R' tab appears and a Free/Chained sub-tablist shows when B2R is active; switching plays the open sound; disabling a flag in admin returns the board to Free automatically.
17. BOARD/STATES: (a) as a player with event inactive → 'Event is not active yet' plate; (b) in team mode without a team → 'Join or Create a Team First' with 'Go to Teams' routing to the Team page; (c) zero visible challenges → 'No challenges yet'; (d) while loading → six skeleton cards.
18. BOARD/CARD: Each card shows category icon+label in category hue, points, title, difficulty badge, 'Compromised' when solved (neon border), 'First blood open' when solvedCount=0, solve count, and solver or first-blood name; hovering tilts the card (fine pointer only) and Insane cards show the violet frame; clicking opens the modal growing from the card and plays the tick.
19. BOARD/HEADER: CommandHeader shows the right badge/copy for inactive/waiting/live/ended/paused(admin), countdown only when live, and Team score / Solved / Progress / Your solves derived numbers that equal the scoreboard's figure for your team.
20. BOARD/BANNED: With your team banned → red 'Team disqualified' alert with team name and mailto support link; admins do not see it.
21. CHAINED: Chain cards show mini chain, progress bar, 'Enter chain' and optional 'Briefing' download; entering shows the canvas chain with positioned node chips; clicking an available chip opens the normal challenge modal; locked chips are disabled; 'Back' returns to the list; 'Briefing' opens the markdown dialog (z 4000) and ✕ closes it; 'Download briefing' opens the file in a new tab.
22. B2R/FREE: Each box card shows USER FLAG and ROOT FLAG rows; 'Submit user'/'Submit root' open the normal challenge modal for the matching challenge; after both solved the card shows ROOTED and 'Machine fully compromised'.
23. B2R/CHAINED: Series cards list machines; entering a series shows the chain; clicking a node opens the box overlay (z 4500) with both flag rows; its submit buttons close the overlay and open the modal; click outside or ✕ closes.
24. MODAL/OPEN-CLOSE: Open a challenge → dialog with aria-label=title; Escape, scrim click and ✕ all close it (Escape is ignored while submitting); Challenge/Solves tabs switch; Solves tab fetches solvers and shows First Blood/You/Teammate badges or 'No solves yet'.
25. MODAL/CONTENT: Markdown description renders (headings, code, lists, links); attachments open in a new tab with correct name and size; resource links from connection_info render as outline buttons; a malformed connection_info does not crash the modal.
26. MODAL/HINTS: Click a paid hint → confirm panel ('Confirm decryption', cost); 'Abort' returns to locked; 'Decrypt −N pts' unlocks and shows the text in the neon panel; a refused unlock shows a red error line; a free (cost 0) hint unlocks on first click; the 'Hints used on this challenge' summary appears.
27. MODAL/SUBMIT-STATES: Submit slot shows the form when live & not paused; 'Submissions open in HH:MM:SS' countdown when waiting (flips to the form at zero without reload); 'Event Ended — Submissions Closed' when ended; 'No Event Running' when inactive; 'Terminal Locked' when attempts exhausted; solved panel with 'by you/<teammate>' when solved.
28. MODAL/SUBMIT-FLOW: Wrong flag → 'Access Denied' stamp + shake on attempt 1, weaker on later attempts, attempts counter increments only from server counts, failure sound; correct flag → validating trace (≥620 ms) → hold dim (260 ms) → BreachConfirm artefact with points count-up (violet 'Legendary' for Insane), success sound, solved panel underneath, card turns Compromised, sidebar progress and CommandHeader numbers update, milestone banner (if earned) ~1.9 s later; clicking BreachConfirm dismisses it early.
29. MODAL/INSANE: Opening an Insane challenge shows the 780 ms violet 'Insane operation' sweep that does not block typing in the flag field; under prefers-reduced-motion the sweep, breach stage and shake are absent but all text/results still appear.
30. INVITE/APP: Sign in with a pending invite → invite dialog (z 110) shows 'Join <team>?' with members/size; 'Join team' joins and routes to Team page; 'Not now' dismisses and clears the stored code; already on a team → 'You're already on a team' with Team page button; full/locked teams disable 'Join team'.
31. SCOREBOARD/LIVE: Header shows Live badge, team count, 'Updated Ns ago' ticking, refresh button spins and is throttled to 8 s; podium shows top 3 with crown/medals (empty plate until a team scores); graph draws top-10 cumulative lines with legend and tooltip; standings table scrolls inside its box with sticky header, rows re-order with up/down markers, your team row is highlighted with a 'You' badge.
32. SCOREBOARD/YOU: Your team strip shows Place/Score/Solves/gap even when outside the top 10; 'Team breakdown' expands Members and 'Who took what' (aria-expanded/aria-controls) and collapses again.
33. SCOREBOARD/STATES: Hidden by admin → blackout plate and 'Hidden' badge on Scoreboard, Teams and Users; frozen → 'Frozen at hh:mm' (or 'Final' after end) badge and snapshot standings; waiting → 'Pre-event', 'Starts soon', opening time; inactive → 'Standby'/'Inactive'.
34. TEAMS/USERS LISTS: Header 'registered' badge shows the total; typing filters server-side after 300 ms (prefix match, '_' escaped); empty state when nothing matches; pagination First/Prev/Next/Last disable at bounds and 'Showing a–b of n' is correct; the decorative search icon button does nothing harmful; mobile Users list shows rank/avatar/solves/country/points.
35. TEAM PROFILE/NO TEAM: 'Create Team' → form; name <2 or >40 chars or with <>{} → inline error; Create → team page; 'Join Team' → code form (lowercased, trimmed) → Join → team page; Cancel returns to the two buttons.
36. TEAM PROFILE/HAS TEAM: Hero shows name, 'Nth place' badge, Rank/Points/Members tiles that match the scoreboard; 'Copy link' copies the /?invite= URL and reads 'Copied' for 2 s (sr status announces); 'Share' appears only where navigator.share exists; 'Copy code' copies the raw code; Members table lists captain badge and per-member solves/points; 'Hints used' table and the Solve points − hints = score line appear when hints were bought; SolvesTable, accuracy/category meters and score chart render; 'Leave Team' asks confirm and returns to the no-team screen.
37. USER PROFILE: Header shows avatar/initial, badges (Team member, Admin, country, affiliation, Since), bio, big solves count; stat rail Solves/Failed/Accuracy/Categories; with solves → SolvesTable + meters + chart; without → 'No solves yet' + 'Awaiting first flag' badge; skeleton while loading.
38. SETTINGS/PROFILE: Tabs Profile/Security switch (aria-current); email field is disabled with lock tooltip on hover; country is a select populated from COUNTRIES; invalid website/affiliation show the bracketed '[ INVALID … ]' message without a request; Save Changes shows 'Profile updated successfully.' and the header username updates; duplicate username shows '[ CALLSIGN TAKEN ]'.
39. SETTINGS/EXPERIENCE: 'Interface sound' row toggles the same preference as the header icon (both update together); Visual effects radio Cinematic/Calm/Off applies live (Off = static gradient, no canvas) and persists.
40. SETTINGS/SECURITY: Requirements rows tick as you type; mismatched or <6-char passwords are refused client-side; wrong current password shows the ACCESS DENIED no-reset message; success shows 'Password updated successfully.' and clears the fields while staying signed in.
41. HOLD/PAUSED: As admin pause the event with a note → players immediately (≤30 s) see 'Operations suspended' HoldScreen on every view with the control message line, EventClock reads HOLD; admins see the amber 'Paused' banner with 'Admin → Event' link and keep full access; resume → players' views return and board refetches.
42. ADMIN/GUARDS: Non-admin opening Admin sees 'Access Denied'; a profile fetch failure shows 'Could not verify your account' with Retry; admins see the panel without a flash of denial.
43. ADMIN/SHELL: Stats bar shows users/teams/challenges/submissions; all 8 tabs switch (aria-pressed) and the strip scrolls horizontally on narrow screens; 'Reset Event Scores' asks confirm and alerts the result.
44. ADMIN/CHALLENGES: Add Challenge → form; Placement radios switch fields (B2R shows root flag/points and hides author/tags); saving without title/description/flag shows the red error; Save returns to the list and the row appears; Visible chip toggles Live/Hidden (B2R flag rows are refused with an alert); Edit prefills (flag blank = keep) and shows the clobbered-flag warning when applicable; Delete confirms and removes; owner sees the key icon that opens the vault.
45. ADMIN/FORM-SUBSECTIONS: Add Hint/remove and Save persists hints in place (existing ids kept); Add files queues with size/budget validation and uploads on Save ('Uploaded' badge afterwards), remove deletes storage + row after confirm; Add Link/remove persists connection_info JSON that the player modal renders.
46. ADMIN/CHAINS & B2R: Master toggles flip the player-facing tabs; New chain → editor; adding ≥2 challenges and 'Save & publish' publishes (fewer refuses with the message); up/down reorder; Preview opens the chain renderer with the 'Simulate solved' slider; publish/unpublish eye icons and delete work; B2R: box editor saves flags/points/attempts/published, series editor mirrors chains, delete box confirms the double-flag warning.
47. ADMIN/USERS: Search filters by username/email; role select asks confirm and changes role (owner's is disabled); Ban is disabled for admins/owner with Lock; Ban/Unban confirm and update the status badge; 'Hand over' (owner only) requires typing the exact username; pagination works at 50/page.
48. ADMIN/TEAMS: Search by team or member; 'Sort by rank' toggles; clicking a row opens the sticky detail aside with rank/score/solves/status/invite code/members/created; Ban/Unban/Delete Team work (locked with hint when the team contains an admin/owner); ✕ closes the aside.
49. ADMIN/SUBMISSIONS & NOTIFICATIONS: Submission log lists ≤100 newest with flag text + hash prefix and ✓/✗ badges; Notifications: pick a type chip, enter title/message, Send → '✅ Notification sent to all users!' and the broadcast appears in Recent list and in every player's bell within 2 min; ✕ on a history card deletes it.
50. ADMIN/EVENT: Status badge matches is_active/start/end; name and DateTimeFields save (picker opens on click; preview shows local time + zone); the four switches persist; allowlist textarea 'Add to allowlist' parses quoted/angle-bracket emails and updates the count; Freeze/Unfreeze and Hide/Show ask confirm and flip the player scoreboard; Pause/Resume with note; +15/+30/+60 extend the end time; 'Start New Event' stays disabled until a name and the exact text 'START NEW EVENT' are entered, then downloads the CSV before clearing; owner sees 'Export scoreboard (CSV)'.
51. ADMIN/VAULT: Owner clicks the key icon → vault dialog (z 120) reveals the flag with a Copy button and a 45 s countdown, or asks to 'Verify & store' a legacy flag (wrong guess refused); Escape/✕/scrim close; non-owners never see the key icon.
52. FOOTER & LEGAL: Privacy/Terms/Support links open the static pages in a new tab (rel noopener) and never navigate the SPA away.
53. A11Y & MOTION: Tab through every view — every interactive element shows the focus ring; icon-only buttons keep aria-labels; enable prefers-reduced-motion → no card tilt, stagger, shake, breach stage, intro sweep, cursor ring, ambient canvas, yet all states/text/results are identical.
54. RESPONSIVE: At 375 px wide no horizontal page scroll on any view; tables scroll inside their surface frames; header collapses to hamburger; EventClock hides below md; the board grid is one column and the difficulty dropdown replaces the rail.
55. PERSISTENCE: Reload after changing sound/fx/notification read state → preferences and unread count persist via the five localStorage keys; a pending invite survives registration/Google redirect.

### From the feature and flow preservation contracts audit

56. BOOT-1 Load `/?invite=abc123xyz` logged out → URL is rewritten to `/` with no query, `localStorage['cyberhx.invite']==='abc123xyz'`, AuthPage opens on the **Register** tab and shows the 'Team invite' card after `team_invite_preview` resolves (mock: {name:'Alpha',members:2,size:4}).
57. BOOT-2 Mock the backend to return 503 twice within 40 s → HoldScreen 'Uplink lost' / 'Reconnecting' appears with the typed log and 'attempt N'; when `/auth/v1/health` returns 200 the app recovers within ~10 s without reload.
58. BOOT-3 Fresh load with a valid session → 'Initializing Terminal...' (role=status) shows until `getSession` resolves, then App renders; no flash of AuthPage.
59. AUTH-1 With `VITE_TURNSTILE_SITE_KEY` unset → badge 'Unavailable', note 'Human verification is not configured for this deployment…', no 'Try again' button, submit disabled; submitting via Enter shows 'Human verification is not configured for this site. Please contact the organisers.'
60. AUTH-2 Block `challenges.cloudflare.com` (or stub `script.onerror`) → within 20 s badge 'Unavailable', note mentions 'challenges.cloudflare.com', 'Try again' re-inserts `<script id="cf-turnstile-script">` and badge returns to 'Pending'.
61. AUTH-3 Stub `window.turnstile.render` to call `error-callback('110200')` → badge 'Failed', note shows '(code 110200)'; stub `expired-callback` → badge back to 'Pending' and submit disabled again.
62. AUTH-4 Stub `turnstile.render` to call `callback('tok')` → badge 'Verified' (badge-solved), submit button enabled; the widget container `div[ref]` is a single stable DOM node across tab switches and window resizes (observe no re-render of the iframe).
63. AUTH-5 Login with empty email → 'Email is required.' with no network call and captcha token still 'Verified'; empty password → 'Password is required.'
64. AUTH-6 Login with mock `signInWithPassword` error 'Invalid login credentials' → `role=alert` 'Invalid email or password.', AccessSequence disappears, `turnstile.reset` called, submit disabled until a new token.
65. AUTH-7 Successful login → AccessSequence shows 'Credentials received / Verifying signature / Restoring session' then 'Access granted' for ~600 ms; App renders once `onAuthStateChange` fires. Reduced-motion: handover at 120 ms.
66. AUTH-8 Register tab: username 'ab' → 'Username must be at least 3 characters'; password 'abc' → 'Password must be at least 6 characters'; username 'bad name!' → 'Username can only contain letters, numbers, underscores, and hyphens'; the `#auth-password` input has `minLength=6` only in register mode.
67. AUTH-9 Mock `registration_is_open` → false → banner 'Registration is currently closed.' in Register mode only; submitting shows the same text; 'Continue with Google' in register mode shows it without navigating.
68. AUTH-10 Mock `signUp` error 'Database error saving new user' → long message beginning 'Registration could not be completed.' and containing 'support@cyberhx.com'.
69. AUTH-11 Load `/#error=access_denied&error_description=The+user+denied` → error 'Google sign-in was cancelled. Try again, or use email and password.' and the hash is removed; the attacker-controlled text is never rendered.
70. AUTH-12 Click 'Continue with Google' → `signInWithOAuth({provider:'google', options:{redirectTo: origin or invite link}})`; if navigation is stubbed out, the button re-enables after 4 s.
71. AUTH-13 Both no-reset notes render: register shows '[ NO RESET PROTOCOL ] There is no password reset on this grid…' with mailto; login shows 'Forgot your access key? [ NO RESET PROTOCOL ] …'.
72. AUTH-14 MotionToggle is visible top-right on the AuthPage before sign-in; clicking it sets `cyberhx.fx='off'` and `cyberhx.fx.prev='cinematic'`; clicking again restores.
73. SESS-1 Mock `profiles` select to fail twice then succeed → profile loads (3 retries, no 'Access Denied' flash); fail three times → `profileError` and the Admin tab shows 'Could not verify your account' with 'Retry'.
74. SESS-2 Click header 'Log out' → `signOut()` then `location.reload()`; AuthPage shows afterwards.
75. TEAM-1 Signed in with a pending invite and `team_id=null` → invite dialog (`aria-label="Team invite"`) 'Join Alpha?' '2/4 members. Your solves will count…'; 'Not now' clears storage; 'Join team' calls `join_team(p_invite_code:'abc123xyz')` lowercased, plays success, refreshes profile, navigates to Team page.
76. TEAM-2 Same with preview `{full:true}` → suffix ' — the team is currently full.' and 'Join team' disabled; `{locked:true}` → ' — team changes are locked while the event is live.' and disabled.
77. TEAM-3 Same but `profile.team_id` set → 'You're already on a team' with 'OK' and 'Team page'.
78. TEAM-4 Preview RPC error → 'Could not check this invite' + 'The invite is still saved…' and storage retained; preview `{error:'Invalid invite'}` → 'This invite is no longer valid' and storage cleared.
79. TEAM-5 Team page with no team → 'No Team Yet'; 'Create Team' → name 'a' → 'Team name must be 2 to 40 characters.'; name 'x<y>' → 'Team name cannot contain < > { } or control characters.'; valid → `create_team(p_name)` then page reloads team data.
80. TEAM-6 'Join Team' with code ' ABCDEF ' → `join_team(p_invite_code:'abcdef')`; RPC `{error:'Team is full'}` → FormError shows 'Team is full'.
81. TEAM-7 With a team: 'Copy link' writes `${origin}/?invite=<code>` to clipboard and shows 'Copied' (btn-success) + sr-only 'Invite link copied'; 'Copy code' writes the raw code; 'Share' appears only when `navigator.share` exists.
82. TEAM-8 'Leave Team' as captain with >1 member → confirm text 'You are the captain. Leaving hands the team…'; cancel → nothing; accept → `leave_team` and the no-team view.
83. TEAM-9 Team page tiles: Rank '#N' computed from `team_scores` count query, Points equals `team_scores.total_points` (not the client sum), Members count; 'Hints used' table and the 'Solve points X − hints Y = score Z' line when hints exist.
84. TEAM-10 Teams directory with `scoreboard_state.scores_hidden=true` → 'Team standings hidden' plate and no `team_scores` row query; otherwise 50 rows/page, search 'te_am' escapes `_`, pagination buttons disable at bounds.
85. BOARD-1 Mock event live + user with team + 12 visible challenges across 3 categories → category sections in icon-map order, cards sorted by tier then points, counts on chips and rail match; 'All' chip shows 12.
86. BOARD-2 Type 'cryp' in `#board-search` → only matching title/category/tag cards remain; press Escape in the input → cleared and blurred; press `/` anywhere (not in an input, no modal) → search focused; `/` while modal open → no focus change.
87. BOARD-3 Select rail 'Hard Operations' → only Hard cards, rail item has `aria-current="true"` and `.is-active`; mobile (<lg) dropdown lists tiers with counts and closes on choice.
88. BOARD-4 Filter to a category + query with no result → 'Nothing matches' with the query echoed in mono and 'Clear filters' resets both.
89. BOARD-5 Event `is_active=false` as player → 'Event is not active yet' and no toolbar; as admin → board renders.
90. BOARD-6 Player without team in team mode → 'Join or Create a Team First' and 'Go to Teams' navigates to the Team page; toolbar hidden.
91. BOARD-7 Each card renders `<button data-selflit data-diff="Hard" class~="card-interactive">`; pointer move writes `--tilt-x/--tilt-y/--spec-x/--spec-y`; click plays 'tick' and opens the modal with `aria-label` = title.
92. BOARD-8 Card badges: solved → 'Compromised' + solver name; unsolved with 0 solves → 'First blood open'; unsolved with first blood → taker's name with `title="First blood: X"`; solves text pluralises ('1 solve', '2 solves').
93. MODE-1 `chain_experience_enabled=false` and `b2r_enabled=false` → no mode tablist at all and no requests to `public_chain_*`/`public_b2r_*`.
94. MODE-2 `chain_experience_enabled=true` → tablist 'Free'/'Chained'; challenges in `public_chain_members` disappear from FREE; 'Chained' shows series cards with MiniChain, '{n} operations', progress; 'Enter chain' mounts ChainExperience; a node not in the catalog is titled 'Locked node', its chip is `disabled` with 'unavailable' in `aria-label`.
95. MODE-3 In a chain with nodes A,B,C where A and B solved → exactly one segment active (A–B), header pill '1 ignited', progress '2 / 3'; solving C while mounted plays 'legendary'.
96. MODE-4 `b2r_enabled=false` but `profile.is_admin` → 'B2R' tab with an 'off' pill; as player → no B2R tab. Challenges tagged 'b2r' never appear on FREE regardless of the flag.
97. MODE-5 B2R Free: box card shows USER/ROOT rows with 'Submit user'/'Submit root' opening the ordinary challenge modal for the correct challenge id; both solved → 'ROOTED' and 'Machine fully compromised'; user only → 'User owned — root next'.
98. MODE-6 B2R Chained: entering a series and clicking a node opens the box overlay (`z-[4500]`), outer click closes, inner click does not; a flag button closes the overlay and opens the challenge modal.
99. MODE-7 Flip `chain_experience_enabled` to false while on the Chained tab → board snaps back to Free with no error.
100. SUBMIT-1 Open an unsolved challenge, live event, `max_attempts=0` → form present, label 'Submit Access Key', placeholder 'FLAG{ACCESS_KEY}', 'Execute' button, 'Attempts 0/∞'.
101. SUBMIT-2 Mock edge fn `{correct:false, attemptsLeft:9, maxAttempts:10}` → error 'Access Denied: Invalid Key Sequence', attempts '1/10', the form gets class `deny` briefly, `.deny-mark` and `.deny-stamp` ('Access Denied') render, 'failure' sound at rung-1 volume; typed flag is preserved.
102. SUBMIT-3 Repeat wrong answers → the ladder descends (shake 6→4→2.5→0→0 px via `--deny-shake`), stamp disappears from rung 4; at `attemptsLeft:0, locked:true` → 'Terminal Locked: Maximum attempts reached.' then reopening shows the 'Terminal Locked: Maximum Brute-Force Attempts Reached' panel and 'Locked' badge; input and button disabled.
103. SUBMIT-4 Mock `{correct:true, points:500, attemptsLeft:…}` → `data-stage` goes 'validating' (≥620 ms) → 'hold' (260 ms) → 'idle'; BreachConfirm '+500 pts' plays and self-dismisses; card and modal show 'Compromised'; `solveCounts` increments; sound 'success' (or 'legendary' for Insane with 'Legendary' label).
104. SUBMIT-5 Mock `{correct:true, alreadySolved:true}` → no ceremony, solved panel 'Operation compromised' immediately, attempts unchanged, no milestone.
105. SUBMIT-6 Mock a 4xx with body `{error:'Cooldown: wait 10 s'}` and no attempts fields → error text shown, attempts counter unchanged, no shake, no sound.
106. SUBMIT-7 Mock `{error:'Your email is not on the registration list to play this event'}` → shows 'ACCESS DENIED :: identity not on the roster — your email is not registered for this event.'
107. SUBMIT-8 Mock `{eventEnded:true}` → 'The event has ended — submissions are closed.'; mock a 401 with unreadable body → 'Your session has expired — sign in again.'; mock a thrown fetch → 'Connection failed. Try again.' and stage returns to idle.
108. SUBMIT-9 Event `waiting` with `start_time` in 90 s → ClosedPanel 'Submissions open in 00:01:30' counting down; when the clock passes start the form appears without reload. `ended` → 'Event Ended — Submissions Closed'; `inactive` (admin only can open) → 'No Event Running — Submissions Closed'.
109. SUBMIT-10 Press Escape with the modal open → closes (and plays 'close'); press Escape during `submitting` → ignored; click the scrim → closes; 'Close challenge' button closes.
110. SUBMIT-11 Insane challenge → OperationIntro overlay 'Insane operation' for <1 s and the flag input is focusable/typeable during it; under reduced motion no intro renders.
111. SUBMIT-12 'Solves' tab → `get_challenge_solvers` called, rows numbered, first row 'First Blood', own row 'You', teammates 'Teammate'; empty → 'No solves yet'.
112. SCORE-1 With solved challenges worth 100+200 and an unlocked 30-pt hint → CommandHeader 'Team score' 270, 'Solved 2 / N', 'Progress' %, 'Your solves x / 2'; card and modal still show full 100/200 points.
113. SCORE-2 Hint spend exceeding points → score floors at 0.
114. HINT-1 Click 'Encrypted Intel Segment' (cost 30) → alertdialog 'Confirm decryption' with '> unlock_hint --cost 30' and 'Decrypt −30 pts' focused; 'Abort' disarms with no RPC; 'Decrypt' calls `unlock_hint(p_hint_id)` and shows the text; cost-0 hint unlocks on first click.
115. HINT-2 Mock `unlock_hint` → `{error:'Not enough points'}` → `role=alert` 'Not enough points'; `error.message` containing 'rate limit exceeded' → 'Too many hint requests. Wait a minute and try again.'; message containing 'permission denied' → 'Could not unlock this hint right now. Try again in a moment.'
116. HINT-3 Hint texts from `get_my_hint_texts` (teammate's unlock) render as unlocked on load; 'Hints used on this challenge: −30 pts…' footer appears.
117. LINK-1 Challenge with files `[{url:'https://x/a.zip', size_bytes:2097152}]` and `connection_info='[{"label":"Target","url":"javascript:alert(1)"},{"label":"Site","url":"https://t"}]'` → 'Download Attachment' anchor href `https://x/a.zip`, '2.0 MB', `target=_blank rel="noopener noreferrer"`; the `javascript:` link renders with **no href**; malformed `connection_info` JSON renders nothing and does not crash.
118. LINK-2 Profile `avatar_url='data:image/png;…'` → initial letter fallback rendered, no `<img>`.
119. EVENT-1 Set `is_paused=true` as player → every view is replaced by HoldScreen 'Operations suspended' / 'Paused by control', the organiser `pause_message` appears as 'control: …', header EventClock shows 'HOLD hh:mm:ss' (data-tone=paused); as admin → amber 'Paused' banner with 'Admin → Event' link and the board stays usable.
120. EVENT-2 Unpause → within ≤8 s `public_challenges` and solve data are refetched; EventClock returns to countdown.
121. EVENT-3 `end_time` within 1 h → CommandHeader countdown and EventClock turn `urgent` (red); after `end_time` status 'ended', badge 'Closed', clock 'CLOSED'.
122. NOTIF-1 Mock 3 notifications newer than `notif_last_seen` → bell pill '3' (and '9+' for 12); opening the panel lists them with type badges and marks all read (`localStorage.notif_last_seen` updated, pill gone); empty → 'No notifications yet'.
123. ROLE-1 Non-admin: no 'Admin' nav tab (desktop or mobile); forcing `currentView='admin'` renders 'Access Denied / Admin privileges required.'; admin: tab visible, dashboard tabs Challenges…Event.
124. ROLE-2 Admin during `waiting`/`ended` → cards open and the submit form is present (canSubmit true).
125. BAN-1 Own team `is_banned=true` as player → `role=alert` 'Team disqualified' with team name and mailto; as admin → not shown.
126. MILE-1 First fresh solve in the session → after ~1.9 s a 'First breach / You are on the board.' banner (role=status) appears for ~2.6 s; reloading with solves already present shows no banner; solving the last challenge of a tier shows '{Tier} tier cleared'.
127. MILE-2 Milestone banner has `pointer-events:none` — clicking through it still dismisses the BreachConfirm/modal underneath.
128. PREF-1 Header SoundToggle `aria-pressed` reflects `cyberhx.sound`; muting then submitting a flag produces no `AudioContext` nodes (except the notification beep); Settings 'Interface sound' row shows the same state live.
129. PREF-2 Settings 'Visual effects' radiogroup: pick 'Off' → `cyberhx.fx='off'`, `AmbientBackground` switches to `data-mode="static"` (no canvas), `data-tier="still"` on the App root after reload, cursor ring/surface light inactive; pick 'Calm' → lattice without warp.
130. PREF-3 Emulate `prefers-reduced-motion: reduce` → no stagger/deny/breach/op-intro/cursor-ring animations; AnimatedNumber jumps; AnimatedView transitions ~0 ms; HoldScreen log appears fully typed.
131. SCOREBOARD-1 Live, 12 teams → first fetch within 0–15 s, standings top 10 ordered by points desc then earliest `last_solve`, podium cards for top 3 when leader > 0, 'Updated Ns ago' ticking, graph with ≤10 series; refresh button triggers `scoreboard_state` + standings + graph and is throttled to 8 s.
132. SCOREBOARD-2 `scoreboard_state.scores_hidden=true` → 'Hidden' badge, 'Scoreboard hidden' plate, no `team_scores` or `get_score_progression` calls; Users and Teams directories show their hidden plates.
133. SCOREBOARD-3 `masked=true, freeze_time=T` → 'Frozen' badge and 'Frozen at hh:mm — final standings hidden until the reveal'; subsequent 15 s ticks call only `scoreboard_state`; `ended=true` → 'Final' and 'Final standings as of hh:mm'.
134. SCOREBOARD-4 Viewer's team outside top 10 → 'You' strip with 'outside the top 10', rank from the count query (= `.or('total_points.gt.P,and(total_points.eq.P,last_solve.lt.T)')` + 1), 'To #10' gap; 'Team breakdown' toggles `#team-breakdown` with members sorted by points and 'Who took what' earliest-solver attribution.
135. SCOREBOARD-5 Between two polls a team moves up two places → its row gets `data-moved="up"`, the rank delta shows '↑2' with sr-only text; own team row has `data-me`.
136. SCOREBOARD-6 Event `waiting` with no scores → 'Starts soon' badge, 'Opens {date}', podium placeholder 'The podium fills in once the event starts', graph 'Curves start at kickoff'; rank marks render as plain numbers (no crown) while nobody has scored.
137. A11Y-1 Every icon-only button has `aria-label` (Close challenge, Notifications, Log out, Settings, My team, My profile, Refresh the scoreboard now, pagination); every `role=dialog` has `aria-modal` and a label; focus outlines visible on Tab.
138. LAYER-1 Open the challenge modal and then trigger an invite dialog (or vice versa) → the invite dialog (z-110) sits above the modal (z-100); the milestone banner (z-200) is above both; the cursor ring (z-140) never blocks clicks.
139. LAYER-2 On a `pointer: fine` desktop the custom reticle cursor appears over the page and the 'hot' variant over buttons/cards/tabs/chips; inputs keep a text caret; disabled controls show not-allowed.
140. CSP-1 With the Vercel CSP applied, no console CSP violations on any view (fonts only from Google Fonts, images https/data, scripts self + Cloudflare, frames Cloudflare only).

### From the environment, motion, performance and styling system audit

141. Default build (no VITE_THEME, no ?theme=) must produce byte-identical behaviour: html[data-theme] = 'cyberhx', no pinaka CSS/JS chunk requested (check Network tab), first paint not delayed beyond one microtask by bootTheme() in src/main.tsx:53.
142. getCapability() tiers unchanged per device class (src/components/environment/performance.ts:46-94): prefers-reduced-motion → 'still' (webgl=false, pointerFx=false, motion=false); fx 'off' → 'still'; deviceMemory<=2 or cores<=2 → 'low'; WebGL probe failure → 'low'; coarse pointer or mem<=4 or cores<=4 → 'medium' (dpr 1.5); else 'high' (dpr 2). Verify data-tier on the App root (App.tsx anchor `data-tier={getCapability().tier}`) in each case under both themes.
143. AmbientBackground modes (src/components/AmbientBackground.tsx:40-44): static on low/still, medium/high otherwise; data-mode attribute on .ambient-root; canvas present only on high/medium; .ambient-grid present only on static. If Pinaka replaces AmbientBackground, confirm the replacement reads getCapability() and renders no canvas/rAF on 'low' and 'still', and that setLatticeCapacity stays 0 so signals.ts publishes are no-ops.
144. FxToggle (Settings) and MotionToggle (header + auth page) still switch cinematic/calm/off live: lattice rebuilds in place (AmbientBackground effect deps [mode,intensity,fx]), capability cache invalidates (performance.ts:107), localStorage 'cyberhx.fx' and 'cyberhx.fx.prev' persist, and the theme's own environment honours all three levels.
145. Hidden-tab pause: document.hidden stops lattice frames (lattice.ts setRunning via AmbientBackground.tsx:88), stops the cursor rAF (cursor.ts:121-124), suspends the AudioContext (AudioManager.ts:399-407). Any new theme rAF loop must do the same.
146. Reduced motion (OS setting on): CSS block index.css:1938-1982 and :2061-2065 still apply (cursor ring hidden, breach/op-intro/milestone-sweep/access-ring hidden, stagger/scan-in off, transforms neutralised); all 17 useReducedMotion() call sites and the matchMedia checks in UserProfile.tsx:25-27 / UsersList.tsx:19-21 still gate JS motion; AnimatedView uses initial={false} and 0.001s transitions; Scoreboard disables layout springs; Chain2D gets reducedMotion=true (sway/bob 0, fire frozen). Theme CSS must add its own @media (prefers-reduced-motion: reduce) kills for every pk-* animation.
147. Pointer FX gating: SurfaceLight, CursorRing and MagneticElement must still early-return when getCapability().pointerFx is false (touch devices, low tier, reduced motion); --mx/--my/--tx/--ty writes and data-tilt attribute only on hover over .holo/.card-interactive/.surface-overlay without data-selflit.
148. CSS cursor: @media (pointer: fine) reticle on html/body and the interactive selector list (index.css:1472-1487) still present (dist should contain 2 cursor:url occurrences, text inputs keep cursor:text, disabled keeps not-allowed); the Pinaka gold cursor (core.css:206-215) must use the identical selector list; touch devices get no custom cursor.
149. Stacking order unchanged: .ambient-root z0 fixed < .page-shell z1 < nav sticky z50 < challenge modal z-[100] < invite z-[110] < OwnerFlagVault z-[120] < .cursor-ring z140 < .milestone-root z200 < chain/B2R modals z-[4000]/[4500]/[5000]. All fixed overlays must keep mounting outside <AnimatedView> (App.tsx anchors `</AnimatedView>` then `<ChallengeModal`, `<MilestoneBanner`) so the motion.div's perspective/transform never becomes their containing block. Any theme fixed layer must sit at z0 (behind .page-shell) with pointer-events:none, or above z200 only if pointer-events:none.
150. Token override completeness: with html[data-theme=pinaka] verify no lime remains at the literal sites in §2.1 (especially .card-interactive::before hover sheen L506, .breach-score text-shadow L1301, .cursor-ring[data-hot] inset L1520, .shadow-neon-strong, .btn-primary:active inset L343) and at the inline/SVG sites in §2.2 (SharedComponents TOKEN L33-40 charts, Scoreboard/UserProfile/TeamProfile COLORS, AuthPage radar SVG L60-70, App.tsx solved card glow/wash, chain/B2R progress gradients and shadow-[…rgba(198,255,0…)] classes). Google 'G' logo colours (AuthPage.tsx:907-910) must remain unchanged.
151. Chart legibility: recharts strokes/fills are literal hex (SharedComponents.tsx:489-517, Scoreboard.tsx:17-20); confirm they remain readable on the themed ground, or that a runtime token read replaces them without changing data/series order.
152. Difficulty personalities: [data-diff] frames, color-mix(in srgb, var(--diff-hue) …) rules and [data-tier="high"]-gated idle animations (index.css:1560-1645) still work with the overridden --color-diff-* tokens; DIFFICULTY_PROFILES tilt numbers unchanged.
153. Bundle: default build must not grow the eager index chunk beyond noise (baseline 1,543,058 B raw / 433,155 B gz; CSS 110,020 B / 19,907 B gz); theme code must land in separate chunks (pinaka boot JS, pinaka.css, components); lazy chunks ChainedBoard/B2RBoard/ChainExperience and the fire.gif (3.6 MB) / chain-strip.png fetch paths unchanged; no @google/genai, express or dotenv ever imported in src/.
154. Fonts/CSP: Inter + JetBrains Mono still load from the index.css:1 @import; any additional fonts only from fonts.googleapis.com/fonts.gstatic.com; no new connect-src/script-src/frame-src needs; no remote images other than https (img-src) and no external scripts. Verify no CSP violations in the console under the theme (vercel.json:90).
155. index.html/manifest: theme-color rewrite at runtime (boot.ts:25-26) is the only change; manifest colours, icons, JSON-LD, OG tags, canonical and the Supabase preconnect untouched; Turnstile (challenges.cloudflare.com) still loads on the auth page.
156. Audio untouched: play()/playValidating()/initAudioLifecycle() call sites and sound names unchanged; 'cyberhx.sound' default ON preserved; no AudioContext created before a user gesture.
157. Lattice disposal: on theme switch (page reload) and on fx change, createLattice().destroy() frees buffers/programs and loses the context (lattice.ts:932-945); no listener leaks from AmbientBackground (pointermove/resize/scroll/visibilitychange) — check with repeated fx toggles in DevTools Performance monitor (JS heap, GPU memory stable).
158. Accessibility unchanged: global :focus-visible ring (index.css:200-204) with the overridden --focus-ring-color visible on every interactive element; .btn-icon aria-labels intact; decorative theme layers aria-hidden and pointer-events:none; contrast of overridden --color-text-* on the new --color-surface-base >= 4.5:1 (Pinaka tokens.css claims primary 15.3:1, secondary 10.1:1, muted 6.3:1 — re-measure).

### From the admin and security inventory audit

159. Admin gate renders all three pre-states unchanged: 'Verifying access...' spinner (AdminDashboard.tsx:914-923), 'Could not verify your account' card with working Retry (928-950), 'Access Denied' card for non-admins (952-968); admin sees the dashboard only when profile.role === 'admin'.
160. Admin nav entry appears only for is_admin on desktop (App.tsx:941-945) and in the mobile menu (1013-1014); the paused admin banner (1044-1055) still links to Admin → Event.
161. All 8 tabs (Challenges, Chains, B2R, Users, Teams, Submissions, Notifications, Event) switch via the tab strip (1112-1127), show aria-pressed/.is-active, and the strip scrolls horizontally at phone width without page overflow.
162. Header 'Reset Event Scores' (1095-1102) is still visually danger (btn-danger), fires the native confirm() text '⚠️ Are you sure? This will DELETE all submissions and reset scores to ZERO!', shows is-loading while running, and reports via alert(); Cancel aborts with no call.
163. StatsBar (118-171) shows four counts and animates only when reduced motion is off.
164. Challenges table (1153-1221) and the mobile card list (1224-1276) each render exactly one at a time at their breakpoint (md); columns Title/Category/Difficulty/Points/Max Attempts/Visible/Actions intact; category dot and badge colours still come from var(--color-cat-*) and badge-easy/medium/hard/insane.
165. Visible chip (1184-1190, 1244-1249) toggles Live/Hidden with chip.is-active lime fill, aria-pressed updates, and a B2R flag row shows the blocking alert() instead of toggling.
166. Delete challenge (1206-1209, 1263-1266) is still a red (text-diff-hard) icon, confirms with 'Delete this challenge? This cannot be undone.', B2R rows are blocked by alert(), failure alerts, and the row disappears after success.
167. Owner-only vault key button (1194-1201, 1252-1258) is absent for a non-owner admin and present for the owner; opening it shows OwnerFlagVault above the dashboard (z-[120]) with scrim, Escape and X closing it.
168. OwnerFlagVault: loading skeleton, then either the flag in #vault-flag-value with working Copy (and selection fallback), a visible 45 s countdown that closes the panel, or the 'Not in the vault' capture form whose 'Verify & store' button is primary and shows is-loading; the error state renders the danger-bordered box (254-260).
169. ChallengeForm create: four Placement radios (Free/Chain/B2R Free/B2R Chain) select visibly (border-border-neon bg-neon-wash), chain/B2R chain selects appear only for their placement, B2R reveals root flag + root points fields and hides Author/Tags.
170. ChallengeForm validation: missing title/description shows the role=alert banner (873-882) and is-invalid fields; missing flag on create, missing root flag, and identical user/root flags each show their specific message (347-362).
171. ChallengeForm flag panel keeps its danger tint (656-690): red AlertTriangle, 'Flag' label in --color-diff-hard, red-bordered input(s); on edit the placeholder reads 'Unchanged — type a new flag to replace it' and the flagClobbered alert (671-685) appears when the RPC reports the challenge.
172. Hints: Add Hint appends a row, remove (741-745) removes it, cost min 0; saving an edited challenge keeps existing hint ids (no re-insert) — verify a player's unlocked hint stays unlocked after an admin edit.
173. Attachments: 'Add files' label opens the hidden file input, per-file 50 MB and per-challenge 200 MB limits produce the fileError alert text, pending rows show 'Uploads on save', existing rows link via safeHttpUrl in a new tab, and 'Remove attachment' confirms before deleting.
174. Resource links: Add/Remove works; links save as JSON only when url is non-blank; the player modal renders them through safeHttpUrl (App.tsx:2400).
175. Save Challenge shows is-loading, closes the editor and reloads the list on success; on an attachment failure the editor stays open with both the fileError line and the banner 'One attachment did not upload. See Attachments below.'
176. Chains tab: master toggle text/variant flips (Enable = btn-primary, Disable = btn-danger) and a failure alerts; New chain opens the editor; add/move/remove members; 'Save & publish' with <2 members shows 'A chain needs at least 2 challenges to publish'; delete confirms with the chain title; Preview opens the z-[5000] dialog with the simulate slider and Close works.
177. B2R tab: master toggle, box list pills (Published/Draft, chained/free), box editor with blank-keeps-flag placeholders and the identical-flags validation, Published checkbox, delete box confirm text mentioning BOTH flags, B2R chain editor/preview, and onChanged refreshing the Challenges list after box changes.
178. Users tab: search filters by username/email, pagination shows 'Showing a–b of n' with first/prev/next/last states, role select confirms and reverts on cancel, Ban confirms and locks (disabled + Lock icon + title) for admins and the owner, Unban is btn-success, 'Hand over' appears only for the owner viewing a non-banned admin and requires the exact username in prompt().
179. Teams tab: search, 'Sort by rank' toggle variant flip, clicking a row opens the sticky detail aside with invite code (masked until loaded), members list, Ban/Unban/Delete in the Danger zone, protected (owner/admin) teams show locked buttons with titles, Delete confirms, StatusLine shows '✅ Done!' or '❌ …'.
180. Submissions tab: latest 100 attempts with plaintext submitted_flag + hash prefix, '✓ Correct'/'✗ Wrong' badges, local time; mobile cards show the same.
181. Notifications tab: type chips (info/success/warning/danger) highlight when selected, Send validates title+message, StatusLine shows success then clears after 3 s, history shows last 10 with per-type wash and a working delete X.
182. Event tab: name/start/end fields with DateTimeField calendar picker and resolved-time preview; the four switches; allowlist textarea + 'Add to allowlist' updating the count; Save Event Settings sends only changed fields and reports 'Nothing changed.' when nothing differs.
183. Event tab Freeze/Unfreeze: confirm text appears, panel border turns neon when frozen, button variant flips (Freeze = btn-primary, Unfreeze = btn-secondary), StatusLine reports teams captured; auto-freeze notes render.
184. Event tab Hide/Show: confirm text appears, panel turns danger-tinted when hidden, button variant flips (Hide = btn-danger, Show = btn-secondary); players' scoreboard reflects scoreboard_state (hidden/masked) — verify with a player account.
185. Event tab Pause/Resume: optional note input visible only while running, confirm text, button variant flips (Pause = btn-danger, Resume = btn-primary), amber panel while paused, players get HoldScreen and admins get the top banner; Resume reports minutes added back.
186. Quick extend +15/+30/+60 confirms with the new end time and updates 'Ends …'.
187. Start New Event: button stays disabled until a name is entered AND 'START NEW EVENT' is typed exactly; the CSV downloads before the reset; a failed export blocks the reset with the '❌ Scoreboard export failed, so the reset was NOT run' message; the three clear checkboxes are honoured; the owner-only 'Export scoreboard (CSV)' button downloads a file.
188. Every native confirm()/prompt()/alert() listed in section 1.13 still appears and blocks; no theme overlay sits above or intercepts them; Cancel always aborts without a network call.
189. Danger controls remain visually distinct from primary and from the theme accent at a glance: btn-danger (red tint), btn-success (green), locked buttons dimmed via .btn:disabled, is-loading spinners visible, badge-hard red for Banned/Wrong, line-through red for banned names, danger-bordered flag panel and 'Start a new event' section.
190. Inline style tokens (--color-border-danger, --color-diff-hard, --color-diff-hard-wash, --color-danger-fg, --color-border-neon, --color-neon) resolve to distinct, legible values under the theme (contrast ≥ 4.5:1 for text), since these panels cannot be restyled by class selectors.
191. All fixed admin overlays (OwnerFlagVault z-120, chain/B2R previews z-5000) still cover the full viewport and centre correctly — i.e. no theme ancestor introduces transform/filter/perspective/contain that would become their containing block.
192. Tables keep horizontal scroll inside TableFrame (surface overflow-hidden > overflow-x-auto) at narrow widths with no page-level horizontal scroll; the sticky Teams aside (lg:sticky lg:top-6) still sticks under the nav.
193. Keyboard: every btn/tab/chip/input shows the focus ring; Escape closes the vault; Enter in #vault-capture submits; Tab order unchanged (no decorative elements inserted into the tab sequence).
194. Reduced motion: StatsBar, vault and modal entrances skip animation; nothing in admin animates continuously.
195. Admin typography stays in Inter/JetBrains Mono for tables, inputs, hashes, flags, emails and counts (display faces only on decorative chrome); uppercase label-micro headers remain readable.
196. The select controls (role select, category/difficulty, add-member selects) keep readable native options (.select option on surface-overlay) and the custom chevron.
197. No new localStorage keys other than cyberhx.pinaka.intro.v1 / cyberhx.pinaka.journey.collapsed are written; notif_last_seen, cyberhx.fx, cyberhx.fx.prev, cyberhx.sound, cyberhx.invite, cyberhx.theme and the sb-*-auth-token are untouched.
198. Network: with the theme active, DevTools shows no requests outside self, *.supabase.co, challenges.cloudflare.com, fonts.googleapis.com, fonts.gstatic.com, and no CSP violations in the console.
199. Auth page under the theme: Turnstile iframe renders inside the ref container, is clickable, becomes 'Verified', and 'Continue with Google' (btn-secondary with brand-colour G) redirects; the blocked/error copy still shows when the widget fails; the OAuth #error hash handling still produces the fixed messages.
200. Uplink-down HoldScreen and paused HoldScreen still replace the app for players and are not hidden by theme layers.
201. Theme fallback: with ?theme=cyberhx or a failed pinaka.css load, the admin renders exactly as before (html[data-theme=cyberhx]).
202. Running the TypeScript check (npm run lint = tsc --noEmit) and build remain green after the theme lands (not run in this audit).

## Consolidated risks for a presentation layer

- **[routes]** Behaviour is keyed on CSS class names and data attributes, not just looks: `.page-shell`, `data-tier`, `data-diff`, `data-selflit`, `data-tilt`, `.holo`, `.card-interactive`, `.surface-overlay`, `.btn/.tab/.chip`, `.is-active/.is-loading/.is-invalid`, `.submit-form[data-stage]`, `.deny*`, `.standings-row[data-moved|data-me]`, `.event-clock[data-tone]`, `.access-*`, `.stagger > *`, `--i/--stagger-*/--deny-*/--rail-hue/--mx/--my/--tx/--ty`. Renaming or removing any of these in a skin silently breaks SurfaceLight, CursorRing, the submit cinematic, the wrong-flag ladder, rank markers or the form lock on the auth card.
- **[routes]** `.auth-scale` redefines `--text-micro/--text-small/--text-body` for the auth card only (index.css:605-614); a theme that re-tokenises type must keep this scoped override or auth labels shrink.
- **[routes]** Several colours are literal and cannot be themed via CSS variables: recharts hex arrays (Scoreboard.tsx:17-20, SharedComponents.tsx:32-41/516-517, TeamProfile.tsx:371, UserProfile.tsx:174), the auth radar SVG (#c6ff00, AuthPage.tsx:60-71), Tailwind off-palette utilities (emerald-* in AuthPage, orange-*/red-500 in chain/B2R/admin files, bg-black/70|80 dialogs), inline rgba in App.tsx:1047/1803/1817, AdminDashboard.tsx:2312 and chain progress gradients, plus rgba(198,255,0,…) baked into index.css components (btn-primary, hairlines, breach, cursor SVG, deny-stamp). A Pinaka palette applied only through `@theme` tokens will leave these lime/orange artefacts unless each site is also addressed.
- **[routes]** `AdminDashboard.StatusLine` (AdminDashboard.tsx:72-85) chooses its colour by `msg.startsWith('❌')`; any copy change to admin status strings (or emoji stripping by a skin) changes error/success colouring. Likewise the Event tab status badge keys on the string containing 'LIVE' / equalling 'Inactive' (:2122).
- **[routes]** The three-level event gating is client-derived every second from `event_settings` (App.tsx:714-729) and paused players lose *every* view to HoldScreen (App.tsx:1057-1058); a skin that wraps or re-parents the content switch must keep HoldScreen rendering inside the same flex parent and keep `AnimatePresence mode="wait"`/`AnimatedView` keyed on `currentView`, or view transitions, scroll-to-top and warp will misfire.
- **[routes]** Every view component roots at `flex-1` and relies on `AnimatedView`'s `flex flex-1 w-full min-w-0` parent (AnimatedView.tsx:321); the challenges view renders `<aside>` + `<main>` as siblings. Wrapping views in a non-flex themed container collapses the sidebar/main layout.
- **[routes]** The z-index ladder (ambient 0 → shell 1 → nav 50 → modal 100 → invite 110 → vault 120 → cursor 140 → milestone 200 → chain readme 4000 → B2R overlay 4500 → admin preview 5000) is hard-coded per component; a theme adding its own fixed layers (frames, ornaments, overlays) must slot between 1 and 50 or above 5000 and must stay `pointer-events: none`, or it will eat clicks on scrims/buttons.
- **[routes]** ChainExperience node chips start at inline `opacity: 0` and are positioned/revealed by canvas callbacks writing `style.transform` (ChainExperience.tsx:64-71, 146); any CSS that sets `transform` or `opacity` on those buttons (e.g. a global hover lift) will fight the renderer and can hide or misplace the chips.
- **[routes]** ChallengeCard tilt is driven by inline `transform` on a wrapper and `--tilt-*` vars (App.tsx:1756-1787); adding `transform` to `.card-interactive[data-selflit]` or its parent breaks the perspective and `preserve-3d`.
- **[routes]** `prefers-reduced-motion` has a global kill block (index.css:1938-1982, 2061-2065) and components check `useReducedMotion()`/`matchMedia` themselves (UserProfile/UsersList use raw matchMedia). New theme animations must register in that block and must be transform/opacity only (DESIGN_SYSTEM.md §7), or they will run for motion-sensitive users.
- **[routes]** The custom reticle cursor and hot-state ring are applied via selectors `a, button, [role=button], summary, label[for], select, .btn, .card-interactive, .tab, .chip` (index.css:1476-1480; CursorRing.tsx:133-134). Replacing the cursor with a Pinaka motif must keep `cursor: text` on inputs and `not-allowed` on disabled, and the data-URI must remain inlined (CSP `img-src` allows `data:` but external cursor files from other origins would be blocked).
- **[routes]** The Vercel CSP (vercel.json) restricts scripts to self + challenges.cloudflare.com, styles to self + fonts.googleapis.com, fonts to fonts.gstatic.com, and `connect-src` to supabase. A skin that loads a new web font, image CDN or script from another origin will be blocked in production even though it works in `vite dev`.
- **[routes]** Turnstile renders into a bare `div ref` (AuthPage.tsx:779) with `theme: 'dark'`; wrapping it in overflow-hidden or transformed containers can clip or break the iframe's challenge popup; the explanation box and 'Try again' depend on `captchaState` text values shown in the badge.
- **[routes]** Native `confirm()/alert()/prompt()` are used in 34 places (admin ops, Leave Team). A theme that globally overrides window dialogs or adds its own modal system must not intercept these or admins lose destructive-action confirmations.
- **[routes]** `text-text-tertiary` (App.tsx:1445, 1455) is not a defined token — harmless today, but a theme generator that validates classes may flag it; do not 'fix' it by changing the Suspense fallback structure (sr-only role=status text lives there).
- **[routes]** Data derivations shown in the UI (myScore = Σsolved points − Σhint costs floored at 0; team rank = teams strictly ahead + 1; podium gated on leader > 0; first-blood-open = solvedCount===0 && !isSolved) are reproduced in multiple components to match the database; a skin must not reformat or round these numbers differently in different places (AnimatedNumber first paint is deliberately static).
- **[routes]** The B2R tab is visible to admins even when `b2r_enabled` is false (App.tsx:421, 1242 'off' pill); QA must test the board both as a player and as an admin because the mode tablist and FREE-board exclusions differ.
- **[routes]** Both Teams and Users list pages have a `btn btn-primary btn-icon` search button with no `onClick` (TeamsList.tsx:164-169, UsersList.tsx:206-211); if a skin converts it to a `<button type=submit>` inside a form it would start submitting/reloading — keep it inert or leave as-is.
- **[routes]** `index.html` carries `theme-color #060b10`, manifest/icons and SEO/OG copy branded CyberHX; the static legal pages (public/*.html + legal.css) are outside React and will not pick up a React-side theme, producing a visual seam when opened from the footer.
- **[flows]** Turnstile stacking/pointer: any theme element with z-index ≥ the auth card's content, a decorative overlay without `pointer-events:none`, or a `::before/::after` on the card ancestors can sit over the Turnstile iframe (`AuthPage.tsx:779`) and make verification unclickable → submit stays disabled for every visitor. Only `.access-root` (z 30, `index.css:1374`) may cover it, and only while `phase !== 'idle'`.
- **[flows]** Turnstile container identity: wrapping the auth card in a theme component that remounts on breakpoint/theme change (new `key`, conditional parent, `AnimatePresence` swap) destroys the node `widgetIdRef` points at; the widget is only re-rendered on `captchaAttempt` (`AuthPage.tsx:231-282`), so the badge would stay 'Pending' forever.
- **[flows]** Turnstile ancestor CSS: `transform`, `filter`, `backdrop-filter`, `opacity<1`, `contain`, or `overflow:hidden` with a fixed height on ancestors of the widget can break iframe hit-testing or clip the 300×65 px challenge; `will-change:transform` on the card also creates a containing block for the fixed-position Cloudflare interstitial.
- **[flows]** CSP (`vercel.json`): a Pinaka font or image loaded from any CDN other than fonts.googleapis.com/fonts.gstatic.com (fonts) or https (images) is blocked; inline `<style>` is allowed but external stylesheets must be same-origin; any theme script from a CDN is blocked (`script-src 'self' … challenges.cloudflare.com`).
- **[flows]** Class-name coupling: JS reads `.deny` (`App.tsx:2092-2101`), `.holo`, `.card-interactive`, `.surface-overlay`, `[data-selflit]` (`SurfaceLight.tsx:34-38`), and `a, button, [role=button], summary, label[for], select, .btn, .card-interactive, .tab, .chip` (`CursorRing.tsx:24-25`). Renaming or dropping these classes (e.g. replacing `.card-interactive` with a Pinaka card class) silently disables tilt/light/cursor states and the wrong-flag shake.
- **[flows]** `data-*` contract: `data-stage` on the submit form, `data-diff`/`data-selflit` on cards, `data-tier` on the App root, `data-moved`/`data-me` on standings rows, `data-tone` on the event clock, `data-state` on access steps, `data-mode` on the ambient root, and runtime-written `data-tilt` are all CSS hooks (`index.css:1007,1080-1108,1335,1350-1368,1408-1420,1511-1521,1560-1636,1762-1801,2044-2046`). A theme that re-templates these elements must carry the attributes through.
- **[flows]** Inline CSS variables written by JS (`--tilt-x/--tilt-y/--spec-x/--spec-y`, `--mx/--my/--tx/--ty`, `--i/--stagger-step/--stagger-dur`, `--deny-shake/--deny-dur/--deny-fade`, `--rail-hue`, `--tile-accent`, `--ambient-grid-opacity`) must not be overridden with `!important` or shadowed by theme rules on the same elements.
- **[flows]** Form identity: keying/remounting the `<form class="submit-form">` (`App.tsx:2502`) or the `<input id="flag-input-…">` on theme state change wipes the player's typed flag and breaks the `classList` shake trick; the comment at `:2089-2091` records exactly this bug.
- **[flows]** Pointer-events on decorative overlays: Pinaka motifs placed over the board, modal, or auth card must be `pointer-events:none` and `aria-hidden`. Non-transparent overlays over `.scrim` would block the click-to-close path; over `.breach-root` they would block the early dismiss click.
- **[flows]** Focus traps / key handlers: a theme-level `keydown` listener that calls `preventDefault`/`stopPropagation` would break `Escape` to close the modal (`App.tsx:2131-2139`), `Escape` to clear search (`:1280`), and the `/` shortcut (`:808-819`). A focus-trap library on the modal would also fight the hint 'Decrypt' `autoFocus` and Turnstile's own focus.
- **[flows]** z-index ladder: new theme layers must slot under 100 (modal) unless intentionally modal; anything ≥ 200 would cover the milestone banner, ≥ 4000 the chain/B2R dialogs. The sticky `<nav>` (z 50) and the notification panel (z 50, `App.tsx:266`) rely on DOM order; a theme header with its own stacking context can push the panel beneath page content.
- **[flows]** `.page-shell` requirement: the ambient plane is `position:fixed; z-index:0` and content relies on `.page-shell{position:relative;z-index:1}` (`index.css:946-959`). A theme background inserted outside `.page-shell` without `pointer-events:none` would swallow all clicks; one inserted with a higher z-index would hide the UI.
- **[flows]** Scroll containers: the challenge modal body (`max-h-[calc(100vh-10rem)] overflow-y-auto`), standings table (`max-h-[28rem] overflow-auto`), chain stage (`overflow-x-auto`), and notification panel rely on their own scroll boxes; theme `overflow:hidden` on ancestors or a fixed-height shell breaks them, and `window.scrollTo` in `AnimatedView.tsx:48` assumes the window scrolls.
- **[flows]** `AnimatedView`/`AnimatePresence mode="wait"` (`App.tsx:1060-1061`): inserting a theme wrapper between `AnimatePresence` and the keyed `motion.div` (or giving views different keys) breaks exit animations and can double-mount views, firing duplicate fetches (TeamProfile, UserProfile, Scoreboard mount effects).
- **[flows]** Multiple `useAuth()` instances: wrapping the app in a new theme provider that re-renders on cursor/scroll would re-render every `useAuth` consumer; wrapping views in `React.memo` with changed props could stall `profile`-driven effects (invite offer keyed on `profile?.id`, `App.tsx:349-364`).
- **[flows]** Hard-coded hex that will not follow token overrides: `Scoreboard.tsx:17-20`, `SharedComponents.tsx:32-41`, `TeamProfile.tsx:371`, `UserProfile.tsx:174`, chain/B2R gradient strings, `ChallengeCard` solved wash (`App.tsx:1803,1817`), the SVG cursor data URIs (`index.css:1474,1479`), `index.html` `theme-color`. A palette swap that only touches tokens leaves lime artefacts; changing recharts colours to `var()` breaks SVG attribute rendering (`Scoreboard.tsx:14-16`).
- **[flows]** Frozen tokens: `--color-cyber-*` names must survive (`DESIGN_SYSTEM.md:19,365`); editing values inside `@theme static` changes the generated utility classes globally, so Pinaka overrides should be scoped (e.g. `[data-theme="pinaka"] { --color-neon: … }`) and applied on an ancestor of `#root`, not by editing the `@theme` block.
- **[flows]** Reduced-motion and fx dial: any new animation that does not honour `prefers-reduced-motion`, `getFx()`/`getCapability()` (`performance.ts`), or `useReducedMotion()` violates `DESIGN_SYSTEM.md:294-297,367-369` and defeats the player's 'Off' setting; a second WebGL canvas competes with the lattice (`BreachConfirm.tsx:10-18` explains why the platform avoids this).
- **[flows]** Sound: a theme that plays audio outside `AudioManager.play()` bypasses `cyberhx.sound`; conversely replacing `AudioManager` sound names breaks `play('tick'|'open'|'close'|'success'|'legendary'|'failure'|'milestone')` call sites in App, ChainExperience, SoundToggle.
- **[flows]** `SurfaceLight` writes `data-tilt` and `--mx/--my/--tx/--ty` onto whatever `.holo/.card-interactive/.surface-overlay` is under the pointer; if the theme marks large containers (page sections, nav) with those classes the whole region will tilt on hover and steal the effect from cards.
- **[flows]** Cursor: `@media (pointer: fine)` sets a custom reticle cursor on `html, body` and interactive selectors (`index.css:1472-1487`); a theme cursor must keep `cursor:text` on inputs and `not-allowed` on disabled, or players lose caret/disabled affordances.
- **[flows]** Copy coupling for QA and support: many strings are matched by the `preserveChecklist` and by the platform's help pages (`support@cyberhx.com`, '[ NO RESET PROTOCOL ]', 'ACCESS DENIED ::'); a themed re-wording changes user-visible behaviour and should be treated as a functional change requiring sign-off.
- **[flows]** `localStorage` keys (`cyberhx.sound`, `cyberhx.fx`, `cyberhx.fx.prev`, `cyberhx.invite`, `notif_last_seen`): a theme persisting its own state must use a distinct namespace (e.g. `cyberhx.theme.*`) and must tolerate storage being unavailable (every existing reader is try/catch-wrapped).
- **[flows]** ARIA/semantic drift: converting `<button>`s to `<div onClick>`, removing `role="tab"/"tablist"`, `aria-pressed`, `aria-current`, `aria-expanded`, `role="alert"/"status"/"alertdialog"`, or `sr-only` nodes (chain state list, loading announcers) changes screen-reader behaviour and can break the cursor-ring 'hot' detection and the global focus ring (`index.css:200-204`).
- **[flows]** Mobile layout gates: the toolbar, rail (`hidden lg:block`), mobile filter (`lg:hidden`), EventClock (`hidden md:inline-flex`), and header labels (`hidden xl:inline`) are breakpoint-conditional; a theme that changes container widths or Tailwind screens can hide the only difficulty filter at some widths or show two.
- **[flows]** Long-running timers and tab visibility: `usePolling`, Scoreboard, event settings, notifications, and `AudioManager` all pause on `visibilitychange`; a theme that renders the app inside an `<iframe>` or alters `document.hidden` semantics (e.g. via a splash overlay using `visibility:hidden`) changes polling behaviour.
- **[flows]** `Chain2D` appends an off-screen `<img>` to `document.body` (`Chain2D.ts:86-92`) and chips are positioned by inline transforms; a theme CSS rule targeting `body > img` or `transform` on `button` elements inside the chain stage will misplace nodes or hide the fire frame.
- **[flows]** Hidden/frozen scoreboard states are driven by `scoreboard_state`; a theme that caches or memoises `Scoreboard`/`TeamsList`/`UsersList` output (or lifts their state) can show stale standings after an admin hides/freezes the board.
- **[flows]** Build-time: adding new npm dependencies (three.js, GSAP, cursor libraries) is forbidden by `DESIGN_SYSTEM.md:366`; Vite alias `@` points to the project root (`vite.config.ts`), so theme imports must use relative paths or that alias consistently.
- **[flows]** `index.html` SEO/meta: `theme-color`, favicon and `cyberhx-build` marker are read by hosting/PWA; changing `<title>`/manifest is presentational but should be a deliberate, reviewed change since analytics and the Vercel deploy check reference the build marker.
- **[environment]** backdrop-filter cost: every .surface, .surface-raised and .card-interactive already carries backdrop-filter: blur(12px) (index.css:457-489) — 100+ challenge cards blur whatever is behind them. A richer or more detailed theme environment (parallax imagery, more contrast behind the cards) makes every blur layer more expensive and more visible as scroll jank on 'medium' devices. Do not add backdrop-filter to any theme layer; consider the README's rule 5 as a hard gate.
- **[environment]** Lattice colours are GLSL literals (lattice.ts L217-490) with no palette uniform: a Pinaka build that keeps <AmbientBackground/> mounted will show a lime/teal lattice under a gold UI. If the theme replaces it, every behaviour in AmbientBackground.tsx (tier gating, visibilitychange pause, pointer/scroll listeners, setLatticeCapacity, destroy on unmount/fx change) must be reimplemented or the signals/mood/warp stores become dead but harmless.
- **[environment]** Fixed-layer and stacking-context collisions: .ambient-root (z0, contain:strict) relies on .page-shell (z1) being the sibling that lifts all UI. A theme environment that is not a sibling of .page-shell, or that adds its own z-index inside .page-shell, can land above cards or below the body background. AnimatedView's motion.div applies perspective/transform during transitions, so any new position:fixed element rendered inside it will be mis-positioned for 150-300 ms; keep fixed overlays mounted after </AnimatedView> as App.tsx does today (challenge modal z-[100], invite z-[110], milestone z200). .cursor-ring z140 and .milestone-root z200 sit above modals by design; a theme banner above z200 would cover the milestone toast; anything with pointer-events between z100 and z5000 can eat modal clicks.
- **[environment]** Inline and SVG colour literals cannot be overridden by the theme stylesheet: recharts TOKEN/COLORS (SharedComponents.tsx:33-40, Scoreboard.tsx:17-20, UserProfile.tsx:174, TeamProfile.tsx:371), the auth radar SVG (AuthPage.tsx:60-70), the solved-card wash (App.tsx `background: 'rgba(198, 255, 0, 0.06)'`), and the chain/B2R progress gradients (#8fb800→#c6ff00→#ddff6b) will stay lime unless a code change reads tokens at runtime. Changing them touches files with live data logic (Scoreboard, profiles, boards) — highest regression surface of the whole effort.
- **[environment]** Tailwind '/opacity' utilities emit a literal hex fallback before the color-mix(var()) rule inside @supports; browsers without color-mix (very old) will show lime; shadow-neon/shadow-neon-strong inline the lime at build time and need class-level overrides (shadow-neon-strong is not yet covered by core.css).
- **[environment]** bootTheme() now gates createRoot() (main.tsx:53): under the theme, first paint waits for the pinaka JS chunk, pinaka.css chunk and (latest boot.ts) two component chunks; a slow network shows the 'Initializing Terminal' state later and the uplink hold screen later. The fallback to 'cyberhx' on failure (themes/index.ts:120-126) must be tested with the CSS chunk blocked (CSP/offline) and with localStorage disabled; VITE_THEME_UNTIL uses the device clock, so a wrong client clock flips the skin.
- **[environment]** performance.ts caches the capability once; the theme's own components must subscribe to fx changes (subscribeFx) rather than caching getCapability() at module load, or they will keep animating after the player chooses 'off'. Conversely App's data-tier attribute is read once per App render and may lag an fx change until the next render (pre-existing).
- **[environment]** Google Fonts: the @import at index.css:1 is already render-blocking without a preconnect; adding Cinzel + EB Garamond via a runtime <link> is non-blocking but will cause a visible font swap on headings (FOUT) under the theme; Cinzel fallback metrics differ substantially from Inter so layout shift on h1/h2 is likely.
- **[environment]** Concurrency/consistency: src/App.tsx and src/themes/** were being modified while this audit ran (App.tsx anchors shifted ~27 lines; theme CSS files and components appeared mid-audit; boot.ts gained overrideCategoryIcons which mutates the board's icon map before render). Anything that mutates module state shared with App (category icon map, cached capability, mood store) must be verified to be a no-op on the default theme and idempotent across StrictMode double effects.
- **[environment]** The manifest (#060b10) and the static public/ pages (404/privacy/support/terms + legal.css) keep the lime brand; a themed PWA splash and themed app with un-themed legal pages is a visible inconsistency but not a functional regression.
- **[environment]** fire.gif (3.6 MB) and the chain raster assets are theme-neutral but cannot be recoloured; a 'Setu' replacement of ChainExperience (per README) re-implements the lazy chunk boundary, the Suspense fallback, useReducedMotion → Chain2D reducedMotion, and the play('open'/'close') sound calls — all functional surfaces.
- **[environment]** Dead dependencies (@google/genai, express, dotenv) are harmless to the bundle but any theme work that accidentally imports @google/genai (14 MB on disk) or touches api/ctftime.js would change the eager chunk or the CTFtime feed; keep both out of scope.
- **[admin-security]** Restyling .btn-danger / .btn-success (index.css:399-425) or redefining --color-diff-hard, --color-border-danger, --color-diff-hard-wash, --color-danger-fg toward the theme's gold/saffron accent would make Reset Event Scores, Start New Event, Ban, Delete Team, Hide Scoreboard and Pause look like primary actions; danger must stay a distinct red hue separate from both the primary accent and the amber pause tint (--color-diff-medium).
- **[admin-security]** Overriding .btn:disabled / [disabled] (index.css:428-436) opacity or saturate, or applying a custom cursor to disabled buttons (themes/pinaka/styles/core.css:208-214 sets cursor globally), would hide the 'locked' state of the owner/admin Ban buttons and protected-team controls.
- **[admin-security]** Any transform, filter, perspective, backdrop-filter, contain: paint/layout, or will-change: transform on an ancestor of the app tree (e.g. a world wrapper around .page-shell, AnimatedView or the admin root) becomes the containing block for every position: fixed overlay — OwnerFlagVault (z-120), chain/B2R previews (z-5000), the challenge and invite modals, the scrim, HoldScreen — and will mis-position or clip them.
- **[admin-security]** Placing any theme layer (canvas, SVG, gradient plane, intro, journey strip) above z-index 0 with pointer events, or above z-[120]/z-[5000] at all, would cover admin modals, the Turnstile iframe, native-like dialogs and the cursor ring; decorative layers must stay z 0 behind .page-shell with pointer-events:none, and must never cover the Turnstile container (AuthPage.tsx:755-781) or the Google button (882-913).
- **[admin-security]** Adding external scripts, iframes, fetch/XHR, web fonts or media from hosts other than self, *.supabase.co, challenges.cloudflare.com, fonts.googleapis.com and fonts.gstatic.com will be blocked by the vercel.json CSP (no media-src/worker-src fallbacks beyond 'self'); partner logos must be bundled, not hot-linked, and nothing may define or replace window.turnstile or the #cf-turnstile-script tag.
- **[admin-security]** Replacing, wrapping or theming window.confirm / prompt / alert (16 confirms, 1 prompt, 22 alerts across the admin files) with custom dialogs changes blocking semantics and the typed-username / START NEW EVENT guards; the theme must leave native dialogs alone.
- **[admin-security]** Introducing dangerouslySetInnerHTML, rehype-raw, a custom ReactMarkdown components map, or a different urlTransform in the challenge description (App.tsx:2349) or chain briefing (ChainExperience.tsx:196) would reopen HTML/URL injection; any URL the theme renders must go through safeHttpUrl (lib/url.ts).
- **[admin-security]** Changing display/visibility rules for 'hidden md:block' / 'md:hidden' pairs (AdminDashboard.tsx:1153/1224, 1439/1536, 1673/1717, 2670/2735) would render both the table and the card list at once, duplicating every destructive button.
- **[admin-security]** Hiding, auto-dismissing, blurring or covering role="alert"/role="status" feedback (StatusLine 72-85; alerts at 673, 821, 875; OwnerFlagVault 249) or the inline error boxes (ChainManager 278, B2RManager 299) behind decorative overlays would conceal failed saves, failed bans and failed resets from the organiser mid-event.
- **[admin-security]** Overriding .input:focus / .is-invalid (index.css:553-571), .chip.is-active (769-774) or .tab.is-active (823-828) so that states collapse would remove the only visual difference between Live/Hidden challenges and between valid/invalid required fields.
- **[admin-security]** Applying backdrop-filter or heavy effects to full-screen layers, or running rAF loops while document.hidden, would degrade the admin on event-day laptops; theme README rules 5-6 already forbid this.
- **[admin-security]** Writing or clearing any localStorage key other than cyberhx.pinaka.intro.v1 and cyberhx.pinaka.journey.collapsed (notably notif_last_seen, cyberhx.invite, cyberhx.theme, or the sb-*-auth-token) would break the notification bell, invite flow, theme fallback or sign-in.
- **[admin-security]** Adding global keydown/Escape handlers, pointer capture or focus traps for decorative components would collide with OwnerFlagVault's window Escape listener (65-69), the challenge modal's Escape (App.tsx:2133) and the Enter-to-submit on #vault-capture, and could steal keyboard focus from admin forms.
- **[admin-security]** Changing the uppercase micro-label / mono fonts in admin tables, flag inputs, hashes, emails and counts to display faces (Cinzel/EB Garamond) or Devanagari numerals would make audit data (submitted flags, hashes, invite codes, timestamps) harder to read and could mis-render; numerals in admin data must stay Latin and tabular.
- **[admin-security]** Deriving UI from client flags (is_admin, is_owner, chain_experience_enabled, b2r_enabled, is_paused) for anything beyond chrome — e.g. showing a 'winner' plate, a countdown to a config.ts date, or rank badges — would invent data the server does not hold (themes/pinaka/README.md rule 3; config.ts:3-7 warns the dates only label the narrative).
- **[admin-security]** Renaming or deleting any --color-cyber-* / --color-* token, or injecting CSS not scoped under html[data-theme="pinaka"], would leak into the default skin and break the documented one-directory removal path (themes/pinaka/README.md:4-6).
