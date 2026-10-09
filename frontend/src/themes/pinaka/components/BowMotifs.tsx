/**
 * BowMotifs — the signature of the Pinaka theme, used sparingly.
 *
 * The divine bow is the one image the theme is allowed to lean on, so it
 * appears only where a shape was already needed: a loader, a progress fill,
 * a timer, the moment a flag lands. Nothing here is a figure, a face or a
 * scene; it is a bow, a string and light on carved stone.
 *
 * Everything in this file is presentation. Props in, pixels out: no fetch,
 * no store, no clock the server does not already own (the countdown counts
 * toward an ISO string the platform hands it). Decoration is aria-hidden;
 * the two things that carry information (the loader, the progress bar, the
 * timer) carry roles and labels.
 *
 * MOTION
 *   Transform, opacity and SVG stroke-dashoffset only. CSS keyframes live in
 *   styles/motifs.css and switch off under prefers-reduced-motion; the
 *   components also read useReducedMotion / the 'still' tier and render the
 *   finished state outright, so a static page is never a half-drawn bow.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { getCapability } from '../../../components/environment/performance';
import { devanagariNumber } from '../config';

/** Reduced motion from either source: the OS preference or the player's dial. */
function useStill(): boolean {
  const reduce = useReducedMotion() ?? false;
  return reduce || getCapability().tier === 'still';
}

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

/* ── BowMark ─────────────────────────────────────────────────────────────── */

/**
 * The bow glyph: a drawn recurve seen side-on, string pulled to the nock,
 * arrow pointing right. 24×24, 1.5 stroke, currentColor — a badge or nav
 * icon that sits next to Lucide without looking borrowed from it.
 */
export function BowMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {/* limbs, bulging toward the target */}
      <path d="M11 3.5c5 4.5 5 12.5 0 17" />
      {/* recurve tips */}
      <path d="M11 3.5c.4-.9 1.2-1.4 2-1.5M11 20.5c.4.9 1.2 1.4 2 1.5" />
      {/* the string, drawn to the nock */}
      <path d="M11 3.5 6.5 12 11 20.5" />
      {/* arrow: shaft, head, fletching */}
      <path d="M6.5 12h14" />
      <path d="m17.5 9.5 3 2.5-3 2.5" />
      <path d="m6.5 12-1.8-1.6M6.5 12l-1.8 1.6" />
    </svg>
  );
}

/* ── BowLoader ───────────────────────────────────────────────────────────── */

/**
 * A bow that draws itself: the arc first, then the string across, a breath,
 * and again. `pathLength="100"` on every stroke lets the CSS dash animation
 * stay in percentages whatever the real geometry measures.
 */
export function BowLoader({ size = 48, label = 'Loading' }: { size?: number; label?: string }) {
  const still = useStill();
  return (
    <span
      role="status"
      aria-live="polite"
      className={`pk-loader${still ? ' is-still' : ''}`}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 48 48" width={size} height={size} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
        {/* the luminosity: the same arc, wide and faint, under the real one */}
        <path className="pk-loader-haze" d="M17 6C34 14 34 34 17 42" strokeWidth="4.5" pathLength="100" />
        {/* limbs */}
        <path className="pk-loader-arc" d="M17 6C34 14 34 34 17 42" strokeWidth="1.75" pathLength="100" />
        {/* recurve tips */}
        <path className="pk-loader-tip" d="M17 6c.5-1.4 1.6-2.2 3-2.4M17 42c.5 1.4 1.6 2.2 3 2.4" strokeWidth="1.5" pathLength="100" />
        {/* the string, at rest */}
        <path className="pk-loader-string" d="M17 6v36" strokeWidth="1.1" pathLength="100" opacity="0.9" />
        {/* the grip: the one thick, solid part of a bow */}
        <path className="pk-loader-grip" d="M29.75 21.5v5" strokeWidth="3" />
      </svg>
      <span className="sr-only">{label}</span>
    </span>
  );
}

