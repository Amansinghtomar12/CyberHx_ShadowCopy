/**
 * WorldBanner — the chapter plate above the command header.
 *
 * WHAT IT SAYS
 *   Which chapter of the campaign this screen lives in, the event's name in
 *   the display face, and one sentence that reads the server's event status
 *   back as narrative. On the right, the bowstring timer counts toward the
 *   one instant the server actually holds for this phase: the start while
 *   waiting, the end while live. Paused, ended and inactive get a small mark
 *   instead of a clock, because there is nothing honest to count toward.
 *
 * WHAT IT DOES NOT SAY
 *   Score, solves, progress and the team readout belong to CommandHeader
 *   directly beneath; repeating them here would be two headers. No results,
 *   no winners, no countdown to a date that did not arrive through props.
 *
 * SIZE
 *   One carved panel, ≤ ~132px tall on a desktop, mb-4 so it reads as the
 *   header's title plate rather than a second header. Stacks on a phone.
 *   No stylesheet of its own: Tailwind utilities and the shared pk- ornaments
 *   from core.css carry it.
 */
import { motion, useReducedMotion } from 'motion/react';
import { PINAKA_EVENT, WORLDS, type World } from '../config';
import type { EventPhase, EventStatus } from '../hooks';
import { BowstringCountdown, ChapterNumeral, Eyebrow } from './BowMotifs';

interface WorldBannerProps {
  world: World;
  phase: EventPhase;
  status: EventStatus;
  eventName?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  /** Organiser pause. The clock stops; the copy says so. */
  paused?: boolean;
}

const ORDER: readonly World[] = ['ayodhya', 'vanavasa', 'setu', 'lanka', 'vijaya'];

/** One sentence per state. Narrative voice, but every claim is the server's. */
function phaseLine(status: EventStatus, paused: boolean): string {
  switch (status) {
    case 'waiting': return 'The hall gathers. Challenges unlock when the countdown ends.';
    case 'live':
      return paused
        ? 'Held by the organisers. The clock is stopped; nothing is lost.'
        : 'Submissions are open. Precision is the weapon.';
    case 'ended': return 'The qualifier has closed. Standings are final once the organisers publish them.';
    default: return 'No event is running.';
  }
}

/** The quiet stand-in for the clock when there is nothing to count toward. */
function HeldMark({ label, tone }: { label: string; tone: 'gold' | 'muted' }) {
  return (
    <span
      className="inline-flex items-center gap-2 rounded-pill border border-border-base bg-surface-inset px-3 py-1.5 font-mono text-small uppercase tracking-[0.18em]"
      style={{ color: tone === 'gold' ? 'var(--pk-gold-soft)' : 'var(--color-text-secondary)' }}
    >
      <span
        className="pk-diamond"
        aria-hidden="true"
        style={tone === 'muted' ? { background: 'var(--color-text-muted)', boxShadow: 'none' } : undefined}
      />
      {label}
    </span>
  );
}

export default function WorldBanner({
  world, phase, status, eventName, startTime, endTime, paused = false,
}: WorldBannerProps) {
  const reduce = useReducedMotion();
  const chapter = WORLDS[world] ?? WORLDS.ayodhya;
  const chapterIndex = Math.max(0, ORDER.indexOf(world)) + 1;
  const title = eventName?.trim() || PINAKA_EVENT.name;

  // The clock: only toward an instant the server provided, and only while
  // that instant still means something. Everything else is a mark.
  const counting =
    status === 'waiting' && startTime ? { target: startTime, from: null, label: 'Opens in' }
      : status === 'live' && !paused && endTime ? { target: endTime, from: startTime ?? null, label: 'Remaining' }
        : null;
  const mark =
    paused && status === 'live' ? { label: 'Held', tone: 'gold' as const }
      : status === 'ended' ? { label: 'Closed', tone: 'muted' as const }
        : status === 'inactive' ? { label: 'Offline', tone: 'muted' as const }
          : null;

  return (
    <motion.section
      initial={reduce ? false : { opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.36, ease: [0.22, 1, 0.36, 1] }}
      className="surface pk-carved relative mb-4 overflow-hidden px-5 py-4 sm:px-6"
      aria-label={`Chapter ${chapter.chapter}, ${chapter.title}`}
      data-world={world}
      data-phase={phase}
      data-status={status}
    >
      {/* World tint along the top edge: follows data-world through tokens.css. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-16 opacity-70"
        style={{ background: 'linear-gradient(to bottom, var(--pk-world-tint), transparent)' }}
      />

      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <div className="flex min-w-0 items-center gap-5">
          {/* The chapter, in Devanagari: decorative; the eyebrow carries it in words. */}
          <ChapterNumeral n={chapterIndex} className="hidden shrink-0 text-[1.125rem] md:inline-flex" />

          <div className="min-w-0">
            <Eyebrow>Chapter {chapter.chapter} · {chapter.title}</Eyebrow>
            <p
              className="pk-display mt-1.5 truncate text-[1.375rem] font-semibold leading-tight tracking-[0.02em] text-text-primary sm:text-[1.5rem]"
              title={title}
            >
              {title}
            </p>
            <p className="pk-prose mt-1 text-text-secondary" style={{ fontSize: '0.9375rem', lineHeight: 1.4 }}>
              {phaseLine(status, paused)}
            </p>
          </div>
        </div>

        {/* The right side: the bowstring, or the mark that says why there is none. */}
        {(counting || mark) && (
          <div className="flex shrink-0 items-center justify-end">
            {counting ? (
              <BowstringCountdown
                targetIso={counting.target}
                fromIso={counting.from}
                label={counting.label}
                size={92}
              />
            ) : mark ? (
              <HeldMark label={mark.label} tone={mark.tone} />
            ) : null}
          </div>
        )}
      </div>
    </motion.section>
  );
}
