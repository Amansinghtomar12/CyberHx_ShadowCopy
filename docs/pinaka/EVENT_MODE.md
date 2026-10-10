# Pinaka CTF — event mode

Two features, one migration, both temporary.

| | Free challenges | Chained challenges |
|---|---|---|
| what it adds | the card becomes a Ramayana battle scene; opening it dresses the whole page | the journey: six chapters in order, and inside each one a chain that opens a link at a time |
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

The same switch sits in the header for admins, one click from anywhere:
a palette button beside the Admin tab. It is labelled "Open Pinaka" /
"Close Pinaka" on a wide screen and in the phone menu, and shows the icon
alone in between, where the row has no width to spare for the words.

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
| battle scenes (the 12 that ship) | `frontend/src/themes/pinaka/assets/scenes/<slug>-{960,1920,portrait}.webp` |
| battle scenes you add | the `scene-art` storage bucket, one WebP each; rows in `pinaka_scene` |
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

## 3a. Adding your own battle scene, during the event

Admin → Challenges → **Pinaka battle scenes** (below the challenge list) →
pick a picture → give it a name → **Add scene**. It is in the dropdown on
every challenge straight away. No deploy, nothing rebuilt, and no waiting
on an engineer.

The picture is prepared in your own browser before anything is uploaded:

- **Resized** to 1920 wide (never upscaled) and re-encoded as WebP, so a
  camera export leaves as a few hundred KB rather than making every page on
  the board wait for it. Accepts PNG, JPEG or WebP, up to 24 MB in.
- **Measured** — three numbers, taken from the picture rather than guessed:
  where the subject sits (so a wide desktop crop and a tall phone crop both
  keep it), where the light is (so bloom and rays leave the painted source),
  and the accent its card border takes. The focal point is shown in the
  panel; a subject hard against an edge gets clamped so neither crop loses
  it.

Use a **landscape** picture. It is painted full-bleed behind the whole site
while a player is in that arena, so a portrait crop will be cut badly.

**Removing one** also clears it from every challenge wearing it — those go
back to the ordinary card, and the panel says how many did. The twelve that
ship cannot be removed; their artwork is in the app's bundle rather than the
database. Their *words* can be edited like any other scene's.

If the catalogue migration has not been applied, the twelve still work
exactly as before and this panel simply has nothing to add to.

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

## 4. Building the story: chapters, chains, challenges

The journey has **two levels of lock**, and they are independent:

```
chapter gate   Mithila opens when EVERY operation in Ayodhya is solved
   chain gate  inside a chapter, link 2 opens when link 1 is solved
```

### The six chapters

They are fixed, named and ordered — in `public.pinaka_chapter` for the
gate and in `themes/pinaka/chapters/config.ts` for the art, and the two
agree by id:

| # | id | name | what it is |
|---|---|---|---|
| 1 | `ayodhya` | Ayodhya | The Beginning |
| 2 | `mithila` | Mithila | The Trial of Pinaka |
| 3 | `vanvaas` | Vanvaas | Into the Forest |
| 4 | `kishkindha` | Kishkindha | Alliance & Recon |
| 5 | `setu` | Setu Bandhan | The Bridge to Lanka |
| 6 | `lanka` | Lanka | The Final War |

Each one brings its own backdrop, colour and ambience; the page changes
character the moment a team walks into it.

### Filling a chapter

**Admin → Chains → _Pinaka story — the six chapters_.** The six are listed
in order with whatever is filed under each. From there:

1. **New chain here** on the chapter you want — the editor opens with that
   chapter already chosen.
2. Name the chain and add as many challenges as you like, in the order
   teams should play them. There is no limit: five, six, eight — whatever
   the chapter is worth.
3. Save, then **Publish**.

The picker only offers challenges that are in **no** chain yet. A
challenge belongs to at most one chain, so one already spoken for is left
out rather than offered and then refused on save.

There is no category to choose. A chain of a web, a crypto and a rev
challenge never had one honest answer, and every card already carries its
own; the chain's category is worked out from its members for the board's
filter chips and nothing else.

