/**
 * Which chained challenges this team may actually play.
 *
 * The server is the authority — a locked challenge is refused at the
 * database whatever the client believes — so this exists only so the board
 * can *show* a lock instead of letting someone walk into a refusal.
 *
 * It reads `get_team_chain_progress()`, which returns one row per chained
 * challenge with the team's own solved/unlocked state and nothing else:
 * no flags, no descriptions, nothing a locked card should not know.
 *
 * Failing to read it leaves every challenge unlocked *in the UI only*.
 * That is the right failure: the gate still holds server-side, so the
 * worst case is a player clicking into a challenge and being told no,
 * rather than the board going dark because one RPC was slow.
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';

export interface ChainProgress {
  /** Challenge ids the team has not yet earned. Empty when nothing is gated. */
  readonly locked: ReadonlySet<string>;
  /** Challenge ids the team has solved, as the server counts them. */
  readonly solved: ReadonlySet<string>;
  /** The last link of each chain: solving it finishes that chain. */
  readonly gates: ReadonlySet<string>;
  /** Which chapter each chain belongs to. Absent for an unfiled chain. */
  readonly chapterOfSeries: ReadonlyMap<string, string>;
  /** Chapters this team has not opened yet. */
  readonly lockedChapters: ReadonlySet<string>;
  /** Re-read after a solve, so the next link opens without a reload. */
  readonly refresh: () => void;
}

interface Row {
  challenge_id: string;
  series_id: string;
  chain_position: number;
  is_solved: boolean;
  is_unlocked: boolean;
  is_gate: boolean;
  /** Added with the chapter gate; absent against an older database. */
  chapter?: string | null;
  chapter_unlocked?: boolean | null;
}

const NONE: ReadonlySet<string> = new Set();
const NO_MAP: ReadonlyMap<string, string> = new Map();

interface State {
  locked: ReadonlySet<string>;
  solved: ReadonlySet<string>;
  gates: ReadonlySet<string>;
  chapterOfSeries: ReadonlyMap<string, string>;
  lockedChapters: ReadonlySet<string>;
}

const EMPTY: State = {
  locked: NONE, solved: NONE, gates: NONE,
  chapterOfSeries: NO_MAP, lockedChapters: NONE,
};

export function useChainProgress(enabled: boolean): ChainProgress {
  const [state, setState] = useState<State>(EMPTY);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    if (!enabled) { setState(EMPTY); return; }
    let live = true;

    void (async () => {
      const { data, error } = await supabase.rpc('get_team_chain_progress');
      if (!live) return;
      if (error || !Array.isArray(data)) { setState(EMPTY); return; }

      const l = new Set<string>(), s = new Set<string>(), g = new Set<string>();
      const chapterOfSeries = new Map<string, string>();
      const lockedChapters = new Set<string>();
      for (const r of data as Row[]) {
        if (!r.is_unlocked) l.add(r.challenge_id);
        if (r.is_solved) s.add(r.challenge_id);
        if (r.is_gate) g.add(r.challenge_id);
        // Both fields arrived with the chapter gate. Against a database
        // that has not had that migration applied they are simply absent,
        // and the board renders exactly as it did before chapters existed.
        if (r.chapter) {
          chapterOfSeries.set(r.series_id, r.chapter);
          if (r.chapter_unlocked === false) lockedChapters.add(r.chapter);
        }
      }
      setState({ locked: l, solved: s, gates: g, chapterOfSeries, lockedChapters });
    })();

    return () => { live = false; };
  }, [enabled, tick]);

  return { ...state, refresh };
}

/** The one sentence a card locked by its own chain is allowed to say. */
export const LOCKED_COPY = 'Locked. Complete the previous challenge to unlock.';

/** And the one a card locked by its chapter gets instead. */
export const CHAPTER_LOCKED_COPY = 'Locked. Finish the chapter before this one.';
