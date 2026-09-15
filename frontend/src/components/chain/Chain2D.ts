// Chained-challenges chain renderer — pure 2D.
//
// The chain itself is a REAL rendered steel asset: a seamless, transparent,
// high-resolution PNG strip of interlocked oval links (generated offline with a
// per-pixel metallic tube shader — chrome environment reflection, speculars,
// contact-shadow AO). At runtime we simply tile that strip horizontally in the
// thin band between challenge cards — no WebGL, no 3D camera, no drawn "cartoon"
// links. A second heated (incandescent) strip is cross-faded in on segments
// whose two adjacent challenges are both solved, and a procedural 2D fire is
// layered on top so the metal looks genuinely engulfed while staying visible.
//
// Clickable challenge cards are HTML, positioned each frame from the node
// centres reported via onNodes.

const COLD_URL = new URL('../../assets/chain/chain-strip.png', import.meta.url).href;
const HOT_URL = new URL('../../assets/chain/chain-strip-hot.png', import.meta.url).href;

// Asset tile geometry (the PNG is @3x of these display units, seamless).
const STRIP_UNITS_W = 368;
const STRIP_UNITS_H = 60;

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
const CHAIN_H = 46;        // chain band height on screen (thin vs ~92px cards)
const CHAIN_INSET = 70;    // chain tucks just under each card edge
const TILE_W = STRIP_UNITS_W * (CHAIN_H / STRIP_UNITS_H); // display tile width

const IGNITE_MS = 1400;    // premium ignition ramp
const FIRE_SCALE = 0.34;   // low-res factor for the procedural fire buffer
const FLAME_H = 78;        // flame height (px) at full heat
const FIRE_MS = 33;        // rebuild fire buffer at ~30fps

export function chainContentWidth(nodeCount: number): number {
  const n = Math.max(1, nodeCount);
  return NODE_MARGIN * 2 + (n - 1) * NODE_SPACING;
}

