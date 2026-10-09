/**
 * The road as milestones of the board.
 *
 * Each of the seven stations is a share of the board the team has solved:
 * the six legs between them are a sixth each, so half the board is
 * Kishkindha and every flag taken is the return to Ayodhya. The map puts the
 * team's arrow on the road by these shares (not by distance travelled), so a
 * station lights exactly when the board says the team has reached it.
 *
 * Copy only; the numbers come from the platform. The lines are short on
 * purpose: they sit beside the map and under the chapter title.
 */
import type { StationKey } from './geo';

export interface Milestone {
  key: StationKey;
  /** The share of the board (0..1) at which the station is reached. */
  at: number;
  title: string;
  line: string;
}

export const MILESTONES: readonly Milestone[] = [
  { key: 'ayodhya',    at: 0,     title: 'The journey begins',    line: 'Every team sets out from the city.' },
  { key: 'chitrakoot', at: 1 / 6, title: 'Into the forest',       line: 'The first flags fall; the trail opens.' },
  { key: 'panchavati', at: 2 / 6, title: 'The trail turns south', line: 'The easy paths are behind you.' },
  { key: 'kishkindha', at: 3 / 6, title: 'Allies gathered',       line: 'Half the board: the army assembles.' },
  { key: 'rameswaram', at: 4 / 6, title: 'The bridge',            line: 'One stone after another, to the far shore.' },
  { key: 'lanka',      at: 5 / 6, title: 'The siege',             line: 'The hardest flags guard the fortress.' },
  { key: 'return',     at: 1,     title: 'Victory',               line: 'Every flag taken. The lamps are lit.' },
];

/** How many milestones a team at board share p has reached (Ayodhya always). */
export function milestonesReached(p: number): number {
  let n = 0;
  for (const m of MILESTONES) if (p + 1e-9 >= m.at) n++;
  return n;
}