/* ── BowProgress ─────────────────────────────────────────────────────────── */

/**
 * A slim golden track; the fill is a drawn string and an arrowhead rides at
 * its end. Both move by transform only: the fill scales from the left, the
 * head sits at the left edge of a full-width carrier that translates by the
 * same fraction. `tone="muted"` for secondary meters that must not compete.
 */
export function BowProgress({ value, label, tone = 'gold' }: { value: number; label: string; tone?: 'gold' | 'muted' }) {
  const v = clamp01(value);
  const pct = Math.round(v * 100);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className="pk-progress"
      data-tone={tone}
    >
      <span className="pk-progress-fill" style={{ transform: `scaleX(${v})` }} aria-hidden="true" />
      <span className="pk-progress-head" style={{ transform: `translate3d(${v * 100}%, 0, 0)` }} aria-hidden="true">
        <svg viewBox="0 0 12 12" fill="currentColor" aria-hidden="true" focusable="false">
          {/* a small arrowhead, point to the right, nock cut at the back */}
          <path d="M1 1.5 11 6 1 10.5 3.6 6Z" />
        </svg>
      </span>
    </div>
  );
}

/* ── BowstringCountdown ──────────────────────────────────────────────────── */

interface BowstringCountdownProps {
  /** The instant counted toward. `null` or unparsable renders nothing. */
  targetIso: string | null | undefined;
  /** The instant the full arc stands for. Without it the arc spans 24 h. */
  fromIso?: string | null;
  /** Shown under the digits and used in the accessible name, e.g. "Remaining". */
  label?: string;
  /** Under this much remaining the arc and digits turn live-red. */
  urgentUnderMs?: number;
  /** Outer diameter in px. */
  size?: number;
  /** Fired once when the count reaches zero. */
  onExpire?: () => void;
}

const DAY_MS = 86_400_000;
const pad = (n: number) => String(n).padStart(2, '0');

/** Split a duration the way EventClock prints it: `1d 23:59:59`. */
function parts(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return {
    d: Math.floor(s / 86400),
    h: Math.floor((s % 86400) / 3600),
    m: Math.floor((s % 3600) / 60),
    s: s % 60,
  };
}

/**
 * An arc timer in the language of a drawn bowstring: a full ring is the whole
 * span, the arc shortens as the time runs out and a nock rides at its head.
 * The arc is stroke-dashoffset on a `pathLength="100"` circle, so each tick
 * is a paint of one stroke and never a layout. The accessible name changes
 * once a minute: a screen reader announcing every second is not a timer, it
 * is a metronome.
 */
