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
  /** Chapter-gate challenge ids — the last link of each series. */
  readonly gates: ReadonlySet<string>;
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
}

const NONE: ReadonlySet<string> = new Set();

export function useChainProgress(enabled: boolean): ChainProgress {
  const [locked, setLocked] = useState<ReadonlySet<string>>(NONE);
  const [solved, setSolved] = useState<ReadonlySet<string>>(NONE);
  const [gates, setGates] = useState<ReadonlySet<string>>(NONE);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    if (!enabled) { setLocked(NONE); setSolved(NONE); setGates(NONE); return; }
    let live = true;

    void (async () => {
      const { data, error } = await supabase.rpc('get_team_chain_progress');
      if (!live) return;
      if (error || !Array.isArray(data)) { setLocked(NONE); setSolved(NONE); setGates(NONE); return; }

      const l = new Set<string>(), s = new Set<string>(), g = new Set<string>();
      for (const r of data as Row[]) {
        if (!r.is_unlocked) l.add(r.challenge_id);
        if (r.is_solved) s.add(r.challenge_id);
        if (r.is_gate) g.add(r.challenge_id);
      }
      setLocked(l); setSolved(s); setGates(g);
    })();

    return () => { live = false; };
  }, [enabled, tick]);

  return { locked, solved, gates, refresh };
}

/** The one sentence a locked card is allowed to say. */
export const LOCKED_COPY = 'Locked. Complete the previous challenge to unlock.';
