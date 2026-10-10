/**
 * Where the team stands, as the server says it stands.
 *
 * progress.ts works the journey out from solves and the names organisers
 * happened to give their chains ("does this title contain 'mithila'?").
 * That was the only option before the chapter gate existed. It no longer
 * is: `get_team_chapter_progress()` returns the six chapters in order with
 * this team's own counts, derived by the same functions that decide whether
 * a flag is accepted. Reading it means the page a player sees and the gate
 * that refuses them can never disagree.
 *
 * It fails open to `null`, and the caller falls back to the derived
 * journey. That is the right failure for this file: it decides which
 * painting to hang and which chapter name to print, and a board that shows
 * chapter one while the server quietly enforces chapter two is a much
 * smaller problem than a board that will not render.
 *
 * It polls, because the moment a chapter opens is not this player's to
 * trigger — a teammate three timezones away can solve the last challenge
 * of Ayodhya, and this tab should find Mithila open without a reload.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { CHAPTER_LIST, CHAPTER_ORDER, isChapterId, type ChapterId } from './config';
import type { Journey, ChapterProgress, ChapterState } from './progress';

/** Same cadence as the event-settings and scene polls. */
const POLL_MS = 30_000;

interface Row {
  chapter: string;
  chapter_position: number;
  title: string;
  series_count: number;
  total: number;
  solved: number;
  is_complete: boolean;
  is_unlocked: boolean;
}

export interface ServerJourney {
  /** Null until the first read lands, or whenever the read fails. */
  readonly journey: Journey | null;
  /**
   * Whether the first read has come back — either with rows or with the
   * "no such function" of an un-migrated database.
   *
   * `journey` alone cannot say: null means both "still asking" and "there
   * is nothing to ask". The difference matters to the unlock transition,
   * which takes its baseline from the journey it is first handed. Without
   * this it took that baseline from the client's own guess, and then the
   * server's answer — a chapter the team closed last night — arrived as a
   * rise, and the ceremony played over a board the player had not yet seen.
   */
  readonly settled: boolean;
  /** Re-read after a solve, so a chapter opens without waiting for the poll. */
  readonly refresh: () => void;
}

/**
 * The team stands in the first chapter that is open to them and not yet
 * finished. Everything before it is complete by definition — that is what
 * the gate means by "open" — and everything after is locked.
 *
 * An empty chapter is complete (the gate treats it that way too, so a
 * journey that uses three of the six chapters is not a dead end), which is
 * why "first incomplete" and not "first with challenges left" is the rule:
 * they agree, and only one of them is the server's.
 */
function toJourney(rows: readonly Row[]): Journey {
  const byId = new Map<ChapterId, Row>();
  for (const r of rows) if (isChapterId(r.chapter)) byId.set(r.chapter, r);

  const ordered = CHAPTER_LIST.map(c => ({ chapter: c, row: byId.get(c.id) ?? null }));

  // The gate and the rail are answering two different questions about an
  // empty chapter, and both answers are right.
  //
  //   The gate asks "may they pass?" — yes: a chapter nobody wrote must
  //   not be a wall, or using three of the six would end the journey.
  //
  //   The rail asks "have they finished it?" — no. A tick on Lanka tells a
  //   team they have won a war that was never written.
  //
  // So `complete` here is the server's answer narrowed to chapters that
  // hold something.
  const has  = ordered.map(o => (o.row?.total ?? 0) > 0);
  const done = ordered.map((o, i) => !!o.row?.is_complete && has[i]);

  // Where the team stands is the first chapter that has something in it and
  // is not finished — an empty one is passed over, not waited at.
  //
  // It used to be the first chapter not ticked, which is the same thing
  // until an organiser uses four of the six: then a team that had solved
  // the entire board was parked on "Setu Bandhan — nothing here yet" for
  // the rest of the event, and the journey never once said it was over,
  // because two chapters nobody wrote were still not ticked. Finishing
  // everything that exists is finishing.
  const firstOpen = done.findIndex((d, i) => !d && has[i]);
  const finished = firstOpen === -1;
  const lastWritten = has.lastIndexOf(true);
  const currentIndex = !finished
    ? firstOpen + 1
    // Finished: rest at the last chapter the organisers actually wrote, so
    // the backdrop and the head name a place the team has been.
    : lastWritten >= 0 ? lastWritten + 1 : CHAPTER_ORDER.length;

  const chapters: ChapterProgress[] = ordered.map(({ chapter, row }, i) => {
    const state: ChapterState =
      done[i] ? 'completed'
      : i + 1 === currentIndex ? 'current'
      : 'locked';
    return {
      id: chapter.id,
      index: chapter.index,
      solved: row?.solved ?? 0,
      total: row?.total ?? 0,
      // `hasGate` meant "the organisers published a challenge that closes
      // this chapter". With the gate in the database the whole chapter is
      // the gate, so it holds whenever the chapter has anything in it.
      hasGate: (row?.total ?? 0) > 0,
      gateSolved: !!row?.is_complete && (row?.total ?? 0) > 0,
      state,
    };
  });

  return {
    current: CHAPTER_ORDER[currentIndex - 1],
    currentIndex,
    chapters,
    completed: chapters.filter(c => c.state === 'completed').length,
    finished,
  };
}

export function useChapterProgress(enabled: boolean): ServerJourney {
  const [journey, setJourney] = useState<Journey | null>(null);
  const [settled, setSettled] = useState(false);
  const [tick, setTick] = useState(0);
  // An unchanged read keeps the same object, so the environment does not
  // re-run its plate crossfade every thirty seconds.
  const signature = useRef('');

  const refresh = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    // Nothing to wait for when the gate is off: the caller's own fallback
    // is the only answer there will be.
    if (!enabled) { setJourney(null); setSettled(true); signature.current = ''; return; }
    let alive = true;

    const read = async () => {
      const { data, error } = await supabase.rpc('get_team_chapter_progress');
      if (!alive) return;
      // A missing function is the un-migrated case, not a fault: the caller
      // falls back to deriving the journey the way it always did.
      if (error || !Array.isArray(data)) { setJourney(null); setSettled(true); signature.current = ''; return; }

      const rows = data as Row[];
      setSettled(true);
      const sig = rows
        .map(r => `${r.chapter}:${r.solved}/${r.total}:${r.is_complete ? 1 : 0}${r.is_unlocked ? 1 : 0}`)
        .sort()
        .join('|');
      if (sig === signature.current) return;
      signature.current = sig;
      setJourney(toJourney(rows));
    };

    // Asking afresh: not settled again until this read answers. A poll that
    // changes nothing re-settles on the same values, so the only window this
    // opens is between the question and its answer.
    setSettled(false);
    void read();
    const t = setInterval(() => { void read(); }, POLL_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') void read(); };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      alive = false;
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, tick]);

  return { journey, settled, refresh };
}
