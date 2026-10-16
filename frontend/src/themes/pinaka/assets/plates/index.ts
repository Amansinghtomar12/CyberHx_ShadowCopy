/**
 * Pinaka theme — world plates.
 *
 * One picture per world plus the hero behind the sign-in page and the intro:
 * every one of them an official event painting now — the temple-city key
 * art for Ayodhya, the forest years for Vanavasa, and Lanka ablaze for
 * Lanka. Vanavasa was the last photograph in the set (a CC0 frame of the
 * Western Ghats at Agumbe) until the organisers painted that world for
 * the final pack, so the set carries no third-party picture at all.
 * Every file is a same-origin asset bundled by Vite (a 1920 px and a 960 px
 * WebP, cover-cropped around `focal`). Licences and
 * sources are recorded here and in docs/pinaka/ASSETS.md; the untouched
 * originals are not in the repository.
 *
 * Presentation only: nothing here reads data. Consumers go through
 * sources.ts (`w960` on viewports up to 960 px and on the low tier, a
 * 960/1920 `srcset` otherwise) and position the image with
 * `object-position: ${focal.x * 100}% ${focal.y * 100}%`.
 */
import type { World } from '../../config';
import { CHAPTER_ORDER, type ChapterId } from '../../chapters/config';
import { CHAPTER_PLATES } from '../chapters';

import temple3840 from './temple-3840.webp';
import temple1920 from './temple-1920.webp';
import temple960 from './temple-960.webp';
import templePortrait from './temple-portrait.webp';
import vanavasa3840 from './vanavasa-3840.webp';
import vanavasa1920 from './vanavasa-1920.webp';
import vanavasa960 from './vanavasa-960.webp';
import vanavasaPortrait from './vanavasa-portrait.webp';
import lankaArt3840 from './lanka-art-3840.webp';
import lankaArt1920 from './lanka-art-1920.webp';
import lankaArt960 from './lanka-art-960.webp';
import lankaArtPortrait from './lanka-art-portrait.webp';
import { SCENE_PLATES, type SceneId } from '../scenes';

/** The official Pinaka CTF 2026 key art: the golden temple-city on the water. */
const TEMPLE_ART: Plate = {
  w3840: temple3840,
  w1920: temple1920,
  w960: temple960,
  portrait: templePortrait,
  width: 1920,
  height: 1080,
  alt: "Pinaka CTF key art: Rama, Sita and Lakshmana on the lamplit steps above the water, the temple-city of Ayodhya across the lake at sunset",
  focal: { x: 0.475, y: 0.526 },
  sun: { x: 0.406, y: 0.281 },
  credit: {
    title: "Pinaka CTF 2026 key art",
    author: "Pinaka CTF · NFSU Chennai",
    license: "Official event artwork",
    licenseUrl: "https://pinakactf.com/",
    sourceUrl: "https://pinakactf.com/",
    photo: false,
  },
};

/**
 * A chapter's background, keyed apart from the worlds: three chapters share
 * a name with a world ('ayodhya', 'setu', 'lanka') and the two systems must
 * not overwrite each other — the worlds still dress the routes, the chapters
 * dress the journey.
 */
export type ChapterPlateKey = `chapter-${ChapterId}`;

/**
 * A battle scene's background, keyed apart again. A scene dresses the site
 * only while a player has that Free challenge open; the chapter plate
 * underneath it is what they return to.
 */
export type ScenePlateKey = `scene-${SceneId}`;

/**
 * A scene added by the organisers during their own event: the same shape,
 * but an id this file cannot know at build time.
 */
export type AddedScenePlateKey = `scene-${string}`;

export type PlateKey = World | 'hero' | ChapterPlateKey | ScenePlateKey;

export interface Plate {
  /** Bundled URL of the 1920×1080 file. */
  w1920: string;
  /** Bundled URL of the 960×540 file. */
  w960: string;
  /** The 3840 px file (AI-upscaled ×2 from the 2560 px paintings and the
      1920 px graded photograph), for high-density and very wide screens. */
  w3840?: string;
  /** A 9:16 crop at full height around the focal point, 1040 px wide, for a
      phone held upright: a landscape picture stretched to a tall screen is
      what made the background blurry there. */
  portrait?: string;
  width: number;
  height: number;
  /** Short description for assistive technology (the plate is decorative; consumers may still use alt=""). */
  alt: string;
  /** Point of interest as a fraction of the plate, for object-position. */
  focal: { x: number; y: number };
  /**
   * Where the light comes from, as a fraction of the plate (it may lie just
   * outside it, for light that falls from above the frame). The environment
   * anchors its sun bloom and god rays here so they leave the painted sun.
   */
  sun?: { x: number; y: number };
  credit: {
    title: string;
    author: string;
    license: string;
    licenseUrl: string;
    sourceUrl: string;
    /** false for a generated fallback, which needs no credit line. */
    photo: boolean;
  };
}

