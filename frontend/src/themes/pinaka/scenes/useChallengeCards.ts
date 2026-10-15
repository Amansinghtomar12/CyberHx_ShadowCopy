/**
 * A challenge's own picture — and, now, its own scene.
 *
 * This used to be deliberately smaller than a battle scene: a picture and
 * nothing else, for challenges that wanted art without a story attached.
 * The organisers asked for the opposite. One upload on the challenge form,
 * carrying its own name, prologue and button wording, and the PLACEMENT
 * decides how it is drawn — a Free challenge opens as an arena with the
 * painting behind the whole site, the same challenge inside a chain shows
 * the painting on its card.
 *
 * So a row here is shaped as a CatalogueScene. Nothing in the board had to
 * learn a second kind of art: SceneCard and ChapterChain already take a
 * scene, and this hands them one.
 *
 * A scene picked from the catalogue still wins where a challenge has both.
 * That is not a preference so much as a fact about content that already
 * exists: challenges are dressed in the twelve shipped paintings today,
 * and an upload should not silently take their place.
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
import { registerCardPlates, type Plate } from '../assets/plates';
import type { CatalogueScene } from './catalogue';

/**
 * A card row, shaped as a scene. `id` is the challenge's own id, so a
 * synthesised scene can never collide with a catalogue one.
 */
export type ChallengeCard = CatalogueScene;

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
  label?: string | null;
  intro?: string | null;
  enter_label?: string | null;
  button_label?: string | null;
  sun_x?: number | null;
  sun_y?: number | null;
}

// label..sun_y arrived with 20261016000000. A database without it answers
// 400 for the whole select, which would take the pictures away as well as
// the words, so the reader falls back to the short list on failure.
const COLUMNS_FULL = 'challenge_id,art_url,art_half_url,art_width,art_height,focal_x,focal_y,accent,label,intro,enter_label,button_label,sun_x,sun_y';
const COLUMNS_BASE = 'challenge_id,art_url,art_half_url,art_width,art_height,focal_x,focal_y,accent';

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
    // Measured on upload now that this plate can be a full-bleed backdrop:
    // the bloom and the rays behind an arena leave the picture's own light.
    // Centred and a little high is the fallback for a row written before
    // there was anywhere to put the measurement.
    sun: { x: row.sun_x ?? 0.5, y: row.sun_y ?? 0.35 },
    credit: {
      title: '', author: 'Added by the organisers',
      license: 'Event artwork', licenseUrl: '', sourceUrl: '', photo: false,
    },
  };
}

/**
 * A card row as a scene.
 *
 * `title` is the challenge's own, used wherever the organisers left a word
 * blank. A scene with no name would print an empty arena door, and the
 * challenge's title is both the truest default and the one they would have
 * typed; the other three fall back to plain English rather than to the
 * Ramayana, because an organiser who uploads a screenshot for a web
 * challenge has not asked for a story.
 */
function sceneOf(row: Row, title: string): ChallengeCard {
  const word = (v: string | null | undefined, fallback: string) => {
    const t = (v ?? '').trim();
    return t.length > 0 ? t : fallback;
  };
  return {
    id: row.challenge_id,
    label: word(row.label, title),
    intro: word(row.intro, ''),
    buttonLabel: word(row.button_label, ''),
    enterLabel: word(row.enter_label, 'Open'),
    accent: row.accent,
    plate: plateOf(row),
    builtin: false,
  };
}

/**
 * @param enabled  The Pinaka skin is open. Off, this resolves to no cards.
 * @param titleOf  Challenge id to title, for the name an organiser left
 *                 blank. Held in a ref rather than a dependency: the board
 *                 rebuilds this map on every render, and making the poll
 *                 depend on it would restart the interval each time.
 */
export function useChallengeCards(
  enabled: boolean,
  titleOf?: ReadonlyMap<string, string>,
): CardMap {
  const [map, setMap] = useState<CardMap>(EMPTY);
  // An unchanged read keeps the same map, so a poll that finds nothing new
  // does not re-render every card on the board.
  const signature = useRef('');
  const titles = useRef<ReadonlyMap<string, string>>(titleOf ?? new Map());
  titles.current = titleOf ?? titles.current;

  const read = useCallback(async (live: () => boolean) => {
    let res = await supabase.from('pinaka_challenge_card').select(COLUMNS_FULL);
    // An un-migrated database rejects the whole select for one unknown
    // column. Asking again for the columns that have always been there
    // keeps the pictures on the board while the words are simply absent.
    if (res.error) res = await supabase.from('pinaka_challenge_card').select(COLUMNS_BASE);
    if (!live()) return;
    const { data, error } = res;
    if (error || !Array.isArray(data)) { setMap(EMPTY); signature.current = ''; return; }

    const rows = (data as unknown as Row[])
      .filter(r => !!r.art_url)
      .sort((a, b) => a.challenge_id.localeCompare(b.challenge_id));

    // The words are in the signature too: an organiser who renames an
    // arena without changing its picture still wants the board to follow.
    const sig = rows.map(r => [
      r.challenge_id, r.art_url, r.accent,
      r.label, r.intro, r.enter_label, r.button_label,
    ].join('\u0001')).join('|');
    if (sig === signature.current) return;
    signature.current = sig;

    const next = new Map(rows.map(r => [r.challenge_id, sceneOf(r, titles.current.get(r.challenge_id) ?? '')]));
    // The environment resolves a backdrop synchronously while rendering,
    // so the plates have to be in the registry before a door can be
    // entered -- not fetched when it is.
    registerCardPlates([...next.values()].map(c => [c.id, c.plate] as const));
    setMap(next);
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