Repeat for as many chains as a chapter needs. A chapter is finished only
when **every operation in every published chain filed under it** is solved,
so two chains in one chapter means both must be completed before the next
chapter opens.

An existing chain can also be moved: open it and use the **Pinaka chapter**
dropdown. The mapping lives in `public.pinaka_series_chapter`.

### The order inside a chain

Unchanged from how chains already work. The order of a chain's members *is*
the story order:

```
position 1   → the chain's first door — open once the CHAPTER is open
position 2   → opens when the team solves position 1
position n   → opens when the team solves position n-1
position max → the last link; finishing every chain's last link finishes
               the chapter, and the next chapter opens
```

A challenge belongs to at most one chain (`idx_chain_member_one_series`
enforces it), so "the previous challenge" is never ambiguous.

### What a chapter looks like to a player

The chapter's painting fills the page, and its operations sit on it as a
row of linked cards — solved behind you, the one you are on glowing in the
chapter's own colour, the rest sealed. The link between two cards lights
when both ends are solved, which is the same rule the steel chain has
always used for an ignited segment.

A card wears the battle scene assigned to its challenge, if it has one
(section 3). A challenge with no scene shows no picture — the chapter's
painting is already the page behind the whole row, and repeating a crop
of it inside every card said the same thing six times.

The link between the cards is the chapter's own: a plain ring at Ayodhya,
the bow's lens at Mithila, a leaf in Vanvaas, a forged oval at
Kishkindha, a dressed stone on the causeway, and a molten spiked ring at
Lanka. It is what tells a player which chapter they are standing in when
the cards themselves carry no art.

A chapter that is still shut shows its name, its number and one line
saying what has to be finished first. The journey is meant to be seen
ahead of you.

> The steel-chain renderer is untouched and is still what **Enter chain**
> opens. This is the chapter view that gets a player there.

### Three things worth knowing

> **A chapter you leave empty is skipped, not a wall.** Using three of the
> six is fine: an empty chapter counts as finished for the gate, so the
> journey carries on. On the players' rail it does *not* show a tick — a
> team is never told they completed a chapter nobody wrote.

> **A chain with no chapter is never chapter-gated.** It still locks link
> by link, but it is reachable from the start. That is the behaviour an
> event that does not use chapters had before any of this existed.

> **Free challenges are never locked at all.** A challenge that is not a
> member of any chain is always open, whatever story mode says.

> **A challenge that is not visible is not part of its chain.** Hide one
> mid-chain and the step after it opens on the last visible step before it,
> so nobody is stranded; chapter completion ignores it the same way. (This
> needs `20261012000000_pinaka_chain_skips_hidden.sql`. Without it, hiding a
> step deadlocks every team for the rest of the event.)

---

## 4b. Is it actually set up? One query that says

Paste this into the Supabase SQL editor. It answers, in order: are the three
migrations applied, is the skin on, is story mode on, are the chapters
seeded, and is anything filed under them.

```sql
select 1 as ord, 'migration: event theme'   as item,
       (to_regprocedure('public.admin_set_theme(text)') is not null)::text as value
union all select 2, 'migration: pinaka event mode',
       (to_regclass('public.pinaka_series_chapter') is not null
        and to_regprocedure('public.pinaka_team_unlocked(uuid,uuid)') is not null)::text
union all select 3, 'migration: pinaka chapter gate',
       (to_regclass('public.pinaka_chapter') is not null
        and to_regprocedure('public.get_team_chapter_progress()') is not null)::text
union all select 4, 'theme', coalesce((select theme from public.event_settings where id = 1), '(unset)')
union all select 5, 'story mode on',
       coalesce((select pinaka_story_mode from public.event_settings where id = 1)::text, '(unset)')
union all select 6, 'chapters in the table', (select count(*)::text from public.pinaka_chapter)
union all select 7, 'chains filed under a chapter', (select count(*)::text from public.pinaka_series_chapter)
union all select 8, 'chains with no chapter yet',
       (select count(*)::text from public.chain_series s
        where not exists (select 1 from public.pinaka_series_chapter p where p.series_id = s.id))
order by ord;
```

