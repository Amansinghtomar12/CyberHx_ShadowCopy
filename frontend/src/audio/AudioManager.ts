/**
 * AudioManager — the platform's only instrument.
 *
 * WHY IT IS SYNTHESISED RATHER THAN SAMPLED
 *   This frontend ships from a static CDN to ~5,000 players who mostly arrive
 *   in the same ten minutes. A set of six mastered audio files is a few hundred
 *   KB on the critical path and a cache-miss cliff at the worst possible time.
 *   Every sound here is built from oscillators, gain envelopes and one 2-second
 *   noise buffer generated on the client, so the whole sound design costs zero
 *   bytes of network and a few hundred microseconds of CPU per event.
 *
 * WHY IT IS CENTRAL
 *   The brief is explicit: no audio logic scattered through components. A
 *   component says `play('success')`. It does not know about AudioContext
 *   lifecycles, autoplay policy, voice limits or gain staging, and it cannot
 *   accidentally make the platform twice as loud by nesting two effects.
 *
 * ONE INSTRUMENT, NOT SIX EFFECTS
 *   Everything shares a palette: sine and triangle cores for anything the
 *   player earned, filtered square for anything that went wrong, and a single
 *   highpassed noise bed for air. The pitch material is one C-major set
 *   (C5 523.25, E5 659.25, G5 783.99, C6 1046.50) so a milestone lands in the
 *   same key as a solve rather than beside it.
 *
 * AUTOPLAY POLICY
 *   The context is constructed lazily inside the first `play()` — which is
 *   always downstream of a click, a key press or a form submit — and resumed
 *   on every play in case the browser suspended it. A player with sound off
 *   never constructs a context at all, so muting is genuinely free.
 *
 * BATTERY
 *   Hidden tab suspends the context; returning resumes it only if sound is
 *   still enabled. Every voice disconnects itself on `ended`, so nothing
 *   accumulates across a twelve-hour session.
 */
import { soundEnabled, subscribeSoundPref } from './preferences';

type Category = 'ui' | 'event' | 'milestone';

/** Master, then per-category. A click must never be as loud as a solve. */
const MASTER = 0.62;
const CATEGORY_GAIN: Record<Category, number> = { ui: 0.30, event: 1.0, milestone: 0.78 };

/**
 * Concurrency ceiling. Ten cards animating in with sound would be a swarm;
 * priority voices (the things a player earned) are exempt so the moment that
 * matters is never the one that gets dropped.
 */
const MAX_VOICES = 12;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let voices = 0;

/** resume() rejects rather than throws on a closed context; neither must escape. */
function wake(c: AudioContext) {
  try {
    if (c.state === 'suspended') void c.resume()?.catch?.(() => {});
  } catch {
    /* A context the browser has torn down is not worth a thrown solve. */
  }
}

function ensure(): AudioContext | null {
  if (typeof window === 'undefined' || !soundEnabled()) return null;
  if (ctx) {
    wake(ctx);
    return ctx;
  }
  const AC: typeof AudioContext | undefined =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  try {
    ctx = new AC();
  } catch {
    return null;
  }
  master = ctx.createGain();
  master.gain.value = MASTER;
  master.connect(ctx.destination);
  wake(ctx);
  return ctx;
}

/** Two seconds of white noise, generated once and reused by every sound. */
function noise(c: AudioContext): AudioBuffer {
  if (noiseBuf) return noiseBuf;
  const len = Math.floor(c.sampleRate * 2);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  noiseBuf = buf;
  return buf;
}

interface ToneOpts {
  type?: OscillatorType;
  /** Start frequency in Hz. */
  freq: number;
  /** Optional glide target; exponential, because pitch is perceived that way. */
  to?: number;
  /** Delay before this voice starts, in seconds. */
  at?: number;
  /** Peak gain before category and master staging. */
  gain: number;
  /** Attack to peak, seconds. */
  attack?: number;
  /** Decay from peak to silence, seconds. */
  decay: number;
  filter?: { type: BiquadFilterType; freq: number; to?: number; q?: number };
  /** Detune in cents — two voices a few cents apart read as one thicker voice. */
  detune?: number;
  category: Category;
  priority?: boolean;
}

