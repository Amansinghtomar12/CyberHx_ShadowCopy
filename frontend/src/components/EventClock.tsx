/**
 * EventClock — the one number that changes how a competitor spends the next
 * hour, kept in the header so it is on every view, not only the board.
 *
 *   waiting  T-minus to the opening
 *   live     time remaining, red under an hour
 *   paused   "HOLD" with the time on hold, because a frozen countdown that
 *            still reads as a countdown is a lie
 *   ended    "CLOSED"
 */
import { useEffect, useState } from 'react';
import { Clock, PauseCircle } from 'lucide-react';

interface EventClockProps {
  status: 'waiting' | 'live' | 'ended' | 'inactive';
  startTime?: string | null;
  endTime?: string | null;
  paused?: boolean;
  pausedAt?: string | null;
}

const pad = (n: number) => String(n).padStart(2, '0');
const fmt = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  return `${d > 0 ? `${d}d ` : ''}${pad(h)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
};

export default function EventClock({ status, startTime, endTime, paused, pausedAt }: EventClockProps) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (status === 'inactive') return null;

  if (paused) {
    const held = pausedAt ? now - new Date(pausedAt).getTime() : 0;
    return (
      <span className="event-clock" data-tone="paused" title="The event is paused; the clock is stopped">
        <PauseCircle className="h-3.5 w-3.5" aria-hidden="true" />
        HOLD {pausedAt ? fmt(held) : ''}
      </span>
    );
  }
  if (status === 'ended') {
    return (
      <span className="event-clock" title="The event has ended">
        <Clock className="h-3.5 w-3.5" aria-hidden="true" /> CLOSED
      </span>
    );
  }
  const target = status === 'waiting' ? startTime : endTime;
  if (!target) return null;
  const left = new Date(target).getTime() - now;
  if (Number.isNaN(left)) return null;
  const urgent = status === 'live' && left < 3600_000;
  return (
    <span
      className="event-clock"
      data-tone={status === 'live' ? (urgent ? 'urgent' : 'live') : undefined}
      title={status === 'waiting' ? 'Time until the event opens' : 'Time remaining'}
      aria-label={`${status === 'waiting' ? 'Opens in' : 'Remaining'} ${fmt(left)}`}
    >
      <Clock className="h-3.5 w-3.5" aria-hidden="true" />
      {status === 'waiting' ? 'T−' : ''}{fmt(left)}
    </span>
  );
}
