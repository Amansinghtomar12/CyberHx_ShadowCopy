/**
 * Where each station sits on the organisers' map.
 *
 * The drawing is theirs: a parchment Ramayana with the road already dashed
 * from Ayodhya through Chitrakoot, Panchavati, Kishkindha and Rameswaram
 * to Lanka, and every place already named in its own hand. That is why the
 * component over it draws one mark and not a map — the road, the coast and
 * the labels are painted, so the only thing left to say is where the team
 * has got to.
 *
 * Coordinates are fractions of the image, measured off the 1536×1024
 * original by landing a crosshair on each printed dot and checking the
 * result rather than trusting the arithmetic. They are fractions so the
 * mark stays on its dot at every size the plate is drawn at.
 */
import type { StationKey } from './geo';

export interface MapPoint {
  /** 0..1 across the image. */
  x: number;
  /** 0..1 down the image. */
  y: number;
  /** Which side of the dot the mark's label reads from. */
  side: 'left' | 'right';
}

export const MAP_POINTS: Record<StationKey, MapPoint> = {
  ayodhya:    { x: 0.347,  y: 0.2012, side: 'right' },
  chitrakoot: { x: 0.3828, y: 0.2861, side: 'right' },
  panchavati: { x: 0.4036, y: 0.4521, side: 'right' },
  kishkindha: { x: 0.4401, y: 0.582,  side: 'right' },
  rameswaram: { x: 0.4896, y: 0.6973, side: 'right' },
  lanka:      { x: 0.6706, y: 0.8789, side: 'right' },
  // The return is the same city, arrived at from the other direction; the
  // mark reads to its left so it does not sit on the outbound label.
  return:     { x: 0.347,  y: 0.2012, side: 'left' },
};

/** The map's own aspect, so the plate reserves the right box before it loads. */
export const MAP_ASPECT = 1536 / 1024;
