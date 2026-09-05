/**
 * CommandHeader — what a player needs to know before they read a single card.
 *
 * WHAT IT REPLACED
 *   Three separate status banners and a generic title block that said
 *   "Challenge Terminal / Modules remain encrypted until a valid access key is
 *   provided". Decorative copy in the most valuable space on the page, while
 *   the numbers a competitor actually cares about -- their score, how far
 *   through they are, how long is left -- lived on other views entirely.
 *
 * WHAT IT SHOWS, AND WHY THAT SET
 *   Time remaining is the single most decision-shaping number in a CTF: it is
 *   what tells you whether to keep digging or move on. It is also free, which
 *   is why it leads.
 *
 *   Score and progress are derived on the client from data the board already
 *   holds, using the same formula the database uses --
 *   GREATEST(points - hint_spend, 0) -- so the figure here cannot drift from
 *   the scoreboard's.
 *
 *   Rank is deliberately absent. It is the one number here that cannot be
 *   derived from what we already have, and fetching it per player per poll is
 *   ~17 extra queries a second at 5000 users against an aggregate view. Worth
 *   adding only after measuring it, not on instinct.
 *
 * STATES
 *   Every state the old banners covered is preserved: waiting (with the start
 *   time), live (with a countdown), ended, and inactive. Admins keep seeing
 *   the board during waiting and ended, exactly as before.
 */
import { useEffect, useState } from 'react';
import { Clock, Flag, Radio, Target, Users, Zap } from 'lucide-react';
import AnimatedNumber from './AnimatedNumber';

type EventStatus = 'waiting' | 'live' | 'ended' | 'inactive';

interface CommandHeaderProps {
  status: EventStatus;
  eventName?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  score: number;
  solved: number;
  total: number;
  /** Solves this player submitted personally, out of `solved`. */
  mine: number;
  hasTeam: boolean;
  /** Organiser pause. Players never see this header while paused; admins do. */
  paused?: boolean;
}

/** Splits a duration into padded h/m/s. Returns null once it has run out. */
function useCountdown(iso?: string | null) {
  const [left, setLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!iso) { setLeft(null); return; }
    const target = new Date(iso).getTime();
    if (Number.isNaN(target)) { setLeft(null); return; }

    const tick = () => setLeft(Math.max(0, target - Date.now()));
    tick();
    // One second is the coarsest interval that still looks like a clock. The
    // work per tick is a subtraction and a string format.
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [iso]);

  if (left === null) return null;
  const s = Math.floor(left / 1000);
  return {
    expired: left === 0,
    h: String(Math.floor(s / 3600)).padStart(2, '0'),
    m: String(Math.floor((s % 3600) / 60)).padStart(2, '0'),
    s: String(s % 60).padStart(2, '0'),
    // Under an hour is when pacing decisions change, so the clock says so.
    urgent: left > 0 && left < 3600_000,
  };
}

function Readout({
  icon: Icon, label, children, tone,
}: {
  icon: typeof Zap; label: string; children: React.ReactNode; tone?: string;
}) {
  return (
    <div className="min-w-0">
      <div className="label-micro flex items-center gap-1.5 text-text-muted">
        <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
        <span className="truncate">{label}</span>
      </div>
      <div
        className="readout mt-1.5 text-h2 leading-none truncate"
        style={{ color: tone ?? 'var(--color-text-primary)' }}
      >
        {children}
      </div>
    </div>
  );
}

