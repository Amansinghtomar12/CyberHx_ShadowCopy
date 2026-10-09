/**
 * PinakaIntro — the first four seconds of the event, once per device.
 *
 * THE RULE THIS IS BUILT AROUND
 *   It is never a gate. The app renders and works underneath from the first
 *   frame; this is a curtain, not a lock. A visible Skip sits top-right before
 *   anything has moved, Escape closes it, a click on the backdrop closes it
 *   once 800ms have passed (so a stray click that was meant for the page the
 *   intro landed on does not swallow it), and if nobody touches anything it
 *   folds itself away seven seconds after the last beat. Nothing here can
 *   hold a player who wants to get to the board.
 *
 * ONCE
 *   The storage key is written the moment this mounts, not when it finishes:
 *   a crash mid-sequence must never loop a player back into it. `?intro=1`
 *   replays it for reviewers and screenshots.
 *
 * THE SEQUENCE (≤ 4.5 s, authored in the `T` table below)
 *   darkness → a horizon line brightens from the centre → silhouettes of
 *   shikharas, domes and a long wall rise out of it in two depths → a gold
 *   line traces the limbs of a recurve bow and the string snaps taut → the
 *   title lockup → the partner line → the one action, which takes focus.
 *   Reduced motion and the 'still' tier skip straight to the finished frame.
 *
 * Motion is transform, opacity and SVG path length only. The haze is a
 * gradient, never a blur: there is no filter on any full-screen layer.
 */
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { getCapability } from '../../../components/environment/performance';
import { PINAKA_EVENT } from '../config';
import { PINAKA_STORAGE_KEYS } from '../keys';
// Whether to play at all is decided by ../intro-gate (shouldShowIntro), which
// the app can read without downloading this chunk.

/* ── Timeline ────────────────────────────────────────────────────────────── */

/**
 * Seconds from mount. Every delay in the render reads from here, so the whole
 * sequence can be measured in one place: the button lands at 3.9 s and has
 * finished arriving by 4.35 s.
 */
const T = {
  horizon: 0.1,
  glow: 0.3,
  skylineFar: 0.7,
  skylineNear: 0.95,
  limbs: 1.5,
  tips: 2.3,
  grip: 2.45,
  string: 2.55,
  twang: 2.78,
  devanagari: 2.75,
  title: 2.95,
  meta: 3.3,
  tagline: 3.45,
  platform: 3.65,
  enter: 3.9,
} as const;

/** Mount to finished frame (T.enter plus its 450ms arrival). */
const SEQUENCE_MS = 4400;
/** The frame may sit this long before the intro dismisses itself. */
const AUTO_DISMISS_MS = 7000;
/** A backdrop click counts only after this; a Skip or Escape always counts. */
const BACKDROP_ARM_MS = 800;
/** The fade on the way out, matched by the transition in intro.css. */
const LEAVE_MS = 280;

const EASE = [0.22, 1, 0.36, 1] as const;

/** Reduced motion from either source: the OS preference or the player's dial. */
function useStill(): boolean {
  const reduce = useReducedMotion() ?? false;
  return reduce || getCapability().tier === 'still';
}

/* ── Skyline geometry ────────────────────────────────────────────────────── */

type Pt = readonly [number, number];
const fmt = (pts: readonly Pt[]) =>
  pts.map(([x, y]) => `${Math.round(x * 10) / 10},${Math.round(y * 10) / 10}`).join(' ');

/**
 * A tower seen in silhouette: tiers stepping inward from the base, then the
 * amalaka (the ribbed cushion) and the kalasha (the finial) on top, mirrored
 * about its axis. `taper(t)` is the half-width at height fraction t, so a
 * quadratic taper gives the curvilinear nagara shikhara and a linear one the
 * broad stepped gateway of the south. Returned as polygon/polyline points
 * running base → spire → base, so a stroke never draws the bottom edge.
 */
