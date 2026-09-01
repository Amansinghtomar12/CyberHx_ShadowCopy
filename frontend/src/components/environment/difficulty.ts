/**
 * Difficulty personalities — four tiers that move differently, not four colours.
 *
 * THE RULE THAT SHAPED EVERY NUMBER HERE
 *   Danger is not illegibility. An Insane operation should feel like it is
 *   under load; it must still be as easy to read as an Easy one. So the
 *   escalation is expressed in the *decoration* — the frame, the sheen, the
 *   entrance, the way the card answers the pointer — and never in the text.
 *   Nothing in any tier moves a glyph while a player is reading it. The card
 *   tilts as a whole (a rigid body, the way it already did), and the idle
 *   motion lives entirely on pseudo-element overlays.
 *
 * WHAT ESCALATES, TIER BY TIER
 *   entrance   slower and gentler at Easy, tighter and harder at Insane
 *   idle       Easy is perfectly still; Insane has a live frame
 *   pointer    Easy lags the cursor and settles; Insane answers immediately
 *   frame      a hairline at Easy; a charged, breathing edge at Insane
 *
 * The numeric half lives here because the pointer handler needs it per frame
 * without a `getComputedStyle` call; the visual half lives in index.css keyed
 * off `[data-diff]`, because 100 cards on a board must not each carry their own
 * inline animation.
 */

export type Difficulty = 'Easy' | 'Medium' | 'Hard' | 'Insane';

export interface DifficultyProfile {
  id: Difficulty;
  label: string;
  /** Badge class in index.css. */
  badge: string;
  /** Max tilt about X (deg) when the pointer is at the card's vertical edge. */
  tiltX: number;
  /** Max tilt about Y (deg) at the horizontal edge. */
  tiltY: number;
  /** How fast the card catches up to the pointer, in ms. Lower = more alert. */
  tiltMs: number;
  /** Per-index entrance delay, ms. Tighter tiers arrive as a burst. */
  stagger: number;
  /** Entrance duration, ms. */
  enterMs: number;
  /**
   * How this tier leans on the environment when the player is looking at it.
   * Multiplies the current mood profile; 1.0 is "no opinion".
   */
  atmosphere: { presence: number; drift: number; traffic: number };
}

export const DIFFICULTY_PROFILES: Record<Difficulty, DifficultyProfile> = {
  /**
   * EASY — calm. The card holds perfectly still at rest and settles slowly
   * under the pointer. It should feel like something already solved by someone
   * else, waiting to be picked up.
   */
  Easy: {
    id: 'Easy', label: 'Easy', badge: 'badge-easy',
    tiltX: 2.5, tiltY: 3, tiltMs: 260,
    stagger: 62, enterMs: 460,
    atmosphere: { presence: 0.90, drift: 0.74, traffic: 0.78 },
  },

  /**
   * MEDIUM — active. A slow sheen crosses the frame every 9s so the card is
   * never quite inert, and the pointer response is a touch quicker.
   */
  Medium: {
    id: 'Medium', label: 'Medium', badge: 'badge-medium',
    tiltX: 4, tiltY: 5, tiltMs: 190,
    stagger: 48, enterMs: 400,
    atmosphere: { presence: 1.00, drift: 1.00, traffic: 1.06 },
  },

  /**
   * HARD — intense. The frame carries a travelling charge and the card answers
   * the pointer almost immediately, which reads as alertness rather than
   * speed. Entrance is tighter and arrives with a rotational bias.
   */
  Hard: {
    id: 'Hard', label: 'Hard', badge: 'badge-hard',
    tiltX: 6, tiltY: 7.5, tiltMs: 120,
    stagger: 36, enterMs: 340,
    atmosphere: { presence: 1.12, drift: 1.30, traffic: 1.36 },
  },

  /**
   * INSANE — legendary. The frame is alive: a violet charge running the border,
   * a slow chromatic breath, and a rare 90ms shear on the decorative layer that
   * never touches a glyph. The pointer response is nearly instantaneous. The
   * entrance is a hard, fast arrival rather than a drift-in.
   */
  Insane: {
    id: 'Insane', label: 'Insane', badge: 'badge-insane',
    tiltX: 8, tiltY: 9.5, tiltMs: 90,
    stagger: 26, enterMs: 300,
    atmosphere: { presence: 1.30, drift: 1.58, traffic: 1.72 },
  },
};

/** Every tier, in escalation order. The board and the sidebar both use this. */
export const DIFFICULTY_ORDER: Difficulty[] = ['Easy', 'Medium', 'Hard', 'Insane'];

/**
 * A difficulty string from the database may be anything the CHECK constraint
 * allows, and a future one may be something it does not. Falling back to Medium
 * keeps an unknown tier rendering as an ordinary card instead of an unstyled one.
 */
export function profileFor(difficulty: string): DifficultyProfile {
  return DIFFICULTY_PROFILES[difficulty as Difficulty] ?? DIFFICULTY_PROFILES.Medium;
}
