/**
 * ThemeSwitch — which skin this device shows.
 *
 * Two positions, the same radio-group pattern as FxToggle so Settings reads
 * as one panel: the event look, or the platform's own. The choice is stored
 * per device (themes/index.ts) and the page reloads, because the theme is
 * resolved once per page load and nothing in the app has to cope with it
 * changing underneath. Presentation only: scores, teams, flags, everything
 * a competitor does, is identical in both.
 *
 * Renders nothing when the deployment has switched the choice off or the
 * event skin has expired (canSwitchTheme), so the panel never offers a
 * control that would do nothing.
 */
import { Monitor } from 'lucide-react';
import { useState, type ComponentType } from 'react';
import { buildTheme, canSwitchTheme, getTheme, setThemeOverride, type ThemeId } from '../../index';
import { BowMark } from './BowMotifs';

const OPTIONS: { id: ThemeId; label: string; hint: string; icon: ComponentType<{ className?: string }> }[] = [
  { id: 'pinaka', label: 'Pinaka', hint: 'The Pinaka CTF 2026 look: gold, stone and the five chapters.', icon: BowMark },
  { id: 'cyberhx', label: 'Classic', hint: 'The standard CyberHX interface.', icon: Monitor },
];

export default function ThemeSwitch({ className = '' }: { className?: string }) {
  // Resolved once per page load; the state exists so the pressed option
  // reads as pressed during the instant before the reload lands.
  const [theme, setLocal] = useState<ThemeId>(() => getTheme());

  if (!canSwitchTheme()) return null;

  function choose(id: ThemeId) {
    if (id === theme) return;
    setLocal(id);
    // Choosing the build's own default clears the override, so the device
    // follows the deployment again rather than pinning today's default.
    setThemeOverride(id === buildTheme() ? null : id);
    window.location.reload();
  }

  return (
    <div className={`surface p-4 ${className}`} role="radiogroup" aria-label="Look">
      <div className="flex items-start justify-between gap-4">
        <span className="min-w-0">
          <span className="block text-small font-bold text-cyber-text">Look</span>
          <span className="block text-small text-text-muted">Which skin this device shows. Nothing else changes.</span>
        </span>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {OPTIONS.map(o => {
          const on = theme === o.id;
          const Icon = o.icon;
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => choose(o.id)}
              className={`focus-ring flex items-start gap-3 rounded-control border p-3 text-left transition-colors ${
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
