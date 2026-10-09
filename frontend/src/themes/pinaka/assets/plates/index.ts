/**
 * Pinaka theme — world plates.
 *
 * One picture per world plus the hero behind the sign-in page and the intro.
 * Two kinds of plate share the same shape:
 *   · official event artwork from pinakactf.com (the temple city at sunset,
 *     Lanka ablaze), shown in full colour, credited to the organisers and
 *     kept out of the CC credit line (`credit.photo: false`);
 *   · licensed photographs (CC0, public domain, CC BY-SA), lightly graded,
 *     whose authors and licences are rendered from PLATE_CREDITS wherever a
 *     plate is shown.
 * Every file is a same-origin WebP bundled by Vite, in two widths (1920 and
 * 960 px), cover-cropped around `focal`. Sources, licences and treatment are
 * recorded here and in docs/pinaka/ASSETS.md; the untouched originals are not
 * in the repository.
 *
 * Presentation only: nothing here reads data. Consumers go through
 * sources.ts (`w960` on viewports up to 960 px and on the low tier, a
 * 960/1920 `srcset` otherwise) and position the image with
 * `object-position: ${focal.x * 100}% ${focal.y * 100}%`.
 */
import type { World } from '../../config';

import temple1920 from './temple-1920.webp';
import temple960 from './temple-960.webp';
import vanavasa1920 from './vanavasa-1920.webp';
import vanavasa960 from './vanavasa-960.webp';
import setu1920 from './setu-1920.webp';
import setu960 from './setu-960.webp';
import lankaArt1920 from './lanka-art-1920.webp';
import lankaArt960 from './lanka-art-960.webp';
import vijaya1920 from './vijaya-1920.webp';
import vijaya960 from './vijaya-960.webp';

export type PlateKey = World | 'hero';

export interface Plate {
  /** Bundled URL of the 1920 px wide file. */
  w1920: string;
  /** Bundled URL of the 960 px wide file. */
  w960: string;
  /** Intrinsic size of the 1920 px file (the 960 file has the same aspect). */
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
    /**
     * true for a licensed photograph, which is named in the rendered credit
     * line; false for the event's own artwork, which is not.
     */
    photo: boolean;
  };
}

/** The official key art: the temple city on the lake at sunset. */
const TEMPLE: Plate = {
  w1920: temple1920,
  w960: temple960,
  width: 1920,
  height: 926,
  alt: "A golden temple city on a lake at sunset, the sun behind its tallest spire, under a storm sky traced with circuit lines and padlock motifs",
  focal: { x: 0.59, y: 0.66 },
  sun: { x: 0.602, y: 0.68 },
  credit: {
    title: "Pinaka CTF 2026 key art",
    author: "Pinaka CTF · NFSU Chennai",
    license: "Official event artwork",
    licenseUrl: "https://pinakactf.com/",
    sourceUrl: "https://pinakactf.com/",
    photo: false,
  },
};

export const PLATES: Record<PlateKey, Plate> = {
  ayodhya: TEMPLE,
  vanavasa: {
    w1920: vanavasa1920,
    w960: vanavasa960,
    width: 1920,
    height: 1080,
    alt: "Mist rolling over layered forested hills of the Western Ghats at Agumbe, seen through foreground foliage",
    focal: { x: 0.55, y: 0.45 },
    // The light falls from the bright haze above the far ridge.
    sun: { x: 0.5, y: -0.06 },
    credit: {
      title: "Mystic Layers of Agumbe",
      author: "Pradyumnakp",
      license: "CC0",
      licenseUrl: "http://creativecommons.org/publicdomain/zero/1.0/deed.en",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Mystic_Layers_of_Agumbe.jpg",
      photo: true,
    },
  },
  setu: {
    w1920: setu1920,
    w960: setu960,
    width: 1920,
    height: 1080,
    alt: "The chain of limestone shoals between Dhanushkodi and Mannar island, photographed from the International Space Station",
    focal: { x: 0.46, y: 0.42 },
    // Seen from orbit there is no horizon: the light comes down from above.
    sun: { x: 0.62, y: -0.12 },
    credit: {
      title: "Limestone shoals between mainland India and Sri Lanka",
      author: "NASA / ISS Expedition 71",
      license: "Public domain (NASA)",
      licenseUrl: "https://www.nasa.gov/nasa-brand-center/images-and-media/",
      sourceUrl: "https://images.nasa.gov/details/iss071e700080",
      photo: true,
    },
  },
  lanka: {
    w1920: lankaArt1920,
    w960: lankaArt960,
    width: 1920,
    height: 1080,
    alt: "Lanka ablaze: a burning fortress city on a ridge at upper left, smoke and a fire glow over a battlefield of spent arrows",
    // Wide screens show the whole fortress and the fire; a portrait screen
    // keeps the burning gate and the near half of the wall.
    focal: { x: 0.42, y: 0.4 },
    sun: { x: 0.8, y: 0.48 },
    credit: {
      title: "Lanka ablaze — Pinaka CTF 2026 artwork",
      author: "Pinaka CTF · NFSU Chennai",
      license: "Official event artwork",
      licenseUrl: "https://pinakactf.com/",
      sourceUrl: "https://pinakactf.com/",
      photo: false,
    },
  },
  vijaya: {
    w1920: vijaya1920,
    w960: vijaya960,
    width: 1920,
    height: 1080,
    alt: "The sun on the horizon behind the silhouetted domes and spires of Ram ki Paidi, Ayodhya, with birds in the sky",
    focal: { x: 0.63, y: 0.35 },
    sun: { x: 0.627, y: 0.289 },
    credit: {
      title: "Ram ki Paidi",
      author: "AyodhyaDiary",
      license: "CC BY-SA 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Ram_ki_Paidi.jpg",
      photo: true,
    },
  },
  hero: TEMPLE,
};

/**
 * Every licensed photograph once, in world order, for the credit line. The
 * event's own artwork (`photo: false`) is not listed: it carries no CC
 * attribution requirement, and the line names only what it says it names.
 */
export const PLATE_CREDITS: Plate['credit'][] = (Object.keys(PLATES) as PlateKey[])
  .map(k => PLATES[k].credit)
  .filter((c, i, all) => c.photo && all.findIndex(o => o.sourceUrl === c.sourceUrl) === i);
