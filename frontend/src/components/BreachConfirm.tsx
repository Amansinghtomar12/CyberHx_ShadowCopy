/**
 * BreachConfirm — what the system does when you actually get in.
 *
 * Solving a challenge is the emotional peak of a twelve-hour CTF and it was a
 * line of text. This is the acknowledgement: the panel is scanned, the points
 * are counted out, and the moment resolves back into the normal solved state.
 *
 * DESIGN RULES IT FOLLOWS
 *   · No confetti. The system is confirming a breach, not throwing a party.
 *   · It never blocks. The overlay is pointer-transparent except for a click
 *     that dismisses it early, so nobody is held hostage by an animation.
 *   · It ends. 1.7s, then it is gone and the real solved panel is underneath
 *     the whole time — this is a layer over the truth, never a substitute.
 *   · Transform and opacity only. No layout, no paint of anything expensive.
 *
 * REDUCED MOTION
 *   Everything animated collapses to a single fade. The words and the score
 *   still arrive, because they are information, not decoration.
 */
import { useEffect } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { useCountUp } from './AnimatedNumber';

interface BreachConfirmProps {
  points: number;
  onDone: () => void;
}

export default function BreachConfirm({ points, onDone }: BreachConfirmProps) {
  const reduce = useReducedMotion() ?? false;
  // Shared with the scoreboard's figures — one count-up, one easing curve.
  // The explicit 0 origin is what makes this one animate on its only paint.
  const shown = useCountUp(points, 900, 0);

  // Self-dismissing. The caller does not have to manage a timer, and the
  // solved panel underneath is already correct when this disappears.
  useEffect(() => {
    const t = setTimeout(onDone, reduce ? 900 : 1700);
    return () => clearTimeout(t);
  }, [onDone, reduce]);

  const ease = [0.22, 1, 0.36, 1] as const;

  return (
    <motion.div
      className="breach-root"
      onClick={onDone}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.16 }}
      aria-live="polite"
    >
      {/* Rings: three expanding shells, staggered. The energy leaving the
          point of entry. */}
      {!reduce && [0, 0.12, 0.24].map((delay, i) => (
        <motion.span
          key={i}
          className="breach-ring"
          initial={{ scale: 0.2, opacity: 0.55 }}
          animate={{ scale: 2.6, opacity: 0 }}
          transition={{ duration: 1.15, delay, ease }}
        />
      ))}

      {/* A single bar sweeping the panel top to bottom — the scan itself. */}
      {!reduce && (
        <motion.span
          className="breach-scan"
          initial={{ y: '-60%', opacity: 0 }}
          animate={{ y: '160%', opacity: [0, 1, 1, 0] }}
          transition={{ duration: 0.85, ease: 'linear' }}
        />
      )}

      <motion.div
        className="breach-plate"
        initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.94 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.42, delay: reduce ? 0 : 0.1, ease }}
      >
        <span className="breach-label">Breach confirmed</span>
        <span className="breach-score readout">
          +{shown}
          <span className="breach-unit">pts</span>
        </span>
      </motion.div>
    </motion.div>
  );
}
