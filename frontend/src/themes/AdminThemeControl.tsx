/**
 * AdminThemeControl — the organisers' switch for the platform's look.
 *
 * One server value (event_settings.theme, written through admin_set_theme)
 * decides what every visitor sees. Open it and every open tab follows within
 * the event-settings poll; close it and they return. Players keep whatever
 * they were doing: only the skin changes.
 *
 * Two shapes of the same control: a small button for the header, a panel
 * with the explanation for Admin → Event. Both confirm with the native
 * dialog, like every other organiser switch on this platform.
 */
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  applyTheme, effectiveTheme, getServerTheme, getThemeOverride, noteServerTheme,
  setThemeOverride, subscribeServerTheme, subscribeTheme, type ThemeId,
} from './index';

interface Props {
  variant?: 'nav' | 'panel';
}

export default function AdminThemeControl({ variant = 'panel' }: Props) {
  const [server, setServer] = useState<ThemeId | null>(() => getServerTheme());
  const [pinned, setPinned] = useState<ThemeId | null>(() => getThemeOverride());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => subscribeServerTheme(setServer), []);
  // The device's own choice can change from Settings; show it when it does.
  useEffect(() => subscribeTheme(() => setPinned(getThemeOverride())), []);

  const open = server === 'pinaka';

  const set = async (next: ThemeId) => {
    const question = next === 'pinaka'
      ? 'Open the Pinaka experience for every visitor?\n\nEveryone sees the Pinaka CTF 2026 look on their next poll (within about 30 seconds). Nothing else changes: scores, challenges and sessions are untouched.'
      : 'Close the Pinaka experience and return every visitor to the classic CyberHX look?';
    if (!window.confirm(question)) return;
    setBusy(true);
    setError('');
    const { data, error: err } = await supabase.rpc('admin_set_theme', { p_theme: next });
    setBusy(false);
    if (err || data?.error) {
      const message = 'Could not change the look: ' + (data?.error ?? err?.message ?? 'unknown error');
      setError(message);
      // The header button has nowhere to write; say it the way the confirm asked.
      if (variant === 'nav') window.alert(message);
      return;
    }
    // Apply here at once; everyone else picks it up on their poll.
    noteServerTheme(data?.theme ?? next);
  };

  /** Drop this device's own choice so it shows what everyone else sees. */
  const follow = () => {
    setThemeOverride(null);
    setPinned(null);
    void applyTheme(effectiveTheme());
  };

  if (variant === 'nav') {
    return (
      <button
        type="button"
        onClick={() => void set(open ? 'cyberhx' : 'pinaka')}
        disabled={busy}
        title={open ? 'Everyone is seeing the Pinaka experience. Click to return to the classic look.' : 'Open the Pinaka experience for every visitor.'}
        className={`btn btn-sm ${open ? 'btn-secondary' : 'btn-primary'} ${busy ? 'is-loading' : ''}`}
      >
        {open ? 'Close Pinaka' : 'Open Pinaka'}
      </button>
    );
  }

  return (
    <div className="surface p-5 sm:p-gutter">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-h3 text-cyber-text">Pinaka experience</h3>
          <p className="mt-1 text-small text-text-muted max-w-prose">
            The Pinaka CTF 2026 look for the whole platform: environment, gold tokens, the five chapters,
            the bow motifs. It is a skin — scoring, challenges, sessions and every control stay exactly
            as they are. Every visitor follows this switch; a player can still pick the classic look for
            their own device from Settings → Experience.
          </p>
        </div>
        <span className={`badge ${open ? 'badge-neon' : 'badge-locked'}`}>{open ? 'Open to everyone' : 'Closed'}</span>
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void set('pinaka')}
          disabled={busy || open}
          className={`btn btn-primary btn-md ${busy ? 'is-loading' : ''}`}
        >
          Open Pinaka for everyone
        </button>
        <button
          type="button"
          onClick={() => void set('cyberhx')}
          disabled={busy || !open}
          className="btn btn-secondary btn-md"
        >
          Close Pinaka
        </button>
        {/* A tab-only preview: nothing is stored on this device beyond the tab,
            and nothing changes for anyone else. */}
        <a
          href="/?preview=pinaka"
          target="_blank"
          rel="noopener"
          className="btn btn-ghost btn-md"
          title="Opens a new tab showing the Pinaka look to you only. Closing the tab ends it; nobody else is affected."
        >
          Preview in a new tab
        </a>
      </div>
      {pinned && (
        <p className="mt-3 text-small text-text-muted">
          This device is pinned to the {pinned === 'pinaka' ? 'Pinaka' : 'classic'} look (Settings → Experience) and
          does not follow the switch above.{' '}
          <button type="button" className="underline text-cyber-text" onClick={follow}>Follow the organisers</button>
        </p>
      )}
      {error && <p role="alert" className="mt-3 text-small" style={{ color: 'var(--color-danger-fg)' }}>{error}</p>}
    </div>
  );
}
