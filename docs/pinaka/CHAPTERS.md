# Pinaka CTF — the six chapters

A temporary event layer on top of the Pinaka skin. The whole platform changes
character as a team advances: background art, accent colour, card rims,
buttons, and a rail that shows how far along the journey the team is.

```
Ayodhya → Mithila → Vanvaas → Kishkindha → Setu Bandhan → Lanka
```

Nothing here touches authentication, scoring, submission, hints, solves,
teams, chains, B2R, admin or any API. The chapter is **derived** from solve
records the platform already holds, and the layer only ever draws pixels.

---

## How a team's chapter is decided

`themes/pinaka/chapters/progress.ts` is a pure function. It is given the
challenges the player can see, the published chain series, and the
platform's own `isSolved` predicate — the same one the board and the chain
experience use — and returns which chapter each team stands in.

1. **A challenge belongs to a chapter** when it is a member of a chain series
   whose title names that chapter, or, failing that, when the challenge's own
   title names it. Matching ignores case, underscores and punctuation, so
   `ayodhya_gate`, `Ayodhya Gate` and `Chapter 1: Ayodhya` all match.
2. **A chapter is complete** when its *gate* challenge is solved. A chapter
   with no gate published falls back to "every challenge in it is solved". A
   chapter with no challenges at all is simply not complete — the team waits
   there, which is what an unpublished chapter should look like.
3. **The current chapter** is the first one that is not complete. Everything
   before it reads as completed, everything after it as locked.

Team solves count, not just your own — a teammate's solve moves the team.

### The gate of each chapter

| Chapter | Gate challenge | Also matches a chain series titled |
|---|---|---|
| 1 Ayodhya | `ayodhya_gate` | ayodhya, chapter 1 |
| 2 Mithila | `mithila_gate` | mithila, pinaka trial, chapter 2 |
| 3 Vanvaas | `vanvaas_gate` | vanvaas, vanavasa, forest, chapter 3 |
| 4 Kishkindha | `kishkindha_gate` | kishkindha, recon, chapter 4 |
| 5 Setu Bandhan | `setu_gate` | setu, setu bandhan, bridge, chapter 5 |
| 6 Lanka | `final_dharma` | lanka, final war, chapter 6 |

To change any of these, edit `match` in `themes/pinaka/chapters/config.ts`.
Nothing else needs to know.

### Setting the event up

Create one chain series per chapter, named for the chapter, and put that
chapter's challenges in it in order, with the gate last. The suggested set:

- **Ayodhya** — `royal_signal`, `palace_cipher`, `first_oath`, `ayodhya_gate`
- **Mithila** — `bow_fragment`, `sacred_curve`, `pinaka_trial`, `mithila_gate`
- **Vanvaas** — `forest_logs`, `golden_deer`, `jatayu_message`, `vanvaas_gate`
- **Kishkindha** — `cave_recon`, `sugreev_signal`, `valley_metadata`, `kishkindha_gate`
- **Setu Bandhan** — `floating_stone`, `bridge_token`, `ocean_pivot`, `setu_gate`
- **Lanka** — `fortress_entry`, `ten_heads`, `firewall_of_lanka`, `final_dharma`

Chains are optional: naming the challenges alone is enough, because the
title match catches them.

---

## What a player sees

- **The background** is that chapter's artwork, across the whole platform.
- **The accents** — card rims, hover glow, primary buttons, focus rings, the
  board's progress bar — take the chapter's colour.
- **The journey rail** above the board shows all six: completed with a tick,
  the current one lit and named, the rest locked and dim. On a narrow screen
  the rail scrolls the current chapter into the middle.
- **"Current journey"** is named above the scoreboard and a team's own page.
- **The unlock moment** appears once, when a chapter is completed: the
  organisers' sentence for the chapter just finished, then the one that
  opens. It is a dialog — Escape or the button closes it — and it never
  blocks play. A browser that has never seen the team records where they
  stand without announcing anything, so joining a team already at Setu does
  not replay four unlocks.

The campaign map below the rail is a different measure and says so: it tracks
the **share of the board** solved along the road, not chapter gates.

---

## Previewing, before and during the event

Both are per-tab, presentation only, and change no data:

- `?chapter=lanka` — look at any chapter's dressing. The rail reads as if the
  team had arrived there. Valid: `ayodhya`, `mithila`, `vanvaas`,
  `kishkindha`, `setu`, `lanka`. `?chapter=auto` clears it.
- `?unlock=setu` — rehearse the transition for that chapter, to check the
  words and the look. Combine them: `?chapter=lanka&unlock=setu`.

---

## Turning it on and off

The chapter layer is part of the Pinaka skin and has no switch of its own: it
is live exactly when the skin is, and gone the moment the skin is off. Every
rule is scoped to `html[data-theme="pinaka"]`, so the default CyberHX theme
cannot see it. See `RESTORE.md` for the skin's own switches — the admin
toggle, `?theme=`, `VITE_THEME` and `VITE_THEME_UNTIL`.

To remove the layer permanently after the event, without touching the rest of
the skin:

1. Delete `themes/pinaka/chapters/`, `themes/pinaka/assets/chapters/`,
   `themes/pinaka/styles/chapters.css`, `components/JourneyBar.tsx` and
   `components/ChapterUnlock.tsx`.
2. Drop the `chapters.css` import from `pinaka.css`, the two lazy exports
   from `lazy.tsx`, and the `ChapterPlateKey` entries from
   `assets/plates/index.ts`.
3. In `App.tsx`, remove the two chapter imports, the `journeyInput` /
   `journey` / `chapter` / `unlock` block, `useChapterAttributes`, the
   `plate=` prop on `PinakaEnvironment`, `<JourneyBar>`, `<ChapterUnlock>`
   and `chapterTag`.

The platform's own data is untouched by all of this.

---

## Files

**Added**

| File | What it is |
|---|---|
| `themes/pinaka/chapters/config.ts` | The six chapters: title, subtitle, line, unlock sentence, ambience, accents, gate match |
| `themes/pinaka/chapters/progress.ts` | Pure derivation of the journey from solves |
| `themes/pinaka/chapters/useChapter.ts` | Hooks: derive, publish on `<html>`, notice an unlock |
| `themes/pinaka/assets/chapters/` | Six backgrounds × 3840 / 1920 / 960 / portrait, and their manifest |
| `themes/pinaka/styles/chapters.css` | The six moods, the chapter's light on the chrome, the rail, the unlock |
| `themes/pinaka/components/JourneyBar.tsx` | The six steps on one rail |
| `themes/pinaka/components/ChapterUnlock.tsx` | The transition dialog |

**Changed**

| File | Change |
|---|---|
| `App.tsx` | Derives the journey, publishes `data-chapter`, paints the chapter's plate, mounts the rail, the unlock and the "current journey" line — all inside `pinaka &&` branches |
| `themes/pinaka/pinaka.css` | Imports `chapters.css` last |
| `themes/pinaka/lazy.tsx` | Two lazy exports |
| `themes/pinaka/assets/plates/index.ts` | Registers the chapter plates under `chapter-<id>`, apart from the world plates |
| `themes/pinaka/components/JourneyMap.tsx` | Says "the road" and the share of the board, so only the rail numbers chapters |

## The artwork

Six backgrounds supplied by the organisers, upscaled ×2 and cut to four sizes
each (a phone held upright gets a 9:16 crop rather than a stretched
landscape). The light position in each is measured, not guessed, so the
environment's glow leaves the painted light.

Chapter 3 is the one image with figures in it. It is shown because it was
supplied for this purpose; its crop keeps the figures in frame rather than
cutting them, on both a wide screen and a phone.
