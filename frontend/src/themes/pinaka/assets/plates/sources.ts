/**
 * Plate sources — how a plate is put on the page.
 *
 * Shared by the environment (its <img>) and the boot preload (a <link>), so
 * the two always agree and the bytes the preload fetched are the bytes the
 * image then uses. Presentation only: no data is read here.
 *
 * Two files per plate, 960 and 1920 px wide (16:9 photographs, and the
 * official art at its own aspect). The plate always covers the viewport, so
 * the width it is drawn at is not the viewport's width: on a portrait phone
 * a landscape plate is drawn several screens wide and cropped to a slice.
 * `sizes` therefore states the real drawn width (the cover scale of the
 * environment's plate box, which bleeds 24 px each side and 96 px below),
 * and the browser picks by that width × pixel ratio. A 1440 × 900 desktop
 * and a 390 × 844 phone at 2× both take the 1920 file; the 960 file alone
 * would be enlarged four times on that phone and read as a smudge. The low
 * tier (≤ 2 GB or ≤ 2 cores, or no WebGL) is served the 960 outright, at any
 * width, to keep its decoded backing store small.
 */
import { getCapability } from '../../../../components/environment/performance';
import type { Plate } from './index';

/** The environment's plate box bleeds past the viewport by this much (see environment.css). */
const BLEED_X = 24;
const BLEED_Y = 96;

export interface PlateSource {
  src: string;
  srcSet?: string;
  sizes?: string;
}

/** The CSS width the plate is drawn at when it covers this viewport. */
function drawnWidth(plate: Plate): string {
  if (typeof window === 'undefined') return '100vw';
  const w = window.innerWidth + BLEED_X * 2;
  const h = window.innerHeight + BLEED_Y;
  return `${Math.round(Math.max(w, (h * plate.width) / plate.height))}px`;
}

/** The `src`/`srcset`/`sizes` an <img> (or a preload) should carry for this plate, on this device. */
export function plateSource(plate: Plate): PlateSource {
  if (getCapability().tier === 'low') return { src: plate.w960 };
  return {
    src: plate.w1920,
    srcSet: `${plate.w960} 960w, ${plate.w1920} 1920w`,
    sizes: drawnWidth(plate),
  };
}

/** The plate's focal point as a CSS position ("45% 50%"), for object-position and transform-origin. */
export function plateFocal(plate: Plate): string {
  return `${Math.round(plate.focal.x * 100)}% ${Math.round(plate.focal.y * 100)}%`;
}

const PRELOAD_ID = 'pinaka-plate-preload';

/**
 * Ask the browser for one plate now, ahead of the environment that will show
 * it. The <link> carries the same srcset and sizes as the <img> will, so the
 * browser's choice of file is the same and the request is reused rather than
 * duplicated. Calling it again for the same plate is a no-op; for another
 * plate it replaces the hint (there is never more than one).
 */
export function preloadPlate(plate: Plate): void {
  if (typeof document === 'undefined') return;
  const source = plateSource(plate);
  const key = source.srcSet ?? source.src;
  const existing = document.getElementById(PRELOAD_ID) as HTMLLinkElement | null;
  if (existing?.dataset.plate === key) return;
  const link = document.createElement('link');
  link.id = PRELOAD_ID;
  link.rel = 'preload';
  link.as = 'image';
  link.href = source.src;
  // The <img> asks for 'high'; the hint should too, or the browser starts the
  // same bytes at image-low and the image waits for them.
  link.setAttribute('fetchpriority', 'high');
  if (source.srcSet && source.sizes) {
    link.setAttribute('imagesrcset', source.srcSet);
    link.setAttribute('imagesizes', source.sizes);
  }
  link.dataset.plate = key;
  if (existing) existing.replaceWith(link);
  else document.head.appendChild(link);
}
