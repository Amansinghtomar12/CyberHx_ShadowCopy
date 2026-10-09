/**
 * The journey, challenge by challenge.
 *
 * WHAT THIS IS
 *   The order of the campaign: which challenges belong to which chapter, in
 *   what sequence, what technical tag each carries, which one closes its
 *   chapter, and the scroll a team is given when they solve it.
 *
 * WHAT IT IS NOT
 *   Authority. This file says what the journey *should* look like; the
 *   platform says what a team has actually solved, and the server decides
 *   what they may open. A challenge named here that the organisers have not
 *   created simply does not appear, and a challenge they created that is not
 *   named here is left to the ordinary board.
 *
 * MATCHING
 *   A row is tied to a real challenge by its title, compared with case,
 *   punctuation and underscores ignored (progress.ts does the comparing), so
 *   "Ayodhya Gate", "ayodhya-gate" and "AYODHYA_GATE" are the same thing.
 *   `aliases` catches a second name the organisers may have used.
 *
 * THE SCROLLS
 *   Two or three lines, given after the solve: what the team found, and
 *   where it points. They are the only place the story speaks in the
 *   player's own past tense, so they carry the journey between puzzles.
 *   Symbolic throughout — a road, an archive, a bridge, a gate.
 */
import type { ChapterId } from './config';

/** The technical discipline, shown as a small tag on the card. */
export type CategoryTag =
  | 'Sanity' | 'Crypto' | 'Forensics' | 'OSINT' | 'Web'
  | 'Stego' | 'Rev' | 'Pwn' | 'Mobile' | 'Misc' | 'Mixed';

export interface StoryChallenge {
  /** Stable key for this row. Also the fallback title match. */
  slug: string;
  /** The title the organisers give the challenge on the platform. */
  title: string;
  /** Other titles that should match the same row. */
  aliases?: readonly string[];
  chapter: ChapterId;
  /** 1-based position inside its chapter. The chain runs in this order. */
  order: number;
  tag: CategoryTag;
  /** The last challenge of a chapter: solving it opens the next chapter. */
  isGate: boolean;
  /** Given when this challenge is solved. */
  scroll: string;
}

