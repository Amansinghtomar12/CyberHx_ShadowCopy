/**
 * Environment mood — the world knows which room you are in.
 *
 * The brief for this platform asks for one continuous universe rather than a
 * set of themed pages, which rules out swapping backgrounds on navigation. The
 * lattice instead keeps its identity and shifts its *behaviour*: same geometry,
 * same palette, different energy. Leaving the challenge board for the
 * scoreboard should feel like walking into a busier room, not like loading a
 * different site.
 *
 * Implemented as a module-level store rather than React context on purpose.
 * The consumer is a WebGL loop that already runs every frame — pushing this
 * through context would re-render the tree to deliver a number that the render
 * path does not use.
 *
 * The lattice eases toward these values over ~1.2s. Nothing here snaps.
 */

export type Mood = 'auth' | 'calm' | 'focus' | 'compete';

export interface MoodProfile {
  /** Overall brightness and density of the lattice. */
  presence: number;
  /** Forward camera speed through the corridor. */
  drift: number;
  /** How energetically payloads travel the wires. */
  traffic: number;
}

/**
 * auth     arrival: the most present the environment ever gets, because there
 *          is no application UI competing with it yet
 * calm     profile and settings: the network idles
 * focus    the challenge board: steady and quiet so the work leads
 * compete  the scoreboard: the network is busy, something is at stake
 */
const PROFILES: Record<Mood, MoodProfile> = {
  auth:    { presence: 1.00, drift: 1.00, traffic: 1.00 },
  calm:    { presence: 0.52, drift: 0.60, traffic: 0.65 },
  focus:   { presence: 0.60, drift: 0.80, traffic: 0.85 },
  compete: { presence: 0.78, drift: 1.25, traffic: 1.45 },
};

let current: Mood = 'calm';
const listeners = new Set<(p: MoodProfile) => void>();

export function setMood(mood: Mood) {
  if (mood === current) return;
  current = mood;
  const p = PROFILES[mood];
  listeners.forEach(fn => fn(p));
}

export function moodProfile(): MoodProfile { return PROFILES[current]; }

export function subscribeMood(fn: (p: MoodProfile) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