function tone(o: ToneOpts) {
  const c = ensure();
  if (!c || !master) return;
  if (voices >= MAX_VOICES && !o.priority) return;

  const t0 = c.currentTime + (o.at ?? 0);
  const attack = o.attack ?? 0.004;
  const peak = o.gain * CATEGORY_GAIN[o.category];

  const osc = c.createOscillator();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(o.freq, t0);
  if (o.to !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.to), t0 + attack + o.decay);
  if (o.detune) osc.detune.setValueAtTime(o.detune, t0);

  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), t0 + attack);
  // Exponential to near-zero then a hard stop: a linear tail clicks, and a
  // true zero is illegal for an exponential ramp.
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + o.decay);

  let tail: AudioNode = g;
  if (o.filter) {
    const f = c.createBiquadFilter();
    f.type = o.filter.type;
    f.frequency.setValueAtTime(o.filter.freq, t0);
    if (o.filter.to !== undefined) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.filter.to), t0 + attack + o.decay);
    if (o.filter.q !== undefined) f.Q.setValueAtTime(o.filter.q, t0);
    g.connect(f);
    tail = f;
  }
  tail.connect(master);

  osc.connect(g);
  voices++;
  osc.onended = () => { voices--; osc.disconnect(); g.disconnect(); if (tail !== g) tail.disconnect(); };
  osc.start(t0);
  osc.stop(t0 + attack + o.decay + 0.02);
}

interface AirOpts {
  at?: number;
  gain: number;
  decay: number;
  filter: { type: BiquadFilterType; freq: number; to?: number; q?: number };
  category: Category;
  priority?: boolean;
}

/** A filtered noise burst — the transient and the air around a tone. */
function air(o: AirOpts) {
  const c = ensure();
  if (!c || !master) return;
  if (voices >= MAX_VOICES && !o.priority) return;

  const t0 = c.currentTime + (o.at ?? 0);
  const src = c.createBufferSource();
  src.buffer = noise(c);
  src.loop = true;

  const f = c.createBiquadFilter();
  f.type = o.filter.type;
  f.frequency.setValueAtTime(o.filter.freq, t0);
  if (o.filter.to !== undefined) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.filter.to), t0 + o.decay);
  if (o.filter.q !== undefined) f.Q.setValueAtTime(o.filter.q, t0);

  const g = c.createGain();
  const peak = o.gain * CATEGORY_GAIN[o.category];
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), t0 + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.decay);

  src.connect(f); f.connect(g); g.connect(master);
  voices++;
  src.onended = () => { voices--; src.disconnect(); f.disconnect(); g.disconnect(); };
  src.start(t0);
  src.stop(t0 + o.decay + 0.02);
}

/* ── The palette ────────────────────────────────────────────────────────── */

const C5 = 523.25, E5 = 659.25, G5 = 783.99, C6 = 1046.5;

export type SoundName =
  | 'tick'        // any button or card commit
  | 'open'        // an operation opens
  | 'close'       // it closes
  | 'success'     // flag accepted
  | 'legendary'   // flag accepted on an Insane operation
  | 'failure'     // flag rejected
  | 'milestone';  // something worth remembering happened

export interface PlayOpts {
  /**
   * 0..1 multiplier applied on top of the recipe. The failure ladder uses this
   * to fade itself out across repeated wrong answers.
   */
  intensity?: number;
}