function tower(cx: number, base: number, w: number, h: number, tiers: number, taper: (t: number) => number): string {
  const half = w / 2;
  const body = h * 0.8;
  const left: Pt[] = [[cx - half, base]];
  for (let i = 0; i < tiers; i++) {
    const t0 = i / tiers;
    const t1 = (i + 1) / tiers;
    const hw = half * taper(t0);
    left.push([cx - hw, base - body * t0], [cx - hw, base - body * t1]);
  }
  const top = base - body;
  const cap = half * taper(1);
  left.push(
    [cx - cap * 1.3, top],
    [cx - cap * 1.3, top - h * 0.05],
    [cx - cap * 0.5, top - h * 0.08],
    [cx - cap * 0.2, top - h * 0.13],
    [cx, top - h * 0.2],
  );
  const right = left.slice(0, -1).reverse().map(([x, y]) => [2 * cx - x, y] as Pt);
  return fmt([...left, ...right]);
}
const shikhara = (t: number) => 1 - 0.72 * t * t;
const gopuram = (t: number) => 1 - 0.56 * t;

/** A dome on a short drum, with a finial. Path data, filled. */
function dome(cx: number, base: number, r: number, drum: number): string {
  const crown = base - drum - r;
  return (
    `M${cx - r},${base} V${base - drum} A${r},${r} 0 0 1 ${cx + r},${base - drum} V${base} Z ` +
    `M${cx - 2.5},${crown + 1} L${cx},${crown - 12} L${cx + 2.5},${crown + 1} Z`
  );
}

/** A long wall with merlons along its top. Polyline points, base → top → base. */
function wall(x0: number, x1: number, base: number, top: number, merlon: number, gap: number, rise: number): string {
  const pts: Pt[] = [[x0, base], [x0, top]];
  for (let x = x0 + gap; x + merlon <= x1; x += merlon + gap) {
    pts.push([x, top], [x, top - rise], [x + merlon, top - rise], [x + merlon, top]);
  }
  pts.push([x1, top], [x1, base]);
  return fmt(pts);
}

/* The city, in two depths. Far: the great shikhara rising behind the gateway,
   lesser towers and domes along the ridge. Near: the wall, its gateway and two
   towers that stand just inside it. The viewBox base (y = 220) is the horizon. */
const FAR_TOWERS = [
  tower(150, 220, 54, 104, 5, shikhara),
  tower(400, 220, 68, 136, 6, shikhara),
  tower(600, 220, 100, 200, 7, shikhara),
  tower(810, 220, 68, 130, 6, shikhara),
  tower(1060, 220, 54, 100, 5, shikhara),
];
const FAR_DOMES = [dome(270, 220, 34, 36), dome(500, 220, 26, 32), dome(710, 220, 30, 32), dome(930, 220, 40, 42), dome(1160, 220, 26, 32)];
const NEAR_WALL = wall(0, 1200, 220, 178, 14, 20, 9);
const NEAR_GATE = tower(600, 178, 150, 116, 5, gopuram);
const NEAR_TOWERS = [tower(250, 178, 48, 80, 4, shikhara), tower(950, 178, 48, 80, 4, shikhara)];

/* ── The bow ─────────────────────────────────────────────────────────────── */

/**
 * A recurve bow seen from the archer's side, limbs arcing upward, string
 * below. The limbs trace first, the recurve tips turn, the string draws from
 * the grip to both tips at once and a faint bowed ghost of it flashes for a
 * third of a second: the snap. `pathLength` is motion's stroke-dasharray.
 */
