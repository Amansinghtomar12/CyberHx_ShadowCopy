/**
 * MotionToggle — stop the background moving, one click from anywhere.
 *
 * The same reasoning as SoundToggle: a player who finds the moving field
 * distracting or nauseating needs it gone *now*, not after locating the
 * Experience panel in Settings. It sits in the header and on the auth page
 * (where the field is first seen), and Settings keeps the full three-level
 * control for players who are configuring rather than reacting.
 *
 * It flips the shared fx preference between 'off' and whatever the player
 * had before (cinematic by default, or calm if they chose it in Settings),
 * remembering the previous level so one click restores it exactly.
 */
import { useEffect, useState } from 'react';
import { Orbit, CircleOff } from 'lucide-react';
import { getFx, setFx, subscribeFx, type FxLevel } from './environment/fx';

const PREV_KEY = 'cyberhx.fx.prev';

interface MotionToggleProps {
  className?: string;
}

export default function MotionToggle({ className = '' }: MotionToggleProps) {
  const [fx, setFxState] = useState<FxLevel>(() => getFx());
  useEffect(() => subscribeFx(setFxState), []);

  const on = fx !== 'off';

  const toggle = () => {
    if (on) {
      try { localStorage.setItem(PREV_KEY, fx); } catch { /* fine */ }
      setFx('off');
    } else {
      let prev: FxLevel = 'cinematic';
      try {
        const v = localStorage.getItem(PREV_KEY);
        if (v === 'cinematic' || v === 'calm') prev = v;
      } catch { /* default */ }
      setFx(prev);
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={on}
      aria-label={on ? 'Turn off background motion' : 'Turn on background motion'}
      title={on ? 'Background motion: on — click to turn off' : 'Background motion: off — click to turn on'}
      className={`btn btn-ghost btn-sm btn-icon ${on ? 'text-cyber-neon' : 'text-text-muted'} ${className}`}
    >
      {on ? <Orbit className="w-3.5 h-3.5" /> : <CircleOff className="w-3.5 h-3.5" />}
    </button>
  );
}