function recipe(name: SoundName, k: number) {
  switch (name) {
    /* A dry, near-subliminal transient. Deliberately not a "beep": it should
       register as the surface responding, not as a notification. */
    case 'tick':
      tone({ type: 'triangle', freq: 880, to: 620, gain: 0.05 * k, decay: 0.045, category: 'ui' });
      air({ gain: 0.02 * k, decay: 0.03, filter: { type: 'bandpass', freq: 2600, q: 1.2 }, category: 'ui' });
      return;

    /* Opening an operation: a short rise with air under it — a door, not a
       chime. */
    case 'open':
      tone({ type: 'sine', freq: 320, to: 505, gain: 0.075 * k, attack: 0.012, decay: 0.15, category: 'ui' });
      air({ gain: 0.035 * k, decay: 0.14, filter: { type: 'lowpass', freq: 900, to: 2200, q: 0.7 }, category: 'ui' });
      return;

    /* Closing is the same gesture inverted, at two thirds the level, so the
       pair reads as one mechanism rather than two events. */
    case 'close':
      tone({ type: 'sine', freq: 470, to: 300, gain: 0.055 * k, attack: 0.008, decay: 0.12, category: 'ui' });
      return;

    /* SUCCESS — three layers, which is what "premium" actually means here.
         low    a 110Hz body hit: the weight, felt more than heard
         mid    C5/E5/G5 arriving 0/70/140ms apart so the chord assembles
                rather than lands, with a second detuned voice on the root
         high   a bright noise shimmer sweeping up and away: the air leaving */
    case 'success':
      tone({ type: 'sine', freq: 110, to: 82, gain: 0.30 * k, attack: 0.004, decay: 0.34, category: 'event', priority: true });
      tone({ type: 'sine', freq: C5, gain: 0.20 * k, attack: 0.010, decay: 0.80, category: 'event', priority: true });
      tone({ type: 'sine', freq: C5, detune: 7, gain: 0.10 * k, attack: 0.014, decay: 0.86, category: 'event', priority: true });
      tone({ type: 'sine', freq: E5, at: 0.07, gain: 0.16 * k, attack: 0.010, decay: 0.74, category: 'event', priority: true });
      tone({ type: 'triangle', freq: G5, at: 0.14, gain: 0.13 * k, attack: 0.010, decay: 0.70, category: 'event', priority: true });
      air({ gain: 0.09 * k, decay: 0.55, filter: { type: 'highpass', freq: 3200, to: 7600, q: 0.6 }, category: 'event', priority: true });
      return;

    /* LEGENDARY — the same chord, opened out. An octave on top, a sub an
       octave below the body hit, and a pre-roll swell that arrives *before*
       the strike so the moment has a run-up. Still under 1.6s of tail: a
       player who solves five of these must not learn to dread it. */
    case 'legendary':
      air({ gain: 0.06 * k, decay: 0.30, filter: { type: 'bandpass', freq: 400, to: 3000, q: 0.9 }, category: 'event', priority: true });
      tone({ type: 'sine', freq: 55, at: 0.26, to: 44, gain: 0.34 * k, attack: 0.006, decay: 0.60, category: 'event', priority: true });
      tone({ type: 'sine', freq: 110, at: 0.26, gain: 0.24 * k, attack: 0.004, decay: 0.40, category: 'event', priority: true });
      tone({ type: 'sine', freq: C5, at: 0.26, gain: 0.19 * k, attack: 0.010, decay: 1.00, category: 'event', priority: true });
      tone({ type: 'sine', freq: E5, at: 0.33, gain: 0.15 * k, attack: 0.010, decay: 0.94, category: 'event', priority: true });
      tone({ type: 'triangle', freq: G5, at: 0.40, gain: 0.13 * k, attack: 0.010, decay: 0.90, category: 'event', priority: true });
      tone({ type: 'triangle', freq: C6, at: 0.47, gain: 0.11 * k, attack: 0.012, decay: 0.86, category: 'event', priority: true });
      air({ gain: 0.10 * k, decay: 0.70, filter: { type: 'highpass', freq: 3600, to: 9000, q: 0.6 }, category: 'event', priority: true });
      return;

    /* FAILURE — two short, dull, low blips through a closed filter. It must
       read as "not that" and nothing more. There is no descending minor third,
       no buzzer, nothing that sounds like a judgement. `intensity` is how the
       ladder in ChallengeModal walks this down to almost nothing. */
    case 'failure':
      tone({ type: 'square', freq: 184, gain: 0.085 * k, attack: 0.003, decay: 0.065,
             filter: { type: 'lowpass', freq: 760, q: 0.8 }, category: 'event' });
      if (k > 0.45) {
        tone({ type: 'square', freq: 152, at: 0.085, gain: 0.070 * k, attack: 0.003, decay: 0.070,
               filter: { type: 'lowpass', freq: 700, q: 0.8 }, category: 'event' });
      }
      return;

    /* MILESTONE — a four-note rise in the same key as the solve chord, so an
       achievement sounds like a consequence of the solve rather than a
       separate system congratulating you. */
    case 'milestone':
      tone({ type: 'sine', freq: 440, gain: 0.14 * k, attack: 0.008, decay: 0.42, category: 'milestone', priority: true });
      tone({ type: 'sine', freq: C5, at: 0.09, gain: 0.14 * k, attack: 0.008, decay: 0.44, category: 'milestone', priority: true });
      tone({ type: 'sine', freq: E5, at: 0.18, gain: 0.13 * k, attack: 0.008, decay: 0.48, category: 'milestone', priority: true });
      tone({ type: 'triangle', freq: G5, at: 0.27, gain: 0.12 * k, attack: 0.010, decay: 0.62, category: 'milestone', priority: true });
      air({ gain: 0.05 * k, decay: 0.50, filter: { type: 'highpass', freq: 2800, to: 6400, q: 0.6 }, category: 'milestone', priority: true });
      return;
  }
}

