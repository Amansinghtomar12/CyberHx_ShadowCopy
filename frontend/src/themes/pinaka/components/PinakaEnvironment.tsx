/**
 * PinakaEnvironment — the world the Pinaka skin exists inside.
 *
 * Fixed, behind everything, never takes pointer events. It replaces
 * <AmbientBackground/> under the theme and sits in exactly the same place in
 * the stacking order (z-index 0, under .page-shell at z-index 1).
 *
 * WHAT IT DRAWS, BOTTOM TO TOP
 *   sky      a gradient between the world's two sky tokens; the phase cools
 *            it before the event, warms the horizon after
 *   scene    two slots, each holding a plate in full colour (the world's,
 *            or the one the mount point asks for), and over it the light of
 *            that plate: god rays fanning out of the painted sun and a bloom
 *            on the sun itself, graded per world (Ayodhya gold, Vanavasa
 *            green-gold, Setu teal-gold, Lanka ember, Vijaya dawn). A change
 *            of world or plate renders the new scene into the hidden slot,
 *            waits for its plate, then crossfades, so there is never a flash
 *            and never a re-layout
 *   relic    the celestial dharma wheel: the official bronze emblem, large
 *            and in full colour high in the sky, turning once in four
 *            minutes, over Ayodhya and Vijaya on the pages whose content
 *            column leaves it sky (not the board, CSS § Relic). It is not
 *            rendered at all (so not downloaded) below 768 px, where every
 *            page header runs the full width; over burning Lanka; on the
 *            board's own worlds (Vanavasa, Setu), whose event header covers
 *            that sky; or on the sign-in page, whose hero has its own wheel
 *   motes    one animated canvas: luminous gold motes, green-gold flecks or
 *            rising embers, with a few soft bokeh discs and haze bands on
 *            the high tier
 *   veil     the readability guarantee, one layer with the vignette:
 *            darkness only where the interface is dense (the nav band, the
 *            sidebar band on wide screens, the foot, and over the board's
 *            forest the upper half where the category headings stand); the
 *            sky is left to glow
 *
 * THE PLATE
 *   One picture per world (assets/plates): the official event artwork for
 *   Ayodhya and Lanka, licensed photographs elsewhere. A same-origin <img>
 *   covering the viewport with object-position at the plate's focal point.
 *   Over a plate no silhouette strip is painted at all (no canvases, no
 *   backing store); the procedural silhouettes are the fallback for a plate
 *   that fails to load, or a mount that asks for none. A plate that has not
 *   loaded is never shown half-way: a new scene is promoted only once its
 *   image has settled (load, error, or a short wait) and the crossfade is
 *   the only fade it gets. The first scene is on screen from the start, so
 *   its image fades in on its own, briefly, the moment it has loaded (a
 *   plate already in the cache appears at once, with no fade), and a change
 *   that arrives before anything was painted replaces the empty scene
 *   instead of crossfading out of it. On the high tier the plate drifts
 *   very slowly (scale 1.06 → 1 over 40 s, transform only, will-change
 *   dropped once it has settled); no drift on medium or low, nothing at all
 *   when still.
 *
 * THE LIGHT
 *   Anchored on the plate's `sun` (assets/plates), wherever the cover crop
 *   puts it; the fan opens away from it by height: a low sun throws its
 *   shafts up into the sky, a sun mid-frame spreads them wide, one above the
 *   frame lets them fall. The shafts are painted with the plate, in its own
 *   layer, screened over it (no mask, no layer of their own: the falloff and
 *   the fan's edges are black, which a screen leaves untouched). On the high
 *   tier alone one more fan, a few degrees round from the first, breathes in
 *   and out on its own layer (opacity only), so the light seems to swing;
 *   nothing of it exists on any other tier.
 *
 * EVERY SILHOUETTE IS ORIGINAL AND DETERMINISTIC
 *   The city, the forest, the causeway and the fortress are built from a
 *   handful of primitives (a stepped tower profile, a battlemented wall, a
 *   canopy cluster, a stone) by a seeded generator, so a reload draws the
 *   same skyline and the static tier can emit the same shapes as inline SVG.
 *
 * TIERS
 *   high    110 motes (bokeh and haze included), the swinging fan of rays,
 *           the relic turning, scroll + pointer parallax, plate drift
 *   medium  44 motes, still rays, the relic turning, scroll parallax only
 *   static  'still' / 'low' / fx off / reduced motion: no canvases at all,
 *           the plate, rays and relic as a still picture, no loops, no
 *           transitions ('low' is also served the 960 px plate only)
 *
 * Presentation only: props in, pixels out. Nothing here reads data.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useReducedMotion } from 'motion/react';
import { getCapability } from '../../../components/environment/performance';
import { subscribeFx } from '../../../components/environment/fx';
import { WORLDS, type World } from '../config';
import { useMediaQuery, useWorldAttributes, type EventPhase } from '../hooks';
import { PLATES, type Plate, type PlateKey } from '../assets/plates';
import { plateFocal, plateSource } from '../assets/plates/sources';
import { PINAKA_IMAGES } from '../assets/images';

export interface PinakaEnvironmentProps {
  world: World;
  phase: EventPhase;
  /**
   * 'subtle' (default) keeps the bands of veil behind the app's chrome;
   * 'normal' (the sign-in page) lifts them, so the painting is at its most
   * vivid there.
   */
  intensity?: 'subtle' | 'normal';
  /**
   * Which plate stands behind the scene. Defaults to the world's own; a
   * mount point may ask for another (a chapter's art, the sign-in hero);
   * `null` shows the procedural silhouettes alone. A change of plate is a
   * change of scene, crossfaded like a change of world.
   */
  plate?: PlateKey | null;
}

/** The world's display title, for the integrator's aria text. */
export function worldLabel(world: World): string {
  return WORLDS[world].title;
}

type Mode = 'high' | 'medium' | 'static';
type Depth = 'far' | 'mid' | 'near';
type Slot = 'a' | 'b';
/** The plate and its light move with the far layer; the keys of `depthEls` name any of them. */
type Layer = Depth | 'plate' | 'rays';
/** 'none' when the scene has no plate; 'failed' falls back to the silhouettes. */
type PlateStatus = 'loading' | 'ready' | 'failed' | 'none';

const DEPTHS: readonly Depth[] = ['far', 'mid', 'near'];

/* ── Layout constants ──────────────────────────────────────────────────────
 * Each depth layer is a strip pinned to the bottom of the viewport, wider and
 * taller than it needs to be so parallax never exposes an edge. */
const BLEED_X = 24;
const BLEED_Y = 96;
/** Visible height of each depth strip, as a fraction of the viewport. */
const VISIBLE: Record<Depth, number> = { far: 0.58, mid: 0.5, near: 0.42 };
/** Scroll parallax factor per depth, clamped so the strip never leaves its bleed. */
const SCROLL_K: Record<Depth, number> = { far: 0.02, mid: 0.05, near: 0.09 };
const SCROLL_MAX = 88;
/** Pointer parallax, high tier only: the near layer moves at most 6px. */
const POINTER_K: Record<Depth, number> = { far: 0.25, mid: 0.55, near: 1 };
const POINTER_MAX_X = 6;
const POINTER_MAX_Y = 3;
/** How long the scene crossfade takes; must match environment.css. */
const FADE_MS = 1200;
/**
 * How long a new scene waits for its plate before it is shown anyway (the
 * plate then fades in on its own when it arrives). Long enough for a cold
 * fetch on a slow link, short enough that a stalled image never holds the
 * world change hostage.
 */
const PLATE_WAIT_MS = 2500;
const FRAME_MS = 1000 / 30;

/**
 * Where the relic is drawn at all. Below 768 px every page header runs the
 * full width of the screen, so the wheel could only stand behind a title;
 * there it is not rendered (and its image not fetched). It belongs to the
 * open sky of Ayodhya and Vijaya; Lanka's light is the fire, and Vanavasa and
 * Setu are worlds of the board alone, whose event header covers that sky.
 */
const RELIC_MEDIA = '(min-width: 48rem)';
const RELIC_WORLDS: Record<World, boolean> = { ayodhya: true, vijaya: true, vanavasa: false, setu: false, lanka: false };

function layerDepth(layer: Layer): Depth {
  return layer === 'plate' || layer === 'rays' ? 'far' : layer;
}

function layerHeight(depth: Depth, vh: number): number {
  return Math.round(vh * VISIBLE[depth]) + BLEED_Y;
}