function Bow({ still }: { still: boolean }) {
  const trace = (delay: number, duration: number) => ({
    initial: still ? false : { pathLength: 0 },
    animate: { pathLength: 1 },
    transition: still ? { duration: 0 } : { delay, duration, ease: EASE },
  });
  return (
    <svg className="pk-intro-bow" viewBox="0 0 400 240" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {/* the luminosity: the same arc, wide and faint, under the real one */}
      <motion.path className="pk-intro-bow-haze" d="M52,214 C120,96 280,96 348,214" strokeWidth="7" {...trace(T.limbs, 1.0)} />
      {/* limbs */}
      <motion.path d="M52,214 C120,96 280,96 348,214" strokeWidth="2" {...trace(T.limbs, 1.0)} />
      {/* recurve tips, turning back toward the string */}
      <motion.path d="M52,214 c-8,-9 -9,-21 -2,-30" strokeWidth="1.75" {...trace(T.tips, 0.3)} />
      <motion.path d="M348,214 c8,-9 9,-21 2,-30" strokeWidth="1.75" {...trace(T.tips, 0.3)} />
      {/* the grip: the one thick, solid part of a bow */}
      <motion.path
        d="M190,125.5 h20"
        strokeWidth="5"
        initial={still ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={still ? { duration: 0 } : { delay: T.grip, duration: 0.3 }}
      />
      {/* the string, drawn outward from the centre to both tips */}
      <motion.path d="M200,184 H50" strokeWidth="1.1" {...trace(T.string, 0.22)} />
      <motion.path d="M200,184 H350" strokeWidth="1.1" {...trace(T.string, 0.22)} />
      {/* the snap: a bowed ghost of the string, there and gone */}
      {!still && (
        <motion.path
          d="M50,184 Q200,196 350,184"
          strokeWidth="1"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.55, 0] }}
          transition={{ delay: T.twang, duration: 0.32, times: [0, 0.3, 1], ease: 'easeOut' }}
        />
      )}
    </svg>
  );
}

/* ── The intro ───────────────────────────────────────────────────────────── */

