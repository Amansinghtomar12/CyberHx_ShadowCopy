/**
 * SoundToggle — mute, one click from anywhere.
 *
 * It lives in the header rather than only in Settings for one reason: a player
 * who is surprised by sound needs to stop it *now*, not after finding a
 * settings page. Settings carries the same control with a label for players who
 * are configuring rather than reacting.
 *
 * It is a real toggle button (`aria-pressed`), so a screen reader announces the
 * current state rather than an ambiguous "sound" label.
 */
import { Volume2, VolumeX } from 'lucide-react';
import { useSound } from '../audio/useSound';
import { play } from '../audio/AudioManager';

interface SoundToggleProps {
  /** 'icon' for the header rail, 'row' for the Settings page. */
  variant?: 'icon' | 'row';
  className?: string;
}

export default function SoundToggle({ variant = 'icon', className = '' }: SoundToggleProps) {
  const { enabled, setEnabled } = useSound();

  const onClick = () => {
    const next = !enabled;
    setEnabled(next);
    // Confirm the change in the medium being changed. Only on the way ON —
    // playing a sound to confirm you asked for silence is a joke that lands
    // exactly once.
    if (next) play('open');
  };

  if (variant === 'row') {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={enabled}
        className={`surface flex w-full items-center justify-between gap-4 p-4 text-left transition-colors hover:bg-surface-raised ${className}`}
      >
        <span className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden="true"
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-inset border ${
              enabled ? 'border-border-neon bg-neon-wash text-cyber-neon' : 'border-border-base bg-surface-inset text-text-muted'
            }`}
          >
            {enabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </span>
          <span className="min-w-0">
            <span className="block text-small font-bold text-cyber-text">Interface sound</span>
            <span className="block text-small text-text-muted">
              {enabled ? 'Solves, milestones and interface feedback are audible.' : 'The platform is silent.'}
            </span>
          </span>
        </span>
        <span
          aria-hidden="true"
          className={`relative h-5 w-9 shrink-0 rounded-pill border transition-colors duration-[var(--duration-base)] ${
            enabled ? 'border-border-neon bg-neon-wash' : 'border-border-base bg-surface-inset'
          }`}
        >
          <span
            className={`absolute top-0.5 h-3.5 w-3.5 rounded-pill transition-all duration-[var(--duration-base)] ease-[var(--ease-out-quint)] ${
              enabled ? 'left-[1.125rem] bg-cyber-neon' : 'left-0.5 bg-border-strong'
            }`}
          />
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={enabled}
      aria-label={enabled ? 'Mute interface sound' : 'Unmute interface sound'}
      title={enabled ? 'Mute sound' : 'Unmute sound'}
      className={`btn btn-ghost btn-sm btn-icon ${enabled ? 'text-cyber-neon' : 'text-text-muted'} ${className}`}
    >
      {enabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
    </button>
  );
}