function detectMode(): Mode {
  const cap = getCapability();
  if (cap.tier === 'high') return 'high';
  if (cap.tier === 'medium') return 'medium';
  return 'static';
}

/**
 * Scene canvases never need more than 1.5× — silhouettes are soft-edged by
 * design — and on the medium tier 1× is indistinguishable at a fraction of
 * the backing-store memory (three strips plus the motes, doubled while a
 * crossfade holds both scenes).
 */
function canvasDpr(): number {
  const cap = getCapability();
  return Math.min(window.devicePixelRatio || 1, cap.dpr, cap.tier === 'high' ? 1.5 : 1);
}

function readViewport(): { w: number; h: number } {
  if (typeof window === 'undefined') return { w: 1280, h: 800 };
  return { w: window.innerWidth, h: window.innerHeight };
}

/* ── Palette ─────────────────────────────────────────────────────────────── */

interface Palette {
  far: string;
  mid: string;
  near: string;
  /** Hairline of light on the near layer, on the sun side. */
  rim: string;
  lamp: string;
  /** Particle colour as "r,g,b". */
  mote: string;
  /** Haze band colour as "r,g,b". */
  haze: string;
  /** Where the light comes from, 0..1 across the viewport. */
  sunX: number;
}

const PALETTE: Record<World, Palette> = {
  ayodhya:  { far: '#0a0c15', mid: '#0e1019', near: '#13141e', rim: 'rgba(235, 203, 132, 0.4)',  lamp: '#f6dfa3', mote: '235,203,132', haze: '227,187,102', sunX: 0.62 },
  vanavasa: { far: '#070e0e', mid: '#0a1412', near: '#0e1915', rim: 'rgba(176, 204, 140, 0.24)', lamp: '#ebcb84', mote: '190,205,120', haze: '120,170,120', sunX: 0.5 },
  setu:     { far: '#0a1220', mid: '#0c1829', near: '#141a26', rim: 'rgba(235, 203, 132, 0.42)', lamp: '#f6dfa3', mote: '235,203,132', haze: '110,150,200', sunX: 0.5 },
  lanka:    { far: '#0d0910', mid: '#150b12', near: '#1b1016', rim: 'rgba(240, 140, 90, 0.4)',   lamp: '#ff9a5a', mote: '245,130,80',  haze: '180,70,60',   sunX: 0.4 },
  vijaya:   { far: '#1d1a1c', mid: '#2a2321', near: '#372d23', rim: 'rgba(246, 223, 163, 0.6)',  lamp: '#fff0c8', mote: '246,223,163', haze: '235,203,132', sunX: 0.5 },
};

/** Setu-only: the water plane and the sun's threads on it. */
const SETU_WATER = '#0b1526';
const GOLD = '#e3bb66';
const EMBER = 'rgba(255, 140, 80, 0.6)';

/* ── Seeded randomness ───────────────────────────────────────────────────── */

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Vijaya is Ayodhya after the return: the same city, so the same seed. */
const SEED: Record<World, number> = { ayodhya: 0x5a1a, vanavasa: 0x7e57, setu: 0x3e70, lanka: 0x1a9a, vijaya: 0x5a1a };
const DEPTH_SALT: Record<Depth, number> = { far: 0x101, mid: 0x202, near: 0x303 };

/* ── Geometry ────────────────────────────────────────────────────────────── */

type Shape =
  | { t: 'poly'; p: number[]; f: string }
  | { t: 'ell'; x: number; y: number; rx: number; ry: number; f: string }
  /** A lamp point: a bright core and a soft halo. */
  | { t: 'lamp'; x: number; y: number; r: number; f: string }
  /** A one-pixel thread of light (reflections on water, the horizon). */
  | { t: 'thread'; x: number; y: number; w: number; f: string; a: number }
  /** A soft light wedge; `f` is "r,g,b", fades from `a` at its top to 0. */
  | { t: 'beam'; p: number[]; f: string; a: number };

interface LayerGeom {
  W: number;
  H: number;
  shapes: Shape[];
  rim: { f: string; dx: number; dy: number } | null;
}

/** Everything a generator needs, plus the lists it fills. */
interface Gen {
  W: number;
  H: number;
  /** y of the viewport's bottom edge inside this strip. */
  base: number;
  /** One vh in pixels. */
  u: number;
  rnd: () => number;
  sunX: number;
  pal: Palette;
  shapes: Shape[];
  /** Candidate lamp positions (x, y pairs) collected while building. */
  lamps: number[];
}

const poly = (p: number[], f: string): Shape => ({ t: 'poly', p, f });

function rectPts(x: number, y: number, w: number, h: number): number[] {
  return [x, y, x + w, y, x + w, y + h, x, y + h];
}

/** Polygon from a half-width profile (hw, y pairs, bottom to top) and an apex. */
function fromProfile(x: number, prof: number[], apexY: number): number[] {
  const pts: number[] = [];
  for (let i = 0; i < prof.length; i += 2) pts.push(x - prof[i], prof[i + 1]);
  pts.push(x, apexY);
  for (let i = prof.length - 2; i >= 0; i -= 2) pts.push(x + prof[i], prof[i + 1]);
  return pts;
}

/** A shikhara: a tapering stepped tower with a ribbed disc and a finial. */
function shikhara(x: number, base: number, w: number, h: number, rnd: () => number, lamps: number[]): number[] {
  const prof: number[] = [];
  let y = base;
  let hw = w / 2;
  prof.push(hw, y);
  y -= h * 0.1; prof.push(hw, y);                 // plinth
  hw *= 0.86; prof.push(hw, y);
  const steps = 3 + Math.floor(rnd() * 4);
  const stepH = (h * 0.68) / steps;
  for (let i = 0; i < steps; i++) {
    y -= stepH;
    prof.push(hw, y);
    lamps.push(x - hw, y, x + hw, y);              // ledge corners catch lamps
    hw *= 0.78 + rnd() * 0.08;
    prof.push(hw, y);
  }
  const disc = hw * 1.5;                           // amalaka
  prof.push(disc, y); y -= h * 0.05; prof.push(disc, y);
  prof.push(hw * 0.4, y); y -= h * 0.07; prof.push(hw * 0.4, y);   // kalasha neck
  prof.push(hw * 0.12, y);
  return fromProfile(x, prof, base - h);
}

/** A dome on a drum, with a small finial. */
function dome(G: Gen, x: number, base: number, w: number, h: number, f: string) {
  const drumH = h * 0.5;
  G.shapes.push(poly(rectPts(x - w / 2, base - drumH, w, drumH), f));
  G.lamps.push(x - w / 2, base - drumH, x + w / 2, base - drumH);
  G.shapes.push({ t: 'ell', x, y: base - drumH, rx: w * 0.54, ry: h * 0.42, f });
  const top = base - drumH - h * 0.42;
  G.shapes.push(poly([x - w * 0.05, top + 1, x, top - h * 0.1, x + w * 0.05, top + 1], f));
}

/** A battlemented wall from x0 to x1; lamps sit in every third gap. */
function wall(G: Gen, x0: number, x1: number, base: number, h: number, mw: number, mh: number, f: string) {
  const top = base - h;
  const pts: number[] = [x0, base, x0, top];
  let i = 0;
  for (let x = x0; x < x1; x += mw * 2, i++) {
    const xe = Math.min(x + mw, x1);
    pts.push(x, top, x, top - mh, xe, top - mh, xe, top);
    if (i % 3 === 1 && x + mw * 1.5 < x1) G.lamps.push(x + mw * 1.5, top);
  }
  pts.push(x1, top, x1, base);
  G.shapes.push(poly(pts, f));
}

/** A pillared pavilion: plinth, columns, sloping eaves and a small dome. */
function pavilion(G: Gen, x: number, base: number, w: number, h: number, f: string) {
  const plinthH = h * 0.12;
  G.shapes.push(poly(rectPts(x - w / 2 - h * 0.05, base - plinthH, w + h * 0.1, plinthH), f));
  const roofB = base - h * 0.72;
  const roofT = base - h * 0.84;
  const cols = 3 + Math.floor(G.rnd() * 3);
  const colW = Math.max(1.5, w * 0.055);
  for (let i = 0; i < cols; i++) {
    const cx = x - w / 2 + colW / 2 + (i * (w - colW)) / (cols - 1);
    G.shapes.push(poly(rectPts(cx - colW / 2, roofB, colW, base - plinthH - roofB), f));
  }
  const eave = h * 0.14;
  G.shapes.push(poly([x - w / 2 - eave, roofB, x - w / 2, roofT, x + w / 2, roofT, x + w / 2 + eave, roofB], f));
  G.lamps.push(x - w / 2 - eave, roofB, x + w / 2 + eave, roofB);
  G.shapes.push({ t: 'ell', x, y: roofT, rx: w * 0.2, ry: h * 0.12, f });
  G.shapes.push(poly([x - 1, roofT - h * 0.11, x, roofT - h * 0.18, x + 1, roofT - h * 0.11], f));
}