export function BowstringCountdown({
  targetIso,
  fromIso,
  label,
  urgentUnderMs = 3_600_000,
  size = 112,
  onExpire,
}: BowstringCountdownProps) {
  const still = useStill();
  const targetMs = targetIso ? Date.parse(targetIso) : NaN;
  const fromMs = fromIso ? Date.parse(fromIso) : NaN;
  const valid = Number.isFinite(targetMs);

  const [now, setNow] = useState(() => Date.now());

  // Own 1 s interval. It stops while the tab is hidden and resyncs the moment
  // it is visible again, so a background tab costs nothing and never drifts.
  useEffect(() => {
    if (!valid) return;
    let id: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (id !== null) return;
      setNow(Date.now());
      id = setInterval(() => setNow(Date.now()), 1000);
    };
    const stop = () => {
      if (id !== null) clearInterval(id);
      id = null;
    };
    const onVisibility = () => (document.hidden ? stop() : start());
    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [valid]);

  const left = valid ? Math.max(0, targetMs - now) : 0;
  const span = Number.isFinite(fromMs) && targetMs > fromMs ? targetMs - fromMs : DAY_MS;
  const fraction = clamp01(left / span);
  const urgent = valid && left > 0 && left < urgentUnderMs;

  // onExpire fires once per target. The callback lives in a ref so a parent
  // re-rendering with a new closure cannot re-arm it.
  const expireRef = useRef(onExpire);
  useEffect(() => { expireRef.current = onExpire; }, [onExpire]);
  const firedRef = useRef(false);
  useEffect(() => { firedRef.current = false; }, [targetMs]);
  useEffect(() => {
    if (!valid || left > 0 || firedRef.current) return;
    firedRef.current = true;
    expireRef.current?.();
  }, [valid, left]);

  const { d, h, m, s } = parts(left);
  const minutesLeft = Math.floor(left / 60_000);
  const ariaLabel = useMemo(() => {
    const p = parts(minutesLeft * 60_000);
    const text = `${p.d > 0 ? `${p.d}d ` : ''}${pad(p.h)}:${pad(p.m)}`;
    return label ? `${label}: ${text}` : text;
  }, [label, minutesLeft]);

  if (!valid) return null;

  // Nock angle: the arc starts at twelve and runs clockwise for `fraction`
  // of the ring; the head is wherever it stops. Monotonic, so no wrap.
  const nockDeg = fraction * 360;
  const timeSize = Math.max(11, size * 0.15);

  return (
    <div
      role="timer"
      aria-label={ariaLabel}
      className={`pk-countdown${still ? ' is-still' : ''}`}
      data-urgent={urgent ? 'true' : undefined}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 120 120" fill="none" aria-hidden="true" focusable="false">
        <circle className="pk-countdown-track" cx="60" cy="60" r="54" strokeWidth="2" />
        {/* quarter ticks, the carved marks on the ring */}
        <path className="pk-countdown-ticks" d="M60 2v5M118 60h-5M60 118v-5M2 60h5" strokeWidth="1" />
        <circle
          className="pk-countdown-arc"
          cx="60"
          cy="60"
          r="54"
          strokeWidth="2.5"
          strokeLinecap="round"
          pathLength="100"
          transform="rotate(-90 60 60)"
          style={{ strokeDashoffset: 100 - fraction * 100 }}
        />
        <g className="pk-countdown-nock" style={{ transform: `rotate(${nockDeg}deg)` }}>
          <path d="M60 2.5 63 6l-3 3.5L57 6Z" />
        </g>
      </svg>
      <div className="pk-countdown-face" aria-hidden="true">
        {d > 0 && <span className="pk-countdown-days" style={{ fontSize: Math.max(12, size * 0.11) }}>{d}d</span>}
        <span className="pk-countdown-time" style={{ fontSize: timeSize }}>
          {pad(h)}:{pad(m)}:{pad(s)}
        </span>
        {label && <span className="pk-countdown-label" style={{ fontSize: Math.max(11, size * 0.1) }}>{label}</span>}
      </div>
    </div>
  );
}

/* ── ArrowSolveLight ─────────────────────────────────────────────────────── */

/**
 * The acknowledgement when a flag lands: a line of light traces the panel
 * once, a soft pulse leaves the centre, and the points stand on a hairline.
 * Then it is over — 1.7 s, 2.1 s for a legendary operation — and the panel
 * underneath, which was correct the whole time, is all that is left.
 *
 * Pointer-transparent, no scrim: the player can keep reading and clicking
 * through it. Mount it inside the modal panel (position: relative,
 * overflow hidden) under AnimatePresence; it fades on exit. z-index 5 keeps
 * it under BreachConfirm (20) if both are mounted.
 *
 * REDUCED MOTION — no trace, no pulse; the points fade in and out.
 */
