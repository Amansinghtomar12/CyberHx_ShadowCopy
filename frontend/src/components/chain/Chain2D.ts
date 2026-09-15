// Chained-challenges chain renderer — pure 2D, real photographic assets.
//
// The chain is a REAL galvanized-steel-chain PHOTOGRAPH (chroma-keyed off its
// green background and cropped to one repeat period so it tiles seamlessly).
// At runtime we tile that strip horizontally in the thin band between cards —
// no WebGL, no 3D camera, no drawn links. A heated (incandescent) recolour of
// the same photo cross-fades in on segments whose two adjacent challenges are
// both solved, and a REAL FIRE photograph is windowed, animated and feathered
// on top so the metal looks genuinely engulfed while staying visible beneath.
//
// Clickable challenge cards are HTML, positioned each frame from the node
// centres reported via onNodes.

const COLD_URL = new URL('../../assets/chain/chain-strip.png', import.meta.url).href;
const HOT_URL = new URL('../../assets/chain/chain-strip-hot.png', import.meta.url).href;
const FIRE_URL = new URL('../../assets/chain/fire.jpg', import.meta.url).href;

// Chain tile geometry — extracted from the supplied hi-res chain render
// (silver cold + golden heated), green-keyed and cropped to whole repeat
// periods so it tiles seamlessly. Logical (aspect) units.
const STRIP_UNITS_W = 495;
const STRIP_UNITS_H = 303;

export interface Chain2DNode { x: number; y: number; }

export interface Chain2DHandle {
  resize: (cssW: number, cssH: number, dpr: number) => void;
  setState: (nodeSolved: boolean[], segmentActive: boolean[]) => void;
  destroy: () => void;
}

export interface Chain2DOptions {
  nodeCount: number;
  reducedMotion: boolean;
  onNodes?: (nodes: Chain2DNode[]) => void;
}

// Layout — a horizontal progression. Cards sit at node centres; the chain fills
// the gap between them. Kept intentionally roomy so the whole series reads at a
// glance and the chain band stays thin relative to the cards (never zoomed in).
export const NODE_SPACING = 280;
export const NODE_MARGIN = 110;
export const STAGE_HEIGHT = 240;
const CHAIN_H = 54;        // chain band height on screen (thin vs ~92px cards)
const CHAIN_INSET = 70;    // chain tucks just under each card edge
const TILE_W = STRIP_UNITS_W * (CHAIN_H / STRIP_UNITS_H); // display tile width

const IGNITE_MS = 1400;    // premium ignition ramp
const FIRE_DISP_H = 148;   // fire band display height (px)
const FIRE_BASE = 0.80;    // fraction of the fire below its dest-top (flames rise)
const FIRE_PAD = 24;       // horizontal padding around each burning segment

export function chainContentWidth(nodeCount: number): number {
  const n = Math.max(1, nodeCount);
  return NODE_MARGIN * 2 + (n - 1) * NODE_SPACING;
}

function hash(n: number): number { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); }
function vnoise(x: number): number {
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  return hash(i) * (1 - u) + hash(i + 1) * u;
}

