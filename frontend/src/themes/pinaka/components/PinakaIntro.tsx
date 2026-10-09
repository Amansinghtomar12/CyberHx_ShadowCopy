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
 *   darkness → the event's painting (the temple city at sunset) rises out of
 *   it → the duel, in full colour, comes forward: Rama drawing on the left,
 *   ten-headed Ravana on the right, the open sky between them → a gold line
 *   traces the limbs of a recurve bow in that sky and the string snaps taut
 *   → the title lockup → the platform line → the one action, which takes
 *   focus. Reduced motion and the 'still' tier skip straight to the finished
 *   frame, which is the whole picture at rest.
 *
 * THE ART
 *   Both pictures are the event's own artwork, bundled same-origin and shown
 *   as drawn: no sepia, no grade, no blend. The painting covers the viewport
 *   on its focal point; the duel (a transparent cut-out) stands on the bottom
 *   edge, as tall as the screen allows, centred, its sides cropped on a
 *   portrait phone so the two figures still face each other. The words stand
 *   on a scrim: a radial darkness at the centre and a fall from the top, both
 *   gradients, so the title and the lines under it measure >= 4.5:1 whatever
 *   the art puts behind them. Only the bundled URL strings come from the
 *   manifests: no image data is inlined in this chunk.
 *
 * Motion is transform, opacity and SVG path length only, and none of it
 * loops: once the frame is finished nothing on the curtain moves. There is no
 * filter, mask or blend on any full-screen layer, so each frame is cheap to
 * composite even on a software renderer.
 */
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { getCapability } from '../../../components/environment/performance';
import { PINAKA_EVENT } from '../config';
import { PINAKA_STORAGE_KEYS } from '../keys';
import { PLATES } from '../assets/plates';
import { plateFocal, plateSource } from '../assets/plates/sources';
import { PINAKA_IMAGES } from '../assets/images';
// Whether to play at all is decided by ../intro-gate (shouldShowIntro), which
// the app can read without downloading this chunk.

/* ── Timeline ────────────────────────────────────────────────────────────── */

/**
 * Seconds from mount. Every delay in the render reads from here, so the whole
 * sequence can be measured in one place: the button lands at 3.9 s and has
 * finished arriving by 4.35 s.
 */
const T = {
  plate: 0,
  glow: 0.3,
  duel: 0.45,
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

/* ── The plate ───────────────────────────────────────────────────────────── */

/**
 * The painting behind the duel. Decorative (alt="", aria-hidden), never
 * draggable, decoded off the main thread, fetched eagerly because it is the
 * first thing on screen. The wrapper carries the timeline's fade; the image
 * itself fades up once it has loaded (the attribute, so a cached file that
 * completed before React listened still counts), so a late arrival never
 * pops. Under `still` both happen at once and at rest.
 */
function Plate({ still }: { still: boolean }) {
  const plate = PLATES.hero;
  const source = plateSource(plate);
  const focal = plateFocal(plate);
  const img = useRef<HTMLImageElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = img.current;
    if (el && el.complete && el.naturalWidth > 0) setReady(true);
  }, []);

  return (
    <motion.div
      className="pk-intro-plate"
      data-ready={ready ? 'true' : 'false'}
      initial={still ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={still ? { duration: 0 } : { delay: T.plate, duration: 1.2, ease: 'easeOut' }}
    >
      <img
        ref={img}
        src={source.src}
        srcSet={source.srcSet}
        sizes={source.sizes}
        width={plate.width}
        height={plate.height}
        alt=""
        aria-hidden="true"
        draggable={false}
        decoding="async"
        loading="eager"
        fetchPriority="high"
        style={{ objectPosition: focal }}
        onLoad={() => setReady(true)}
      />
    </motion.div>
  );
}

/* ── The duel ────────────────────────────────────────────────────────────── */

/**
 * Rama and Ravana, the event's key illustration, in full colour. A
 * transparent cut-out standing on the bottom edge; it comes forward once
 * (opacity and a 4% settle in scale, transform-origin on the ground between
 * the two figures) and is still from then on. The low tier is served the
 * 1200 px file only. Everyone else chooses by the width the picture is drawn
 * at (intro.css): the full width of a landscape screen, and on an upright
 * one its height sets the size (46vh × 2400 / 1160, about 95vh), wider than
 * the screen. So a 390 × 844 phone at 2× draws it 803 px wide, 1606 device
 * pixels, and takes the 2400 px file rather than enlarging the 1200.
 */
const DUEL_SIZES = '(max-aspect-ratio: 1/1) 96vh, 100vw';

function Duel({ still }: { still: boolean }) {
  const low = getCapability().tier === 'low';
  return (
    <motion.div
      className="pk-intro-duel"
      initial={still ? false : { opacity: 0, scale: 1.04 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={still ? { duration: 0 } : { delay: T.duel, duration: 1.8, ease: EASE }}
    >
      <img
        src={PINAKA_IMAGES.duel.small}
        srcSet={low ? undefined : `${PINAKA_IMAGES.duel.small} 1200w, ${PINAKA_IMAGES.duel.large} 2400w`}
        sizes={low ? undefined : DUEL_SIZES}
        width={2400}
        height={1160}
        alt=""
        aria-hidden="true"
        draggable={false}
        decoding="async"
        loading="eager"
      />
    </motion.div>
  );
}

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
      data-still={still ? 'true' : undefined}
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
      {/* ── Scene: the painting, the duel, the light. Decoration only. ── */}
      <div className="pk-intro-scene" aria-hidden="true">
        <Plate still={still} />

        <motion.div
          className="pk-intro-glow"
          initial={still ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={still ? { duration: 0 } : { delay: T.glow, duration: 1.4, ease: 'easeOut' }}
        />

        <Duel still={still} />

        {/* the darkness the words stand on: centre and top, never a filter */}
        <span className="pk-intro-scrim" />
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
