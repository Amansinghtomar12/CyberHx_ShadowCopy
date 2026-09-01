/**
 * useSound — the render-time view of the sound preference.
 *
 * The engine reads `soundEnabled()` directly because it is not a component.
 * This exists only so a toggle can draw the right icon and stay in sync when
 * the preference is changed from somewhere else (the header and Settings both
 * expose it, and both must agree without a reload).
 */
import { useEffect, useState } from 'react';
import { soundEnabled, setSoundEnabled, subscribeSoundPref } from './preferences';

export function useSound(): { enabled: boolean; setEnabled: (on: boolean) => void; toggle: () => void } {
  const [enabled, setLocal] = useState(soundEnabled);

  useEffect(() => subscribeSoundPref(setLocal), []);

  return {
    enabled,
    setEnabled: setSoundEnabled,
    toggle: () => setSoundEnabled(!soundEnabled()),
  };
}
