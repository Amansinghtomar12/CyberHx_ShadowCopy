/**
 * The chapter, as the rest of the skin consumes it.
 *
 * `useJourney` derives it from solves the caller already holds (progress.ts);
 * `useChapterAttributes` publishes it on <html> so stylesheet-only effects
 * follow without any component knowing; `useChapterUnlock` notices the moment
 * a chapter is completed so the transition can be shown once.
 *
 * Presentation only. Nothing here fetches, scores or writes anything the
 * server owns; the single piece of state kept on the device is "which
 * chapter this browser last saw", so a team is not shown the same unlock
 * twice.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CHAPTERS, CHAPTER_LIST, CHAPTER_ORDER, FIRST_CHAPTER, isChapterId,
  type Chapter, type ChapterId,
} from './config';
import { deriveJourney, JOURNEY_START, type Journey, type JourneyInput } from './progress';

/** Where this browser last saw the team standing, so an unlock shows once. */
const SEEN_KEY = 'cyberhx.pinaka.chapter.seen';
/** A reviewer's per-tab override: ?chapter=lanka. Presentation only. */
const PREVIEW_KEY = 'cyberhx.pinaka.chapter.preview';

/**
 * A rehearsal of the transition: ?unlock=mithila shows the moment Mithila is
 * completed, without anything having been solved. For the organisers to
 * check the words and the look before the event; it changes nothing else.
 */
function readUnlockRehearsal(): ChapterId | null {
  if (typeof window === 'undefined') return null;
  try {
    const v = new URLSearchParams(window.location.search).get('unlock');
    return v && isChapterId(v.toLowerCase()) ? (v.toLowerCase() as ChapterId) : null;
  } catch {
    return null;
  }
}

function readPreview(): ChapterId | null {
  if (typeof window === 'undefined') return null;
  try {
    const q = new URLSearchParams(window.location.search).get('chapter');
    if (q) {
      const v = q.toLowerCase();
      if (isChapterId(v)) {
        sessionStorage.setItem(PREVIEW_KEY, v);
        return v;
      }
      if (v === 'off' || v === 'auto') sessionStorage.removeItem(PREVIEW_KEY);
      return null;
    }
    const stored = sessionStorage.getItem(PREVIEW_KEY);
    return isChapterId(stored) ? stored : null;
  } catch {
    return null;
  }
}

/**
 * The journey for this team.
 *
 * `server` is the authority when it is there: get_team_chapter_progress()
 * is computed by the same functions that decide whether a flag is taken,
 * so a board built from it cannot disagree with the gate. It is null until
 * that read lands, and on any database where the chapter migration has not
 * been applied — then `input` is used, which works the journey out from
 * solves and from the names organisers gave their chains. That fallback is
 * a guess by construction, which is exactly why it is the fallback.
 *
 * `input` itself is null until the board's data has arrived, and the
 * journey then reads as the start — the first chapter, nothing complete —
 * which is also the truth for a team that has not solved anything.
 *
 * A reviewer's ?chapter= override moves the current chapter only; the
 * per-chapter solve counts stay honest.
 */
export function useJourney(input: JourneyInput | null, server?: Journey | null): Journey {
  const fallback = useMemo(() => (input ? deriveJourney(input) : JOURNEY_START), [input]);
  const derived = server ?? fallback;
  const preview = useMemo(readPreview, []);

  return useMemo(() => {
    if (!preview) return derived;
    const index = CHAPTER_ORDER.indexOf(preview) + 1;
    return {
      ...derived,
      current: preview,
      currentIndex: index,
      // the rail reads as if the team had arrived here, so a reviewer sees
      // the lit, completed and locked states the real journey would show
      completed: index - 1,
      chapters: derived.chapters.map((c, i) => ({
        ...c,
        state: i + 1 < index ? 'completed' : i + 1 === index ? 'current' : 'locked',
      })),
      finished: false,
    };
  }, [derived, preview]);
}

/**
 * Publishes the chapter on <html>: `data-chapter` for the theme's own rules
 * and a `theme-<id>` class, which is the hook event CSS can target directly.
 */
export function useChapterAttributes(chapter: ChapterId | null): void {
  useEffect(() => {
    if (!chapter) return;
    const el = document.documentElement;
    const className = `theme-${chapter}`;
    el.dataset.chapter = chapter;
    el.classList.add(className);
    return () => {
      delete el.dataset.chapter;
      el.classList.remove(className);
    };
  }, [chapter]);
}

function readSeen(): number | null {
  try {
    // getItem returns null when the key is absent, and Number(null) is 0 --
    // which would read as "this browser has seen the team complete nothing"
    // and announce a chapter they finished long ago. Check the string first.
    const raw = localStorage.getItem(SEEN_KEY);
    if (raw === null) return null;
    const v = Number(raw);
    return Number.isInteger(v) && v >= 0 ? v : null;
  } catch {
    return null;
  }
}
function writeSeen(n: number): void {
  try { localStorage.setItem(SEEN_KEY, String(n)); } catch { /* storage off: show once per load */ }
}

export interface ChapterUnlock {
  /** The chapter the team has just completed, or null when nothing is new. */
  completed: Chapter | null;
  /** The chapter that just opened, or null when the journey is over. */
  opened: Chapter | null;
  dismiss: () => void;
}

/**
 * Notices the moment the number of completed chapters grows, and reports the
 * chapter that was completed so the transition can name it.
 *
 * The first time a browser sees a team, the count is recorded without
 * announcing anything: a player who joins a team that is already at Setu
 * should not be shown four unlocks at once. A count that goes down (an admin
 * reset the event, or the player moved to a newer team) re-records quietly.
 */
export function useChapterUnlock(journey: Journey, ready = true): ChapterUnlock {
  const rehearsal = useMemo(readUnlockRehearsal, []);
  const [shown, setShown] = useState<number | null>(
    () => (rehearsal ? CHAPTER_ORDER.indexOf(rehearsal) + 1 : null),
  );

  // Deliberately stateless: the device's own record is read on every run
  // rather than mirrored in a ref, so a remount (the skin resolving, a
  // development double-mount) cannot leave a stale "last seen" behind and
  // announce a chapter the team completed long ago.
  useEffect(() => {
    if (rehearsal) return;
    // Until the journey is real, `journey.completed` is zero because
    // nothing has been read yet, not because the team has finished
    // nothing. Taking that as the baseline makes the first real read look
    // like four chapters completed in one instant, and the transition
    // fires over a board the player has not even seen.
    if (!ready) return;
    const stored = readSeen();
    if (stored === null) {
      writeSeen(journey.completed);     // first sight of this team: record, say nothing
      return;
    }
    if (journey.completed > stored) {
      setShown(journey.completed);
      writeSeen(journey.completed);
    } else if (journey.completed < stored) {
      writeSeen(journey.completed);     // the event was reset, or this is a newer team
    }
  }, [journey.completed, rehearsal, ready]);

  const dismiss = useCallback(() => setShown(null), []);

  return useMemo(() => {
    if (shown === null || shown < 1) return { completed: null, opened: null, dismiss };
    const completed = CHAPTER_LIST[Math.min(shown, CHAPTER_LIST.length) - 1] ?? null;
    const opened = shown < CHAPTER_LIST.length ? CHAPTER_LIST[shown] : null;
    return { completed, opened, dismiss };
  }, [shown, dismiss]);
}

/** The chapter record for an id, with the first chapter as the fallback. */
export function chapterOf(id: ChapterId | null | undefined): Chapter {
  return CHAPTERS[id && isChapterId(id) ? id : FIRST_CHAPTER];
}
