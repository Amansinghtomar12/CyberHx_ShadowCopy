/**
 * Where a team stands in the journey, derived from the platform's own solves.
 *
 * This file reads; it never writes, scores or decides anything the server
 * has not already decided. The caller passes the authoritative "is this
 * challenge solved" predicate — the same one the board and the chain
 * experience use — and the published chain series. Nothing here talks to the
 * network, and nothing here can change a score.
 *
 * HOW A CHAPTER IS RECOGNISED
 *   Each chapter names a gate challenge and a few aliases (config.ts). A
 *   challenge belongs to a chapter when it is a member of a chain series
 *   whose title matches one of the aliases, or, failing that, when its own
 *   title names the chapter ("ayodhya_gate", "Ayodhya Gate"). Matching
 *   ignores case, underscores and punctuation, so the organisers can name
 *   things the way they like.
 *
 * WHEN A CHAPTER IS COMPLETE
 *   Its gate challenge is solved. A chapter whose gate the organisers have
 *   not published falls back to "every challenge in it is solved", and a
 *   chapter with no challenges at all is simply not complete — the team
 *   waits there, which is what an unpublished chapter should look like.
 *
 * The current chapter is the first one that is not complete; everything
 * before it is complete, everything after it is locked.
 */
import { CHAPTER_LIST, CHAPTER_ORDER, FIRST_CHAPTER, type Chapter, type ChapterId } from './config';

export type ChapterState = 'completed' | 'current' | 'locked';

export interface ChapterProgress {
  id: ChapterId;
  index: number;
  state: ChapterState;
  /** Challenges of this chapter the team has solved, and how many there are. */
  solved: number;
  total: number;
  /** Whether the chapter's gate challenge exists, and whether it is solved. */
  hasGate: boolean;
  gateSolved: boolean;
}

export interface Journey {
  current: ChapterId;
  /** 1-based, so it reads like the chapter numbers. */
  currentIndex: number;
  chapters: readonly ChapterProgress[];
  /** How many chapters are fully complete. */
  completed: number;
  /** True once the last chapter's gate is solved. */
  finished: boolean;
}

/** One challenge, as little of it as this file needs. */
export interface JourneyChallenge {
  id: string;
  title: string;
}

/** One published chain series, as little of it as this file needs. */
export interface JourneySeries {
  title: string;
  challengeIds: readonly string[];
}

export interface JourneyInput {
  challenges: readonly JourneyChallenge[];
  series: readonly JourneySeries[];
  /** Authoritative solve predicate, passed in by the caller. */
  isSolved: (challengeId: string) => boolean;
}

/** Lower-case, punctuation and underscores to single spaces. */
function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Does `haystack` contain `needle` as whole words? */
function containsPhrase(haystack: string, needle: string): boolean {
  if (!needle) return false;
  return haystack === needle || haystack.startsWith(`${needle} `) ||
    haystack.endsWith(` ${needle}`) || haystack.includes(` ${needle} `);
}

function matchesChapter(title: string, chapter: Chapter): boolean {
  const t = normalize(title);
  if (!t) return false;
  if (containsPhrase(t, normalize(chapter.match.gate))) return true;
  return chapter.match.aliases.some(a => containsPhrase(t, normalize(a)));
}

/**
 * Which chapter each challenge belongs to. Chain membership wins over a
 * title match, because the organisers stated it explicitly; within either,
 * the earliest chapter in journey order wins, so a challenge is counted once.
 */
function assign(input: JourneyInput): Map<string, ChapterId> {
  const owner = new Map<string, ChapterId>();

  for (const chapter of CHAPTER_LIST) {
    for (const s of input.series) {
      if (!matchesChapter(s.title, chapter)) continue;
      for (const id of s.challengeIds) if (!owner.has(id)) owner.set(id, chapter.id);
    }
  }
  for (const chapter of CHAPTER_LIST) {
    for (const c of input.challenges) {
      if (owner.has(c.id)) continue;
      if (matchesChapter(c.title, chapter)) owner.set(c.id, chapter.id);
    }
  }
  return owner;
}

/** The journey, as the platform's own solve records describe it. */
export function deriveJourney(input: JourneyInput): Journey {
  const owner = assign(input);

  const rows = CHAPTER_LIST.map(chapter => {
    const mine = input.challenges.filter(c => owner.get(c.id) === chapter.id);
    const gateName = normalize(chapter.match.gate);
    const gate = mine.find(c => normalize(c.title) === gateName) ??
      mine.find(c => containsPhrase(normalize(c.title), gateName));
    const solved = mine.reduce((n, c) => n + (input.isSolved(c.id) ? 1 : 0), 0);
    const gateSolved = gate ? input.isSolved(gate.id) : false;
    const complete = gate
      ? gateSolved
      : mine.length > 0 && solved === mine.length;
    return {
      id: chapter.id,
      index: chapter.index,
      solved,
      total: mine.length,
      hasGate: !!gate,
      gateSolved,
      complete,
    };
  });

  // The first chapter that is not complete is where the team stands. If every
  // chapter is complete the journey is over, and the team rests at the last.
  const firstOpen = rows.findIndex(r => !r.complete);
  const finished = firstOpen === -1;
  const currentIndex = finished ? CHAPTER_ORDER.length : firstOpen + 1;
  const current = finished ? CHAPTER_ORDER[CHAPTER_ORDER.length - 1] : CHAPTER_ORDER[firstOpen];

  const chapters: ChapterProgress[] = rows.map((r, i) => ({
    id: r.id,
    index: r.index,
    solved: r.solved,
    total: r.total,
    hasGate: r.hasGate,
    gateSolved: r.gateSolved,
    state: r.complete ? 'completed' : i + 1 === currentIndex ? 'current' : 'locked',
  }));

  return {
    current,
    currentIndex,
    chapters,
    completed: chapters.filter(c => c.state === 'completed').length,
    finished,
  };
}

/** The journey before anything is known: everyone starts in the first chapter. */
export const JOURNEY_START: Journey = {
  current: FIRST_CHAPTER,
  currentIndex: 1,
  chapters: CHAPTER_LIST.map((c, i) => ({
    id: c.id, index: c.index, solved: 0, total: 0,
    hasGate: false, gateSolved: false,
    state: i === 0 ? 'current' : 'locked',
  })),
  completed: 0,
  finished: false,
};
