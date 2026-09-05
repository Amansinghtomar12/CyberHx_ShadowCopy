/**
 * FxToggle — the player's dial for how much the environment moves.
 *
 * Three positions rather than a switch, because "less" is a real answer: a
 * player who finds the warp jumps too much should not have to give up the
 * whole environment to be rid of them. Applied live; the lattice rebuilds
 * itself in place and nothing reloads.
 */
import { Sparkles, Waves, CircleOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { getFx, setFx, subscribeFx, type FxLevel } from './environment/fx';

const OPTIONS: { id: FxLevel; label: string; hint: string; icon: typeof Sparkles }[] = [
  { id: 'cinematic', label: 'Cinematic', hint: 'Stars, nebula, warp jumps and camera motion.', icon: Sparkles },
  { id: 'calm', label: 'Calm', hint: 'The environment without the jumps; gentler drift.', icon: Waves },
  { id: 'off', label: 'Off', hint: 'A still gradient. No WebGL, no animation.', icon: CircleOff },
];

export default function FxToggle({ className = '' }: { className?: string }) {
  const [fx, setLocal] = useState<FxLevel>(() => getFx());
  useEffect(() => subscribeFx(setLocal), []);

  return (
    <div className={`surface p-4 ${className}`} role="radiogroup" aria-label="Visual effects">
      <div className="flex items-start justify-between gap-4">
        <span className="min-w-0">
          <span className="block text-small font-bold text-cyber-text">Visual effects</span>
          <span className="block text-small text-text-muted">How much the environment behind the interface moves.</span>
        </span>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {OPTIONS.map(o => {
          const on = fx === o.id;
          const Icon = o.icon;
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setFx(o.id)}
              className={`flex items-start gap-3 rounded-control border p-3 text-left transition-colors ${
                on ? 'border-border-neon bg-neon-wash' : 'border-border-base bg-surface-inset hover:bg-surface-raised'
              }`}
            >
              <span
                aria-hidden="true"
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-inset border ${
                  on ? 'border-border-neon text-cyber-neon' : 'border-border-base text-text-muted'
                }`}
              >
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className={`block text-small font-bold ${on ? 'text-cyber-neon' : 'text-cyber-text'}`}>{o.label}</span>
                <span className="block text-small text-text-muted">{o.hint}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