/** A tower with a crenellated top and a slight taper (the fortress idiom). */
function keep(G: Gen, x: number, base: number, w: number, h: number, f: string) {
  const top = base - h;
  const hwB = w / 2;
  const hwT = w * 0.46;
  const mw = Math.max(2, w * 0.14);
  const mh = Math.max(2, h * 0.05);
  const pts: number[] = [x - hwB, base, x - hwT, top];
  for (let cx = x - hwT; cx < x + hwT; cx += mw * 2) {
    const xe = Math.min(cx + mw, x + hwT);
    pts.push(cx, top, cx, top - mh, xe, top - mh, xe, top);
  }
  pts.push(x + hwT, top, x + hwB, base);
  G.shapes.push(poly(pts, f));
  G.lamps.push(x - hwT * 0.5, top, x + hwT * 0.5, top);
}

/** A banner: a pole and a thin triangle streaming away from the sun. */
function banner(G: Gen, x: number, y: number, h: number, f: string) {
  const dir = G.sunX > x ? -1 : 1;
  G.shapes.push(poly(rectPts(x - 0.6, y - h, 1.2, h), f));
  const fl = h * 0.55;
  G.shapes.push(poly([x, y - h, x + dir * fl, y - h + fl * 0.22, x, y - h + fl * 0.42], f));
}

/** A tree canopy: a cluster of overlapping rounded masses. */
function canopy(G: Gen, x: number, y: number, r: number, f: string) {
  const n = 3 + Math.floor(G.rnd() * 3);
  G.shapes.push({ t: 'ell', x, y, rx: r, ry: r * 0.78, f });
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + G.rnd() * 0.8;
    const d = r * (0.45 + G.rnd() * 0.3);
    const rr = r * (0.5 + G.rnd() * 0.3);
    G.shapes.push({ t: 'ell', x: x + Math.cos(a) * d, y: y + Math.sin(a) * d * 0.7, rx: rr, ry: rr * 0.8, f });
  }
}

/** A tapered trunk. */
function trunk(G: Gen, x: number, base: number, h: number, w: number, f: string) {
  G.shapes.push(poly([x - w / 2, base, x - w * 0.28, base - h, x + w * 0.28, base - h, x + w / 2, base], f));
}

function ground(G: Gen, hz: number, f: string) {
  G.shapes.push(poly(rectPts(-2, hz, G.W + 4, G.H - hz + 2), f));
}

/** Turn the collected candidates into lamps, keeping `density` of them. */
function placeLamps(G: Gen, density: number, r: number) {
  for (let i = 0; i < G.lamps.length; i += 2) {
    if (G.rnd() < density) G.shapes.push({ t: 'lamp', x: G.lamps[i], y: G.lamps[i + 1] - r, r, f: G.pal.lamp });
  }
  G.lamps.length = 0;
}

/* ── Worlds ──────────────────────────────────────────────────────────────── */

/** Ayodhya by night, and Vijaya — the same city with every lamp lit. */
function cityFar(G: Gen, lit: boolean) {
  const { W, base, u, rnd, pal } = G;
  const hz = base - 9 * u;
  for (let x = -2 * u; x < W + 2 * u; x += (2.4 + rnd() * 3) * u) {
    const roll = rnd();
    if (roll < 0.68) G.shapes.push(poly(shikhara(x, hz, (1.6 + rnd() * 1.8) * u, (6 + rnd() * 11) * u, rnd, G.lamps), pal.far));
    else if (roll < 0.86) dome(G, x, hz, (2.4 + rnd() * 2) * u, (4 + rnd() * 3) * u, pal.far);
  }
  // The grand tower stands a little toward the light.
  G.shapes.push(poly(shikhara(W * 0.5 + (G.sunX - W * 0.5) * 0.3, hz, 4.2 * u, 24 * u, rnd, G.lamps), pal.far));
  ground(G, hz, pal.far);
  placeLamps(G, lit ? 0.55 : 0.1, 0.7);
}

function cityMid(G: Gen, lit: boolean) {
  const { W, base, u, rnd, pal } = G;
  const hz = base - 3.5 * u;
  wall(G, -BLEED_X, W + BLEED_X, hz, 5 * u, 0.5 * u, 0.55 * u, pal.mid);
  for (let x = rnd() * 10 * u; x < W; x += (13 + rnd() * 11) * u) {
    if (rnd() < 0.7) G.shapes.push(poly(shikhara(x, hz, (2.8 + rnd() * 1.8) * u, (9 + rnd() * 7) * u, rnd, G.lamps), pal.mid));
    else pavilion(G, x, hz, 5.5 * u, 6.5 * u, pal.mid);
  }
  ground(G, hz, pal.mid);
  placeLamps(G, lit ? 0.9 : 0.25, 0.85);
}

function cityNear(G: Gen, lit: boolean) {
  const { W, base, u, rnd, pal } = G;
  G.shapes.push(poly(shikhara(W * 0.09, base, 7 * u, 22 * u, rnd, G.lamps), pal.near));
  G.shapes.push(poly(shikhara(W * 0.91, base, 6.2 * u, 19 * u, rnd, G.lamps), pal.near));
  pavilion(G, W * 0.3, base, 9 * u, 9 * u, pal.near);
  pavilion(G, W * 0.66, base, 7.5 * u, 8 * u, pal.near);
  wall(G, -BLEED_X, W + BLEED_X, base, 4.2 * u, 0.9 * u, 0.85 * u, pal.near);
  ground(G, base, pal.near);
  placeLamps(G, lit ? 1 : 0.5, 1);
}

/** Vanavasa: layered canopies, trunks, a path of light. */
function forestFar(G: Gen) {
  const { W, base, u, rnd, pal } = G;
  const hz = base - 12 * u;
  ground(G, hz, pal.far);
  for (let x = -3 * u; x < W + 3 * u; x += (2 + rnd() * 2.2) * u) {
    canopy(G, x, hz - (2 + rnd() * 5) * u, (2 + rnd() * 2.2) * u, pal.far);
  }
}

function forestMid(G: Gen) {
  const { W, base, u, rnd, pal } = G;
  const hz = base - 5 * u;
  ground(G, hz, pal.mid);
  for (let x = -2 * u; x < W + 2 * u; x += (5 + rnd() * 4.5) * u) {
    const h = (8 + rnd() * 8) * u;
    trunk(G, x, hz, h, (0.5 + rnd() * 0.4) * u, pal.mid);
    canopy(G, x, hz - h, (3 + rnd() * 2.5) * u, pal.mid);
  }
}

function forestNear(G: Gen) {
  const { W, H, base, u, rnd, pal } = G;
  // A path of light opens toward the viewer from deep in the forest.
  G.shapes.push({ t: 'beam', p: [W * 0.5 - 1.5 * u, base - 20 * u, W * 0.5 + 1.5 * u, base - 20 * u, W * 0.5 + 15 * u, H, W * 0.5 - 15 * u, H], f: pal.mote, a: 0.14 });
  ground(G, base, pal.near);
  // Great trunks at the edges, their crowns hanging in from the top.
  for (const fx of [0.04, 0.13, 0.87, 0.96]) {
    trunk(G, W * fx, base + 2, 60 * u, (2 + rnd() * 1.2) * u, pal.near);
  }
  canopy(G, W * 0.06, -2 * u, 9 * u, pal.near);
  canopy(G, W * 0.94, -1 * u, 8 * u, pal.near);
  // Low undergrowth along the bottom edge.
  for (let x = -2 * u; x < W + 2 * u; x += (3 + rnd() * 3) * u) {
    if (Math.abs(x - W * 0.5) < 9 * u) continue;             // keep the path open
    canopy(G, x, base - rnd() * u, (1.4 + rnd() * 1.6) * u, pal.near);
  }
}