export default function PinakaIntro({ onDone }: { onDone: () => void }) {
  const still = useStill();
  // The frame is "finished" once the button is in: that is when focus moves
  // and the auto-dismiss clock starts. Under reduced motion it is finished
  // on the first render.
  const [ready, setReady] = useState(still);
  const [leaving, setLeaving] = useState(false);
  const closing = useRef(false);
  const mountedAt = useRef(0);
  const enterRef = useRef<HTMLButtonElement>(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const timers = useRef<number[]>([]);

  // Seen, from the first frame. Then the clock: the button at T.enter, the
  // self-dismissal seven seconds after the frame has finished. Mount-only on
  // purpose: `still` is a per-session measurement and `leave` is stable.
  useEffect(() => {
    mountedAt.current = performance.now();
    try { localStorage.setItem(PINAKA_STORAGE_KEYS.introSeen, String(Date.now())); } catch { /* no storage: shouldShowIntro() already said no */ }
    const finish = still ? 0 : SEQUENCE_MS;
    const ids = timers.current;
    if (!still) ids.push(window.setTimeout(() => setReady(true), T.enter * 1000));
    ids.push(window.setTimeout(() => leave(), finish + AUTO_DISMISS_MS));
    return () => { ids.forEach(clearTimeout); ids.length = 0; };
  }, []);

  // Escape, from the first frame.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') leave(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // The one action takes focus the moment it exists.
  useEffect(() => {
    if (ready) enterRef.current?.focus({ preventScroll: true });
  }, [ready]);

  // Guarded: a Skip, an Escape, a timer and a backdrop click may all land in
  // the same second, and the handover happens once.
  function leave() {
    if (closing.current) return;
    closing.current = true;
    setLeaving(true);
    // The app hands focus back to the page once the curtain has gone (the
    // page is inert until then); see the introOpen effect in App.tsx.
    timers.current.push(window.setTimeout(() => onDoneRef.current(), still ? 0 : LEAVE_MS));
  }

  // Tab stays on the curtain: the page behind is inert, so without this the
  // focus would fall off the end into the browser chrome.
  function onKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'Tab') return;
    const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled])'));
    if (!items.length) return;
    const i = items.indexOf(document.activeElement as HTMLElement);
    const next = e.shiftKey ? (i <= 0 ? items.length - 1 : i - 1) : (i < 0 || i === items.length - 1 ? 0 : i + 1);
    e.preventDefault();
    items[next].focus({ preventScroll: true });
  }

  function onBackdrop(e: MouseEvent<HTMLDivElement>) {
    if ((e.target as Element).closest('button')) return;
    if (performance.now() - mountedAt.current < BACKDROP_ARM_MS) return;
    leave();
  }

  // Opacity + a small rise, at a beat on the timeline. Reduced motion renders
  // the resting state outright.
  const beat = (at: number, duration = 0.5, rise = 10) => ({
    initial: still ? false : { opacity: 0, y: rise },
    animate: { opacity: 1, y: 0 },
    transition: still ? { duration: 0 } : { delay: at, duration, ease: EASE },
  });

  return (
    <div
      className={`pk-intro${leaving ? ' is-leaving' : ''}`}
      role="dialog"
      aria-modal="false"
      aria-label="Welcome to Pinaka CTF"
      onClick={onBackdrop}
      onKeyDown={onKeyDown}
    >
      {/* First in the DOM as it is first on the screen: visible from the first
          frame, before anything has moved. */}
      <button type="button" className="btn btn-ghost btn-sm pk-intro-skip" onClick={leave} aria-label="Skip the introduction">
        Skip
      </button>
      {/* ── Scene: sky, horizon, the city rising. Decoration only. ── */}
      <div className="pk-intro-scene" aria-hidden="true">
        <motion.div
          className="pk-intro-glow"
          initial={still ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={still ? { duration: 0 } : { delay: T.glow, duration: 1.4, ease: 'easeOut' }}
        >
          <span className="pk-intro-glow-core" />
        </motion.div>

        <motion.div
          className="pk-intro-layer"
          initial={still ? false : { opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={still ? { duration: 0 } : { delay: T.skylineFar, duration: 1.1, ease: EASE }}
        >
          <svg className="pk-intro-skyline is-far" viewBox="0 0 1200 220" preserveAspectRatio="xMidYMax slice" focusable="false">
            {FAR_TOWERS.map((pts, i) => <polygon key={`t${i}`} points={pts} />)}
            {FAR_DOMES.map((d, i) => <path key={`d${i}`} d={d} />)}
            <rect x="0" y="202" width="1200" height="18" />
          </svg>
        </motion.div>

        <motion.div
          className="pk-intro-layer"
          initial={still ? false : { opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={still ? { duration: 0 } : { delay: T.skylineNear, duration: 1.1, ease: EASE }}
        >
          {/* Polylines, not polygons: the fill closes the shape, the stroke
              does not, so the gold hairline rides the roofline and never the
              ground. Drawn wall first so the gateway and towers sit on it. */}
          <svg className="pk-intro-skyline is-near" viewBox="0 0 1200 220" preserveAspectRatio="xMidYMax slice" focusable="false">
            <polyline points={NEAR_WALL} />
            {NEAR_TOWERS.map((pts, i) => <polyline key={i} points={pts} />)}
            <polyline points={NEAR_GATE} />
          </svg>
        </motion.div>

        <motion.span
          className="pk-intro-horizon"
          initial={still ? false : { scaleX: 0, opacity: 0 }}
          animate={{ scaleX: 1, opacity: 1 }}
          transition={still ? { duration: 0 } : { delay: T.horizon, duration: 1.0, ease: EASE }}
        />
        <div className="pk-intro-ground" />
      </div>

      {/* ── Stage: the bow, the name, the one action. ── */}
      <div className="pk-intro-stage">
        <Bow still={still} />

        <motion.span className="pk-intro-deva" lang="hi" {...beat(T.devanagari, 0.5, 8)}>
          {PINAKA_EVENT.devanagari}
        </motion.span>
        <motion.h1 className="pk-intro-title pk-foil-text" {...beat(T.title, 0.6)}>
          PINAKA
        </motion.h1>
        <motion.span className="pk-eyebrow pk-intro-meta" {...beat(T.meta, 0.4, 6)}>
          CTF 2026
        </motion.span>
        <motion.p className="pk-intro-tagline" {...beat(T.tagline, 0.5, 8)}>
          {PINAKA_EVENT.tagline}
        </motion.p>
        {/* The platform's place in this, said plainly: it scores the event. */}
        <motion.p className="pk-intro-platform" {...beat(T.platform, 0.5, 6)}>
          {PINAKA_EVENT.platformLine}
        </motion.p>

        {ready && (
          <motion.div className="pk-intro-action" {...beat(0, 0.45, 8)}>
            <button ref={enterRef} type="button" className="btn btn-primary btn-lg" onClick={leave}>
              Enter the Arena
            </button>
          </motion.div>
        )}
      </div>

    </div>
  );
}