/** Fire a sound. Silent and allocation-free when the player has sound off. */
export function play(name: SoundName, opts: PlayOpts = {}) {
  if (!soundEnabled()) return;
  const k = Math.max(0, Math.min(1, opts.intensity ?? 1));
  if (k === 0) return;
  try {
    recipe(name, k);
  } catch {
    // A dead context must never take a solve down with it.
  }
}

/* ── Lifecycle ──────────────────────────────────────────────────────────── */

/**
 * A sustained sweep for the validation stage of a submission. Returns a stop
 * function; the caller owns it and must call it on every exit path, including
 * the ones where the modal is closed mid-flight.
 */
export function playValidating(): () => void {
  if (!soundEnabled()) return () => {};
  const c = ensure();
  if (!c || !master) return () => {};

  let stopped = false;
  const t0 = c.currentTime;

  const osc = c.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(150, t0);

  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  // Enough resonance to give the sweep a voice, not enough to make stage 1 as
  // loud as the solve it is leading up to. Measured: Q 6 was adding ~20dB and
  // peaking level with the success chord.
  f.Q.setValueAtTime(2.2, t0);
  // The filter, not the pitch, is what climbs — a rising cutoff reads as
  // something being worked out, where a rising pitch reads as an alarm.
  f.frequency.setValueAtTime(260, t0);
  f.frequency.linearRampToValueAtTime(2100, t0 + 1.6);

  const PEAK = 0.030 * CATEGORY_GAIN.event;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(PEAK, t0 + 0.09);

  osc.connect(f); f.connect(g); g.connect(master);
  voices++;
  osc.onended = () => { voices--; osc.disconnect(); f.disconnect(); g.disconnect(); };
  osc.start(t0);

  return () => {
    if (stopped) return;
    stopped = true;
    try {
      // Two things here are deliberate, and both were found by measuring.
      //
      // The release point is clamped to just after t0. currentTime only
      // advances in 128-sample quanta, so a server that answers inside the
      // same quantum as the submit would otherwise have us call
      // cancelScheduledValues() at exactly t0 — which deletes the anchor that
      // sets the gain to silence, leaving the node at its default of 1.0. The
      // measured result was a 60ms burst at full scale on the fastest
      // responses. A ceremony that occasionally screams is worse than none.
      //
      // And the level is the known constant rather than a read of .value, so
      // the release always starts from somewhere sane no matter what the
      // automation timeline has been through.
      const rel = Math.max(c.currentTime, t0 + 0.001);
      g.gain.cancelScheduledValues(rel);
      g.gain.setValueAtTime(PEAK, rel);
      // A 60ms release rather than a hard stop: cutting a sawtooth dead is a
      // click, and a click at the exact moment of a solve is a bug you hear.
      g.gain.exponentialRampToValueAtTime(0.0001, rel + 0.06);
      osc.stop(rel + 0.08);
    } catch {
      try { osc.stop(); } catch { /* already stopped */ }
    }
  };
}

/** Called once from the app root. */
export function initAudioLifecycle(): () => void {
  if (typeof document === 'undefined') return () => {};

  const onVisibility = () => {
    if (!ctx) return;
    if (document.hidden) void ctx.suspend();
    else if (soundEnabled()) void ctx.resume();
  };
  document.addEventListener('visibilitychange', onVisibility);

  // Turning sound off mid-session should go quiet immediately, not after the
  // current tail. Turning it on should not require a page reload.
  const unsub = subscribeSoundPref(on => {
    if (!ctx) return;
    if (on) void ctx.resume();
    else void ctx.suspend();
  });

  return () => {
    document.removeEventListener('visibilitychange', onVisibility);
    unsub();
  };
}
