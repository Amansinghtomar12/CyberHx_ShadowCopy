/**
 * Which battle scene dresses which Free challenge.
 *
 * One small read of `pinaka_challenge_scene`, kept out of useData.ts so the
 * ordinary data path is untouched by the event and the whole feature can be
 * removed by deleting this directory.
 *
 * The table may not exist — the event migration is applied by hand, and the
 * skin can be switched on before it is. A missing table, a revoked grant or
 * any other error resolves to "no scenes", which renders the platform's
 * ordinary challenge dialog. Failing open is right here precisely because
 * nothing on this path is a secret: it decides which picture to draw.
 */
import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { isSceneId, type SceneId } from './config';

export type SceneMap = ReadonlyMap<string, SceneId>;

const EMPTY: SceneMap = new Map();

export function useChallengeScenes(enabled: boolean): SceneMap {
  const [map, setMap] = useState<SceneMap>(EMPTY);

  useEffect(() => {
    if (!enabled) { setMap(EMPTY); return; }
    let live = true;

    void (async () => {
      const { data, error } = await supabase
        .from('pinaka_challenge_scene')
        .select('challenge_id,scene');

      if (!live) return;
      if (error || !data) { setMap(EMPTY); return; }

      const next = new Map<string, SceneId>();
      for (const row of data as { challenge_id: string; scene: string }[]) {
        // An unknown slug means the table outlived a scene that was renamed
        // or dropped; skip it rather than render a broken background.
        if (isSceneId(row.scene)) next.set(row.challenge_id, row.scene);
      }
      setMap(next);
    })();

    return () => { live = false; };
  }, [enabled]);

  return map;
}