/** Setu: a calm water horizon, the sun's threads, a causeway of stones. */
function seaFar(G: Gen) {
  const { W, base, u, rnd, pal } = G;
  const hz = base - 34 * u;
  // A far shore of low mounds.
  const pts: number[] = [-2, hz];
  for (let x = -2; x < W + 2; x += 6 * u) pts.push(x, hz - (0.3 + rnd() * 2.4) * u);
  pts.push(W + 2, hz, W + 2, hz + 2, -2, hz + 2);
  G.shapes.push(poly(pts, pal.far));
  // The water plane, and a hairline where it meets the sky.
  G.shapes.push(poly(rectPts(-2, hz, W + 4, G.H - hz + 2), SETU_WATER));
  G.shapes.push({ t: 'thread', x: -2, y: hz, w: W + 4, f: GOLD, a: 0.22 });
}

function seaMid(G: Gen) {
  const { W, base, u, rnd, sunX } = G;
  const hz = base - 34 * u;
  // Reflections: dense and narrow near the horizon, scattered and wide nearer.
  for (let i = 0; i < 84; i++) {
    const d = rnd() ** 1.6;                                   // 0 at the horizon
    const y = hz + 0.4 * u + d * (base - hz);
    const spread = 2 * u + d * 22 * u;
    const x = sunX + (rnd() + rnd() - 1) * spread;
    const w = (0.8 + rnd() * 3) * u * (0.5 + d);
    G.shapes.push({ t: 'thread', x: x - w / 2, y, w, f: GOLD, a: 0.12 + (1 - d) * 0.3 });
  }
  for (let i = 0; i < 10; i++) {
    const y = hz + rnd() * (base - hz);
    const w = (6 + rnd() * 12) * u;
    G.shapes.push({ t: 'thread', x: rnd() * W - w / 2, y, w, f: GOLD, a: 0.06 });
  }
}

function seaNear(G: Gen) {
  const { W, base, u, rnd, pal } = G;
  const hz = base - 34 * u;
  // Stones recede toward the vanishing point just right of centre.
  const vx = W * 0.54;
  for (let i = 15; i >= 0; i--) {
    const k = 1 / (1 + i * 0.5);
    const y = hz + (base + 3 * u - hz) * k;
    const rx = 7.5 * u * k * (0.85 + rnd() * 0.3);
    const ry = rx * 0.32;
    const x = vx + (W * 0.5 - vx) * k + Math.sin(i * 0.9) * 2.5 * u * k;
    G.shapes.push({ t: 'thread', x: x - rx * 0.7, y: y + ry * 0.9, w: rx * 1.4, f: GOLD, a: 0.18 * k + 0.04 });
    G.shapes.push({ t: 'ell', x, y, rx, ry, f: pal.near });
  }
  // Two boulders at the shore's edge.
  G.shapes.push({ t: 'ell', x: W * 0.12, y: base + 2 * u, rx: 13 * u, ry: 5 * u, f: pal.near });
  G.shapes.push({ t: 'ell', x: W * 0.9, y: base + 3 * u, rx: 11 * u, ry: 4.5 * u, f: pal.near });
}

/** Lanka: a fortress — walls, keeps, a gate lit from behind, banners. */
function fortFar(G: Gen) {
  const { W, base, u, rnd, pal } = G;
  const hz = base - 12 * u;
  const pts: number[] = [-2, hz];
  for (let x = -2; x < W + 2; x += (3 + rnd() * 3) * u) pts.push(x, hz - (2 + rnd() * 8) * u);
  pts.push(W + 2, hz);
  G.shapes.push(poly(pts, pal.far));
  ground(G, hz, pal.far);
}

function fortMid(G: Gen) {
  const { W, base, u, rnd, pal } = G;
  const hz = base - 4 * u;
  wall(G, -BLEED_X, W + BLEED_X, hz, 9 * u, 0.8 * u, 1 * u, pal.mid);
  for (let x = rnd() * 12 * u; x < W; x += (16 + rnd() * 10) * u) {
    const h = (14 + rnd() * 6) * u;
    keep(G, x, hz, (4 + rnd() * 2) * u, h, pal.mid);
    if (rnd() < 0.5) banner(G, x, hz - h, 3 * u, pal.mid);
  }
  ground(G, hz, pal.mid);
  placeLamps(G, 0.15, 0.8);
}

function fortNear(G: Gen) {
  const { W, base, u, pal } = G;
  const cx = W * 0.5;
  // The gate: two keeps flanking a wall, with an ember-lit opening.
  keep(G, cx - 8 * u, base, 7 * u, 21 * u, pal.near);
  keep(G, cx + 8 * u, base, 7 * u, 21 * u, pal.near);
  G.shapes.push(poly(rectPts(cx - 5 * u, base - 13 * u, 10 * u, 13 * u), pal.near));
  G.shapes.push({ t: 'lamp', x: cx, y: base - 4 * u, r: 2.4 * u, f: '#ff8a5a' });
  G.shapes.push(poly(rectPts(cx - 2.2 * u, base - 5 * u, 4.4 * u, 5 * u), EMBER));
  G.shapes.push({ t: 'ell', x: cx, y: base - 5 * u, rx: 2.2 * u, ry: 2.4 * u, f: EMBER });
  banner(G, cx - 8 * u, base - 21 * u, 3.6 * u, pal.near);
  banner(G, cx + 8 * u, base - 21 * u, 3.6 * u, pal.near);
  // The outer wall and the corner keeps.
  wall(G, -BLEED_X, W + BLEED_X, base, 6 * u, 1.2 * u, 1.2 * u, pal.near);
  keep(G, W * 0.08, base, 9 * u, 17 * u, pal.near);
  keep(G, W * 0.93, base, 8 * u, 15 * u, pal.near);
  ground(G, base, pal.near);
  placeLamps(G, 0.3, 0.9);
}

const GENERATORS: Record<World, Record<Depth, (G: Gen) => void>> = {
  ayodhya:  { far: G => cityFar(G, false), mid: G => cityMid(G, false), near: G => cityNear(G, false) },
  vijaya:   { far: G => cityFar(G, true),  mid: G => cityMid(G, true),  near: G => cityNear(G, true) },
  vanavasa: { far: forestFar, mid: forestMid, near: forestNear },
  setu:     { far: seaFar,    mid: seaMid,    near: seaNear },
  lanka:    { far: fortFar,   mid: fortMid,   near: fortNear },
};

/** Build one depth strip of one world, for a given viewport. Pure. */
function layerGeometry(world: World, depth: Depth, vw: number, vh: number): LayerGeom {
  const pal = PALETTE[world];
  const W = vw + BLEED_X * 2;
  const base = Math.round(vh * VISIBLE[depth]);
  const H = base + BLEED_Y;
  const G: Gen = {
    W, H, base,
    u: vh / 100,
    rnd: mulberry32(SEED[world] ^ DEPTH_SALT[depth]),
    sunX: BLEED_X + vw * pal.sunX,
    pal,
    shapes: [],
    lamps: [],
  };
  GENERATORS[world][depth](G);
  const rim = depth === 'near' ? { f: pal.rim, dx: G.sunX > W / 2 ? 1.25 : -1.25, dy: -1 } : null;
  return { W, H, shapes: G.shapes, rim };
}

/* ── Renderers ───────────────────────────────────────────────────────────── */

function tracePoly(ctx: CanvasRenderingContext2D, p: number[]) {
  ctx.beginPath();
  ctx.moveTo(p[0], p[1]);
  for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]);
  ctx.closePath();
}

