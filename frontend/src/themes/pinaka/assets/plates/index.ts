/**
 * Pinaka theme — photographic plates.
 *
 * One colour-graded photograph per world plus the hero behind the sign-in
 * page and the intro. Every file is a same-origin asset bundled by Vite
 * (1920×1080 and 960×540 WebP, cover-cropped around `focal`). Licences and
 * sources are recorded here and in docs/pinaka/ASSETS.md; the untouched
 * originals are not in the repository.
 *
 * Presentation only: nothing here reads data. Consumers pick `w960` under
 * ~1000px viewports or on the low tier and `w1920` otherwise, and position the
 * image with `object-position: ${focal.x * 100}% ${focal.y * 100}%`.
 */
import type { World } from '../../config';

import ayodhya1920 from './ayodhya-1920.webp';
import ayodhya960 from './ayodhya-960.webp';
import vanavasa1920 from './vanavasa-1920.webp';
import vanavasa960 from './vanavasa-960.webp';
import setu1920 from './setu-1920.webp';
import setu960 from './setu-960.webp';
import lanka1920 from './lanka-1920.webp';
import lanka960 from './lanka-960.webp';
import vijaya1920 from './vijaya-1920.webp';
import vijaya960 from './vijaya-960.webp';
import hero1920 from './hero-1920.webp';
import hero960 from './hero-960.webp';

export type PlateKey = World | 'hero';

export interface Plate {
  /** Bundled URL of the 1920×1080 file. */
  w1920: string;
  /** Bundled URL of the 960×540 file. */
  w960: string;
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
  ayodhya: {
    w1920: ayodhya1920,
    w960: ayodhya960,
    width: 1920,
    height: 1080,
    alt: "Ram ki Paidi on the Sarayu at Deepotsav: lit ghats and temple domes reflected in the river at night",
    focal: { x: 0.45, y: 0.5 },
    credit: {
      title: "Sarayu River night view, Ayodhya 001",
      author: "रूही (Ruhi)",
      license: "CC BY-SA 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Sarayu_River_night_view,_Ayodhya_001.jpg",
      photo: true,
    },
  },
  vanavasa: {
    w1920: vanavasa1920,
    w960: vanavasa960,
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
  setu: {
    w1920: setu1920,
    w960: setu960,
    width: 1920,
    height: 1080,
    alt: "The chain of limestone shoals between Dhanushkodi and Mannar island, photographed from the International Space Station",
    focal: { x: 0.46, y: 0.42 },
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
    w1920: lanka1920,
    w960: lanka960,
    width: 1920,
    height: 1080,
    alt: "Sigiriya rock rising from the forest under a heavy evening sky, seen from Pidurangala",
    focal: { x: 0.5, y: 0.5 },
    credit: {
      title: "Sigiriya, taken from Pidurangala Rock",
      author: "C.J.Hatton",
      license: "CC BY-SA 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Sigiriya,_taken_from_Pidurangala_Rock.jpg",
      photo: true,
    },
  },
  vijaya: {
    w1920: vijaya1920,
    w960: vijaya960,
    width: 1920,
    height: 1080,
    alt: "The sun on the horizon behind the silhouetted domes and spires of Ram ki Paidi, Ayodhya, with birds in the sky",
    focal: { x: 0.63, y: 0.35 },
    credit: {
      title: "Ram ki Paidi",
      author: "AyodhyaDiary",
      license: "CC BY-SA 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Ram_ki_Paidi.jpg",
      photo: true,
    },
  },
  hero: {
    w1920: hero1920,
    w960: hero960,
    width: 1920,
    height: 1080,
    alt: "Dusk over Hampi: the Virupaksha temple tower lit at the left, banana groves and boulder hills below a sky of pink cloud",
    focal: { x: 0.32, y: 0.6 },
    credit: {
      title: "A beautiful sunset in Hampi",
      author: "Albert Paul",
      license: "CC BY-SA 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:A_beautiful_sunset_in_Hampi.jpg",
      photo: true,
    },
  },
};

/** Every photograph once, in world order, for the footer credit line. */
export const PLATE_CREDITS: Plate['credit'][] = (Object.keys(PLATES) as PlateKey[])
  .map(k => PLATES[k].credit)
  .filter((c, i, all) => c.photo && all.findIndex(o => o.sourceUrl === c.sourceUrl) === i);
