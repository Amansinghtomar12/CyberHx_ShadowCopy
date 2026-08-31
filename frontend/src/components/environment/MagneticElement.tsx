/**
 * MagneticElement — an important control that acknowledges your hand before
 * you reach it.
 *
 * WHAT IT DOES
 *   Inside a radius, the element drifts a few pixels toward the cursor and
 *   eases back when you leave. That is all. The restraint is the point: the
 *   maximum offset is 6px by default, which the eye registers as the object
 *   being *aware* rather than as the object moving.
 *
 * WHY IT IS NOT ON EVERYTHING
 *   Magnetism is a way of saying "this one matters". Applied to every button
 *   it says nothing, and a page where all the furniture creeps toward the
 *   pointer feels like a toy rather than an instrument. Use it on the primary
 *   action of a view and almost nowhere else.
 *
 * PHYSICS
 *   The pull is not linear. It falls off with an eased curve so the element
 *   barely stirs at the edge of the radius and commits as you close in, and
 *   the return uses the same critically-damped chase as everything else driven
 *   by the shared cursor singleton — no springiness, no overshoot, no bounce.
 *
 * COST
 *   No listener of its own: it subscribes to the shared cursor loop, and only
 *   on devices the PerformanceManager says can afford pointer effects. Touch
 *   devices and reduced-motion users render a plain wrapper with zero runtime.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { subscribeCursor } from './cursor';
import { getCapability } from './performance';

interface MagneticElementProps {
  children: ReactNode;
  /** Distance in px at which the pull begins. */
  radius?: number;
  /** Maximum travel in px. Keep this small — 4-8 reads as intent, 20 as a toy. */
  strength?: number;
  className?: string;
}

export default function MagneticElement({
  children,
  radius = 120,
  strength = 6,
  className = '',
}: MagneticElementProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const { pointerFx } = getCapability();
    if (!pointerFx) return;
    const el = ref.current;
    if (!el) return;

    let tx = 0, ty = 0;   // target offset
    let cx = 0, cy = 0;   // current offset
    let raf = 0;

    const settle = () => {
      raf = 0;
      // Chase the target. Runs only while there is distance left to close, so
      // a resting element costs nothing.
      cx += (tx - cx) * 0.18;
      cy += (ty - cy) * 0.18;
      el.style.transform = `translate3d(${cx.toFixed(2)}px, ${cy.toFixed(2)}px, 0)`;
      if (Math.abs(tx - cx) > 0.05 || Math.abs(ty - cy) > 0.05) {
        raf = requestAnimationFrame(settle);
      } else {
        // Land exactly on target so we never leave a sub-pixel residue.
        el.style.transform = `translate3d(${tx.toFixed(2)}px, ${ty.toFixed(2)}px, 0)`;
      }
    };

    const unsubscribe = subscribeCursor(({ x, y, active }) => {
      if (!active) return;
      const r = el.getBoundingClientRect();
      const dx = x - (r.left + r.width / 2);
      const dy = y - (r.top + r.height / 2);
      const dist = Math.hypot(dx, dy);

      if (dist < radius) {
        // Eased falloff: barely stirs at the rim, commits as you approach.
        const pull = Math.pow(1 - dist / radius, 1.6);
        tx = (dx / (dist || 1)) * pull * strength;
        ty = (dy / (dist || 1)) * pull * strength;
      } else {
        tx = 0; ty = 0;
      }
      if (!raf) raf = requestAnimationFrame(settle);
    });

    return () => {
      unsubscribe();
      if (raf) cancelAnimationFrame(raf);
      el.style.transform = '';
    };
  }, [radius, strength]);

  // display:contents would break the transform, so this is a real box — but an
  // inline-block one, so it never changes the layout of what it wraps.
  return (
    <div ref={ref} className={`magnetic ${className}`}>
      {children}
    </div>
  );
}
