/**
 * Plate sources — how a plate is put on the page.
 *
 * Shared by the environment (its <img>) and the boot preload (a <link>), so
 * the two always agree and the bytes the preload fetched are the bytes the
 * image then uses. Presentation only: no data is read here.
 *
 * Up to four files per plate: 960, 1920 and (for the paintings) 3840 px
 * wide, and a 9:16 portrait crop. The low tier (≤ 2 GB or ≤ 2 cores, or no
 * WebGL) is served the 960 at any width. A viewport up to 960 CSS px wide is
 * served one file outright, not a srcset (a 3× phone would otherwise pick
 * the 3840): the portrait crop when the screen is upright and the plate has
 * one, the 1920 otherwise. Both decode to about 8 MB; the 960 that used to
 * be served here was stretched five-fold up a tall screen and read as blur
 * now that the veils are light. Everyone else gets `srcset` + `sizes=100vw`,
 * and the browser chooses by viewport width × pixel ratio (a 1440 px
 * desktop takes the 1920, the same desktop at 2× or a 4K screen the 3840).
 */
import { getCapability } from '../../../../components/environment/performance';
import type { Plate } from './index';

/** The plate always covers the viewport. */
export const PLATE_SIZES = '100vw';

export interface PlateSource {
  src: string;
  srcSet?: string;
  sizes?: string;
}

/** The widest viewport that is served the 960 file outright. */
export const PLATE_SMALL_MAX_PX = 960;

function matches(query: string): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(query).matches;
}

function narrowViewport(): boolean {
  return matches(`(max-width: ${PLATE_SMALL_MAX_PX}px)`);
}

/** The `src`/`srcset`/`sizes` an <img> (or a preload) should carry for this plate, on this device. */
export function plateSource(plate: Plate): PlateSource {
  if (getCapability().tier === 'low') return { src: plate.w960 };
  if (narrowViewport()) {
    return { src: plate.portrait && matches('(orientation: portrait)') ? plate.portrait : plate.w1920 };
  }
  return {
    src: plate.w1920,
    srcSet: `${plate.w960} 960w, ${plate.w1920} 1920w${plate.w3840 ? `, ${plate.w3840} 3840w` : ''}`,
    sizes: PLATE_SIZES,
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
