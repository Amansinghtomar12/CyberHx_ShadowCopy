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
 *   scene    two slots, each holding a horizon glow and three parallax depth
 *            layers of procedurally generated silhouettes. A world change
 *            renders the new scene into the hidden slot and crossfades, so
 *            there is never a flash and never a re-layout
 *   motes    one animated canvas: gold motes, leaf flecks or embers, plus a
 *            few wide haze bands on the high tier
 *   veil     the readability guarantee — the UI always wins
 *
 * EVERY SILHOUETTE IS ORIGINAL AND DETERMINISTIC
 *   The city, the forest, the causeway and the fortress are built from a
 *   handful of primitives (a stepped tower profile, a battlemented wall, a
 *   canopy cluster, a stone) by a seeded generator, so a reload draws the
 *   same skyline and the static tier can emit the same shapes as inline SVG.
 *
 * TIERS
 *   high    canvases at DPR ≤ 1.5, 90 motes, haze, scroll + pointer parallax
 *   medium  canvases at DPR ≤ 1.5, 36 motes, no haze, scroll parallax only
 *   static  'still' / 'low' / fx off / reduced motion: no canvases at all,
 *           inline SVG silhouettes, no loops, no transitions
 *
 * Presentation only: props in, pixels out. Nothing here reads data.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import { getCapability } from '../../../components/environment/performance';
import { subscribeFx } from '../../../components/environment/fx';
import { WORLDS, type World } from '../config';
import { useWorldAttributes, type EventPhase } from '../hooks';

export interface PinakaEnvironmentProps {
  world: World;
  phase: EventPhase;
  /** 'subtle' (default) keeps the veil strong; 'normal' (auth) lifts it a little. */
  intensity?: 'subtle' | 'normal';
}

/** The world's display title, for the integrator's aria text. */
export function worldLabel(world: World): string {
  return WORLDS[world].title;
}

type Mode = 'high' | 'medium' | 'static';
type Depth = 'far' | 'mid' | 'near';
type Slot = 'a' | 'b';

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
const FRAME_MS = 1000 / 30;

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

function LayerCanvas({ geom }: { geom: LayerGeom }) {
  const ref = useRef<HTMLCanvasElement>(null);
  // Layout effect: the strip is painted before the browser shows the commit,
  // so a freshly mounted scene never flashes empty under its fade-in.
  useLayoutEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    paintLayer(canvas, geom, canvasDpr());
    return () => { canvas.width = 0; canvas.height = 0; };
  }, [geom]);
  return <canvas ref={ref} className="pk-env-canvas" />;
}

function SceneLayer({ world, depth, mode, vw, vh }: { world: World; depth: Depth; mode: Mode; vw: number; vh: number }) {
  const geom = useMemo(() => layerGeometry(world, depth, vw, vh), [world, depth, vw, vh]);
  return mode === 'static' ? <LayerSvg geom={geom} /> : <LayerCanvas geom={geom} />;
}

/* ── Motes ───────────────────────────────────────────────────────────────── */

type MoteKind = 'gold' | 'leaf' | 'ember';
const MOTE_KIND: Record<World, MoteKind> = { ayodhya: 'gold', vanavasa: 'leaf', setu: 'gold', lanka: 'ember', vijaya: 'gold' };

