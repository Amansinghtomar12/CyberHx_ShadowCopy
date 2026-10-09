/**
 * PodiumFrame — the ornamental frame around a podium card.
 *
 * WHAT IT ADDS
 *   An inset hairline just outside the card, four corner ornaments, and a
 *   cartouche at the top centre carrying the rank as a Devanagari numeral.
 *   The first place gets a laurel flourish in gold and the small bow mark;
 *   the second, simpler brackets in a cooler pale gold; the third, plain
 *   brackets in bronze. Nothing else: no text, no data, no claim the card
 *   itself does not already make.
 *
 * WHAT IT DOES NOT CHANGE
 *   The card. It renders as the child, untouched, inside a relative wrapper;
 *   the frame is absolute and pointer-transparent. The wrapper is the grid
 *   item now, so it carries the podium order the card used to (first in the
 *   middle on sm+) and, for the leader, the small lift; lanka.css hands the
 *   card's own lift back so the frame and the card stay aligned.
 *
 * MOTION
 *   Under reduced motion, nothing. Otherwise the leader's frame carries a
 *   very slow sheen, 8 s, opacity only. Styles in styles/lanka.css.
 */
import type { ReactNode } from 'react';
import { useReducedMotion } from 'motion/react';
import { getCapability } from '../../../components/environment/performance';
import { devanagariNumber } from '../config';
import { BowMark } from './BowMotifs';

interface PodiumFrameProps {
  rank: 1 | 2 | 3;
  children: ReactNode;
}

/** Reduced motion from either source: the OS preference or the player's dial. */
function useStill(): boolean {
  const reduce = useReducedMotion() ?? false;
  return reduce || getCapability().tier === 'still';
}

/* Grid placement the card carried before it was wrapped (see Scoreboard). */
const ORDER: Record<1 | 2 | 3, string> = {
  1: 'sm:order-2 sm:-translate-y-2',
  2: 'sm:order-1',
  3: 'sm:order-3',
};

/**
 * One corner, drawn for the top-left; the stylesheet mirrors it into the
 * other three. 28×28, currentColor, so the rank's ink colours all four.
 */
function Corner({ rank, pos }: { rank: 1 | 2 | 3; pos: 'tl' | 'tr' | 'bl' | 'br' }) {
  return (
    <svg
      className="pk-podium-corner"
      data-pos={pos}
      viewBox="0 0 28 28"
      width="28"
      height="28"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {/* the bracket every rank shares */}
      <path d="M1 13V1h12" />
      {rank === 1 && (
        <>
          {/* a quarter arch inside the bracket, and three leaves off it */}
          <path d="M5 23c0-9.9 8.1-18 18-18" opacity="0.9" />
          <path d="M9.5 15.5c1.4-1.4 3.6-1.6 5-.4-1.4 1.2-3.6 1.4-5 .4Z" fill="currentColor" stroke="none" opacity="0.8" />
          <path d="M15.5 9.5c1.4-1.4 3.6-1.6 5-.4-1.4 1.2-3.6 1.4-5 .4Z" fill="currentColor" stroke="none" opacity="0.8" />
          <path d="M12.2 12.2c.3-1.9 1.7-3.5 3.5-3.9-.3 1.9-1.7 3.5-3.5 3.9Z" fill="currentColor" stroke="none" opacity="0.6" />
          <circle cx="23" cy="23" r="1.1" fill="currentColor" stroke="none" opacity="0.9" />
        </>
      )}
      {rank === 2 && (
        <>
          {/* a second, shorter bracket inside the first */}
          <path d="M6 15V6h9" opacity="0.7" />
          <circle cx="6" cy="6" r="0.9" fill="currentColor" stroke="none" />
        </>
      )}
      {rank === 3 && <path d="M6 10V6h4" opacity="0.6" />}
    </svg>
  );
}

export default function PodiumFrame({ rank, children }: PodiumFrameProps) {
  const still = useStill();
  const safeRank: 1 | 2 | 3 = rank === 1 || rank === 2 || rank === 3 ? rank : 3;

  return (
    <div className={`pk-podium relative ${ORDER[safeRank]}${still ? ' is-still' : ''}`} data-rank={safeRank}>
      {children}

      {/* The frame: outside the card, under nothing, over nothing clickable. */}
      <span className="pk-podium-frame" aria-hidden="true">
        {safeRank === 1 && !still && <span className="pk-podium-sheen" />}
        <Corner rank={safeRank} pos="tl" />
        <Corner rank={safeRank} pos="tr" />
        <Corner rank={safeRank} pos="bl" />
        <Corner rank={safeRank} pos="br" />
      </span>

      {/* The cartouche: the rank in Devanagari, the bow for the leader. The
          card already states the rank in words; this is ornament. */}
      <span className="pk-podium-cartouche" aria-hidden="true">
        {safeRank === 1 && <BowMark className="pk-podium-bow" />}
        <span className="pk-podium-numeral" lang="hi">{devanagariNumber(safeRank)}</span>
      </span>
    </div>
  );
}