function hash(n: number): number { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); }
function vnoise(x: number): number {
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  return hash(i) * (1 - u) + hash(i + 1) * u;
}
function hash2(x: number, y: number): number { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
function noise2(x: number, y: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}
function fbm2(x: number, y: number): number {
  let s = 0, amp = 0.5, f = 1;
  for (let o = 0; o < 3; o++) { s += amp * noise2(x * f, y * f); f *= 2; amp *= 0.5; }
  return s;
}

export function createChain2D(canvas: HTMLCanvasElement, opts: Chain2DOptions): Chain2DHandle {
  const ctx = canvas.getContext('2d')!;
  const n = Math.max(1, opts.nodeCount);
  const segCount = Math.max(0, n - 1);

  const cold = new Image(); cold.src = COLD_URL;
  const hot = new Image(); hot.src = HOT_URL;
  let coldOk = false, hotOk = false;
  cold.onload = () => { coldOk = true; };
  hot.onload = () => { hotOk = true; };

  const nodeSolved = new Array<boolean>(n).fill(false);
  const segHeat = new Float32Array(segCount);
  const segTarget = new Float32Array(segCount);
  const segIgniteAt = new Float32Array(segCount).fill(-1);

  // Low-res offscreen buffer for the procedural fire (rebuilt at ~30fps).
  let fireBuf: HTMLCanvasElement | null = null;
  let fireCtx: CanvasRenderingContext2D | null = null;
  let lastFire = -1;

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

  function rebuildFireBuffer(t: number, bandCY: number) {
    const w = Math.max(1, Math.round(cssW * FIRE_SCALE));
    const h = Math.max(1, Math.round(cssH * FIRE_SCALE));
    if (!fireBuf) { fireBuf = document.createElement('canvas'); fireCtx = fireBuf.getContext('2d'); }
    if (fireBuf.width !== w || fireBuf.height !== h) { fireBuf.width = w; fireBuf.height = h; }
    const fc = fireCtx!;
    const img = fc.createImageData(w, h);
    const d = img.data;
    const ft = opts.reducedMotion ? 1.7 : t;
    const baseY = bandCY + CHAIN_H * 0.12;

    for (let s = 0; s < segCount; s++) {
      const heat = segHeat[s];
      if (heat < 0.02) continue;
      const x0 = nodeX(s) + CHAIN_INSET, x1 = nodeX(s + 1) - CHAIN_INSET;
      if (x1 <= x0) continue;
      const seed = s * 37.7;
      const flameH = FLAME_H * heat;
      const bx0 = Math.max(0, Math.floor((x0 - 6) * FIRE_SCALE));
      const bx1 = Math.min(w - 1, Math.ceil((x1 + 6) * FIRE_SCALE));
      const by0 = Math.max(0, Math.floor((baseY - flameH - 12) * FIRE_SCALE));
      const by1 = Math.min(h - 1, Math.ceil((baseY + 10) * FIRE_SCALE));
      for (let ly = by0; ly <= by1; ly++) {
        const py = ly / FIRE_SCALE;
        for (let lx = bx0; lx <= bx1; lx++) {
          const px = lx / FIRE_SCALE;
          const fx = (px - x0) / ((x1 - x0) || 1);
          if (fx < -0.06 || fx > 1.06) continue;
          const above = baseY - py;
          if (above < -9) continue;
          const nh = above / flameH;
          if (nh > 1.08) continue;
          const nn = fbm2(px * 0.02 + seed, py * 0.032 - ft * 1.5);
          const warp = fbm2(px * 0.055 + seed * 2, py * 0.07 - ft * 2.2);
          let v = (nn * 0.72 + warp * 0.28) * 1.55 - nh;
          if (above < 0) v -= (-above) * 0.06;
          const eo = Math.abs(fx - 0.5) * 2;
          const edge = eo < 0.86 ? 1 : 1 - (eo - 0.86) / 0.2;
          v *= Math.max(0, Math.min(1, edge)) * heat;
          if (v <= 0.02) continue;
          const i = Math.min(1, v);
          let r: number, gg: number, b: number;
          if (i < 0.34) { const k = i / 0.34; r = 110 + 130 * k; gg = 6 + 40 * k; b = 0; }
          else if (i < 0.68) { const k = (i - 0.34) / 0.34; r = 255; gg = 46 + 140 * k; b = 8 + 34 * k; }
          else { const k = (i - 0.68) / 0.32; r = 255; gg = 186 + 64 * k; b = 42 + 180 * k; }
          const a = Math.min(255, i * 300);
          const idx = (ly * w + lx) * 4;
          d[idx] = Math.min(255, d[idx] + r);
          d[idx + 1] = Math.min(255, d[idx + 1] + gg);
          d[idx + 2] = Math.min(255, d[idx + 2] + b);
          d[idx + 3] = Math.min(255, d[idx + 3] + a);
        }
      }
    }
    fc.putImageData(img, 0, 0);
  }

  function drawFire(now: number, t: number, bandCY: number) {
    let anyHot = false;
    for (let s = 0; s < segCount; s++) if (segHeat[s] >= 0.02) { anyHot = true; break; }
    if (!anyHot) return;

    if (lastFire < 0 || now - lastFire >= FIRE_MS) { rebuildFireBuffer(t, bandCY); lastFire = now; }
    if (fireBuf) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(fireBuf, 0, 0, cssW, cssH);
      ctx.restore();
    }

    // ambient glow + rising embers per burning segment
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const baseY = bandCY + CHAIN_H * 0.12;
    for (let s = 0; s < segCount; s++) {
      const heat = segHeat[s];
      if (heat < 0.02) continue;
      const x0 = nodeX(s) + CHAIN_INSET, x1 = nodeX(s + 1) - CHAIN_INSET;
      const span = x1 - x0;
      if (span <= 0) continue;
      const gl = ctx.createLinearGradient(x0, baseY - CHAIN_H, x0, baseY + CHAIN_H * 0.5);
      gl.addColorStop(0, 'rgba(255,110,30,0)');
      gl.addColorStop(0.5, `rgba(255,120,35,${0.12 * heat})`);
      gl.addColorStop(1, 'rgba(255,70,10,0)');
      ctx.fillStyle = gl;
      ctx.fillRect(x0, baseY - CHAIN_H, span, CHAIN_H * 1.5);
      if (!opts.reducedMotion) {
        const embers = Math.max(2, Math.round(span / 34));
        for (let e = 0; e < embers; e++) {
          const seed = s * 17 + e * 3.3;
          const rise = (t * 0.5 + seed * 0.37) % 1;
          const ea = (1 - rise) * heat * 0.85;
          if (ea < 0.05) continue;
          const ex = x0 + ((e + 0.5) / embers) * span + (vnoise(seed + Math.floor(t * 0.5 + seed)) - 0.5) * 22;
          ctx.fillStyle = `rgba(255,205,130,${ea})`;
          ctx.beginPath();
          ctx.arc(ex, baseY - rise * FLAME_H * 1.1, 1.5 * (1 - rise) + 0.4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
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

    // subtle green accent glow under solved nodes (metal stays realistic)
    for (let i = 0; i < n; i++) {
      if (!nodeSolved[i]) continue;
      const x = nodeX(i);
      const glow = ctx.createRadialGradient(x, bandCY, 0, x, bandCY, 48);
      glow.addColorStop(0, 'rgba(198,255,0,0.10)');
      glow.addColorStop(1, 'rgba(198,255,0,0)');
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(x, bandCY, 48, 0, Math.PI * 2); ctx.fill();
    }

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
