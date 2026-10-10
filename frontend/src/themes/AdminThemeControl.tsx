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

  /**
   * Story mode — the second switch, and the one that changes how the game
   * plays rather than how it looks. `null` means the event migration has
   * not been applied yet, which is a different thing from "off" and is
   * shown differently: there is nothing to toggle until it exists.
   */
  const [story, setStory] = useState<boolean | null>(null);
  const [storyBusy, setStoryBusy] = useState(false);
  useEffect(() => {
    let live = true;
    void (async () => {
      const { data, error: err } = await supabase
        .from('event_settings').select('pinaka_story_mode').eq('id', 1).maybeSingle();
      if (!live) return;
      // A missing column errors; that is the un-migrated case, not a fault.
      setStory(err || data?.pinaka_story_mode == null ? null : !!data.pinaka_story_mode);
    })();
    return () => { live = false; };
  }, []);

  const setStoryMode = async (next: boolean) => {
    const question = next
      ? 'Lock the chained challenges into the story order?\n\nEach chained challenge opens only once the team has solved the one before it. Locked challenges keep their title, category and points but give up their description, files and hints, and refuse flags. Free challenges are NOT affected. Scores already earned are untouched.'
      : 'Unlock every chained challenge?\n\nPlayers can attempt them in any order again, immediately. Nothing already solved is lost.';
    if (!window.confirm(question)) return;
    setStoryBusy(true); setError('');
    const { data, error: err } = await supabase.rpc('admin_set_pinaka_story_mode', { p_on: next });
    setStoryBusy(false);
    if (err || data?.error) {
      setError('Could not change story mode: ' + (data?.error ?? err?.message ?? 'unknown error'));
      return;
    }
    setStory(!!data?.pinaka_story_mode);
  };

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
      {/* ── The second switch ───────────────────────────────────────────
          Kept visually subordinate to the skin, because it is the one that
          changes play rather than looks: an organiser should have to read a
          line before touching it. */}
      <div className="mt-5 border-t border-border-subtle pt-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h4 className="text-body font-semibold text-cyber-text">Story mode — the chained journey</h4>
            <p className="mt-1 text-small text-text-muted max-w-prose">
              Locks each chained challenge behind the one before it, so a team walks the six
              chapters in order. A locked challenge still shows its title, category and points,
              but gives up its description, files and hints and refuses flags — enforced in the
              database, not just hidden here. <strong>Free challenges are never affected.</strong>
            </p>
          </div>
          <span className={`badge ${story ? 'badge-neon' : 'badge-locked'}`}>
            {story === null ? 'Not installed' : story ? 'Locked in order' : 'Open order'}
          </span>
        </div>

        {story === null ? (
          <p className="mt-3 rounded-control border border-border-subtle bg-surface-inset px-3 py-2 text-small text-text-muted leading-relaxed">
            The event migration has not been applied to this database yet, so there is nothing to
            switch on. Apply <code className="font-mono">20261010000000_pinaka_event_mode.sql</code>,
            then reload this page. Until then the platform plays exactly as it always has.
          </p>
        ) : (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void setStoryMode(true)}
              disabled={storyBusy || story}
              className={`btn btn-primary btn-md ${storyBusy ? 'is-loading' : ''}`}
            >
              Lock the journey in order
            </button>
            <button
              type="button"
              onClick={() => void setStoryMode(false)}
              disabled={storyBusy || !story}
              className="btn btn-secondary btn-md"
            >
              Unlock every chapter
            </button>
          </div>
        )}
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
