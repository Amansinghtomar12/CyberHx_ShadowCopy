/**
 * AnimatedNumber — a figure that moves to its new value instead of replacing it.
 *
 * WHY IT MATTERS ON A SCOREBOARD
 *   A number that swaps from 1,200 to 1,500 tells you the value changed but
 *   not that it *rose*. Counting the distance makes the direction and the size
 *   of the change legible without any extra chrome, which is most of what a
 *   leaderboard is for.
 *
 * BEHAVIOUR
 *   · First paint never animates. Landing on the scoreboard and watching forty
 *     rows count up from zero is a slot machine, not information.
 *   · Only subsequent changes animate, from the previous value to the new one.
 *   · Reduced motion sets the value directly.
 *
 * COST
 *   One rAF per element while it is moving, and nothing at all at rest. The
 *   loop stops on arrival rather than idling.
 */
import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';

/**
 * Counts from the previous value to `target`.
 *
 * Static on first paint by default, because a scoreboard that counts every row
 * up from zero on arrival is a slot machine. Pass `from` when the first paint
 * *is* the event -- the breach confirmation counts from 0 precisely once, and
 * that run is the whole point of it.
 */
export function useCountUp(target: number, ms = 700, from?: number) {
  const reduce = useReducedMotion() ?? false;
  const [display, setDisplay] = useState(target);
  const origin = useRef(target);
  const first = useRef(true);
  const raf = useRef(0);

  useEffect(() => {
    // Mount is not a change -- unless the caller gave an explicit origin, in
    // which case the first run is the animation they asked for.
    if (first.current) {
      first.current = false;
      if (from === undefined || reduce) {
        origin.current = target;
        setDisplay(target);
        return;
      }
      origin.current = from;
      setDisplay(from);
    }
    if (reduce || origin.current === target) {
      origin.current = target;
      setDisplay(target);
      return;
    }

    const start = origin.current;
    const delta = target - start;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / ms);
      // easeOutQuint — quick departure, long settle, so the figure reads as
      // locking on rather than sliding to a stop.
      setDisplay(Math.round(start + delta * (1 - Math.pow(1 - p, 5))));
      if (p < 1) raf.current = requestAnimationFrame(tick);
      else origin.current = target;
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target, ms, reduce, from]);

  return display;
}

interface AnimatedNumberProps {
  value: number;
  /** Thousands separators. Off for small counters like solve counts. */
  format?: boolean;
  ms?: number;
  className?: string;
}

export default function AnimatedNumber({
  value, format = true, ms = 700, className = '',
}: AnimatedNumberProps) {
  const n = useCountUp(value, ms);
  return (
    // aria-live is deliberately absent: a table of these would narrate every
    // tick. The surrounding row already announces the change once.
    <span className={className}>{format ? n.toLocaleString() : n}</span>
  );
}
