/**
 * Pinaka theme — world plates.
 *
 * One picture per world plus the hero behind the sign-in page and the intro:
 * the official event paintings — the temple-city key art for Ayodhya, the
 * bridge to the far shore (Setu), the return (Vijaya) and the hero, Lanka
 * ablaze for Lanka — and one colour-graded photograph, the forest of
 * Vanavasa.
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

/** The official Pinaka CTF 2026 key art: the golden temple-city on the water. */
const TEMPLE_ART: Plate = {
  w3840: temple3840,
  w1920: temple1920,
  w960: temple960,
  portrait: templePortrait,
  width: 1920,
  height: 926,
  alt: "Pinaka CTF key art: a golden temple-city on a lake at sunset, its spires reflected in the water under glowing cyber-lock sigils",
  focal: { x: 0.59, y: 0.66 },
  credit: {
    title: "Pinaka CTF 2026 key art",
    author: "Pinaka CTF · NFSU Chennai",
    license: "Official event artwork",
    licenseUrl: "https://pinakactf.com/",
    sourceUrl: "https://pinakactf.com/",
    photo: false,
  },
};

export type PlateKey = World | 'hero';

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
    alt: "Mist rolling over layered forested hills of the Western Ghats at Agumbe, seen through foreground foliage",
    focal: { x: 0.55, y: 0.45 },
    credit: {
      title: "Mystic Layers of Agumbe",
      author: "Pradyumnakp",
      license: "CC0",
      licenseUrl: "http://creativecommons.org/publicdomain/zero/1.0/deed.en",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Mystic_Layers_of_Agumbe.jpg",
      photo: true,
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
    focal: { x: 0.55, y: 0.42 },
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
};

/** Every photograph once, in world order, for the footer credit line. */
export const PLATE_CREDITS: Plate['credit'][] = (Object.keys(PLATES) as PlateKey[])
  .map(k => PLATES[k].credit)
  .filter((c, i, all) => c.photo && all.findIndex(o => o.sourceUrl === c.sourceUrl) === i);
