/**
 * SurfaceLight — one listener that makes every panel in the product respond
 * to the cursor.
 *
 * WHY IT IS GLOBAL AND NOT A HOOK
 *   The alternative is wiring a hook into forty components and remembering to
 *   do it in the forty-first. This attaches a single passive pointermove to
 *   the document, finds the nearest lightable ancestor of whatever is under
 *   the cursor, and writes four CSS variables onto it. Nothing else in the
 *   codebase has to know this exists — a panel opts in by carrying a class
 *   the CSS already targets.
 *
 * WHAT IT WRITES
 *   --mx / --my   cursor position within the element, as a percentage, which
 *                 the radial-gradient in .holo::before reads directly
 *   --tx / --ty   the same thing re-centred to −1..1, which the tilt reads
 *
 * COST
 *   One listener. Work only happens when the hovered panel changes or the
 *   pointer moves inside one, and the writes are batched into a single rAF so
 *   a fast sweep across a dense grid still produces one style write per frame.
 *   Touch devices are skipped entirely: there is no hover state to serve, and
 *   the tilt would fight the scroll.
 */
import { useEffect } from 'react';
import { getCapability } from './performance';

// data-selflit marks a panel that already drives its own tilt and specular.
// The challenge card is the case that matters: it has a bespoke ±4°/±5° tilt
// on a wrapper with its own perspective. Adopting it here would apply a second
// rotation to the inner element on a different axis, and the two transforms
// visibly fight. Opting out is cheaper and more honest than trying to detect
// the collision.
const LIGHTABLE = [
  '.holo:not([data-selflit])',
  '.card-interactive:not([data-selflit])',
  '.surface-overlay:not([data-selflit])',
].join(', ');

export default function SurfaceLight() {
  useEffect(() => {
    // One authority for "can this device afford pointer effects" — covers
    // touch, reduced motion and weak hardware in a single answer.
    if (!getCapability().pointerFx) return;

    let current: HTMLElement | null = null;
    let pending: { el: HTMLElement; x: number; y: number } | null = null;
    let frame = 0;

    const flush = () => {
      frame = 0;
      if (!pending) return;
      const { el, x, y } = pending;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const px = (x - r.left) / r.width;
      const py = (y - r.top) / r.height;
      el.style.setProperty('--mx', `${(px * 100).toFixed(1)}%`);
      el.style.setProperty('--my', `${(py * 100).toFixed(1)}%`);
      // Re-centred so the tilt is symmetric about the middle of the panel.
      el.style.setProperty('--tx', (px * 2 - 1).toFixed(3));
      el.style.setProperty('--ty', (py * 2 - 1).toFixed(3));
    };

    const clear = (el: HTMLElement) => {
      el.removeAttribute('data-tilt');
      for (const v of ['--mx', '--my', '--tx', '--ty']) el.style.removeProperty(v);
    };

    const onMove = (e: PointerEvent) => {
      const target = e.target as Element | null;
      const el = target?.closest?.(LIGHTABLE) as HTMLElement | null;

      if (el !== current) {
        if (current) clear(current);
        current = el;
        // data-tilt is what arms the transform in CSS, so a panel only ever
        // tilts while it is genuinely the one under the cursor.
        if (current) current.setAttribute('data-tilt', '');
      }
      if (!current) return;

      pending = { el: current, x: e.clientX, y: e.clientY };
      if (!frame) frame = requestAnimationFrame(flush);
    };

    // Leaving the window does not fire pointermove over a new element, so the
    // last panel would otherwise stay lit with the cursor gone.
    const onLeave = () => {
      if (current) clear(current);
      current = null;
      pending = null;
    };

    document.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerleave', onLeave, { passive: true });
    window.addEventListener('blur', onLeave, { passive: true });

    return () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('blur', onLeave);
      if (frame) cancelAnimationFrame(frame);
      if (current) clear(current);
    };
  }, []);

  return null;
}