Rows 1–3 and 6 are the migrations: `true`, `true`, `true`, `6`. Row 4 must
read `pinaka` and row 5 `true`, or nothing is gated. Rows 7 and 8 are the
content: **7 = 0 and 8 = 0 together mean there are no chains at all yet**,
which is why a freshly migrated event shows six empty chapters. Row 8 on its
own counts the chains still waiting for a chapter.

---

## 5. Testing locked / unlocked behaviour

### The automated test

`supabase/tests/run.sh` builds a throwaway database, applies every
migration, loads fixtures and runs the three gate tests. Every check prints
`ok` or `MISMATCH`, and the script exits non-zero if any failed.

```bash
# once: a cluster to test against
/usr/lib/postgresql/16/bin/initdb -D /tmp/pgt/data -A trust -U postgres
/usr/lib/postgresql/16/bin/pg_ctl -D /tmp/pgt/data \
  -o '-p 54399 -c listen_addresses=127.0.0.1' -l /tmp/pgt/server.log start

PGPORT=54399 supabase/tests/run.sh
```

| file | what it proves |
|---|---|
| `pinaka_story_mode_test.sql` | the chain gate: link by link, teammates cannot race it, a locked challenge says nothing about itself, turning it off restores ordinary play |
| `pinaka_chapter_gate_test.sql` | the chapter gate: a first door that is still shut because its chapter is, finishing a chapter opens the next and only the next, empty chapters skip, unfiled chains are not gated |
| `pinaka_chapter_edges_test.sql` | the events people actually build the night before: no chains filed at all, content only in a late chapter, two chains in one chapter, a chain filed but empty, a chain not published, a challenge not visible |
| `pinaka_scene_catalogue_test.sql` | the scene catalogue: the twelve are seeded and cannot be deleted, a new scene needs its artwork, writing it is admin-only, a built-in's words can be edited but its bundled art cannot be swapped, and an unknown scene is a sentence rather than a crash |

It writes fixture rows into a database it creates and drops —
**never point it at production.**

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

By `20261010000000_pinaka_event_mode.sql`:

- `event_settings.pinaka_story_mode` — new column, defaults `false`
- `public.pinaka_challenge_scene`, `public.pinaka_series_chapter` — new tables
- `pinaka_team_unlocked`, `pinaka_viewer_unlocked`, `get_team_chain_progress`
- `admin_set_pinaka_story_mode`, `admin_set_challenge_scene`, `admin_set_series_chapter`
- `idx_submissions_team_challenge_correct`

By `20261011000000_pinaka_chapter_gate.sql` (the chapter level):

- `public.pinaka_chapter` — new table: the six ids, their order, their names
- `pinaka_chapter_complete`, `pinaka_chapter_unlocked`
- `get_team_chapter_progress`, `admin_list_pinaka_chapters`
- `idx_pinaka_series_chapter_chapter`, `idx_chain_series_published`
- `pinaka_team_unlocked` replaced in place, same name and signature, to AND
  in the chapter gate. Every caller — both wrappers, both views, both
  policies — picked it up without being touched.
- `get_team_chain_progress` dropped and recreated with two more columns
  (`chapter`, `chapter_unlocked`). The existing columns kept their names,
  order and types, so a client built against the old shape kept working.

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

-- 3. drop what was added, callers before the things they call
drop function if exists public.get_team_chapter_progress();
drop function if exists public.get_team_chain_progress();
drop function if exists public.admin_list_pinaka_chapters();
drop function if exists public.pinaka_viewer_unlocked(uuid);
drop function if exists public.pinaka_team_unlocked(uuid,uuid);
drop function if exists public.pinaka_chapter_unlocked(uuid,text);
drop function if exists public.pinaka_chapter_complete(uuid,text);
drop table if exists public.pinaka_chapter;
drop table if exists public.pinaka_challenge_scene, public.pinaka_series_chapter;
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
