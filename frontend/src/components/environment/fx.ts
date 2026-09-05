/**
 * Visual effects preference — the player's say over how much the environment
 * moves.
 *
 * The PerformanceManager decides what a device can afford; this decides what
 * the person in front of it wants. Both matter. A photosensitive player on a
 * gaming laptop and a player on a library machine both need a way down from
 * the full experience, and prefers-reduced-motion only covers the first.
 *
 *   cinematic  everything: stars, nebula, warp jumps, camera motion
 *   calm       the environment without the jumps: no warp, gentler drift
 *   off        the static gradient, no WebGL at all
 *
 * Stored per device. Changing it is applied live; nothing reloads.
 */
export type FxLevel = 'cinematic' | 'calm' | 'off';

const KEY = 'cyberhx.fx';
const listeners = new Set<(fx: FxLevel) => void>();

function read(): FxLevel {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'cinematic' || v === 'calm' || v === 'off') return v;
  } catch { /* storage unavailable: default */ }
  return 'cinematic';
}

let current: FxLevel | null = null;

export function getFx(): FxLevel {
  if (current === null) current = read();
  return current;
}

export function setFx(fx: FxLevel) {
  if (fx === getFx()) return;
  current = fx;
  try { localStorage.setItem(KEY, fx); } catch { /* fine */ }
  listeners.forEach(fn => fn(fx));
}

export function subscribeFx(fn: (fx: FxLevel) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
