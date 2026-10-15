/**
 * The picture on a challenge's card, where the organisers gave it one.
 *
 * Separate from the battle scenes next door, because they answer different
 * questions. A scene is a shared thing — a name, a line of story, the
 * wording on a button — and dressing a challenge in one turns its card into
 * an arena door. This is a picture and nothing else, chosen per challenge
 * when it is written, for the great majority of challenges that want art
 * without a story attached.
 *
 * A scene still wins where a challenge has both: being an arena is a larger
 * claim than having a picture.
 *
 * It polls, for the same reason the scene map does. Organisers write
 * challenges while players are already on the board, and a card that
 * appeared an hour after its picture did would be nobody's idea of live.
 *
 * A missing table is the un-migrated case, not a fault: it resolves to "no
 * pictures", which is the board exactly as it was.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import type { Plate } from '../assets/plates';

export interface ChallengeCard {
  readonly challengeId: string;
  /** A plate, so every consumer that already paints one needs no new shape. */
  readonly plate: Plate;
  readonly accent: string;
}

export type CardMap = ReadonlyMap<string, ChallengeCard>;

const EMPTY: CardMap = new Map();

/** Same cadence as the scene map, so the two land together. */
const POLL_MS = 30_000;

interface Row {
  challenge_id: string;
  art_url: string;
  art_half_url: string | null;
  art_width: number | null;
  art_height: number | null;
  focal_x: number;
  focal_y: number;
  accent: string;
}

const COLUMNS = 'challenge_id,art_url,art_half_url,art_width,art_height,focal_x,focal_y,accent';

function plateOf(row: Row): Plate {
  // The half file where there is one, so a card a few hundred pixels wide
  // does not pull a 4K painting to draw itself, and the full file as the
  // 3840 candidate for a screen that actually wants one.
  const half = row.art_half_url || row.art_url;
  return {
    w3840: row.art_url,
    w1920: half,
    w960: half,
    portrait: half,
    width: row.art_width ?? 1920,
    height: row.art_height ?? 1080,
    alt: '',
    focal: { x: row.focal_x, y: row.focal_y },
    // No measured light for a card picture: the bloom belongs to a
    // full-bleed plate, and centring it is the neutral choice.
    sun: { x: 0.5, y: 0.35 },
    credit: {
      title: '', author: 'Added by the organisers',
      license: 'Event artwork', licenseUrl: '', sourceUrl: '', photo: false,
    },
  };
}

export function useChallengeCards(enabled: boolean): CardMap {
  const [map, setMap] = useState<CardMap>(EMPTY);
  // An unchanged read keeps the same map, so a poll that finds nothing new
  // does not re-render every card on the board.
  const signature = useRef('');

  const read = useCallback(async (live: () => boolean) => {
    const { data, error } = await supabase.from('pinaka_challenge_card').select(COLUMNS);
    if (!live()) return;
    if (error || !Array.isArray(data)) { setMap(EMPTY); signature.current = ''; return; }

    const rows = (data as unknown as Row[])
      .filter(r => !!r.art_url)
      .sort((a, b) => a.challenge_id.localeCompare(b.challenge_id));

    const sig = rows.map(r => `${r.challenge_id}:${r.art_url}:${r.accent}`).join('|');
    if (sig === signature.current) return;
    signature.current = sig;

    setMap(new Map(rows.map(r => [
      r.challenge_id,
      { challengeId: r.challenge_id, plate: plateOf(r), accent: r.accent },
    ])));
  }, []);

  useEffect(() => {
    if (!enabled) { setMap(EMPTY); signature.current = ''; return; }
    let alive = true;
    const live = () => alive;
    void read(live);
    const t = setInterval(() => { void read(live); }, POLL_MS);
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