export const STORY: readonly StoryChallenge[] = [
  /* ── Chapter 1 · Ayodhya — The Beginning ──────────────────────────────── */
  {
    slug: 'first-darshan', title: 'First Darshan', chapter: 'ayodhya', order: 1, tag: 'Sanity', isGate: false,
    scroll: 'The hall stands open to you. You have shown the first discipline — to look carefully before reaching for anything. On the far wall, old letters wait in a hand the court no longer writes.',
  },
  {
    slug: 'palace-inscription', title: 'Palace Inscription', chapter: 'ayodhya', order: 2, tag: 'Crypto', isGate: false,
    scroll: 'The inscription gives way. It is a record, not a prayer: accounts kept in a cipher the scribes believed safe. Where accounts are kept, an archive is kept beside them.',
  },
  {
    slug: 'royal-archive', title: 'Royal Archive', chapter: 'ayodhya', order: 3, tag: 'Forensics', isGate: false,
    scroll: 'The archive yields what was written over. A name was taken out, and the shape of it stayed behind. The trail ends at the gate, and the gate does not answer to anything you are carrying.',
  },
  {
    slug: 'ayodhya-gate', title: 'Ayodhya Gate', chapter: 'ayodhya', order: 4, tag: 'Web', isGate: true,
    scroll: 'The gate opens from the inside, as gates do. The road beyond is already lit for you. You will not come this way again for a long while.',
  },

  /* ── Chapter 2 · Mithila — The Trial of Pinaka ────────────────────────── */
  {
    slug: 'bow-fragment', title: 'Bow Fragment', chapter: 'mithila', order: 1, tag: 'Forensics', isGate: false,
    scroll: 'A fragment, not a whole: a sliver of something far older than the court that houses it. Its broken edge was cut, not worn. Someone measured this piece before you did.',
  },
  {
    slug: 'sacred-curve', title: 'Sacred Curve', chapter: 'mithila', order: 2, tag: 'Crypto', isGate: false,
    scroll: 'The curve is not ornament. It is a proportion, repeated until it becomes a key, and it opens a door rather than a lock. The court keeps a route that is not on any floor plan.',
  },
  {
    slug: 'hidden-court-route', title: 'Hidden Court Route', chapter: 'mithila', order: 3, tag: 'Web', isGate: false,
    scroll: 'The route runs behind the public hall, as you suspected. It ends where the pedestal stands. Everything between you and the bow has now been answered except the bow itself.',
  },
  {
    slug: 'trial-of-pinaka', title: 'Trial of Pinaka', aliases: ['pinaka-trial', 'mithila-gate'], chapter: 'mithila', order: 4, tag: 'Rev', isGate: true,
    scroll: 'The trial was never about strength. It asked whether you understood what you were lifting, and you answered. The hall is quiet now in a way it was not before.',
  },

  /* ── Chapter 3 · Vanvaas — Into the Forest ────────────────────────────── */
  {
    slug: 'forest-footprints', title: 'Forest Footprints', aliases: ['forest-logs'], chapter: 'vanvaas', order: 1, tag: 'Forensics', isGate: false,
    scroll: 'The prints are recent and they are wrong: the stride is even where the ground is not. Whoever walked here wanted the trail found. Something brighter waits further in.',
  },
  {
    slug: 'golden-deer-trail', title: 'Golden Deer Trail', aliases: ['golden-deer'], chapter: 'vanvaas', order: 2, tag: 'OSINT', isGate: false,
    scroll: 'You followed the strange trail deeper into the forest. The signs are no longer natural — they were placed, and placed well. Somewhere ahead, a broken message waits.',
  },
  {
    slug: 'jatayus-last-message', title: "Jatayu's Last Message", aliases: ['jatayu-message'], chapter: 'vanvaas', order: 3, tag: 'Stego', isGate: false,
    scroll: 'It was carried a long way by something that did not survive the carrying. Half of it is missing and the half that remains names a direction. The forest thins from here.',
  },
  {
    slug: 'vanvaas-gate', title: 'Vanvaas Gate', chapter: 'vanvaas', order: 4, tag: 'Web', isGate: true,
    scroll: 'The forest lets you go without ceremony. Ahead the ground rises into rock and open sky, and there are watchers on it who saw you long before you saw them.',
  },

  /* ── Chapter 4 · Kishkindha — Alliance & Recon ────────────────────────── */
  {
    slug: 'cave-signal', title: 'Cave Signal', aliases: ['cave-recon'], chapter: 'kishkindha', order: 1, tag: 'OSINT', isGate: false,
    scroll: 'The signal repeats on a patient schedule — not a warning, an invitation. It has been running far longer than your journey. Someone up here keeps very good records.',
  },
  {
    slug: 'sugreevs-archive', title: "Sugreev's Archive", aliases: ['sugreev-signal', 'sugreev-archive'], chapter: 'kishkindha', order: 2, tag: 'Forensics', isGate: false,
    scroll: 'The archive is an alliance in waiting: every valley mapped, every crossing timed, every debt written down. One endpoint in it is still live.',
  },
  {
    slug: 'valley-endpoint', title: 'Valley Endpoint', aliases: ['valley-metadata'], chapter: 'kishkindha', order: 3, tag: 'Web', isGate: false,
    scroll: 'The endpoint answers, and it answers to you now. What it returns is not intelligence but terms — what the alliance asks, and what it will give in return.',
  },
  {
    slug: 'alliance-key', title: 'Alliance Key', aliases: ['kishkindha-gate'], chapter: 'kishkindha', order: 4, tag: 'Crypto', isGate: true,
    scroll: 'The key is shared, which is the whole point of it: neither half opens anything alone. The army forms below while you hold your half. Ahead of all of it lies water.',
  },

  /* ── Chapter 5 · Setu Bandhan — The Bridge to Lanka ───────────────────── */
  {
    slug: 'floating-stone', title: 'Floating Stone', chapter: 'setu', order: 1, tag: 'Misc', isGate: false,
    scroll: 'It should sink and it does not, and the reason is written on it rather than in it. One stone proves nothing. A thousand laid in the right order prove a road.',
  },
  {
    slug: 'ocean-token', title: 'Ocean Token', chapter: 'setu', order: 2, tag: 'Web', isGate: false,
    scroll: 'The sea is not crossed by force but by permission, and permission here is a token that expires. You hold one. Holding it is not the same as building.',
  },
  {
    slug: 'bridge-builder', title: 'Bridge Builder', aliases: ['bridge-token'], chapter: 'setu', order: 3, tag: 'Rev', isGate: false,
    scroll: 'Each stone has to carry the next, so the order matters more than any single stone. You stop placing them by hand and teach the work to repeat itself. The far shore stops being a rumour.',
  },
  {
    slug: 'setu-gate', title: 'Setu Gate', aliases: ['ocean-pivot'], chapter: 'setu', order: 4, tag: 'Mobile', isGate: true,
    scroll: 'The causeway holds under the weight of everyone behind you. Lanka is no longer across the water — it is ahead, and it is lit, and it has been watching the bridge grow.',
  },

  /* ── Chapter 6 · Lanka — The Final War ────────────────────────────────── */
  {
    slug: 'fortress-entry', title: 'Fortress Entry', chapter: 'lanka', order: 1, tag: 'Web', isGate: false,
    scroll: 'The outer wall is not the defence; it is the first question. You are inside the gate and inside nothing else. Every door from here was built by someone expecting you.',
  },
  {
    slug: 'ashoka-trace', title: 'Ashoka Trace', chapter: 'lanka', order: 2, tag: 'Forensics', isGate: false,
    scroll: 'In the grove, a trace that was meant to be swept and was swept badly. It proves what the fortress denies. Carry it carefully: it is evidence, not a weapon.',
  },
  {
    slug: 'ten-heads-binary', title: 'Ten Heads Binary', aliases: ['ten-heads'], chapter: 'lanka', order: 3, tag: 'Rev', isGate: false,
    scroll: 'Ten ways to answer the same question, and nine of them are decoys that answer convincingly. You found which head speaks for the rest. The inner gate is next, and it does not bluff.',
  },
  {
    slug: 'lanka-gate', title: 'Lanka Gate', aliases: ['firewall-of-lanka'], chapter: 'lanka', order: 4, tag: 'Pwn', isGate: false,
    scroll: 'The gate gives, and what is behind it is quieter than the siege outside. One thing remains, and it is not a wall or a lock. It is the question the whole road was asking.',
  },
  {
    slug: 'final-dharma', title: 'Final Dharma', chapter: 'lanka', order: 5, tag: 'Mixed', isGate: true,
    scroll: 'It took everything the road taught you, in the order the road taught it. The fortress is still standing; it is simply no longer in the way. Dharma is restored, and the journey is complete.',
  },
];

/** The badge a team earns for completing a chapter. */
export const CHAPTER_BADGE: Record<ChapterId, string> = {
  ayodhya: 'Ayodhya Initiate',
  mithila: 'Bearer of Pinaka',
  vanvaas: 'Forest Seeker',
  kishkindha: 'Kishkindha Scout',
  setu: 'Setu Builder',
  lanka: 'Victor of Lanka',
};

/** The rows of one chapter, in chain order. */
export function storyOf(chapter: ChapterId): readonly StoryChallenge[] {
  return STORY.filter(s => s.chapter === chapter).sort((a, b) => a.order - b.order);
}

/** Every title a row answers to, for matching against the platform's own. */
export function titlesOf(row: StoryChallenge): readonly string[] {
  return [row.title, row.slug, ...(row.aliases ?? [])];
}
