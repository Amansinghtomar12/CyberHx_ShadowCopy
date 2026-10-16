/**
 * The scene catalogue: the twelve that ship, plus whatever the organisers
 * have added since.
 *
 * WHY THIS EXISTS
 *   `scenes/config.ts` is a closed set — a union type and twelve records,
 *   right for art that ships with the app. It stopped being the whole truth
 *   when organisers gained the ability to add a scene during their own
 *   event, so this is the merged view every consumer should read.
 *
 * WHERE THE ART COMES FROM
 *   A built-in keeps its bundled plate: already measured, already
 *   compressed, served from the app's own bundle, and fetching it from
 *   storage instead would be slower for nothing. An added scene carries the
 *   URL of its uploaded art and the numbers the browser measured from it,
 *   and a `Plate` is built around that at runtime.
 *
 * WHAT IT DOES NOT DO
 *   Decide anything. A scene dresses a challenge — a background, a line of
 *   story, the wording on a button. Nothing here gates, scores, orders or
 *   hides a challenge, and a challenge with no scene is untouched.
 */
import type { Plate } from '../assets/plates';
import { SCENE_PLATES } from '../assets/scenes';
import { SCENES, isSceneId, type Scene, type SceneId } from './config';

/** A row of `public.pinaka_scene`, as PostgREST returns it. */
export interface SceneRow {
  id: string;
  label: string;
  intro: string;
  button_label: string;
  enter_label: string;
  accent: string;
  art_url: string | null;
  art_width: number | null;
  art_height: number | null;
  focal_x: number;
  focal_y: number;
  sun_x: number;
  sun_y: number;
  position: number;
  is_builtin: boolean;
}

/**
 * A scene as the board uses it: the words, the art, and where it came from.
 *
 * Every field of `Scene` except `id`, which widens — a built-in's id is one
 * of twelve known strings, an added scene's is whatever the organisers
 * named it. Written as Omit rather than an extension because narrowing a
 * union to `string` is not something a subtype may do.
 */
export interface CatalogueScene extends Omit<Scene, 'id'> {
  readonly id: string;
  readonly plate: Plate;
  /** True for the twelve that ship in the bundle. */
  readonly builtin: boolean;
}

export interface SceneCatalogue {
  readonly order: readonly string[];
  readonly byId: ReadonlyMap<string, CatalogueScene>;
  /** The scene for a challenge's mapping, or null for "no scene". */
  readonly lookup: (id: string | null | undefined) => CatalogueScene | null;
}

/**
 * The plate for an uploaded picture.
 *
 * One file where a bundled plate has three. The board asks a plate for
 * `w1920`, `w960` and sometimes `portrait`; pointing all of them at the one
 * upload lets every existing consumer work unchanged, and the browser
 * scales a 1920-wide painting down perfectly well. `alt` stays empty
 * because these are backgrounds — the challenge's own title is what a
 * screen reader should be reading, not a description of the wallpaper.
 */
function plateFromRow(row: SceneRow): Plate {
  const url = row.art_url as string;
  return {
    w1920: url,
    w960: url,
    portrait: url,
    width: row.art_width ?? 1920,
    height: row.art_height ?? 1080,
    alt: '',
    focal: { x: row.focal_x, y: row.focal_y },
    sun: { x: row.sun_x, y: row.sun_y },
    credit: {
      title: row.label,
      author: 'Added by the organisers',
      license: 'Event artwork',
      licenseUrl: '',
      sourceUrl: '',
      photo: false,
    },
  };
}

/** The twelve, as catalogue entries, for before any read has landed. */
function builtinOnly(): CatalogueScene[] {
  return (Object.keys(SCENES) as SceneId[]).map(id => ({
    ...SCENES[id],
    plate: SCENE_PLATES[id],
    builtin: true,
  }));
}

/**
 * Merge what the database says with what the bundle holds.
 *
 * A built-in takes its words from the row — organisers may edit a line of
 * story — but always its art from the bundle, whatever the row claims. A
 * row with no art and no bundled plate is dropped rather than drawn: it
 * would be a scene a player could be assigned and nobody could see.
 */
export function buildCatalogue(rows: readonly SceneRow[] | null): SceneCatalogue {
  const entries: CatalogueScene[] = [];

  if (!rows || rows.length === 0) {
    entries.push(...builtinOnly());
  } else {
    for (const row of [...rows].sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))) {
      const bundled = isSceneId(row.id) ? SCENE_PLATES[row.id] : null;
      const plate = bundled ?? (row.art_url ? plateFromRow(row) : null);
      if (!plate) continue;
      entries.push({
        id: row.id,
        label: row.label,
        intro: row.intro,
        buttonLabel: row.button_label,
        enterLabel: row.enter_label,
        accent: row.accent,
        plate,
        builtin: !!bundled,
      } as CatalogueScene);
    }
    // A database that has the table but somehow lost the seed should not
    // cost an event its shipped artwork.
    if (!entries.some(e => e.builtin)) entries.push(...builtinOnly());
  }

  const byId = new Map(entries.map(e => [e.id, e]));
  return {
    order: entries.map(e => e.id),
    byId,
    lookup: (id) => (typeof id === 'string' ? byId.get(id) ?? null : null),
  };
}

/** What the board uses until the first read lands, or if it never does. */
export const BUILTIN_CATALOGUE: SceneCatalogue = buildCatalogue(null);
