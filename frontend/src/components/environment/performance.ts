/**
 * PerformanceManager — the single place that decides how much this device can
 * afford, so no two effects ever disagree about it.
 *
 * Before this existed, AmbientBackground and SurfaceLight each ran their own
 * capability checks with slightly different rules. That is how you end up with
 * a phone running the full WebGL lattice while the cursor lighting has already
 * decided the same phone is a touch device — two subsystems, two opinions, one
 * machine.
 *
 * The tier is computed once and cached. Device memory, core count and pointer
 * type do not change mid-session, and re-measuring them per component is both
 * wasteful and a source of drift.
 *
 * TIERS
 *   high    full lattice, DPR 2, cursor lighting, magnetic elements
 *   medium  lattice at reduced density and DPR 1.5, no magnetism
 *   low     CSS environment only, no WebGL
 *   still   reduced-motion: static environment, no ambient animation at all
 *
 * "still" is deliberately not the same as "low". A powerful desktop whose owner
 * asked for reduced motion should get a crisp static environment, not the
 * cut-down one we hand a weak phone.
 */

export type Tier = 'high' | 'medium' | 'low' | 'still';

export interface Capability {
  tier: Tier;
  /** WebGL environment is worth starting. */
  webgl: boolean;
  /** Cursor-driven lighting, tilt and magnetism are worth wiring up. */
  pointerFx: boolean;
  /** Any ambient animation at all. */
  motion: boolean;
  /** Upper bound on devicePixelRatio for GPU work. */
  dpr: number;
}

let cached: Capability | null = null;

function measure(): Capability {
  // SSR and prerender: assume the least, upgrade on the client.
  if (typeof window === 'undefined') {
    return { tier: 'still', webgl: false, pointerFx: false, motion: false, dpr: 1 };
  }

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return { tier: 'still', webgl: false, pointerFx: false, motion: false, dpr: 1 };
  }

  const nav = navigator as Navigator & { deviceMemory?: number };
  const mem = nav.deviceMemory ?? 4;
  const cores = navigator.hardwareConcurrency ?? 4;
  const coarse = window.matchMedia('(pointer: coarse)').matches;

  // A device reporting 2GB or two cores is telling us it has better uses for
  // its battery than our background.
  if (mem <= 2 || cores <= 2) {
    return { tier: 'low', webgl: false, pointerFx: false, motion: true, dpr: 1 };
  }

  // Probe rather than infer: a machine can look capable and still have WebGL
  // blocklisted by its driver. Cheaper to find out now than to mount, fail and
  // fall back with a visible flash.
  let webgl = false;
  try {
    const c = document.createElement('canvas');
    webgl = !!(c.getContext('webgl') || c.getContext('experimental-webgl'));
  } catch {
    webgl = false;
  }
  if (!webgl) {
    return { tier: 'low', webgl: false, pointerFx: !coarse, motion: true, dpr: 1 };
  }

  if (coarse || mem <= 4 || cores <= 4) {
    // Touch devices get the environment but never the cursor systems: there is
    // no hover to serve, and a tilt would fight the scroll.
    return { tier: 'medium', webgl: true, pointerFx: !coarse, motion: true, dpr: 1.5 };
  }

  return { tier: 'high', webgl: true, pointerFx: true, motion: true, dpr: 2 };
}

/** Cached capability for this session. Safe to call from anywhere, any number of times. */
export function getCapability(): Capability {
  if (!cached) cached = measure();
  return cached;
}

/** Test seam: forget the cached measurement. */
export function resetCapability() { cached = null; }