export function createChain2D(canvas: HTMLCanvasElement, opts: Chain2DOptions): Chain2DHandle {
  const ctx = canvas.getContext('2d')!;
  const n = Math.max(1, opts.nodeCount);
  const segCount = Math.max(0, n - 1);

  const cold = new Image(); cold.src = COLD_URL;
  const hot = new Image(); hot.src = HOT_URL;
  const fireImg = new Image(); fireImg.src = FIRE_URL;
  let coldOk = false, hotOk = false, fireOk = false;
  cold.onload = () => { coldOk = true; };
  hot.onload = () => { hotOk = true; };
  fireImg.onload = () => { fireOk = true; };

  const nodeSolved = new Array<boolean>(n).fill(false);
  const segHeat = new Float32Array(segCount);
  const segTarget = new Float32Array(segCount);
  const segIgniteAt = new Float32Array(segCount).fill(-1);

  // Offscreen buffers for the real-fire compositing (fire layers + feather mask).
  let fbuf: HTMLCanvasElement | null = null, fbx: CanvasRenderingContext2D | null = null;
  let mbuf: HTMLCanvasElement | null = null, mbx: CanvasRenderingContext2D | null = null;

  let cssW = 1, cssH = STAGE_HEIGHT, dpr = 1;
  let raf = 0, disposed = false;
  const t0 = performance.now();
  const swayAmp = opts.reducedMotion ? 0 : 2.6;

  const nodeX = (i: number) => NODE_MARGIN + i * NODE_SPACING;
  const bandCenter = (t: number) => cssH / 2 + Math.sin(t * 0.6) * swayAmp;

  // Tile the seamless chain strip across [x0,x1] at a shared phase so the chain
  // is continuous across segments; clipped to the band so it only fills the gap.
  function drawBand(img: HTMLImageElement, x0: number, x1: number, top: number, alpha: number) {
    if (x1 <= x0) return;
    ctx.save();
    ctx.beginPath(); ctx.rect(x0, top, x1 - x0, CHAIN_H); ctx.clip();
    ctx.globalAlpha = alpha;
    ctx.imageSmoothingEnabled = true;
    const start = Math.floor(x0 / TILE_W) * TILE_W;
    for (let x = start; x < x1; x += TILE_W) ctx.drawImage(img, x, top, TILE_W, CHAIN_H);
    ctx.restore();
  }

  // Real fire: window a different slice of the fire photograph per burning
  // segment, animate it in place (drift + bob + flicker), composite two layers
  // additively into an offscreen buffer, then feather every edge with a single
  // UNIONED soft-ellipse mask so it reads as flame — never a rectangle. The
  // heated-steel strip underneath stays visible through the flames.
  function drawFire(now: number, t: number, bandCY: number) {
    if (!fireOk) return;
    let anyHot = false;
    for (let s = 0; s < segCount; s++) if (segHeat[s] >= 0.02) { anyHot = true; break; }
    if (!anyHot) return;

    if (!fbuf) { fbuf = document.createElement('canvas'); fbx = fbuf.getContext('2d'); }
    if (fbuf.width !== cssW || fbuf.height !== cssH) { fbuf.width = cssW; fbuf.height = cssH; }
    if (!mbuf) { mbuf = document.createElement('canvas'); mbx = mbuf.getContext('2d'); }
    if (mbuf.width !== cssW || mbuf.height !== cssH) { mbuf.width = cssW; mbuf.height = cssH; }
    const fc = fbx!, mc = mbx!;
    const IW = fireImg.naturalWidth || 1286, IH = fireImg.naturalHeight || 720;
    const ft = opts.reducedMotion ? 1.7 : t;

    fc.setTransform(1, 0, 0, 1, 0, 0);
    fc.clearRect(0, 0, cssW, cssH);
    fc.globalCompositeOperation = 'lighter';
    fc.imageSmoothingEnabled = true;
    for (let s = 0; s < segCount; s++) {
      const heat = segHeat[s];
      if (heat < 0.02) continue;
      const x0 = nodeX(s) + CHAIN_INSET, x1 = nodeX(s + 1) - CHAIN_INSET;
      if (x1 <= x0) continue;
      const destW = (x1 - x0) + FIRE_PAD * 2, fh = FIRE_DISP_H, scale = fh / IH;
      const srcW = Math.min(IW, destW / scale), range = Math.max(0, IW - srcW);
      const drift = Math.sin(ft * 0.5 + s * 1.7) * 0.5 + 0.5;
      const bob = opts.reducedMotion ? 0 : Math.sin(ft * 2.1 + s) * 3;
      const srcX = Math.max(0, Math.min(range, range * (((s * 0.37 + 0.12 * drift) % 1))));
      const top = bandCY - fh * FIRE_BASE + bob;
      fc.globalAlpha = Math.min(1, heat * (1.05 + 0.2 * vnoise(ft * 3 + s * 2.1)));
      fc.drawImage(fireImg, srcX, 0, srcW, IH, x0 - FIRE_PAD, top, destW, fh);
      const fh2 = fh * 1.14, top2 = bandCY - fh2 * FIRE_BASE + bob * 0.6;
      const srcX2 = Math.max(0, Math.min(range, range * (((s * 0.61 + 0.5 + 0.1 * drift) % 1))));
      fc.globalAlpha = Math.min(1, heat * (0.62 + 0.24 * vnoise(ft * 4.3 + s * 3.7)));
      fc.save(); fc.translate(x0 - FIRE_PAD + destW / 2, top2); fc.scale(-1, 1);
      fc.drawImage(fireImg, srcX2, 0, srcW, IH, -destW / 2, 0, destW, fh2); fc.restore();
    }
    fc.globalAlpha = 1;

    // unioned soft-ellipse mask (source-over so segments add, not intersect)
    mc.setTransform(1, 0, 0, 1, 0, 0);
    mc.clearRect(0, 0, cssW, cssH);
    mc.globalCompositeOperation = 'source-over';
    for (let s = 0; s < segCount; s++) {
      const heat = segHeat[s];
      if (heat < 0.02) continue;
      const x0 = nodeX(s) + CHAIN_INSET, x1 = nodeX(s + 1) - CHAIN_INSET;
      const cx = (x0 + x1) / 2, cy = bandCY - FIRE_DISP_H * 0.38, rx = (x1 - x0) / 2 + 20, ry = FIRE_DISP_H * 0.90;
      mc.save(); mc.translate(cx, cy); mc.scale(1, ry / rx);
      const rg = mc.createRadialGradient(0, 0, 0, 0, 0, rx);
      rg.addColorStop(0, 'rgba(0,0,0,1)');
      rg.addColorStop(0.52, 'rgba(0,0,0,1)');
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      mc.fillStyle = rg; mc.beginPath(); mc.arc(0, 0, rx, 0, Math.PI * 2); mc.fill(); mc.restore();
    }
    fc.globalCompositeOperation = 'destination-in';
    fc.drawImage(mbuf, 0, 0);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(fbuf, 0, 0, cssW, cssH);
    ctx.restore();
  }

  function frame(now: number) {
    if (disposed) return;
    const t = (now - t0) / 1000;

    for (let s = 0; s < segCount; s++) {
      const goal = segTarget[s];
      if (segHeat[s] !== goal) {
        if (goal > segHeat[s]) {
          const p = segIgniteAt[s] >= 0 ? Math.min((now - segIgniteAt[s]) / IGNITE_MS, 1) : 1;
          segHeat[s] = p * p * (3 - 2 * p);
          if (p >= 1) segHeat[s] = 1;
        } else {
          segHeat[s] = Math.max(goal, segHeat[s] - 0.04);
        }
      }
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    const bandCY = bandCenter(t);
    const top = bandCY - CHAIN_H / 2;

    // the chain: cold steel everywhere, heated steel cross-faded on hot segments
    if (coldOk) {
      for (let s = 0; s < segCount; s++) {
        const x0 = nodeX(s) + CHAIN_INSET, x1 = nodeX(s + 1) - CHAIN_INSET;
        drawBand(cold, x0, x1, top, 1);
        if (hotOk && segHeat[s] > 0.02) drawBand(hot, x0, x1, top, segHeat[s]);
      }
    }

    drawFire(now, t, bandCY);

    if (opts.onNodes) {
      const nodes: Chain2DNode[] = [];
      for (let i = 0; i < n; i++) nodes.push({ x: nodeX(i), y: bandCY });
      opts.onNodes(nodes);
    }
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  return {
    resize(w, h, ratio) {
      cssW = Math.max(1, w); cssH = Math.max(1, h);
      dpr = Math.min(ratio, 2.5);
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
    },
    setState(solved, active) {
      for (let i = 0; i < n; i++) nodeSolved[i] = !!solved[i];
      for (let s = 0; s < segCount; s++) {
        const want = active[s] ? 1 : 0;
        if (want === 1 && segTarget[s] !== 1) segIgniteAt[s] = performance.now();
        if (want === 0) segIgniteAt[s] = -1;
        segTarget[s] = want;
      }
    },
    destroy() { disposed = true; cancelAnimationFrame(raf); },
  };
}
