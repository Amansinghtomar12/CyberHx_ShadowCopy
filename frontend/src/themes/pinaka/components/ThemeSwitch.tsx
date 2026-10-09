/**
 * ThemeSwitch — which skin this device shows.
 *
 * Two positions, the same radio-group pattern as FxToggle so Settings reads
 * as one panel: the event look, or the platform's own. The choice is stored
 * per device (themes/index.ts) and applied in place — no reload, nothing a
 * competitor is doing is interrupted. Presentation only: scores, teams,
 * flags, everything a competitor does, is identical in both.
 *
 * Renders nothing when the deployment has switched the choice off or the
 * event skin has expired (canSwitchTheme), so the panel never offers a
 * control that would do nothing.
 */
import { Monitor } from 'lucide-react';
import type { ComponentType, KeyboardEvent } from 'react';
import { applyTheme, buildTheme, canSwitchTheme, effectiveTheme, getServerTheme, setThemeOverride, useTheme, type ThemeId } from '../../index';
import { BowMark } from './BowMotifs';

const OPTIONS: { id: ThemeId; label: string; hint: string; icon: ComponentType<{ className?: string }> }[] = [
  { id: 'pinaka', label: 'Pinaka', hint: 'The Pinaka CTF 2026 look: gold, stone and the five chapters.', icon: BowMark },
  { id: 'cyberhx', label: 'Classic', hint: 'The standard CyberHX interface.', icon: Monitor },
];

export default function ThemeSwitch({ className = '' }: { className?: string }) {
  const theme = useTheme();

  if (!canSwitchTheme()) return null;

  function choose(id: ThemeId) {
    if (id === theme) return;
    // Choosing what the organisers (or, failing them, the build) already
    // show clears the override, so the device follows them again rather
    // than pinning today's answer. Anything else is the device's own call.
    const followed = getServerTheme() ?? buildTheme();
    setThemeOverride(id === followed ? null : id);
    void applyTheme(effectiveTheme());
  }

  // One tab stop; the arrow keys move the choice, as a radio group does.
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const i = Math.max(0, OPTIONS.findIndex(o => o.id === theme));
    let next = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % OPTIONS.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i - 1 + OPTIONS.length) % OPTIONS.length;
    if (next < 0) return;
    e.preventDefault();
    choose(OPTIONS[next].id);
    e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus();
  }

  return (
    <div className={`surface p-4 ${className}`} role="radiogroup" aria-label="Look" onKeyDown={onKeyDown}>
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
              tabIndex={on ? 0 : -1}
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
