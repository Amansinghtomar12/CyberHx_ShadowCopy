/**
 * Pinaka hooks — the little shared logic the themed components need.
 *
 * None of this fetches anything. Every input is a value the platform already
 * holds (the current view, the board mode, the server-derived event status).
 */
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import type { World } from './config';

export type EventStatus = 'waiting' | 'live' | 'ended' | 'inactive';
export type EventPhase = 'before' | 'during' | 'after';

/**
 * Which environment a screen lives in.
 *
 *   ended            -> Vijaya, everywhere (the field is quiet)
 *   challenges       -> Vanavasa; the chained board is Setu; before the event
 *                       opens the hall is still Ayodhya
 *   scoreboard/teams/users -> Lanka (the arena: rivals and standings)
 *   everything else  -> Ayodhya (profile, team, settings, admin, auth)
 */
export function deriveWorld(
  view: string,
  boardMode: 'free' | 'chained' | 'b2r' | string,
  status: EventStatus,
): World {
  if (status === 'ended') return 'vijaya';
  switch (view) {
    case 'challenges':
      if (status === 'waiting' || status === 'inactive') return 'ayodhya';
      return boardMode === 'chained' ? 'setu' : 'vanavasa';
    case 'scoreboard':
    case 'teams':
    case 'users':
      return 'lanka';
    default:
      return 'ayodhya';
  }
}

export function derivePhase(status: EventStatus): EventPhase {
  if (status === 'ended') return 'after';
  if (status === 'live') return 'during';
  return 'before';
}

export function useWorld(view: string, boardMode: string, status: EventStatus): World {
  return useMemo(() => deriveWorld(view, boardMode, status), [view, boardMode, status]);
}

/**
 * Publishes the world and phase on <html> so stylesheet-only effects (sky
 * tint, accent warmth) follow the screen without any component knowing.
 */
export function useWorldAttributes(world: World, phase: EventPhase): void {
  useEffect(() => {
    const el = document.documentElement;
    el.dataset.world = world;
    el.dataset.phase = phase;
    return () => {
      delete el.dataset.world;
      delete el.dataset.phase;
    };
  }, [world, phase]);
}

const NO_MEDIA = () => () => {};

/**
 * Whether a media query matches, live. Presentation only: used to leave out
 * work the layout would hide anyway (an image inside a display:none column
 * is still fetched by the browser). False where matchMedia is missing.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useMemo(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return NO_MEDIA;
    return (onChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    };
  }, [query]);
  const getSnapshot = () =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches;
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
