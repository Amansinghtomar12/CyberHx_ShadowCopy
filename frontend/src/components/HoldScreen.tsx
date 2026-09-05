/**
 * HoldScreen — the platform holding, on purpose or not.
 *
 * Two reasons bring it up and the player is told which:
 *
 *   paused   an organiser stopped the clock. Submissions are sealed, the
 *            board is empty, standings hold. Resume restores everything and
 *            the time spent here is added back to the event.
 *   uplink   the backend stopped answering. The client keeps knocking every
 *            eight seconds and this clears itself on the first answer.
 *
 * Either way it must never read as an error. It reads as a system in a
 * known state, saying so in the platform's own voice, with the environment
 * still alive behind it. There is nothing to click because there is nothing
 * the player can do; the screen leaves when the reason does.
 */
import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { PauseCircle, RadioTower } from 'lucide-react';

interface HoldScreenProps {
  reason: 'paused' | 'uplink';
  /** Organiser's note, shown as a line from control. */
  message?: string | null;
  /** When the hold began. */
  since?: string | number | null;
  /** Probe count while the uplink is down. */
  attempts?: number;
}

const LINES: Record<HoldScreenProps['reason'], string[]> = {
  paused: [
    'SIGSTOP received from control',
    'submission channel sealed',
    'standings held at the moment of pause',
    'mission clock stopped — no time is lost',
    'awaiting SIGCONT from control',
  ],
  uplink: [
    'uplink to control lost',
    'retrying handshake every 8 s',
    'nothing was submitted while offline',
    'holding position',
  ],
};

const pad = (n: number) => String(n).padStart(2, '0');

function useElapsed(since?: string | number | null) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  if (!since) return null;
  const t = typeof since === 'number' ? since : new Date(since).getTime();
  if (Number.isNaN(t)) return null;
  const s = Math.max(0, Math.floor((now - t) / 1000));
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

export default function HoldScreen({ reason, message, since, attempts = 0 }: HoldScreenProps) {
  const reduce = useReducedMotion() ?? false;
  const lines = LINES[reason];
  const [shown, setShown] = useState(reduce ? lines.length : 0);
  const elapsed = useElapsed(since);

  // The log types itself out once, then holds. Nothing loops.
  useEffect(() => {
    if (reduce) return;
    setShown(0);
    const id = setInterval(() => setShown(n => {
      if (n >= lines.length) { clearInterval(id); return n; }
      return n + 1;
    }), 380);
    return () => clearInterval(id);
  }, [reason, lines.length, reduce]);

  const Icon = reason === 'paused' ? PauseCircle : RadioTower;
  const title = reason === 'paused' ? 'Operations suspended' : 'Uplink lost';
  const sub = reason === 'paused'
    ? 'The organisers have paused the CTF. Everything resumes exactly where it stopped.'
    : 'Control is not answering. The platform is holding until it does.';

  return (
    <section
      role="status"
      aria-live="polite"
      aria-label={title}
      className="hold flex-1 w-full min-w-0 flex items-center justify-center px-4 py-12 sm:py-20"
    >
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 14, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className="hold-panel surface-overlay relative w-full max-w-2xl overflow-hidden p-6 sm:p-10"
      >
        <span aria-hidden="true" className="hold-scan" />
        <div className="flex flex-wrap items-center gap-3">
          <span className="badge badge-medium inline-flex items-center gap-1.5">
            <span className="hold-dot" aria-hidden="true" />
            {reason === 'paused' ? 'Paused by control' : 'Reconnecting'}
          </span>
          {elapsed && (
            <span className="label-micro font-mono tabular-nums">
              {reason === 'paused' ? 'On hold' : 'Down'} {elapsed}
            </span>
          )}
          {reason === 'uplink' && attempts > 0 && (
            <span className="label-micro font-mono tabular-nums">attempt {attempts}</span>
          )}
        </div>

        <div className="mt-6 flex items-start gap-4">
          <span
            aria-hidden="true"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-inset border border-border-neon bg-neon-wash text-cyber-neon shadow-neon"
          >
            <Icon className="h-6 w-6" />
          </span>
          <div className="min-w-0">
            <p className="label-micro text-cyber-neon">// hold</p>
            <h2 className="hold-title readout mt-1 text-display text-cyber-text">{title}</h2>
            <p className="mt-3 text-body text-text-secondary max-w-prose">{sub}</p>
          </div>
        </div>

        <ol className="hold-log mt-7 space-y-1.5 font-mono text-small" aria-label="System log">
          {lines.slice(0, shown).map((l, i) => (
            <li key={l} className="hold-line" style={{ animationDelay: reduce ? '0ms' : `${i * 40}ms` }}>
              <span className="text-cyber-neon">&gt;</span> {l}
              {i === lines.length - 1 && <span className="hold-caret" aria-hidden="true" />}
            </li>
          ))}
          {message && shown >= lines.length && (
            <li className="hold-line hold-line--control">
              <span className="text-cyber-neon">&gt;</span> control: <span className="text-cyber-text">{message}</span>
            </li>
          )}
        </ol>

        <p className="mt-7 border-t border-border-subtle pt-4 text-small text-text-muted">
          {reason === 'paused'
            ? 'Your session, your team and your solves are intact. This screen clears itself when control resumes.'
            : 'Your session is intact and nothing is lost. This screen clears itself the moment control answers.'}
        </p>
      </motion.div>
    </section>
  );
}
