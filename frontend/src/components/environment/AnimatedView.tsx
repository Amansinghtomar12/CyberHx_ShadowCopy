/**
 * AnimatedView — moving between rooms without leaving the building.
 *
 * THE IDEA
 *   The environment behind the UI is mounted once, above this component, and
 *   never unmounts. So a view change is not a page load: the world holds still
 *   while the interface in front of it recedes, and the next one comes forward
 *   out of the same space. That continuity is the entire effect. If the
 *   background flickered or reset here, the illusion would be gone and this
 *   would just be a fade.
 *
 * WHY NO BLUR
 *   The brief allows a blur transition and I deliberately did not use one.
 *   filter: blur() on a full page subtree forces a repaint of everything
 *   inside it, every frame, and this platform has to stay smooth on a mid
 *   range phone with 200 challenge cards on screen. Scale and opacity are
 *   compositor-only: the GPU moves a texture it already has. At 150ms the
 *   difference is invisible to the eye and very visible in a frame profile.
 *
 * WHY IT IS FAST
 *   150ms out, 260ms in. A CTF player changes view constantly for twelve
 *   hours; a transition they have to wait for becomes the thing they hate
 *   about the platform by hour three. This is meant to be felt at the edge of
 *   perception, not watched.
 *
 * LAYOUT
 *   The wrapper is itself a flex container because the challenge board renders
 *   an <aside> and a <main> as siblings that must stay side by side, and every
 *   other view roots at flex-1 expecting to be a flex item. Wrapping them in a
 *   plain block would collapse both cases.
 */
import { useEffect, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { triggerWarp } from './mood';

interface AnimatedViewProps {
  /** Changing this key is what triggers the transition. */
  viewKey: string;
  children: ReactNode;
}

export default function AnimatedView({ viewKey, children }: AnimatedViewProps) {
  const reduce = useReducedMotion() ?? false;

  // Arriving at a new view halfway down the previous one's scroll position is
  // disorienting, and no amount of motion design fixes it.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
    // The environment jumps with you. The lattice decides whether it can
    // afford to answer; under reduced motion nobody asks.
    if (!reduce) triggerWarp(1);
  }, [viewKey, reduce]);

  return (
    <motion.div
      key={viewKey}
      className="flex flex-1 w-full min-w-0"
      // The outgoing view falls back into the environment; the incoming one
      // rises out of it. Both directions are small on purpose — this reads as
      // depth, not as a slide.
      style={{ transformPerspective: 1400, transformOrigin: '50% 40%' }}
      // A degree of pitch on the way in, so the view arrives out of the
      // corridor the stars just streaked down rather than fading on a flat.
      initial={reduce ? false : { opacity: 0, scale: 0.99, y: -6, rotateX: 0.7 }}
      animate={{ opacity: 1, scale: 1, y: 0, rotateX: 0 }}
      // Leaving is quicker than arriving, and eases *in* rather than out, so
      // the old view drops away and the new one is already coming forward
      // before the eye has finished tracking the first.
      exit={reduce
        ? { opacity: 0, transition: { duration: 0.001 } }
        : { opacity: 0, scale: 0.985, y: 8, rotateX: -0.5,
            transition: { duration: 0.15, ease: [0.4, 0, 1, 1] } }}
      transition={{ duration: reduce ? 0.001 : 0.3, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
