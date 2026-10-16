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
import type { ChapterId } from '../../chapters/config';

export interface MapPoint {
  /** 0..1 across the image. */
  x: number;
  /** 0..1 down the image. */
  y: number;
  /** Which side of the dot the mark's label reads from. */
  side: 'left' | 'right';
}

/**
 * One point per chapter, because the chapter is what the whole skin counts
 * in: the rail at the top of the board, the list beside this map and the
 * mark on it all read the same six states now. The map prints more places
 * than that — Chitrakoot, Videha, the return — and they stay printed; the
 * journey simply does not stop at them.
 */
export const CHAPTER_POINTS: Record<ChapterId, MapPoint> = {
  ayodhya:    { x: 0.347,  y: 0.2012, side: 'right' },
  mithila:    { x: 0.5658, y: 0.2617, side: 'right' },
  // Vanvaas is the forest; Panchavati is where the map names it.
  vanvaas:    { x: 0.4036, y: 0.4521, side: 'right' },
  kishkindha: { x: 0.4401, y: 0.582,  side: 'right' },
  // Setu Bandhan is the causeway; Rameswaram is the shore it leaves from.
  setu:       { x: 0.4896, y: 0.6973, side: 'right' },
  lanka:      { x: 0.6706, y: 0.8789, side: 'right' },
};

/** The map's own aspect, so the plate reserves the right box before it loads. */
export const MAP_ASPECT = 1536 / 1024;
