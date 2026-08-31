/**
 * CursorRing — the weight behind the reticle.
 *
 * The reticle itself is a real CSS cursor drawn by the compositor, so it is
 * always exactly under the pointer with zero lag. This ring is the opposite on
 * purpose: it chases, with damping, and opens up over anything interactive.
 * The gap between the two is what makes the pointer feel like an object with
 * mass rather than a picture stuck to the mouse.
 *
 * COST
 *   No listener of its own — it reads the shared cursor singleton, which is
 *   already running a single rAF loop for the lattice. Position is written
 *   straight to style.transform, never through React state, so this never
 *   re-renders the tree while you move the mouse.
 *
 *   The hot test runs on pointerover rather than every frame. Hit-testing the
 *   DOM 60 times a second to ask "am I over a button" is a lot of work to
 *   answer a question that only changes when you cross an element boundary.
 */
import { useEffect, useRef } from 'react';
import { subscribeCursor } from './cursor';
import { getCapability } from './performance';

const INTERACTIVE =
  'a, button, [role="button"], summary, label[for], select, .btn, .card-interactive, .tab, .chip';

export default function CursorRing() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Touch devices and reduced-motion users get nothing at all.
    if (!getCapability().pointerFx) return;
    const el = ref.current;
    if (!el) return;

    const unsubscribe = subscribeCursor(({ x, y, active }) => {
      if (!active) return;
      el.dataset.active = '1';
      // Rounded to whole pixels: sub-pixel positions on a 1px border produce
      // shimmer as the compositor resamples it.
      el.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
    });

    const onOver = (e: PointerEvent) => {
      const hot = (e.target as Element | null)?.closest?.(INTERACTIVE);
      el.dataset.hot = hot ? '1' : '0';
    };
    // Leaving the window has to clear both states, or the ring is left frozen
    // mid-screen with the cursor long gone.
    const onLeave = () => { el.dataset.active = '0'; el.dataset.hot = '0'; };

    document.addEventListener('pointerover', onOver, { passive: true });
    document.addEventListener('pointerleave', onLeave, { passive: true });
    window.addEventListener('blur', onLeave, { passive: true });

    return () => {
      unsubscribe();
      document.removeEventListener('pointerover', onOver);
      document.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('blur', onLeave);
    };
  }, []);

  return <div ref={ref} className="cursor-ring" aria-hidden="true" data-active="0" data-hot="0" />;
}
