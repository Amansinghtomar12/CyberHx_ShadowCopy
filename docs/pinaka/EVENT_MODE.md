# Pinaka CTF — event mode

Two features, one migration, both temporary.

| | Free challenges | Chained challenges |
|---|---|---|
| what it adds | the card becomes a Ramayana battle scene; opening it dresses the whole page | the journey: each challenge opens only once the team solved the one before it |
| who it affects | nobody's play — cosmetic only | every chained challenge, while story mode is on |
| switch | per challenge, in the challenge editor | one master flag, plus per-series chapters |

Everything below is additive. No existing table changed shape, no existing
function was edited, and `admin_upsert_challenge` still takes exactly the
thirteen arguments it always did.

---

## 1. Turning it on and off

There are **two independent switches**, on purpose. The skin is a look;
story mode changes how the game plays. You can dress the event without
locking it, rehearse locking before the doors open, and kill locking
mid-event without losing the artwork.

### The skin (backgrounds, gold, chapters)

Admin panel → **Pinaka experience** card → **Open Pinaka for everyone**.
Players pick it up on their next poll, within about 30 seconds.

That card also has a **preview** that opens a new tab showing the skin to
you alone — nobody else is affected, and closing the tab ends it.

### Story mode (the locking)

```sql
select public.admin_set_pinaka_story_mode(true);   -- on
select public.admin_set_pinaka_story_mode(false);  -- off
```

Must be run as an admin — it checks `is_admin()`, so it will refuse from
the Supabase SQL editor, which has no auth session. Call it from the app
as a signed-in admin, or set the column directly and skip the audit entry:

```sql
update public.event_settings set pinaka_story_mode = true where id = 1;
```

**Off is instant and total.** Every gate short-circuits on this flag
before it looks at anything else, so turning it off returns every
challenge to ordinary play immediately — no cache to clear, no re-deploy.

It defaults to `false`, so applying the migration changes nothing until
you deliberately switch it on.

---

## 2. Where the images live

| what | where |
|---|---|
| battle scenes (12) | `frontend/src/themes/pinaka/assets/scenes/<slug>-{960,1920,portrait}.webp` |
| chapter backgrounds (6) | `frontend/src/themes/pinaka/assets/chapters/<id>-{960,1920,3840,portrait}.webp` |
| scene text and accents | `frontend/src/themes/pinaka/scenes/config.ts` |
| chapter text and accents | `frontend/src/themes/pinaka/chapters/config.ts` |

Scenes are full-viewport plates, not card art: opening a scene challenge
swaps the site's plate to its painting and closing puts the chapter's
plate back. They therefore carry the same four numbers a world plate
does — 1920, 960, a 9:16 portrait crop, and measured `focal` and `sun`
points, so the environment's bloom leaves the painted light rather than a
guessed corner.

The source art is 1672 px wide, so 1920 is a 1.15x lift with a light
unsharp pass rather than a real upscale. The twelve source PNGs were
27 MB; the shipped plate set is **4.1 MB** in total.

Scene accent colours are measured from the artwork — the most saturated
populated hue of each picture, lifted into a band that reads on dark
glass — rather than chosen by eye. If you replace a picture, re-measure
rather than keeping the old hex.

---

## 3. Assigning a battle scene to a Free challenge

Admin → Challenges → create or edit a challenge → set **Placement** to
*Free* → the **Ramayana Battle Scene** dropdown appears → pick one →
Save.

- "None / Default" clears it, and is what every challenge is by default.
- The dropdown only shows for Free challenges, as intended: a scene
  dresses a one-off arena, not a step of the story.
- Scoring, hints, files, category, points and solves are all unaffected.
- The card becomes the arena door: it leads with the scene's name, keeps
  the challenge's own title beneath it (a board of twelve arenas still has
  to be navigable), and carries a call to arms written for that scene —
  Give Chase, Take the Leap, Win the War. A solved arena reads "Return to
  the field".