export function ArrowSolveLight({ points, legendary = false }: { points: number; legendary?: boolean }) {
  const still = useStill();
  const total = legendary ? 2.1 : 1.7;
  // The plate arrives once the trace has passed the first edge and leaves
  // with the sequence, so the overlay is visually empty if left mounted.
  const plateDelay = still ? 0 : (legendary ? 0.5 : 0.45);
  const plateDuration = still ? 1.1 : total - plateDelay;
  const ease = [0.22, 1, 0.36, 1] as const;

  return (
    <motion.div
      className={`pk-solve-light pointer-events-none absolute inset-0 z-[5] overflow-hidden rounded-[inherit]${legendary ? ' is-legendary' : ''}`}
      aria-hidden="true"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      {!still && (
        <>
          <svg className="pk-solve-trace" aria-hidden="true" focusable="false">
            {/* The rim sits on the panel edge; the outer half of each stroke is
                clipped by overflow, leaving a hairline just inside the border.
                rx tracks the panel radius (rounded-panel, 18px) closely enough
                that nothing visibly cuts a corner. */}
            <rect className="pk-solve-trace-rim" x="0" y="0" width="100%" height="100%" rx="17" vectorEffect="non-scaling-stroke" />
            <rect className="pk-solve-trace-line" x="0" y="0" width="100%" height="100%" rx="17" pathLength="100" vectorEffect="non-scaling-stroke" />
            {legendary && (
              <rect className="pk-solve-trace-line is-second" x="0" y="0" width="100%" height="100%" rx="17" pathLength="100" vectorEffect="non-scaling-stroke" />
            )}
          </svg>
          <span className={`pk-solve-pulse${legendary ? ' is-bright' : ''}`} />
        </>
      )}

      <motion.div
        className="pk-solve-plate"
        initial={still ? { opacity: 0 } : { opacity: 0, scale: 0.92, y: 6 }}
        animate={still
          ? { opacity: [0, 1, 1, 0] }
          : { opacity: [0, 1, 1, 0], scale: [0.92, 1, 1, 1], y: [6, 0, 0, -4] }}
        transition={{
          duration: plateDuration,
          delay: plateDelay,
          ease,
          times: [0, 0.22, 0.78, 1],
        }}
      >
        <span className="pk-solve-points">+{Math.max(0, Math.round(points))}</span>
        <span className="pk-rule" />
      </motion.div>
    </motion.div>
  );
}

/* ── Ornaments ───────────────────────────────────────────────────────────── */

/** A hairline in the foil gradient. `.pk-rule` from core.css. */
export function GoldRule({ className }: { className?: string }) {
  return <div aria-hidden="true" className={`pk-rule${className ? ` ${className}` : ''}`} />;
}

/** Micro-caps label flanked by two fading hairlines. `.pk-eyebrow` from core.css. */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={`pk-eyebrow${className ? ` ${className}` : ''}`}>{children}</span>;
}

/**
 * The engraved inner frame of a ceremonial plate: an inset hairline with a
 * gold bracket in each corner, drawn around whatever it wraps. The frame is
 * absolute and pointer-transparent, so it never changes the layout of its
 * children or gets in the way of anything inside.
 */
export function CornerFrame({ children, className, inset = 10 }: { children: ReactNode; className?: string; inset?: number }) {
  const frameStyle = { '--pk-frame-inset': `${inset}px` } as CSSProperties;
  return (
    <div className={`relative${className ? ` ${className}` : ''}`}>
      {children}
      <span className="pk-frame" style={frameStyle} aria-hidden="true">
        <span className="pk-frame-corner" data-pos="tl" />
        <span className="pk-frame-corner" data-pos="tr" />
        <span className="pk-frame-corner" data-pos="bl" />
        <span className="pk-frame-corner" data-pos="br" />
      </span>
    </div>
  );
}

/**
 * A chapter number: the Devanagari digits from config.ts in the display
 * face, the latin numeral small beneath so nobody has to read the script.
 * Decorative — the chapter title next to it carries the information.
 */
export function ChapterNumeral({ n, className }: { n: number; className?: string }) {
  const safe = Math.max(0, Math.floor(n));
  return (
    <span aria-hidden="true" className={`pk-numeral${className ? ` ${className}` : ''}`}>
      <span className="pk-numeral-deva">{devanagariNumber(safe)}</span>
      <span className="pk-numeral-latin">{safe}</span>
    </span>
  );
}
