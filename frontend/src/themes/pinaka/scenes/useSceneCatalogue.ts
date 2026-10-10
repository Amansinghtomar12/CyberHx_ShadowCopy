/**
 * Reading the scene catalogue, and keeping the plate registry in step.
 *
 * The board paints a scene's background by looking up `scene-<id>` in the
 * plate registry, which was a constant built at module load. A scene added
 * during an event is not in it, so this registers the plates it reads —
 * the registry gained a runtime overlay for exactly this.
 *
 * Reads once and on demand. The catalogue changes when an organiser adds a
 * scene, which is not something to poll for: the admin panel refreshes it
 * after a write, and anyone else picks it up on their next load.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { registerScenePlates } from '../assets/plates';
import {
  BUILTIN_CATALOGUE, buildCatalogue, type SceneCatalogue, type SceneRow,
} from './catalogue';

const COLUMNS =
  'id,label,intro,button_label,enter_label,accent,art_url,art_width,art_height,focal_x,focal_y,sun_x,sun_y,position,is_builtin';

export interface SceneCatalogueState {
  readonly catalogue: SceneCatalogue;
  /** Whether the first read has come back, with rows or with a refusal. */
  readonly settled: boolean;
  /** Re-read after an organiser adds or removes one. */
  readonly refresh: () => void;
}

export function useSceneCatalogue(enabled: boolean): SceneCatalogueState {
  const [catalogue, setCatalogue] = useState<SceneCatalogue>(BUILTIN_CATALOGUE);
  const [settled, setSettled] = useState(false);
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick(t => t + 1), []);
  // The registry is global, so a second board mounting must not clear the
  // plates the first one registered.
  const registered = useRef<string[]>([]);

  useEffect(() => {
    // Not the Pinaka skin: nothing to read, and the twelve are there anyway.
    if (!enabled) { setCatalogue(BUILTIN_CATALOGUE); setSettled(true); return; }
    let alive = true;

    void (async () => {
      const { data, error } = await supabase
        .from('pinaka_scene').select(COLUMNS).order('position', { ascending: true });
      if (!alive) return;

      // A missing table is the un-migrated case, not a fault: the twelve
      // still ship, so the board keeps working exactly as it did.
      const next = error || !Array.isArray(data)
        ? BUILTIN_CATALOGUE
        : buildCatalogue(data as unknown as SceneRow[]);

      const added = [...next.byId.values()].filter(s => !s.builtin);
      registerScenePlates(added.map(s => [s.id, s.plate] as const));
      registered.current = added.map(s => s.id);

      setCatalogue(next);
      setSettled(true);
    })();

    return () => { alive = false; };
  }, [enabled, tick]);

  return { catalogue, settled, refresh };
}