export const PLATES: Record<PlateKey, Plate> = {
  ayodhya: TEMPLE_ART,
  vanavasa: {
    w3840: vanavasa3840,
    w1920: vanavasa1920,
    w960: vanavasa960,
    portrait: vanavasaPortrait,
    width: 1920,
    height: 1080,
    alt: "Rama, Lakshmana and Sita walking a forest trail at sunrise above a valley of waterfalls, a deer in the undergrowth",
    focal: { x: 0.465, y: 0.53 },
    sun: { x: 0.906, y: 0.156 },
    // No longer the Agumbe photograph. The organisers painted this world
    // themselves in the final pack, so the credit follows the picture: a
    // CC0 photographer's name left on artwork they did not make would be
    // a false record, which is what this field exists to prevent.
    credit: {
      title: "Vanavasa — the forest years",
      author: "Pinaka CTF · NFSU Chennai",
      license: "Official event artwork",
      licenseUrl: "https://pinakactf.com/",
      sourceUrl: "https://pinakactf.com/",
      photo: false,
    },
  },
  setu: TEMPLE_ART,
  lanka: {
    w3840: lankaArt3840,
    w1920: lankaArt1920,
    w960: lankaArt960,
    portrait: lankaArtPortrait,
    width: 1920,
    height: 1080,
    alt: "Pinaka CTF artwork: the fortress of Lanka ablaze above a smoking battlefield",
    // keeps the fortress and the fire on wide screens, the burning gate on phones
    focal: { x: 0.483, y: 0.517 },
    sun: { x: 0.719, y: 0.156 },
    credit: {
      title: "Lanka ablaze — Pinaka CTF 2026 artwork",
      author: "Pinaka CTF · NFSU Chennai",
      license: "Official event artwork",
      licenseUrl: "https://pinakactf.com/",
      sourceUrl: "https://pinakactf.com/",
      photo: false,
    },
  },
  vijaya: TEMPLE_ART,
  hero: TEMPLE_ART,
  ...(Object.fromEntries(
    CHAPTER_ORDER.map(id => [`chapter-${id}`, CHAPTER_PLATES[id]]),
  ) as Record<ChapterPlateKey, Plate>),
  ...(Object.fromEntries(
    (Object.keys(SCENE_PLATES) as SceneId[]).map(id => [`scene-${id}`, SCENE_PLATES[id]]),
  ) as Record<ScenePlateKey, Plate>),
};

/**
 * Plates for scenes the organisers added after this module was built.
 *
 * The registry above is a constant, which was the whole truth while the
 * twelve battle scenes were the only ones. A scene added during an event
 * has no entry there, and the environment resolves a plate synchronously
 * while rendering — so the alternative to this overlay is threading an
 * async catalogue through every component that paints a background.
 *
 * Written once when the catalogue lands and read through `plateFor`.
 * Replaces rather than accumulates, so a scene the organisers deleted
 * stops being paintable.
 */
let addedPlates: ReadonlyMap<string, Plate> = new Map();

export function registerScenePlates(entries: readonly (readonly [string, Plate])[]): void {
  addedPlates = new Map(entries.map(([id, plate]) => [`scene-${id}`, plate]));
}

/**
 * The same overlay again, for a picture uploaded on a challenge's own
 * form. Keyed `scene-<challenge id>`, because a card row is a scene now
 * and the environment asks for it by the same kind of key.
 *
 * A SECOND map rather than more entries in the one above, and that is the
 * whole reason this exists: both writers replace their map wholesale, so
 * sharing one meant whichever of the two polls answered last wiped the
 * other's plates. The symptom was precise and easy to miss -- an uploaded
 * picture made a perfectly good arena door, and entering it left the
 * background on the chapter's painting, because the only thing missing was
 * the plate the backdrop needed.
 */
let cardPlates: ReadonlyMap<string, Plate> = new Map();

export function registerCardPlates(entries: readonly (readonly [string, Plate])[]): void {
  cardPlates = new Map(entries.map(([id, plate]) => [`scene-${id}`, plate]));
}

/**
 * The plate for a key: the bundle first, then anything the organisers
 * added. `null` for a key neither knows, which is what a caller gets for a
 * scene that was deleted while someone had its challenge open.
 */
export function plateFor(key: PlateKey | AddedScenePlateKey | null | undefined): Plate | null {
  if (!key) return null;
  // Bundle, then the catalogue's additions, then a challenge's own upload.
  // Same order the board resolves a scene in, so a challenge wearing both
  // is painted with the one its card is showing.
  return (PLATES as Record<string, Plate | undefined>)[key]
    ?? addedPlates.get(key)
    ?? cardPlates.get(key)
    ?? null;
}

/** The plate a battle scene is painted with. */
export function scenePlateKey(id: string): ScenePlateKey {
  return `scene-${id}` as ScenePlateKey;
}

/** The plate a chapter is painted with. */
export function chapterPlateKey(id: ChapterId): ChapterPlateKey {
  return `chapter-${id}`;
}

/* The on-screen credit line is gone, and now there is nothing it could
   have said: every plate in the set is the organisers' own artwork. The
   last third-party picture was Vanavasa's CC0 photograph, which asked for
   no attribution either. Every plate still carries its own `credit`, and
   docs/pinaka/ASSETS.md remains the record of where each came from. */