/** Draw a layer once. No shadowBlur: the halos are gradients. */
function paintLayer(canvas: HTMLCanvasElement, geom: LayerGeom, dpr: number) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  canvas.width = Math.round(geom.W * dpr);
  canvas.height = Math.round(geom.H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, geom.W, geom.H);

  // Rim light: the solids once more, nudged toward the sun, under themselves.
  if (geom.rim) {
    ctx.save();
    ctx.translate(geom.rim.dx, geom.rim.dy);
    ctx.fillStyle = geom.rim.f;
    for (const s of geom.shapes) {
      if (s.t === 'poly') { tracePoly(ctx, s.p); ctx.fill(); }
      else if (s.t === 'ell') { ctx.beginPath(); ctx.ellipse(s.x, s.y, s.rx, s.ry, 0, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.restore();
  }

  for (const s of geom.shapes) {
    switch (s.t) {
      case 'poly':
        ctx.fillStyle = s.f;
        tracePoly(ctx, s.p);
        ctx.fill();
        break;
      case 'ell':
        ctx.fillStyle = s.f;
        ctx.beginPath();
        ctx.ellipse(s.x, s.y, s.rx, s.ry, 0, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'lamp': {
        const halo = s.r * 4;
        const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, halo);
        g.addColorStop(0, s.f);
        g.addColorStop(0.3, s.f + '55');
        g.addColorStop(1, s.f + '00');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(s.x, s.y, halo, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'thread':
        ctx.globalAlpha = s.a;
        ctx.fillStyle = s.f;
        ctx.fillRect(s.x, s.y, s.w, 1);
        ctx.globalAlpha = 1;
        break;
      case 'beam': {
        let top = Infinity, bottom = -Infinity;
        for (let i = 1; i < s.p.length; i += 2) { top = Math.min(top, s.p[i]); bottom = Math.max(bottom, s.p[i]); }
        const g = ctx.createLinearGradient(0, top, 0, bottom);
        g.addColorStop(0, `rgba(${s.f},${s.a})`);
        g.addColorStop(1, `rgba(${s.f},0)`);
        ctx.fillStyle = g;
        tracePoly(ctx, s.p);
        ctx.fill();
        break;
      }
    }
  }
}

function pointsAttr(p: number[]): string {
  let out = '';
  for (let i = 0; i < p.length; i += 2) out += `${p[i].toFixed(1)},${p[i + 1].toFixed(1)} `;
  return out;
}

/** The static tier's silhouettes: the same geometry as inline SVG. */
function LayerSvg({ geom }: { geom: LayerGeom }) {
  const solids = geom.shapes.filter(s => s.t === 'poly' || s.t === 'ell');
  return (
    <svg className="pk-env-svg" viewBox={`0 0 ${geom.W} ${geom.H}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
      {geom.rim && (
        <g fill={geom.rim.f} transform={`translate(${geom.rim.dx} ${geom.rim.dy})`}>
          {solids.map((s, i) =>
            s.t === 'poly'
              ? <polygon key={i} points={pointsAttr(s.p)} />
              : s.t === 'ell' ? <ellipse key={i} cx={s.x} cy={s.y} rx={s.rx} ry={s.ry} /> : null,
          )}
        </g>
      )}
      {geom.shapes.map((s, i) => {
        switch (s.t) {
          case 'poly': return <polygon key={i} points={pointsAttr(s.p)} fill={s.f} />;
          case 'ell': return <ellipse key={i} cx={s.x} cy={s.y} rx={s.rx} ry={s.ry} fill={s.f} />;
          case 'lamp': return (
            <g key={i} fill={s.f}>
              <circle cx={s.x} cy={s.y} r={s.r * 3.5} opacity={0.16} />
              <circle cx={s.x} cy={s.y} r={s.r} opacity={0.95} />
            </g>
          );
          case 'thread': return <rect key={i} x={s.x} y={s.y} width={s.w} height={1} fill={s.f} opacity={s.a} />;
          case 'beam': return <polygon key={i} points={pointsAttr(s.p)} fill={`rgb(${s.f})`} opacity={s.a * 0.5} />;
        }
      })}
    </svg>
  );
}

function LayerCanvas({ geom, dpr }: { geom: LayerGeom; dpr: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  // Layout effect: the strip is painted before the browser shows the commit,
  // so a freshly mounted scene never flashes empty under its fade-in.
  useLayoutEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    paintLayer(canvas, geom, dpr);
    return () => { canvas.width = 0; canvas.height = 0; };
  }, [geom, dpr]);
  return <canvas ref={ref} className="pk-env-canvas" />;
}

/**
 * One strip of a scene: the fallback when the scene has no plate (or its
 * plate failed). Over a plate nothing is painted at all.
 */
function SceneLayer({ world, depth, mode, vw, vh }: {
  world: World; depth: Depth; mode: Mode; vw: number; vh: number;
}) {
  const geom = useMemo(() => layerGeometry(world, depth, vw, vh), [world, depth, vw, vh]);
  if (mode === 'static') return <LayerSvg geom={geom} />;
  return <LayerCanvas geom={geom} dpr={canvasDpr()} />;
}

/* ── Light: where the sun stands on screen ───────────────────────────────── */

interface SunPoint {
  /** Viewport px. */
  x: number;
  y: number;
  /** Radius the rays need to reach the farthest corner of the viewport. */
  r: number;
  /** The fan: where it opens (0deg = straight up, clockwise) and how wide. */
  from: number;
  span: number;
}

/**
 * Which way the light opens, from how high the sun stands on screen
 * (0 = top edge, 1 = bottom): a sun low on the horizon throws its shafts up
 * into the sky; one in the middle of the frame spreads them wide and a
 * little down; one high in the sky sheds them all round; light from above
 * the frame falls down into it. The fan is centred on "up" or "down" and
 * its edges are soft (environment.css), so the bands blend.
 */
function fanFor(fy: number): { from: number; span: number } {
  if (fy < 0) return { from: 180 - 75, span: 150 };
  if (fy < 0.25) return { from: 0, span: 360 };
  if (fy < 0.55) return { from: -135, span: 270 };
  return { from: -100, span: 200 };
}

/**
 * Where a plate's light source lands on screen. The plate box bleeds
 * BLEED_X past each side and BLEED_Y below the viewport and is covered by
 * the image at its focal point (object-fit: cover), so the painted sun is
 * found with the same arithmetic the browser uses. This is the plate's own
 * sun whatever world it is shown in (Setu and Vijaya, painted with the
 * temple-city art, take that painting's sunset). Without a plate (or one
 * without a sun) the light is the world's palette sun, low on the horizon.
 */
function sunPoint(world: World, plate: Plate | null, vw: number, vh: number): SunPoint {
  let x = vw * PALETTE[world].sunX;
  let y = vh * 0.7;
  if (plate?.sun) {
    const cw = vw + BLEED_X * 2;
    const ch = vh + BLEED_Y;
    const s = Math.max(cw / plate.width, ch / plate.height);
    const w = plate.width * s;
    const h = plate.height * s;
    x = (cw - w) * plate.focal.x - BLEED_X + plate.sun.x * w;
    y = (ch - h) * plate.focal.y + plate.sun.y * h;
  }
  const r = Math.max(
    Math.hypot(x, y), Math.hypot(vw - x, y),
    Math.hypot(x, vh - y), Math.hypot(vw - x, vh - y),
  );
  return { x: Math.round(x), y: Math.round(y), r: Math.round(r * 1.04), ...fanFor(y / vh) };
}

/** The scene's light as custom properties: the sun, the reach, the fan. */
function sunStyle(sun: SunPoint): CSSProperties {
  return {
    ['--pk-sun-px' as string]: `${sun.x}px`,
    ['--pk-sun-py' as string]: `${sun.y}px`,
    ['--pk-rays-r' as string]: `${sun.r}px`,
    ['--pk-rays-from' as string]: `${sun.from}deg`,
    ['--pk-rays-span' as string]: `${sun.span}deg`,
  };
}

/* ── Plate ───────────────────────────────────────────────────────────────── */

/**
 * The light of a scene: the shafts out of the sun and its bloom, one
 * screened group. Static on every tier; its fan geometry and colour are
 * custom properties of the scene (sunStyle, environment.css § 3).
 */
function SceneLight() {
  return (
    <div className="pk-env-light">
      <div className="pk-env-rays" />
      <div className="pk-env-bloom" />
    </div>
  );
}

/**
 * The picture behind a scene. Decorative (alt="", aria-hidden), never
 * draggable, decoded off the main thread, fetched eagerly because the scene
 * that holds it is waiting for it. It reports once: ready or failed. The
 * wrapper is what parallax moves; inside it the art (the image and its
 * light, painted together in one layer) is what the drift scales, about the
 * focal point, so the slow push ends on the subject and the light stays on
 * the painted sun. `children` (the high tier's swinging fan) sit over the
 * art inside the wrapper, so they move with it.
 */
function PlateLayer({ plate, status, active, vpKey, layerRef, onSettle, children }: {
  plate: Plate;
  status: PlateStatus;
  active: boolean;
  /** Changes with the viewport: `sizes` states the width the plate is drawn at. */
  vpKey: string;
  layerRef: (el: HTMLDivElement | null) => void;
  /** `instant`: the image was already complete when the scene mounted. */
  onSettle: (status: 'ready' | 'failed', instant?: boolean) => void;
  children?: ReactNode;
}) {
  const img = useRef<HTMLImageElement>(null);
  // The drift ran its 40 s: drop the animation (its final frame is the
  // identity) and the will-change with it.
  const [drifted, setDrifted] = useState(false);
  // vpKey stands for the viewport plateSource reads.
  const source = useMemo(() => plateSource(plate), [plate, vpKey]);
  const settle = useRef(onSettle);
  settle.current = onSettle;

  // A plate the preload (or an earlier scene) already fetched can be complete
  // before the load event reaches React; the attribute says so either way.
  // Checked before the first paint, so a cached plate is shown at once, with
  // no fade (the scene is marked `instant`); only on mount, not on a resize.
  const mounted = useRef(false);
  useLayoutEffect(() => {
    const el = img.current;
    if (el && el.complete && el.naturalWidth > 0) settle.current('ready', !mounted.current);
    mounted.current = true;
  }, [source]);

  return (
    <div
      ref={layerRef}
      className="pk-env-plate"
      data-ready={status === 'ready' ? 'true' : 'false'}
      data-drift={drifted ? 'done' : 'on'}
      style={{ ['--pk-plate-focal' as string]: plateFocal(plate) }}
    >
      <div
        className="pk-env-plate-art"
        onAnimationEnd={e => { if (e.target === e.currentTarget) setDrifted(true); }}
      >
        <img
          ref={img}
          src={source.src}
          srcSet={source.srcSet}
          sizes={source.sizes}
          width={plate.width}
          height={plate.height}
          alt=""
          aria-hidden="true"
          draggable={false}
          decoding="async"
          loading="eager"
          fetchPriority={active ? 'high' : 'auto'}
          onLoad={() => settle.current('ready')}
          onError={() => settle.current('failed')}
        />
        <SceneLight />
      </div>
      {children}
    </div>
  );
}

/* ── Motes ───────────────────────────────────────────────────────────────── */

type MoteKind = 'gold' | 'leaf' | 'ember';
const MOTE_KIND: Record<World, MoteKind> = { ayodhya: 'gold', vanavasa: 'leaf', setu: 'gold', lanka: 'ember', vijaya: 'gold' };

/**
 * Each kind of mote in a few tints ("r,g,b"), so a population reads as light
 * rather than as confetti: gold from pale to deep, the forest's green-gold
 * with a little sun in it, embers from blood-orange to yellow flame.
 */
const MOTE_TINTS: Record<MoteKind, readonly string[]> = {
  gold:  ['255,214,130', '255,236,188', '246,184,92'],
  leaf:  ['206,232,140', '255,222,150', '150,212,150'],
  ember: ['255,112,48', '255,168,72', '255,74,40'],
};

/** Mote populations per tier; bokeh discs are part of the high tier's count. */
const MOTES_HIGH = 110;
const MOTES_MEDIUM = 44;
const BOKEH_SHARE = 0.08;

interface Mote {
  x: number; y: number; vx: number; vy: number;
  r: number; a: number; ph: number; fl: number;
  /** Which tint of its kind. */
  tint: number;
  /** A large, faint, slow disc of out-of-focus light. */
  bokeh: boolean;
  /** 0..1 fade-in; counts down when `dying`. */
  life: number;
  dying: boolean;
  kind: MoteKind;
}

interface HazeBand { img: HTMLCanvasElement; x: number; y: number; v: number; a: number; life: number }

interface MoteSystem {
  setWorld(world: World): void;
  destroy(): void;
}

/** A glowing point: a white-hot core, the tint around it, a soft halo. */
function makeSprite(rgb: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const ctx = c.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, 'rgba(255,250,236,1)');
    g.addColorStop(0.14, `rgba(${rgb},0.95)`);
    g.addColorStop(0.38, `rgba(${rgb},0.38)`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 32, 32);
  }
  return c;
}

/** A soft disc with a faint brighter rim, like a highlight thrown out of focus. */
function makeBokeh(rgb: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, `rgba(${rgb},0.55)`);
    g.addColorStop(0.72, `rgba(${rgb},0.7)`);
    g.addColorStop(0.86, `rgba(${rgb},0.9)`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  }
  return c;
}

/** A wide, very soft rectangle of tinted light; drawn once, blitted per frame. */
function makeHaze(rgb: string, w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  const ctx = c.getContext('2d');
  if (ctx) {
    const gx = ctx.createLinearGradient(0, 0, c.width, 0);
    gx.addColorStop(0, `rgba(${rgb},0)`);
    gx.addColorStop(0.5, `rgba(${rgb},1)`);
    gx.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = gx;
    ctx.fillRect(0, 0, c.width, c.height);
    const gy = ctx.createLinearGradient(0, 0, 0, c.height);
    gy.addColorStop(0, 'rgba(0,0,0,0)');
    gy.addColorStop(0.5, 'rgba(0,0,0,1)');
    gy.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalCompositeOperation = 'destination-in';
    ctx.fillStyle = gy;
    ctx.fillRect(0, 0, c.width, c.height);
  }
  return c;
}

function createMotes(
  canvas: HTMLCanvasElement,
  opts: { count: number; haze: boolean; bokeh: boolean; dpr: number; world: World; w: number; h: number },
): MoteSystem | null {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const { count, dpr, w: W, h: H } = opts;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  let world = opts.world;
  let kind = MOTE_KIND[world];
  const kinds: MoteKind[] = ['gold', 'leaf', 'ember'];
  const sprites = {} as Record<MoteKind, HTMLCanvasElement[]>;
  const discs = {} as Record<MoteKind, HTMLCanvasElement[]>;
  for (const k of kinds) {
    sprites[k] = MOTE_TINTS[k].map(makeSprite);
    discs[k] = opts.bokeh ? MOTE_TINTS[k].map(makeBokeh) : [];
  }
  let motes: Mote[] = [];
  let bands: HazeBand[] = [];

  const rnd = Math.random;
  const spawn = (k: MoteKind, fresh: boolean, bokeh = false): Mote => {
    const r = rnd();
    const m: Mote = {
      x: rnd() * W, y: rnd() * H, vx: 0, vy: 0, r: 1, a: 0.5, ph: rnd() * Math.PI * 2, fl: 0,
      tint: Math.floor(rnd() * MOTE_TINTS[k].length), bokeh, life: fresh ? 0 : 1, dying: false, kind: k,
    };
    if (bokeh) {
      // Out of focus, close to the eye: big, faint, barely moving.
      m.r = 8 + r * 12; m.a = 0.09 + rnd() * 0.1;
      m.vy = k === 'leaf' ? 2 + r * 3 : -(2 + r * 4); m.vx = (rnd() - 0.5) * 3;
      m.fl = 0.4 + rnd() * 0.6;
    } else if (k === 'gold') { m.vy = -(6 + r * 14);  m.vx = (rnd() - 0.5) * 5; m.r = 0.9 + r * 2.3; m.a = 0.42 + rnd() * 0.46; m.fl = rnd() < 0.35 ? 1.5 + rnd() * 2.5 : 0; }
    else if (k === 'leaf') { m.vy = 8 + r * 12;     m.vx = (rnd() - 0.5) * 6; m.r = 1 + r * 1.8;   m.a = 0.36 + rnd() * 0.38; }
    else {
      // Embers: they rise fast from below, drift with the heat and flicker.
      m.vy = -(18 + r * 34); m.vx = (rnd() - 0.5) * 10; m.r = 0.7 + r * 1.8; m.a = 0.5 + rnd() * 0.4; m.fl = 5 + rnd() * 8;
      m.y = H * (0.35 + rnd() * 0.65);
    }
    return m;
  };
  const populate = (k: MoteKind, fresh: boolean, n: number) => {
    const nBokeh = opts.bokeh ? Math.round(n * BOKEH_SHARE) : 0;
    for (let i = 0; i < n; i++) motes.push(spawn(k, fresh, i < nBokeh));
  };
  const buildHaze = (rgb: string, fresh: boolean) => {
    bands = [];
    if (!opts.haze) return;
    for (let i = 0; i < 3; i++) {
      const bw = W * (0.55 + i * 0.12);
      const bh = H * 0.12;
      bands.push({
        img: makeHaze(rgb, bw, bh),
        x: rnd() * (W + bw) - bw,
        y: H * (0.48 + i * 0.14),
        v: (6 + i * 4) * (i % 2 ? -1 : 1),
        a: 0.07 - i * 0.012,
        life: fresh ? 0 : 1,
      });
    }
  };
  populate(kind, false, count);
  buildHaze(PALETTE[world].haze, false);

  let raf = 0;
  let last = 0;
  let elapsed = 0;

  const step = (dt: number) => {
    elapsed += dt;
    const sway = kind === 'leaf' ? 14 : kind === 'ember' ? 9 : 4;
    for (let i = motes.length - 1; i >= 0; i--) {
      const m = motes[i];
      m.x += (m.vx + Math.sin(elapsed * 0.7 + m.ph) * (m.bokeh ? 2 : sway)) * dt;
      m.y += m.vy * dt;
      const edge = m.bokeh ? 40 : 8;
      if (m.y < -edge) m.y = H + edge; else if (m.y > H + edge) m.y = -edge;
      if (m.x < -edge) m.x = W + edge; else if (m.x > W + edge) m.x = -edge;
      if (m.dying) {
        m.life -= dt / 0.9;
        // Gone: swap-and-pop in place, so the loop allocates nothing per frame.
        if (m.life <= 0) { motes[i] = motes[motes.length - 1]; motes.pop(); }
      } else if (m.life < 1) m.life = Math.min(1, m.life + dt / 1.2);
    }
    for (const b of bands) {
      b.x += b.v * dt;
      const span = W + b.img.width;
      if (b.x > W) b.x -= span; else if (b.x < -b.img.width) b.x += span;
      if (b.life < 1) b.life = Math.min(1, b.life + dt / 1.2);
    }
  };

  const draw = () => {
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
    for (const b of bands) {
      ctx.globalAlpha = b.a * b.life;
      ctx.drawImage(b.img, b.x, b.y);
    }
    // Light adds up: where two motes cross they get brighter, not muddier.
    ctx.globalCompositeOperation = 'lighter';
    for (const m of motes) {
      const flicker = m.fl ? 0.6 + 0.4 * Math.sin(elapsed * m.fl + m.ph) : 1;
      ctx.globalAlpha = Math.min(0.95, m.a * m.life * flicker);
      if (m.bokeh) {
        const img = discs[m.kind][m.tint] ?? sprites[m.kind][m.tint];
        ctx.drawImage(img, m.x - m.r, m.y - m.r, m.r * 2, m.r * 2);
      } else {
        const s = m.r * 3.2;
        ctx.drawImage(sprites[m.kind][m.tint], m.x - s, m.y - s, s * 2, s * 2);
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  };

  // 30 fps cap: every frame schedules the next, but only every other one at
  // 60 Hz does any work. Pauses entirely while the tab is hidden.
  const tick = (t: number) => {
    raf = requestAnimationFrame(tick);
    if (t - last < FRAME_MS - 1) return;
    const dt = Math.min(0.1, (t - last) / 1000) || FRAME_MS / 1000;
    last = t;
    step(dt);
    draw();
  };
  const start = () => {
    if (raf || document.hidden) return;
    last = performance.now();
    raf = requestAnimationFrame(tick);
  };
  const stop = () => { cancelAnimationFrame(raf); raf = 0; };
  const onVisibility = () => { if (document.hidden) stop(); else start(); };
  document.addEventListener('visibilitychange', onVisibility);
  draw();
  start();

  return {
    setWorld(next) {
      if (next === world) return;
      world = next;
      const nextKind = MOTE_KIND[next];
      if (nextKind !== kind) {
        kind = nextKind;
        for (const m of motes) m.dying = true;
        // Rapid flips (Challenges → Scoreboard → back) would stack a whole
        // population per flip; the transient total is capped at three.
        const room = Math.max(0, count * 3 - motes.length);
        populate(kind, true, Math.min(count, room));
      }
      buildHaze(PALETTE[next].haze, true);
    },
    destroy() {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
      motes = [];
      bands = [];
      canvas.width = 0;
      canvas.height = 0;
    },
  };
}

/* ── Component ───────────────────────────────────────────────────────────── */

/** What a scene slot holds: its world, which plate, and how far that plate has come. */
interface Scene {
  world: World;
  plateKey: PlateKey | null;
  plate: PlateStatus;
  /** The plate was already decoded when the scene mounted: shown without a fade. */
  instant?: boolean;
}

interface Slots {
  a: Scene | null;
  b: Scene | null;
  /** The scene on screen. */
  active: Slot;
  /** A scene rendered but not yet shown: it is waiting for its plate. */
  pending: Slot | null;
}

function other(slot: Slot): Slot {
  return slot === 'a' ? 'b' : 'a';
}

function newScene(world: World, plateKey: PlateKey | null): Scene {
  return { world, plateKey, plate: plateKey ? 'loading' : 'none' };
}

/**
 * The relic stays mounted for one fade after it is no longer wanted, so it
 * leaves the way it came (environment.css fades it); it is mounted at once
 * when wanted, and never at all where it is not.
 */
function useRelic(wanted: boolean): boolean {
  const [mounted, setMounted] = useState(wanted);
  useEffect(() => {
    if (wanted) { setMounted(true); return; }
    const t = window.setTimeout(() => setMounted(false), FADE_MS);
    return () => window.clearTimeout(t);
  }, [wanted]);
  return wanted || mounted;
}

export default function PinakaEnvironment({ world, phase, intensity = 'subtle', plate: plateProp }: PinakaEnvironmentProps) {
  useWorldAttributes(world, phase);

  const reduce = useReducedMotion() ?? false;
  // Decided up front (the capability read is synchronous and cached), so the
  // first commit renders the right kind of layer rather than a full SVG scene
  // the next effect would throw away.
  const [mode, setMode] = useState<Mode>(() => (typeof window === 'undefined' ? 'static' : detectMode()));
  const [vp, setVp] = useState(readViewport);
  const motesRef = useRef<HTMLCanvasElement>(null);
  const motesSys = useRef<MoteSystem | null>(null);
  const depthEls = useRef<Record<string, HTMLDivElement | null>>({});

  // Reduced motion wins over whatever the hardware could afford.
  const effectiveMode: Mode = reduce ? 'static' : mode;
  // No transitions either when the player turned effects off: the 'still'
  // tier is the same promise as the OS preference, made from Settings.
  const still = reduce || getCapability().tier === 'still';
  // The swinging fan exists on the high tier alone, and never when still.
  const sweep = effectiveMode === 'high' && !still;

  const wide = useMediaQuery(RELIC_MEDIA);
  const relicWanted = wide && intensity !== 'normal' && RELIC_WORLDS[world];
  const relicMounted = useRelic(relicWanted);

  // Re-read whenever the player moves the effects dial (the capability cache
  // is dropped on that event, so this reads a fresh answer).
  useEffect(() => subscribeFx(() => setMode(detectMode())), []);

  // Resize: debounced, then every scene redraws for the new viewport.
  useEffect(() => {
    let timer = 0;
    const onResize = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setVp(prev => {
        const next = readViewport();
        // A phone's toolbar sliding away or its keyboard rising changes only
        // the height, by a little or by a lot; neither deserves a rebuilt
        // skyline and respawned motes. Only a real resize does (the width,
        // or a much taller window). The fixed layer is simply cropped until then.
        if (next.w === prev.w && next.h - prev.h < 160) return prev;
        return next;
      }), 160);
    };
    window.addEventListener('resize', onResize, { passive: true });
    return () => { window.clearTimeout(timer); window.removeEventListener('resize', onResize); };
  }, []);

  // Two scene slots. The active one holds the scene on screen; a change of
  // world or plate writes the new scene into the other slot as *pending*,
  // rendered but hidden, and promotes it to active once its plate has
  // settled, so the CSS crossfade has both complete scenes in the DOM for its
  // whole duration and a half-loaded plate is never on screen.
  const plateKey: PlateKey | null = plateProp === null ? null : (plateProp ?? world);
  const [slots, setSlots] = useState<Slots>(() => ({ a: newScene(world, plateKey), b: null, active: 'a', pending: null }));
  const isWanted = (scene: Scene | null) => !!scene && scene.world === world && scene.plateKey === plateKey;
  const shown = slots.pending ?? slots.active;
  if (!isWanted(slots[shown])) {
    const current = slots[slots.active];
    if (isWanted(current)) {
      // Flipped back before the pending scene had arrived: abandon it.
      setSlots({ ...slots, [slots.pending as Slot]: null, pending: null });
    } else if (current && current.plate === 'loading' && !slots[other(slots.active)]) {
      // Nothing of the scene on screen has been painted yet (its plate is
      // still on the way, and no earlier scene is fading out under it):
      // there is nothing to crossfade from, so the new scene simply takes
      // its place and appears the moment its own plate arrives.
      setSlots({ ...slots, [slots.active]: newScene(world, plateKey), pending: null });
    } else {
      const target = other(slots.active);
      setSlots({ ...slots, [target]: newScene(world, plateKey), pending: target });
    }
  }

  // The plate of a scene reported in. Only the scene that still holds that
  // world and plate is updated: a late event from a scene already replaced
  // is ignored.
  const settlePlate = useCallback((slot: Slot, w: World, key: PlateKey, status: 'ready' | 'failed', instant = false) => {
    setSlots(prev => {
      const scene = prev[slot];
      if (!scene || scene.world !== w || scene.plateKey !== key || scene.plate === status || scene.plate === 'none') return prev;
      return { ...prev, [slot]: { ...scene, plate: status, instant } };
    });
  }, []);

  // Promote the pending scene once its plate has settled, or after a short
  // wait regardless (the plate then fades in on its own when it arrives).
  useEffect(() => {
    const p = slots.pending;
    if (!p) return;
    const scene = slots[p];
    if (!scene) return;
    const promote = () => setSlots(prev => (prev.pending === p ? { ...prev, active: p, pending: null } : prev));
    if (scene.plate !== 'loading') { promote(); return; }
    const t = window.setTimeout(promote, PLATE_WAIT_MS);
    return () => window.clearTimeout(t);
  }, [slots]);

  // Once the retired scene has faded, release it: its plate is the most
  // expensive thing on this page and nobody can see it any more.
  useEffect(() => {
    if (slots.pending) return;
    const retired = other(slots.active);
    if (slots[retired] === null) return;
    const t = window.setTimeout(() => {
      setSlots(s => (s.pending || s.active === retired || s[retired] === null ? s : { ...s, [retired]: null }));
    }, FADE_MS + 200);
    return () => window.clearTimeout(t);
  }, [slots]);

  // Parallax: positions are read in passive listeners, applied in one rAF.
  // Scroll moves the strips immediately; the pointer eases toward its target
  // over a few frames and the loop stops as soon as it has arrived.
  useEffect(() => {
    const els = depthEls.current;
    if (effectiveMode === 'static') {
      for (const key in els) { const el = els[key]; if (el) el.style.transform = ''; }
      return;
    }
    const pointer = effectiveMode === 'high' && getCapability().pointerFx;
    let raf = 0;
    let scrollY = window.scrollY;
    let tx = 0, ty = 0, cx = 0, cy = 0;

    const apply = () => {
      for (const key in els) {
        const el = els[key];
        if (!el) continue;
        const depth = layerDepth(key.slice(2) as Layer);
        const sy = -Math.min(scrollY * SCROLL_K[depth], SCROLL_MAX);
        el.style.transform = `translate3d(${(cx * POINTER_K[depth]).toFixed(2)}px, ${(sy + cy * POINTER_K[depth]).toFixed(2)}px, 0)`;
      }
    };
    const frame = () => {
      raf = 0;
      cx += (tx - cx) * 0.1;
      cy += (ty - cy) * 0.1;
      apply();
      if (Math.abs(tx - cx) > 0.05 || Math.abs(ty - cy) > 0.05) raf = requestAnimationFrame(frame);
    };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(frame); };
    const onScroll = () => { scrollY = window.scrollY; schedule(); };
    const onPointer = (e: PointerEvent) => {
      tx = (e.clientX / window.innerWidth - 0.5) * 2 * POINTER_MAX_X;
      ty = (e.clientY / window.innerHeight - 0.5) * 2 * POINTER_MAX_Y;
      schedule();
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    if (pointer) window.addEventListener('pointermove', onPointer, { passive: true });
    schedule();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('pointermove', onPointer);
    };
  }, [effectiveMode]);

  // The one animated canvas. Rebuilt on tier or viewport change; a world
  // change only retargets it (see the effect below) so motes drift across.
  useEffect(() => {
    if (effectiveMode === 'static') return;
    const canvas = motesRef.current;
    if (!canvas) return;
    const sys = createMotes(canvas, {
      count: effectiveMode === 'high' ? MOTES_HIGH : MOTES_MEDIUM,
      haze: effectiveMode === 'high',
      bokeh: effectiveMode === 'high',
      // Soft 2–6 px sprites: 1× is sharp enough and a quarter of the memory.
      dpr: 1,
      world,
      w: vp.w,
      h: vp.h,
    });
    motesSys.current = sys;
    return () => { sys?.destroy(); motesSys.current = null; };
    // `world` is deliberately not a dependency: the system is retargeted below.
  }, [effectiveMode, vp.w, vp.h]);

  useEffect(() => {
    motesSys.current?.setWorld(world);
  }, [world]);

  const activeScene = slots[slots.active];
  const vpKey = `${vp.w}x${vp.h}`;
  // Settled: one scene on screen, its plate painted, nothing fading. The sky
  // under it is then hidden (the plate covers it), so the fixed root paints
  // a flat colour that costs no texture.
  const settled = !slots.pending && !slots[other(slots.active)] && activeScene?.plate === 'ready';

  return (
    <div
      aria-hidden="true"
      className="pk-env"
      data-world={world}
      data-phase={phase}
      data-mode={effectiveMode}
      data-still={still ? 'true' : undefined}
      data-intensity={intensity}
      // How far the plate on screen has come.
      data-plate={activeScene?.plate ?? 'none'}
      data-settled={settled ? 'true' : undefined}
      // The measured viewport height, so the CSS horizon glow and the canvas
      // horizon agree even where 100vh and innerHeight do not (mobile toolbars).
      style={{ ['--pk-env-vh' as string]: `${vp.h}px` }}
    >
      <div className="pk-env-sky" />
      {(['a', 'b'] as const).map(slot => {
        const scene = slots[slot];
        const plate = scene?.plateKey && scene.plate !== 'failed' ? PLATES[scene.plateKey] : null;
        const sun = scene ? sunPoint(scene.world, plate, vp.w, vp.h) : null;
        return (
          <div
            key={slot}
            className="pk-env-scene"
            data-slot={slot}
            data-world={scene?.world}
            data-plate-key={scene?.plateKey ?? undefined}
            data-plate={scene?.plate}
            data-instant={scene?.instant ? 'true' : undefined}
            data-active={slots.active === slot ? 'true' : 'false'}
            style={sun ? sunStyle(sun) : undefined}
          >
            {/* The horizon glow belongs to its scene so it crossfades with it. */}
            <div className="pk-env-sun" />
            {scene && plate && scene.plateKey && (
              <PlateLayer
                key={`${scene.world}:${scene.plateKey}`}
                plate={plate}
                status={scene.plate}
                active={slots.active === slot}
                vpKey={vpKey}
                layerRef={el => { depthEls.current[`${slot}-plate`] = el; }}
                onSettle={(status, instant) => settlePlate(slot, scene.world, scene.plateKey as PlateKey, status, instant)}
              >
                {sweep && <div className="pk-env-sweep" />}
              </PlateLayer>
            )}
            {/* The silhouettes are the fallback: over a plate none is painted. */}
            {scene && !plate && DEPTHS.map(depth => (
              <div
                key={depth}
                className="pk-env-depth"
                data-depth={depth}
                ref={el => { depthEls.current[`${slot}-${depth}`] = el; }}
                style={{ height: layerHeight(depth, vp.h) }}
              >
                <SceneLayer world={scene.world} depth={depth} mode={effectiveMode} vw={vp.w} vh={vp.h} />
              </div>
            ))}
            {/* Without a plate the light rides with the far strip instead. */}
            {scene && !plate && (
              <div className="pk-env-light-far" ref={el => { depthEls.current[`${slot}-rays`] = el; }}>
                <SceneLight />
              </div>
            )}
          </div>
        );
      })}
      {/* The celestial dharma wheel: the official emblem, high in the sky.
          Only where it is wanted (RELIC_WORLDS, wide screens, not the
          sign-in page), so nowhere else is it fetched or turned. */}
      {relicMounted && <div className="pk-env-relic" data-on={relicWanted ? 'true' : 'false'}>
        <div className="pk-env-relic-halo" />
        <img
          className="pk-env-relic-wheel"
          src={PINAKA_IMAGES.wheelEmblem.small}
          srcSet={`${PINAKA_IMAGES.wheelEmblem.small} 700w, ${PINAKA_IMAGES.wheelEmblem.large} 1000w`}
          sizes="min(56vmin, 640px)"
          width={700}
          height={700}
          alt=""
          aria-hidden="true"
          draggable={false}
          decoding="async"
          // Lazy: where the stylesheet hides the wheel (the board) it is
          // never fetched; where it shows it is in view and loads at once.
          loading="lazy"
        />
      </div>}
      {effectiveMode !== 'static' && <canvas ref={motesRef} className="pk-env-motes" />}
      {/* Readability: dark bands only where the interface is dense, and the
          vignette, in one layer. */}
      <div className="pk-env-veil" />
    </div>
  );
}
