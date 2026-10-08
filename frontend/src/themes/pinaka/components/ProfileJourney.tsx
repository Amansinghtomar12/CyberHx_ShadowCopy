/**
 * ProfileJourney — the player's solves, read as a journey.
 *
 * WHAT IT SHOWS
 *   The same solves the profile already lists, in the order they happened,
 *   as arrow marks along one hairline: the arrowhead in the category's hue,
 *   the challenge title, the points, the time. The twelve most recent, so
 *   the strip stays a strip; the table beneath holds the full record.
 *
 * WHAT IT DOES NOT SHOW
 *   Anything the data does not say. No badges, no streaks, no rank, no
 *   "milestones". A player with no solves gets a sentence, not a trophy case.
 *
 * SIZE AND MOTION
 *   One surface. The strip scrolls sideways inside its own container on a
 *   narrow screen; the page never does. The marks step in on first paint by
 *   opacity and a few pixels of transform; under reduced motion they are
 *   simply there. No stylesheet of its own: utilities and the shared pk-
 *   ornaments carry it.
 */
import { useId, useMemo } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Eyebrow } from './BowMotifs';

interface JourneySolve {
  title: string;
  category: string;
  /** ISO timestamp of the solve. */
  at: string;
  points: number;
}

interface ProfileJourneyProps {
  solves: JourneySolve[];
}

const SHOWN = 12;

/** Category id → the platform's hue token, with misc as the fallback for an id
    the stylesheet does not know. The id is sanitised so a stray value from
    the database can never break out of the var() expression. */
function categoryHue(category: string): string {
  const safe = String(category ?? '').toLowerCase().replace(/[^a-z0-9-]/g, '');
  return safe ? `var(--color-cat-${safe}, var(--color-cat-misc))` : 'var(--color-cat-misc)';
}

function formatAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** A small arrowhead, point to the right, nock cut at the back. */
function ArrowMark({ hue }: { hue: string }) {
  return (
    <span
      className="relative z-[1] inline-flex h-5 w-5 items-center justify-center rounded-full border border-border-base bg-surface-overlay"
      style={{ color: hue }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 12 12" width="10" height="10" fill="currentColor" aria-hidden="true" focusable="false">
        <path d="M1 1.5 11 6 1 10.5 3.6 6Z" />
      </svg>
    </span>
  );
}

export default function ProfileJourney({ solves }: ProfileJourneyProps) {
  const reduce = useReducedMotion();
  const headingId = useId();

  // Oldest first, then the most recent twelve of those: the strip ends at
  // the latest flag, which is where a returning player's eye lands.
  const shown = useMemo(() => {
    const sorted = [...(solves ?? [])]
      .filter(s => s && typeof s.at === 'string')
      .sort((a, b) => {
        const ta = Date.parse(a.at);
        const tb = Date.parse(b.at);
        return (Number.isFinite(ta) ? ta : 0) - (Number.isFinite(tb) ? tb : 0);
      });
    return sorted.slice(-SHOWN);
  }, [solves]);
  const total = solves?.length ?? 0;

  return (
    <section className="surface p-5" aria-labelledby={headingId}>
      <Eyebrow>The journey</Eyebrow>
      <h2 id={headingId} className="mt-2 text-h3 text-cyber-text">Solves in order</h2>

      {shown.length === 0 ? (
        <p className="pk-prose mt-3 text-text-secondary">
          No solves yet. The first flag you capture begins the journey.
        </p>
      ) : (
        <>
          <div className="custom-scrollbar mt-5 -mx-1 overflow-x-auto px-1 pb-2">
            <ol className="relative flex min-w-max items-start gap-6 pt-1" aria-label="Solves, oldest first">
              {/* the road: one hairline under every mark */}
              <span
                className="pk-rule pointer-events-none absolute inset-x-0 top-[0.875rem]"
                aria-hidden="true"
              />
              {shown.map((s, i) => (
                <motion.li
                  key={`${s.at}-${s.title}-${i}`}
                  className="flex w-40 shrink-0 flex-col items-start"
                  initial={reduce ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.32, delay: reduce ? 0 : 0.04 * i, ease: [0.22, 1, 0.36, 1] }}
                >
                  <ArrowMark hue={categoryHue(s.category)} />
                  <span className="mt-2.5 w-full truncate text-small font-semibold text-text-primary" title={s.title}>
                    {s.title}
                  </span>
                  <span className="mt-0.5 flex w-full items-baseline justify-between gap-2">
                    <span className="font-mono text-small tabular-nums text-cyber-neon">
                      +{Math.max(0, Math.round(Number(s.points) || 0))}
                    </span>
                    <span className="label-micro truncate normal-case tracking-normal" style={{ color: categoryHue(s.category) }}>
                      {s.category}
                    </span>
                  </span>
                  <time dateTime={s.at} className="mt-0.5 font-mono text-small tabular-nums text-text-muted">
                    {formatAt(s.at)}
                  </time>
                </motion.li>
              ))}
            </ol>
          </div>
          {total > shown.length && (
            <p className="mt-2 text-small text-text-muted">
              The {shown.length} most recent of {total}. The full record is in the table below.
            </p>
          )}
        </>
      )}
    </section>
  );
}
