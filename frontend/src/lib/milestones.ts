/**
 * Milestones — the moments worth naming, derived from data the board already has.
 *
 * NO NEW STATE, NO NEW QUERY, NO NEW TABLE
 *   Every rule below is a pure function of the challenge list and the set of
 *   solved ids. That is not a shortcut, it is the whole design: an achievement
 *   system with its own storage is an achievement system that can disagree with
 *   the scoreboard, and a CTF where the banner and the score tell different
 *   stories is worse than one with no banners.
 *
 * WHY IT CANNOT FIRE ON PAGE LOAD OR ON A POLL
 *   `detectMilestones` is called from exactly one place: the success branch of
 *   a submission made in this session, and only when the server confirms it was
 *   a *fresh* solve. The 120-second solve-data poll never reaches it, and a
 *   player who reloads after clearing a tier does not get congratulated again.
 *   That guard is a call-site rule rather than a flag, because a flag is
 *   something you can forget to check.
 *
 * RESTRAINT
 *   Five rules, not fifteen. The every-fifth-solve rule is the only recurring
 *   one, and it exists so a long grind has punctuation. Everything else can
 *   happen at most once per event. A platform that celebrates everything has
 *   told you nothing.
 */

export type MilestoneTone = 'neon' | 'gold' | 'violet';

export interface Milestone {
  /** Stable within a session; used as the animation key. */
  id: string;
  title: string;
  detail: string;
  tone: MilestoneTone;
}

interface Shape {
  id: string;
  difficulty: string;
  category: string;
}

export interface MilestoneInput {
  /** The operation that was just compromised. */
  solved: Shape;
  /** Every visible operation in the event. */
  all: Shape[];
  /** Solved ids INCLUDING the one just landed. */
  solvedIds: string[];
  /** True when this player drew first blood on it. */
  firstBlood: boolean;
}

export function detectMilestones({ solved, all, solvedIds, firstBlood }: MilestoneInput): Milestone[] {
  const out: Milestone[] = [];
  const done = new Set(solvedIds);
  const count = solvedIds.length;

  // ── Firsts ───────────────────────────────────────────────
  if (count === 1) {
    out.push({
      id: 'first-breach',
      title: 'First breach',
      detail: 'You are on the board.',
      tone: 'neon',
    });
  }

  if (firstBlood) {
    out.push({
      id: `first-blood-${solved.id}`,
      title: 'First blood',
      detail: 'Nobody had cracked this one before you.',
      tone: 'gold',
    });
  }

  if (solved.difficulty === 'Insane') {
    const insaneDone = all.filter(c => c.difficulty === 'Insane' && done.has(c.id)).length;
    if (insaneDone === 1) {
      out.push({
        id: 'first-insane',
        title: 'Insane operation compromised',
        detail: 'Most of the field will not get this far.',
        tone: 'violet',
      });
    }
  }

  // ── Sweeps ───────────────────────────────────────────────
  const tier = all.filter(c => c.difficulty === solved.difficulty);
  if (tier.length > 1 && tier.every(c => done.has(c.id))) {
    out.push({
      id: `tier-${solved.difficulty}`,
      title: `${solved.difficulty} tier cleared`,
      detail: `All ${tier.length} ${solved.difficulty.toLowerCase()} operations compromised.`,
      tone: solved.difficulty === 'Insane' ? 'violet' : 'gold',
    });
  }

  const cat = all.filter(c => c.category === solved.category);
  if (cat.length > 1 && cat.every(c => done.has(c.id))) {
    out.push({
      id: `category-${solved.category}`,
      title: `${solved.category} cleared`,
      detail: `All ${cat.length} ${solved.category} operations compromised.`,
      tone: 'gold',
    });
  }

  if (all.length > 0 && count === all.length) {
    out.push({
      id: 'full-compromise',
      title: 'Full compromise',
      detail: 'Every operation on the board is yours.',
      tone: 'violet',
    });
  }

  // ── Punctuation ──────────────────────────────────────────
  // Only when nothing better happened. A fifth solve that also cleared a tier
  // does not need two banners, and the tier is the better story.
  if (out.length === 0 && count >= 5 && count % 5 === 0) {
    out.push({
      id: `count-${count}`,
      title: `${count} operations compromised`,
      detail: 'The field is moving. Keep going.',
      tone: 'neon',
    });
  }

  return out;
}