export default function CommandHeader({
  status, eventName, startTime, endTime,
  score, solved, total, mine, hasTeam, paused = false,
}: CommandHeaderProps) {
  const countdown = useCountdown(status === 'live' && !paused ? endTime : null);
  const pct = total > 0 ? Math.round((solved / total) * 100) : 0;

  const statusTone =
    paused ? 'var(--color-diff-medium)'
      : status === 'live' ? 'var(--color-neon)'
      : status === 'waiting' ? 'var(--color-diff-medium)'
      : status === 'ended' ? 'var(--color-diff-hard)'
      : 'var(--color-text-muted)';

  return (
    <header className="holo surface relative mb-8 overflow-hidden p-5 sm:p-6 lg:mb-10">
      {/* Status edge — the fastest read on the page, before any text. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-0 w-[2px]"
        style={{ backgroundColor: statusTone }}
      />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            {paused && <span className="badge badge-medium">Paused</span>}
            {status === 'live' && !paused && <span className="badge badge-live">Live</span>}
            {status === 'waiting' && <span className="badge badge-locked">Standby</span>}
            {status === 'ended' && <span className="badge badge-hard">Closed</span>}
            {status === 'inactive' && <span className="badge badge-locked">Offline</span>}
            <h2 className="text-h2 text-cyber-text truncate">
              {eventName || 'CyberHX CTF'}
            </h2>
          </div>

          <p className="mt-2 text-small text-text-muted">
            {status === 'waiting' && startTime && (
              <>Opens <span className="readout text-cyber-text">{new Date(startTime).toLocaleString()}</span></>
            )}
            {status === 'waiting' && !startTime && 'Start time not set.'}
            {status === 'live' && paused && 'Paused by control. The clock is stopped; players are holding.'}
            {status === 'live' && !paused && 'Submissions open. Good hunting.'}
            {status === 'ended' && 'Submissions are closed.'}
            {status === 'inactive' && 'No event is currently running.'}
          </p>
        </div>

        {/* The clock. Largest element here because it is the number that
            changes how a competitor spends the next hour. */}
        {countdown && !countdown.expired && (
          <div className="text-right">
            <div className="label-micro flex items-center justify-end gap-1.5 text-text-muted">
              <Clock className="h-3 w-3" aria-hidden="true" />
              Remaining
            </div>
            <div
              className="readout mt-1 text-h1 leading-none tabular-nums"
              style={{ color: countdown.urgent ? 'var(--color-status-live)' : 'var(--color-cyber-neon)' }}
              // Announced only on the hour-ish rather than every second, which
              // a screen reader would otherwise read aloud continuously.
              aria-label={`${countdown.h} hours ${countdown.m} minutes remaining`}
            >
              {countdown.h}<span className="text-text-muted">:</span>
              {countdown.m}<span className="text-text-muted">:</span>
              {countdown.s}
            </div>
          </div>
        )}
      </div>

      {/* Readouts. Four numbers, no chrome, all derived from data the board
          already had. */}
      <div className="mt-6 grid grid-cols-2 gap-5 border-t border-border-subtle pt-5 sm:grid-cols-4">
        <Readout icon={Zap} label={hasTeam ? 'Team score' : 'Your score'} tone="var(--color-cyber-neon)">
          <AnimatedNumber value={score} />
        </Readout>

        <Readout icon={Target} label="Solved">
          <AnimatedNumber value={solved} format={false} />
          <span className="text-text-muted text-h3"> / {total}</span>
        </Readout>

        <Readout icon={Flag} label="Progress">
          {pct}<span className="text-text-muted text-h3">%</span>
        </Readout>

        <Readout icon={hasTeam ? Users : Radio} label={hasTeam ? 'Your solves' : 'Team'}>
          {hasTeam
            ? <><AnimatedNumber value={mine} format={false} /><span className="text-text-muted text-h3"> / {solved}</span></>
            : <span className="text-h3 text-diff-medium">None</span>}
        </Readout>
      </div>

      {/* Progress rail. Transform-only, so it costs nothing to animate. */}
      <div className="mt-4 h-1 w-full overflow-hidden rounded-pill bg-surface-inset" aria-hidden="true">
        <div
          className="h-full origin-left rounded-pill transition-transform duration-[var(--duration-slow)] ease-[var(--ease-out-quint)]"
          style={{
            backgroundColor: 'var(--color-cyber-neon)',
            transform: `scaleX(${Math.max(0, Math.min(1, total > 0 ? solved / total : 0))})`,
          }}
        />
      </div>
    </header>
  );
}
