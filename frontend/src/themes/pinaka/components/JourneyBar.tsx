/**
 * JourneyBar — the six chapters on one rail.
 *
 * Ayodhya → Mithila → Vanvaas → Kishkindha → Setu Bandhan → Lanka, with the
 * step the team stands in lit, the ones behind it marked complete and the
 * ones ahead dimmed. Every state is carried by text as well as by colour: a
 * completed step says so, the current one is aria-current, a locked one is
 * named as locked. The rail is not navigation — the board below is — so
 * nothing here is a link or a button.
 *
 * Presentation only: it renders the journey it is handed and reads nothing.
 */
import { useLayoutEffect, useRef } from 'react';
import { useReducedMotion } from 'motion/react';
import { Check, Lock } from 'lucide-react';
import { CHAPTER_LIST } from '../chapters/config';
import { devanagariNumber } from '../config';
import type { Journey } from '../chapters/progress';

const STATE_WORD = {
  completed: 'completed',
  current: 'current chapter',
  locked: 'locked',
} as const;

export default function JourneyBar({ journey }: { journey: Journey }) {
  const current = CHAPTER_LIST[Math.min(journey.currentIndex, CHAPTER_LIST.length) - 1];
  const rail = useRef<HTMLOListElement>(null);
  const here = useRef<HTMLLIElement>(null);
  const reduce = useReducedMotion() ?? false;

  // On a narrow rail the six steps are wider than the box, and the step that
  // matters is the one the team stands in -- so it is brought into the middle
  // rather than left clipped at the right edge. Only the rail scrolls; the
  // page does not move, which is why this is not scrollIntoView().
  useLayoutEffect(() => {
    const box = rail.current;
    const step = here.current;
    if (!box || !step || box.scrollWidth <= box.clientWidth) return;
    const target = step.offsetLeft - (box.clientWidth - step.offsetWidth) / 2;
    const left = Math.max(0, Math.min(target, box.scrollWidth - box.clientWidth));
    box.scrollTo({ left, behavior: reduce ? 'auto' : 'smooth' });
  }, [journey.currentIndex, reduce]);

  return (
    <div className="pk-journeybar-host">
      <ol className="pk-journeybar" aria-label="Journey progress" ref={rail}>
        {CHAPTER_LIST.map((chapter, i) => {
          const state = journey.chapters[i]?.state ?? 'locked';
          return (
            <li
              key={chapter.id}
              ref={state === 'current' ? here : undefined}
              className="pk-journeybar-step"
              data-state={state}
              aria-current={state === 'current' ? 'step' : undefined}
            >
              <span className="pk-journeybar-mark">
                {state === 'completed'
                  ? <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  : state === 'locked'
                    ? <Lock className="h-3 w-3" aria-hidden="true" />
                    : <span lang="hi" aria-hidden="true">{devanagariNumber(chapter.index)}</span>}
              </span>
              <span className="pk-journeybar-name">{chapter.title}</span>
              <span className="sr-only">
                {`Chapter ${chapter.index}, ${chapter.title}, ${chapter.subtitle}: ${STATE_WORD[state]}.`}
              </span>
            </li>
          );
        })}
      </ol>
      {current && <p className="pk-journeybar-sub">{current.subtitle}</p>}
    </div>
  );
}