interface Mote {
  x: number; y: number; vx: number; vy: number;
  r: number; a: number; ph: number; fl: number;
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

function makeSprite(rgb: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const ctx = c.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(8, 8, 0, 8, 8, 8);
    g.addColorStop(0, `rgba(${rgb},1)`);
    g.addColorStop(0.35, `rgba(${rgb},0.55)`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 16, 16);
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
  opts: { count: number; haze: boolean; dpr: number; world: World; w: number; h: number },
): MoteSystem | null {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const { count, dpr, w: W, h: H } = opts;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  let world = opts.world;
  let kind = MOTE_KIND[world];
  const sprites: Record<MoteKind, HTMLCanvasElement> = {
    gold: makeSprite(PALETTE.ayodhya.mote),
    leaf: makeSprite(PALETTE.vanavasa.mote),
    ember: makeSprite(PALETTE.lanka.mote),
  };
  let motes: Mote[] = [];
  let bands: HazeBand[] = [];

  const rnd = Math.random;
  const spawn = (k: MoteKind, fresh: boolean): Mote => {
    const r = rnd();
    const m: Mote = { x: rnd() * W, y: rnd() * H, vx: 0, vy: 0, r: 1, a: 0.4, ph: rnd() * Math.PI * 2, fl: 0, life: fresh ? 0 : 1, dying: false, kind: k };
    if (k === 'gold')       { m.vy = -(6 + r * 12);  m.vx = (rnd() - 0.5) * 4; m.r = 0.9 + r * 1.4; m.a = 0.22 + rnd() * 0.3; }
    else if (k === 'leaf')  { m.vy = 8 + r * 12;     m.vx = (rnd() - 0.5) * 6; m.r = 1.2 + r * 1.3; m.a = 0.22 + rnd() * 0.3; }
    else                    { m.vy = -(16 + r * 26); m.vx = (rnd() - 0.5) * 8; m.r = 0.8 + r * 1.5; m.a = 0.3 + rnd() * 0.3; m.fl = 5 + rnd() * 7; }
    return m;
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
        a: 0.05 - i * 0.008,
        life: fresh ? 0 : 1,
      });
    }
  };
  for (let i = 0; i < count; i++) motes.push(spawn(kind, false));
  buildHaze(PALETTE[world].haze, false);

  let raf = 0;
  let last = 0;
  let elapsed = 0;

  const step = (dt: number) => {
    elapsed += dt;
    const sway = kind === 'leaf' ? 14 : 4;
    for (let i = motes.length - 1; i >= 0; i--) {
      const m = motes[i];
      m.x += (m.vx + Math.sin(elapsed * 0.7 + m.ph) * sway) * dt;
      m.y += m.vy * dt;
      if (m.y < -8) m.y = H + 8; else if (m.y > H + 8) m.y = -8;
      if (m.x < -8) m.x = W + 8; else if (m.x > W + 8) m.x = -8;
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
    for (const b of bands) {
      ctx.globalAlpha = b.a * b.life;
      ctx.drawImage(b.img, b.x, b.y);
    }
    for (const m of motes) {
      const flicker = m.fl ? 0.65 + 0.35 * Math.sin(elapsed * m.fl + m.ph) : 1;
      ctx.globalAlpha = Math.min(0.6, m.a * m.life * flicker);
      const s = m.r * 2.4;
      ctx.drawImage(sprites[m.kind], m.x - s, m.y - s, s * 2, s * 2);
    }
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
        for (let i = 0; i < Math.min(count, room); i++) motes.push(spawn(kind, true));
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

export default function PinakaEnvironment({ world, phase, intensity = 'subtle' }: PinakaEnvironmentProps) {
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

  // Two scene slots. The active one holds the current world; a change writes
  // the new world into the other slot and swaps which is active, so the CSS
  // crossfade has both scenes in the DOM for its whole duration.
  const [slots, setSlots] = useState<{ a: World | null; b: World | null; active: Slot }>(() => ({ a: world, b: null, active: 'a' }));
  if (slots[slots.active] !== world) {
    const next: Slot = slots.active === 'a' ? 'b' : 'a';
    setSlots({ a: next === 'a' ? world : slots.a, b: next === 'b' ? world : slots.b, active: next });
  }
  // Once the retired scene has faded, release it: its canvases are the most
  // expensive thing on this page and nobody can see them any more.
  useEffect(() => {
    const retired: Slot = slots.active === 'a' ? 'b' : 'a';
    if (slots[retired] === null) return;
    const t = window.setTimeout(() => {
      setSlots(s => (s.active === retired || s[retired] === null ? s : { ...s, [retired]: null }));
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
        const depth = key.slice(2) as Depth;
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
      count: effectiveMode === 'high' ? 90 : 36,
      haze: effectiveMode === 'high',
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

  return (
    <div
      aria-hidden="true"
      className="pk-env"
      data-world={world}
      data-phase={phase}
      data-mode={effectiveMode}
      data-still={still ? 'true' : undefined}
      data-intensity={intensity}
      // The measured viewport height, so the CSS horizon glow and the canvas
      // horizon agree even where 100vh and innerHeight do not (mobile toolbars).
      style={{ ['--pk-env-vh' as string]: `${vp.h}px` }}
    >
      <div className="pk-env-sky" />
      {(['a', 'b'] as const).map(slot => {
        const w = slots[slot];
        return (
          <div
            key={slot}
            className="pk-env-scene"
            data-slot={slot}
            data-world={w ?? undefined}
            data-active={slots.active === slot ? 'true' : 'false'}
          >
            {/* The horizon glow belongs to its scene so it crossfades with it. */}
            <div className="pk-env-sun" />
            {DEPTHS.map(depth => (
              <div
                key={depth}
                className="pk-env-depth"
                data-depth={depth}
                ref={el => { depthEls.current[`${slot}-${depth}`] = el; }}
                style={{ height: layerHeight(depth, vp.h) }}
              >
                {w && <SceneLayer world={w} depth={depth} mode={effectiveMode} vw={vp.w} vh={vp.h} />}
              </div>
            ))}
          </div>
        );
      })}
      {effectiveMode !== 'static' && <canvas ref={motesRef} className="pk-env-motes" />}
      {/* Readability guarantee: the UI always wins against the environment. */}
      <div className="pk-env-veil" />
      <div className="pk-env-vignette" />
    </div>
  );
}
