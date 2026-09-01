/**
 * SoundPreferences — one stored answer to "does this player want to hear it?"
 *
 * Deliberately a module-level store rather than React context. The audio engine
 * is not a component and must be able to ask this question from a timer, an
 * event handler, or a WebGL frame without a provider above it. Components that
 * need to *render* the state subscribe through `useSound`.
 *
 * DEFAULT IS ON, and that is a real decision rather than an oversight. Sound
 * that starts off is sound nobody finds: the toggle is in the header, but no
 * player goes looking for a feature they have never heard. The cost of being
 * wrong is bounded — the very first sound a player can possibly hear is a 40ms
 * tick at roughly 1% of full scale, and the mute control is one click away in
 * the header on every single view.
 *
 * Nothing here can make noise on page load. A browser will not let an
 * AudioContext produce output before a user gesture, and the engine does not
 * even construct one until the first `play()` call, which is always downstream
 * of a click, a key press or a submit.
 */

const KEY = 'cyberhx.sound';

function read(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw === null) return true;   // never asked → on
    return raw === '1';
  } catch {
    // Private mode, blocked storage, or a hostile embed. Honour the default
    // rather than treating a storage failure as a preference.
    return true;
  }
}

let enabled = read();
const listeners = new Set<(on: boolean) => void>();

export function soundEnabled(): boolean {
  return enabled;
}

export function setSoundEnabled(on: boolean) {
  if (on === enabled) return;
  enabled = on;
  try {
    window.localStorage.setItem(KEY, on ? '1' : '0');
  } catch {
    // The session still respects the choice; only persistence is lost.
  }
  listeners.forEach(fn => fn(on));
}

export function subscribeSoundPref(fn: (on: boolean) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
