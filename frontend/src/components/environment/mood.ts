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

/* ── Composition ────────────────────────────────────────────────────────
 *
 * The room you are in is only one of three things the environment knows. The
 * other two arrived with the operations work:
 *
 *   difficulty  what you are looking at *right now* — a filtered tier, or the
 *               operation you have open. An Insane operation should make the
 *               world lean in; an Easy one should let it settle back.
 *   progress    how far through the event you are. This is the slow one. It
 *               does not react to anything you do in the moment; it is the
 *               accumulated fact that the field is more yours than it was.
 *
 * They compose multiplicatively onto the room's base profile, so a busy room
 * during a hard operation late in the event is the busiest the field ever gets,
 * and none of the three has to know about the other two. The lattice still
 * eases toward whatever comes out over ~1.2s, so a change of any input is a
 * drift rather than a cut.
 */

/** Per-difficulty lean. Kept in sync with DIFFICULTY_PROFILES.atmosphere. */
const DIFFICULTY_LEAN: Record<string, MoodProfile> = {
  Easy:   { presence: 0.90, drift: 0.74, traffic: 0.78 },
  Medium: { presence: 1.00, drift: 1.00, traffic: 1.06 },
  Hard:   { presence: 1.12, drift: 1.30, traffic: 1.36 },
  Insane: { presence: 1.30, drift: 1.58, traffic: 1.72 },
};

const NEUTRAL: MoodProfile = { presence: 1, drift: 1, traffic: 1 };

let current: Mood = 'calm';
let focus: string | null = null;
let progress = 0;                 // 0..1, share of the board solved
const listeners = new Set<(p: MoodProfile) => void>();

function composed(): MoodProfile {
  const base = PROFILES[current];
  const lean = (focus && DIFFICULTY_LEAN[focus]) || NEUTRAL;
  // Progress is capped low on purpose. A player who has solved everything
  // should notice the world is warmer, not find it shouting.
  const p = Math.max(0, Math.min(1, progress));
  return {
    presence: base.presence * lean.presence * (1 + 0.22 * p),
    drift:    base.drift    * lean.drift    * (1 + 0.12 * p),
    traffic:  base.traffic  * lean.traffic  * (1 + 0.36 * p),
  };
}

function emit() {
  const p = composed();
  listeners.forEach(fn => fn(p));
}

export function setMood(mood: Mood) {
  if (mood === current) return;
  current = mood;
  emit();
}

/**
 * The difficulty currently under the player's attention, or null for none.
 * Called when the board filter changes and when an operation is opened or
 * closed. Idempotent — a repeat of the same value costs nothing.
 */
export function setDifficultyFocus(difficulty: string | null) {
  const next = difficulty && DIFFICULTY_LEAN[difficulty] ? difficulty : null;
  if (next === focus) return;
  focus = next;
  emit();
}

/**
 * Share of the board this player has solved, 0..1. Progression made visible:
 * the field is measurably brighter and busier at the end of an event than at
 * the start, for no per-frame cost — the lattice was already easing toward
 * these three numbers.
 */
export function setProgress(ratio: number) {
  const next = Math.max(0, Math.min(1, Number.isFinite(ratio) ? ratio : 0));
  // Quantised so a solve-count poll cannot emit a new profile on every tick.
  const q = Math.round(next * 20) / 20;
  if (q === progress) return;
  progress = q;
  emit();
}

export function moodProfile(): MoodProfile { return composed(); }

export function subscribeMood(fn: (p: MoodProfile) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
