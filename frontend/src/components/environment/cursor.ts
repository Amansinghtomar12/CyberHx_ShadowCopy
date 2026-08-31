/**
 * CursorPhysics — one pointer listener for the whole product, with inertia.
 *
 * WHY A SINGLETON
 *   The lattice wants the cursor. So do the magnetic buttons, the surface
 *   lighting, and anything added later. Each attaching its own listener means
 *   N handlers on every pointermove and N slightly different smoothing curves,
 *   which is how an interface starts feeling incoherent — elements that should
 *   be reacting to the same hand appear to be reacting to different ones.
 *
 *   This keeps one listener and one rAF loop. Subscribers read a shared state
 *   that is already smoothed, so everything on screen agrees about where the
 *   cursor is and how fast it is moving.
 *
 * THE PHYSICS
 *   raw     the true pointer position, updated on the event
 *   smooth  chases raw with exponential damping — this is what effects read
 *   vel     smoothed velocity, so effects can respond to *speed*, not just
 *           position. A flick past a card should feel different to a slow
 *           approach, and without velocity it cannot.
 *
 *   Damping is frame-rate independent: 1 - exp(-k·dt) rather than a fixed
 *   lerp factor, so the motion feels identical at 60Hz and 144Hz instead of
 *   twice as fast on a gaming monitor.
 *
 * The loop only runs while something is subscribed and the tab is visible.
 */

export interface CursorState {
  /** Viewport pixels. */
  x: number; y: number;
  /** Normalised −1..1, origin at centre. y is up-positive, matching GL. */
  nx: number; ny: number;
  /** Smoothed velocity in px/s. */
  vx: number; vy: number;
  /** Magnitude of velocity, px/s. Useful for speed-reactive effects. */
  speed: number;
  /** False until the pointer has actually moved: avoids a jump from 0,0. */
  active: boolean;
}

type Listener = (s: CursorState) => void;

const state: CursorState = {
  x: 0, y: 0, nx: 0, ny: 0, vx: 0, vy: 0, speed: 0, active: false,
};

let rawX = 0, rawY = 0;
const listeners = new Set<Listener>();
let raf = 0;
let last = 0;
let wired = false;

const onPointerMove = (e: PointerEvent) => {
  rawX = e.clientX;
  rawY = e.clientY;
  if (!state.active) {
    // First real sample: teleport rather than easing in from the corner.
    state.x = rawX; state.y = rawY;
    state.active = true;
  }
};

const onLeave = () => {
  // Ease back to centre so nothing is left holding a stale offset.
  rawX = window.innerWidth / 2;
  rawY = window.innerHeight / 2;
};

function frame(now: number) {
  raf = requestAnimationFrame(frame);
  const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016);
  last = now;

  const px = state.x, py = state.y;
  // Frame-rate independent damping: identical feel at 60Hz and 144Hz.
  const k = 1 - Math.exp(-9 * dt);
  state.x += (rawX - state.x) * k;
  state.y += (rawY - state.y) * k;

  const w = window.innerWidth || 1;
  const h = window.innerHeight || 1;
  state.nx = (state.x / w) * 2 - 1;
  state.ny = -((state.y / h) * 2 - 1);

  // Velocity is itself smoothed; raw per-frame deltas are far too jittery to
  // drive anything visible.
  const vk = 1 - Math.exp(-6 * dt);
  state.vx += (((state.x - px) / dt) - state.vx) * vk;
  state.vy += (((state.y - py) / dt) - state.vy) * vk;
  state.speed = Math.hypot(state.vx, state.vy);

  listeners.forEach(fn => fn(state));
}

function start() {
  if (wired) return;
  wired = true;
  rawX = window.innerWidth / 2;
  rawY = window.innerHeight / 2;
  state.x = rawX; state.y = rawY;
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  window.addEventListener('pointerleave', onLeave, { passive: true });
  window.addEventListener('blur', onLeave, { passive: true });
  document.addEventListener('visibilitychange', onVisibility);
  last = 0;
  raf = requestAnimationFrame(frame);
}

function stop() {
  if (!wired) return;
  wired = false;
  cancelAnimationFrame(raf);
  raf = 0;
  window.removeEventListener('pointermove', onPointerMove);
  window.removeEventListener('pointerleave', onLeave);
  window.removeEventListener('blur', onLeave);
  document.removeEventListener('visibilitychange', onVisibility);
}

function onVisibility() {
  if (document.hidden) { cancelAnimationFrame(raf); raf = 0; }
  else if (wired && !raf) { last = 0; raf = requestAnimationFrame(frame); }
}

/** Subscribe to smoothed cursor state. Returns an unsubscribe function. */
export function subscribeCursor(fn: Listener): () => void {
  listeners.add(fn);
  if (listeners.size === 1) start();
  return () => {
    listeners.delete(fn);
    // Nothing is watching: stop the loop rather than burn a frame forever.
    if (listeners.size === 0) stop();
  };
}

/** Current smoothed state, for imperative reads. */
export function cursor(): Readonly<CursorState> { return state; }
