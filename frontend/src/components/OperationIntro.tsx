/**
 * OperationIntro — the 900ms an Insane operation gets to introduce itself.
 *
 * WHAT IT IS NOT
 *   It is not a gate. It is pointer-transparent from the first frame, the
 *   description is already rendered and readable underneath it, and the flag
 *   field is already focusable. A player who opens an Insane operation and
 *   immediately pastes a flag they solved offline is not slowed down by a
 *   single millisecond. That is the whole reason it is an overlay and not a
 *   sequence.
 *
 * WHAT IT DOES
 *   A violet charge crosses the panel, the tier is named once, and it is gone.
 *   The point is that opening an Insane operation should not feel identical to
 *   opening an Easy one — the difficulty should announce itself before you
 *   have read a word of the brief.
 *
 * Only Insane gets this. If every tier had an intro, no tier would.
 */
import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';

interface OperationIntroProps {
  /** Changing this re-runs the intro; keep it to the operation id. */
  operationId: string;
}

export default function OperationIntro({ operationId }: OperationIntroProps) {
  const reduce = useReducedMotion() ?? false;
  const [live, setLive] = useState(true);

  useEffect(() => {
    setLive(true);
    // 780ms, not 900: measured end-to-end (mount to gone) the observed life
    // was ~1.1s once paint and unmount were counted, and the brief asks for
    // under a second.
    const t = setTimeout(() => setLive(false), 780);
    return () => clearTimeout(t);
  }, [operationId]);

  // Reduced motion gets nothing here: the badge already says "Insane", which
  // is the information. This layer is entirely atmosphere.
  if (reduce || !live) return null;

  return (
    <div className="op-intro" aria-hidden="true">
      <motion.span
        className="op-intro-sweep"
        initial={{ x: '-110%' }}
        animate={{ x: '110%' }}
        transition={{ duration: 0.62, ease: [0.22, 1, 0.36, 1] }}
      />
      <motion.span
        className="op-intro-label"
        initial={{ opacity: 0, letterSpacing: '0.55em' }}
        animate={{ opacity: [0, 1, 1, 0], letterSpacing: '0.28em' }}
        transition={{ duration: 0.78, ease: [0.22, 1, 0.36, 1], opacity: { times: [0, 0.2, 0.62, 1], duration: 0.78 } }}
      >
        Insane operation
      </motion.span>
      <motion.span
        className="op-intro-rule"
        initial={{ scaleX: 0, opacity: 0 }}
        animate={{ scaleX: 1, opacity: [0, 1, 0] }}
        transition={{ duration: 0.78, ease: [0.22, 1, 0.36, 1] }}
      />
    </div>
  );
}
