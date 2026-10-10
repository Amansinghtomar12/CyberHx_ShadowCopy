/**
 * Which battle scene dresses which Free challenge.
 *
 * One small read of `pinaka_challenge_scene`, kept out of useData.ts so the
 * ordinary data path is untouched by the event and the whole feature can be
 * removed by deleting this directory.
 *
 * It polls. An organiser assigning a scene mid-event is a normal thing to
 * do — scenes go on as challenges are written, often while players are
 * already on the board — and a fetch that ran once at mount would leave
 * every open tab showing the old cards until each player happened to
 * reload. The table is one short row per dressed challenge, so the poll is
 * cheaper than the confusion of a board that disagrees with the admin
 * panel. The cadence matches the event-settings poll, so the two land
 * together and a scene appears about as fast as the skin itself does.
 *
 * The table may not exist — the event migration is applied by hand, and the
 * skin can be switched on before it is. A missing table, a revoked grant or
 * any other error resolves to "no scenes", which renders the platform's
 * ordinary challenge dialog. Failing open is right here precisely because
 * nothing on this path is a secret: it decides which picture to draw.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { isSceneId, type SceneId } from './config';

export type SceneMap = ReadonlyMap<string, SceneId>;

const EMPTY: SceneMap = new Map();

/** Same cadence as the event-settings poll, so a scene lands with the skin. */
const POLL_MS = 30_000;

export function useChallengeScenes(enabled: boolean): SceneMap {
  const [map, setMap] = useState<SceneMap>(EMPTY);
  // Keeps the identity of an unchanged map stable, so a poll that finds
  // nothing new does not re-render every card on the board.
  const signature = useRef('');

  const read = useCallback(async (live: () => boolean) => {
    const { data, error } = await supabase
      .from('pinaka_challenge_scene')
      .select('challenge_id,scene');

    if (!live()) return;
    if (error || !data) { setMap(EMPTY); signature.current = ''; return; }

    const rows = (data as { challenge_id: string; scene: string }[])
      // An unknown slug means the table outlived a scene that was renamed
      // or dropped; skip it rather than render a broken background.
      .filter(r => isSceneId(r.scene))
      .sort((a, b) => a.challenge_id.localeCompare(b.challenge_id));

    const sig = rows.map(r => r.challenge_id + ':' + r.scene).join('|');
    if (sig === signature.current) return;
    signature.current = sig;
    setMap(new Map(rows.map(r => [r.challenge_id, r.scene as SceneId])));
  }, []);

  useEffect(() => {
    if (!enabled) { setMap(EMPTY); signature.current = ''; return; }
    let alive = true;
    const live = () => alive;

    void read(live);
    const t = setInterval(() => { void read(live); }, POLL_MS);

    // A tab that has been in the background for an hour should not wait out
    // the rest of its interval before catching up.
    const onVisible = () => { if (document.visibilityState === 'visible') void read(live); };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      alive = false;
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, read]);

  return map;
}
