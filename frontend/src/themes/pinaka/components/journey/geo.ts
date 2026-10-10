/**
 * Journey map geography — India and Sri Lanka, seven stations, one road.
 *
 * Generated from Natural Earth 1:10m 'Admin 0 – Countries', India point of
 * view (public domain, naturalearthdata.com): India is drawn whole, with the
 * boundaries the Government of India recognises — Jammu and Kashmir and
 * Ladakh in full, Arunachal Pradesh, the Andaman and Nicobar Islands. Built
 * by a script; do not hand-edit the path data. Projection: equirectangular
 * with the x scale multiplied by cos(21.3°) (the map's mid-latitude), fitted
 * so lon 66..98.2 E and lat 5..37.6 N fill the viewBox with a 24px margin,
 * centred. Coastlines are simplified (Douglas–Peucker 0.08°, 0.02° around
 * the Palk Strait) and rounded to 0.1px; islands under 0.05 deg² are dropped,
 * except India's (0.002 deg²) and Sri Lanka's (0.004 deg²). Lakshadweep's
 * islets, each far below a pixel, are drawn as small dots where they lie.
 *
 * Pure data and one pure function. Nothing here reads the DOM or the network.
 */
import type { World } from '../../config';

export const MAP_VIEWBOX = '0 0 720 780';
export const MAP_WIDTH = 720;
export const MAP_HEIGHT = 780;

/* Projection constants — the same fit the generator used, so project() lands
   on the baked coordinates (to within the 0.1px rounding). */
const LON_MIN = 66.0;
const LON_MAX = 98.2;
const LAT_MIN = 5.0;
const LAT_MAX = 37.6;
const MARGIN = 24;
const KX = Math.cos((21.3 * Math.PI) / 180);
const SCALE = Math.min(
  (MAP_WIDTH - 2 * MARGIN) / ((LON_MAX - LON_MIN) * KX),
  (MAP_HEIGHT - 2 * MARGIN) / (LAT_MAX - LAT_MIN),
);
const OFFSET_X = (MAP_WIDTH - (LON_MAX - LON_MIN) * KX * SCALE) / 2;
const OFFSET_Y = (MAP_HEIGHT - (LAT_MAX - LAT_MIN) * SCALE) / 2;

/** Longitude/latitude (degrees) to viewBox coordinates. */
export function project(lon: number, lat: number): { x: number; y: number } {
  return {
    x: OFFSET_X + (lon - LON_MIN) * KX * SCALE,
    y: OFFSET_Y + (LAT_MAX - lat) * SCALE,
  };
}



export type StationKey = 'ayodhya' | 'chitrakoot' | 'panchavati' | 'kishkindha' | 'rameswaram' | 'lanka' | 'return';

export interface Station {
  key: StationKey;
  /** The chapter the station belongs to. */
  world: World;
  /** The real place the station is pinned to. */
  place: string;
  lon: number;
  lat: number;
  x: number;
  y: number;
}

/** The seven stations in order. x/y are project(lon, lat) rounded to 0.1, and
    the route's Bezier knots use exactly these values, so every station sits on
    the path. The last is Ayodhya again: the return. */
export const STATIONS: Station[] = [
  { key: 'ayodhya', world: 'ayodhya', place: 'Ayodhya', lon: 82.20, lat: 26.80, x: 362.1, y: 266.8 },
  { key: 'chitrakoot', world: 'vanavasa', place: 'Chitrakoot', lon: 80.87, lat: 25.20, x: 334.3, y: 302.6 },
  { key: 'panchavati', world: 'vanavasa', place: 'Panchavati', lon: 73.79, lat: 19.99, x: 186.6, y: 419.3 },
  { key: 'kishkindha', world: 'vanavasa', place: 'Kishkindha', lon: 76.46, lat: 15.33, x: 242.3, y: 523.7 },
  { key: 'rameswaram', world: 'setu', place: 'Rameswaram', lon: 79.31, lat: 9.29, x: 301.8, y: 659 },
  { key: 'lanka', world: 'lanka', place: 'Lanka', lon: 80.76, lat: 7.95, x: 332, y: 689 },
  { key: 'return', world: 'vijaya', place: 'Ayodhya', lon: 82.20, lat: 26.80, x: 362.1, y: 266.8 },
];

/**
 * The road, as one smooth loop of cubic Beziers (centripetal Catmull–Rom
 * through the knots): Ayodhya → Chitrakoot → Panchavati → Kishkindha (Hampi)
 * → Rameswaram → across the strait → Lanka, then the airborne return bowing
 * out over the Bay of Bengal and back to Ayodhya.
 */

/** Fraction of the route's length (0..1) at which each station sits, in
    STATIONS order. Measured by sampling the curve; use with
    getTotalLength()/getPointAtLength() or stroke-dashoffset. */
export const ROUTE_STATION_T: number[] = [0, 0.0433, 0.2203, 0.3324, 0.4696, 0.5105, 1];

/** A few gentle wave hairlines, hand-placed in open water away from the road. */