- Pressing it turns the card over and hands the scene to the **whole
  page**; the ordinary challenge dialog opens on top, unchanged, with a
  one-line prologue and scene-specific submit wording ("Track the Golden
  Deer" rather than "Execute").
- "Take rest", at the foot of the dialog beside the flag field, is the way
  back out: the card folds and the chapter's sky returns. Nothing is lost
  — a Free challenge is free, so leaving costs no attempt. Escape and the
  dialog's X do the same.

The mapping is stored in `public.pinaka_challenge_scene`, one row per
challenge. Setting a scene on a challenge that has none inserts a row;
choosing "None / Default" deletes it.

---

## 4. Assigning chapters and order to the chain

**Chapter**: Admin → Chains → open a chain → **Pinaka chapter** dropdown
→ pick one of the six → Save. Stored in `public.pinaka_series_chapter`.

**Order**: unchanged from how chains already work. The order of a chain's
members *is* the story order, and the **last member of a chain is its
chapter gate**. There is no separate "is gate" switch to get out of sync:

```
position 1  → the chapter's first door, always open
position 2  → opens when the team solves position 1
position n  → opens when the team solves position n-1
position max→ the chapter gate
```

A challenge belongs to at most one chain (`idx_chain_member_one_series`
enforces it), so "the previous challenge" is never ambiguous.

> **Free challenges are never chain-locked.** A challenge that is not a
> member of any chain is always unlocked, whatever story mode says.

---

## 5. Testing locked / unlocked behaviour

### The automated test

`supabase/tests/pinaka_story_mode_test.sql` runs the whole gate against a
throwaway database. Every line prints `ok` or `MISMATCH`.

```bash
createdb ctf
for f in supabase/migrations/*.sql; do psql -d ctf -f "$f"; done
psql -d ctf -f supabase/tests/pinaka_story_mode_test.sql
```

It writes fixture rows — **never point it at production.**

### By hand, as a player

1. Turn story mode on.
2. Sign in as a player on a team that has solved nothing.
3. The chain board shows link 1 open and the rest with a lock and the
   line *"Locked. Complete the previous challenge to unlock."*
4. Open a locked challenge directly by URL. It shows the locked state,
   and the description, connection string, files and hints are all
   absent — not hidden in the client, absent from the response.
5. Submit any flag to a locked challenge. It is refused with 403 and
   **no attempt is spent** — the gate runs before the attempt counter,
   the cooldown, the IP budget and the flag comparison.
6. Solve link 1. Link 2 opens — for **every member of the team**, on
   every device, after any refresh.

### What a locked challenge is allowed to say

Visible: title, category, points, difficulty, solve count.
Withheld: description, connection info, file rows, hint rows (so not even
how many hints exist or what they cost), hint text, and flag submission.

### Two teammates solving at once

Nothing to test, by construction. Progress is **derived** from
`submissions` rather than stored in a counter, so there is no row to race
for and no counter to double-increment. Whichever member solves, and
however simultaneously, the next link reads open the moment either
transaction commits.

### Admins

Admins are never gated — that is what makes chapter preview work. An
admin sees every chapter and can verify any challenge at any time.

---

## 6. What was changed, and how to undo it

### Added (nothing existing was altered)

- `event_settings.pinaka_story_mode` — new column, defaults `false`
- `public.pinaka_challenge_scene`, `public.pinaka_series_chapter` — new tables
- `pinaka_team_unlocked`, `pinaka_viewer_unlocked`, `get_team_chain_progress`
- `admin_set_pinaka_story_mode`, `admin_set_challenge_scene`, `admin_set_series_chapter`
- `idx_submissions_team_challenge_correct`

### Wrapped (the originals are untouched, just renamed)

`submit_flag_tx` is ~200 lines of ban checks, event window, attempt caps,
cooldowns, IP budget, hash compare and the insert, all in one
transaction. Re-stating it to add four lines would have been four lines of
feature and 200 lines of risk. So the original was renamed to
`submit_flag_tx_core` and a thin wrapper took its name: the wrapper checks
the gate, then calls the original. **The scoring logic was not edited.**
Same for `unlock_hint` → `unlock_hint_core`.

### Changed in place

`public_challenges` (description and connection_info now blank when
locked), `public_hints`, and the `hints_select` / `files_select` RLS
policies.

> The views alone would not have been enough. `useData.ts` asks PostgREST
> to embed `files:challenge_files(...)` and `hints(id,cost)`, which
> PostgREST resolves against the **base tables** under RLS, not through
> the views — so the policies had to carry the same gate.

### Full revert

```sql
-- 1. stop the locking immediately
select public.admin_set_pinaka_story_mode(false);

-- 2. give the originals their names back
alter function public.submit_flag_tx_core(uuid,uuid,text,text) rename to submit_flag_tx;
alter function public.unlock_hint_core(uuid) rename to unlock_hint;

-- 3. drop what was added
drop table if exists public.pinaka_challenge_scene, public.pinaka_series_chapter;
drop function if exists public.get_team_chain_progress();
drop function if exists public.pinaka_viewer_unlocked(uuid);
drop function if exists public.pinaka_team_unlocked(uuid,uuid);
drop function if exists public.admin_set_challenge_scene(uuid,text);
drop function if exists public.admin_set_series_chapter(uuid,text);
drop function if exists public.admin_set_pinaka_story_mode(boolean);
alter table public.event_settings drop column if exists pinaka_story_mode;

-- 4. restore the view and the two policies
--    re-run the relevant block of
--    20260913000000_team_flow_and_view_hardening.sql
```

Step 2 must come before step 3: dropping `pinaka_team_unlocked` while the
wrappers still reference it would leave submissions broken.

On the frontend, deleting `frontend/src/themes/pinaka/scenes/` and
removing the `scenes.css` import from `pinaka.css` takes the Free-challenge
half out entirely.

---

## 7. One caveat worth knowing

The storage bucket is public-read behind capability URLs. Withholding a
file row hides a locked challenge's attachments from anyone who has not
already been handed the URL — it does **not** revoke a URL that is
already out. If a locked chapter's attachments are genuinely secret,
upload them fresh rather than relying on the row being hidden.
