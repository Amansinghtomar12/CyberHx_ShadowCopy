// Chained-challenges chain renderer — pure 2D, using the user-supplied images.
//
// Two real assets, used as-is:
//   • chain-strip.png — the STEEL chain, tiled along the whole band.
//   • fire.gif        — the animated fire, composited over solved segments and
//                       recoloured (green→yellow→orange→red) by overall progress.
//
// No WebGL, no 3D camera, no drawn links. Clickable challenge cards are HTML,
// positioned each frame from the node centres reported via onNodes.

const STEEL_URL = new URL('../../assets/chain/chain-strip.png', import.meta.url).href;
const FIRE_URL = new URL('../../assets/chain/fire.gif', import.meta.url).href;

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

// Layout — a horizontal progression. Cards sit at node centres; the chain runs
// continuously behind them and is visible in the gaps.
export const NODE_SPACING = 320;   // longer chain runs between cards
export const NODE_MARGIN = 120;
export const STAGE_HEIGHT = 200;
const CHAIN_H = 34;        // smaller links — zoomed out, more sockets visible

const IGNITE_MS = 1400;    // premium ignition ramp
const FIRE_DISP_H = 56;    // fire band display height (px) — low flame for the small chain
const FIRE_BASE = 0.72;    // fraction of the fire below its dest-top (flames rise)
const FIRE_PAD = 22;       // horizontal padding around each burning segment

export function chainContentWidth(nodeCount: number): number {
  const n = Math.max(1, nodeCount);
  return NODE_MARGIN * 2 + (n - 1) * NODE_SPACING;
}

function hash(n: number): number { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); }
function vnoise(x: number): number {
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  return hash(i) * (1 - u) + hash(i + 1) * u;
}

// Progress heat: the fire heats up as more of the chain is solved.
//   green (just started) → yellow → orange → red (fully solved).
// Returns a hue-rotate offset from the gif's orange base + a matching glow rgb.
interface HeatColor { deg: number; glow: [number, number, number]; }
function heatColor(t: number): HeatColor {
  const stops: { t: number; deg: number; glow: [number, number, number] }[] = [
    { t: 0,     deg: 92,  glow: [70, 230, 90] },   // green
    { t: 1 / 3, deg: 24,  glow: [210, 220, 40] },  // yellow
    { t: 2 / 3, deg: 0,   glow: [255, 120, 30] },  // orange
    { t: 1,     deg: -24, glow: [255, 55, 25] },   // red
  ];
  t = Math.max(0, Math.min(1, t));
  let a = stops[0], b = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (t >= stops[i].t && t <= stops[i + 1].t) { a = stops[i]; b = stops[i + 1]; break; }
  }
  const k = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);
  const lerp = (x: number, y: number) => x + (y - x) * k;
  return {
    deg: lerp(a.deg, b.deg),
    glow: [Math.round(lerp(a.glow[0], b.glow[0])), Math.round(lerp(a.glow[1], b.glow[1])), Math.round(lerp(a.glow[2], b.glow[2]))],
  };
}

export function createChain2D(canvas: HTMLCanvasElement, opts: Chain2DOptions): Chain2DHandle {
  const ctx = canvas.getContext('2d')!;
  const n = Math.max(1, opts.nodeCount);
  const segCount = Math.max(0, n - 1);

  const steel = new Image(); steel.src = STEEL_URL;
  let steelOk = false, fireOk = false;
  steel.onload = () => { steelOk = true; };

  // The fire is an animated GIF. It has to live in the DOM to keep animating;
  // we park it off-screen and sample its current frame with drawImage.
  const fireEl = document.createElement('img');
  fireEl.src = FIRE_URL;
  fireEl.setAttribute('aria-hidden', 'true');
  fireEl.style.cssText = 'position:fixed;left:-99999px;top:0;width:64px;height:auto;opacity:0.01;pointer-events:none;';
  fireEl.onload = () => { fireOk = true; };
  document.body.appendChild(fireEl);

  const nodeSolved = new Array<boolean>(n).fill(false);
  const segHeat = new Float32Array(segCount);
  const segTarget = new Float32Array(segCount);
  const segIgniteAt = new Float32Array(segCount).fill(-1);

  // Offscreen buffers for the fire compositing (fire layers + feather mask).
  let fbuf: HTMLCanvasElement | null = null, fbx: CanvasRenderingContext2D | null = null;
  let mbuf: HTMLCanvasElement | null = null, mbx: CanvasRenderingContext2D | null = null;

  let cssW = 1, cssH = STAGE_HEIGHT, dpr = 1;
  let raf = 0, disposed = false;
  const t0 = performance.now();
  const swayAmp = opts.reducedMotion ? 0 : 2.4;

  const nodeX = (i: number) => NODE_MARGIN + i * NODE_SPACING;
  const bandCenter = (t: number) => cssH / 2 + Math.sin(t * 0.6) * swayAmp;
  const tileW = (img: HTMLImageElement) => CHAIN_H * ((img.naturalWidth || 1) / (img.naturalHeight || 1));

  // Tile a chain image across [x0,x1] at a shared phase, clipped to the band.
  function drawChain(img: HTMLImageElement, x0: number, x1: number, cy: number, alpha: number) {
    if (x1 <= x0) return;
    const tw = tileW(img), top = cy - CHAIN_H / 2;
    ctx.save();
    ctx.beginPath(); ctx.rect(x0, top, x1 - x0, CHAIN_H); ctx.clip();
    ctx.globalAlpha = alpha;
    ctx.imageSmoothingEnabled = true;
    const start = Math.floor(x0 / tw) * tw;
    for (let x = start; x < x1; x += tw) ctx.drawImage(img, x, top, tw, CHAIN_H);
    ctx.restore();
  }

  // Red-hot glow that makes the metal in a burning segment look heated — a soft
  // ellipse along the chain line, additive, fading out in every direction (no
  // hard edges). Scaled by heat so it ramps in with the ignition.
  function hotChain(x0: number, x1: number, cy: number, t: number, s: number, heat: number, glow: [number, number, number]) {
    if (x1 <= x0) return;
    const flick = 0.82 + 0.18 * vnoise(t * 2.4 + s * 1.3);
    const cx = (x0 + x1) / 2, rx = (x1 - x0) / 2 + 14, ry = CHAIN_H * 0.72;
    const [r, gr, b] = glow;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.translate(cx, cy); ctx.scale(1, ry / rx);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    g.addColorStop(0, `rgba(${r},${gr},${b},${0.55 * flick * heat})`);
    g.addColorStop(0.55, `rgba(${r},${gr},${b},${0.26 * flick * heat})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, rx, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // Animated fire from the GIF: window a slice per burning segment, animate in
  // place (drift + bob + flicker) as two additive layers into an offscreen
  // buffer, then feather every edge with a single UNIONED soft-ellipse mask so
  // it reads as flame, never a rectangle. The burning chain stays visible under.
  function drawFire(t: number, bandCY: number, hueDeg: number) {
    if (!fireOk) return;
    let anyHot = false;
    for (let s = 0; s < segCount; s++) if (segHeat[s] >= 0.02) { anyHot = true; break; }
    if (!anyHot) return;

    if (!fbuf) { fbuf = document.createElement('canvas'); fbx = fbuf.getContext('2d'); }
    if (fbuf.width !== cssW || fbuf.height !== cssH) { fbuf.width = cssW; fbuf.height = cssH; }
    if (!mbuf) { mbuf = document.createElement('canvas'); mbx = mbuf.getContext('2d'); }
    if (mbuf.width !== cssW || mbuf.height !== cssH) { mbuf.width = cssW; mbuf.height = cssH; }
    const fc = fbx!, mc = mbx!;
    const IW = fireEl.naturalWidth || 640, IH = fireEl.naturalHeight || 356;
    const ft = opts.reducedMotion ? 1.7 : t;

    fc.setTransform(1, 0, 0, 1, 0, 0);
    fc.clearRect(0, 0, cssW, cssH);
    fc.globalCompositeOperation = 'lighter';
    fc.imageSmoothingEnabled = true;
    for (let s = 0; s < segCount; s++) {
      const heat = segHeat[s];
      if (heat < 0.02) continue;
      const x0 = nodeX(s), x1 = nodeX(s + 1);
      if (x1 <= x0) continue;
      const destW = (x1 - x0) + FIRE_PAD * 2, fh = FIRE_DISP_H, scale = fh / IH;
      const srcW = Math.min(IW, destW / scale), range = Math.max(0, IW - srcW);
      const drift = Math.sin(ft * 0.5 + s * 1.7) * 0.5 + 0.5;
      const bob = opts.reducedMotion ? 0 : Math.sin(ft * 2.1 + s) * 3;
      const srcX = Math.max(0, Math.min(range, range * (((s * 0.37 + 0.12 * drift) % 1))));
      const top = bandCY - fh * FIRE_BASE + bob;
      fc.globalAlpha = Math.min(1, heat * (0.56 + 0.15 * vnoise(ft * 3 + s * 2.1)));
      fc.drawImage(fireEl, srcX, 0, srcW, IH, x0 - FIRE_PAD, top, destW, fh);
      const fh2 = fh * 1.16, top2 = bandCY - fh2 * FIRE_BASE + bob * 0.6;
      const srcX2 = Math.max(0, Math.min(range, range * (((s * 0.61 + 0.5) % 1))));
      fc.globalAlpha = Math.min(1, heat * (0.34 + 0.11 * vnoise(ft * 4.3 + s * 3.7)));
      fc.save(); fc.translate(x0 - FIRE_PAD + destW / 2, top2); fc.scale(-1, 1);
      fc.drawImage(fireEl, srcX2, 0, srcW, IH, -destW / 2, 0, destW, fh2); fc.restore();
    }
    fc.globalAlpha = 1;

    // Feather only the edges — a horizontal fade at each segment's ends and a
    // vertical fade at the flame tips — so the gif keeps its own flame
    // silhouette and there are no hard rectangle borders.
    mc.setTransform(1, 0, 0, 1, 0, 0);
    mc.clearRect(0, 0, cssW, cssH);
    mc.globalCompositeOperation = 'source-over';
    for (let s = 0; s < segCount; s++) {
      if (segHeat[s] < 0.02) continue;
      const x0 = nodeX(s) - FIRE_PAD, x1 = nodeX(s + 1) + FIRE_PAD;
      const g = mc.createLinearGradient(x0, 0, x1, 0), fw = 30 / (x1 - x0);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(fw, 'rgba(0,0,0,1)');
      g.addColorStop(1 - fw, 'rgba(0,0,0,1)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      mc.fillStyle = g; mc.fillRect(x0, 0, x1 - x0, cssH);
    }
    // vertical top-fade so flame tips dissipate instead of hard-cutting
    const vg = mc.createLinearGradient(0, bandCY - FIRE_DISP_H * 0.9, 0, bandCY - FIRE_DISP_H * 0.46);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,1)');
    mc.globalCompositeOperation = 'destination-in';
    mc.fillStyle = vg; mc.fillRect(0, 0, cssW, cssH);
    mc.globalCompositeOperation = 'source-over';
    fc.globalCompositeOperation = 'destination-in';
    fc.drawImage(mbuf, 0, 0);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.imageSmoothingEnabled = true;
    // recolour the orange gif to the current progress heat (green→red)
    ctx.filter = `hue-rotate(${hueDeg}deg) saturate(1.18)`;
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

    // Progress heat — the more challenges are solved, the hotter the fire runs:
    // green (first solve) → yellow → orange → red (all solved).
    let solvedCount = 0;
    for (let i = 0; i < n; i++) if (nodeSolved[i]) solvedCount++;
    const progress = n > 1 ? (solvedCount - 1) / (n - 1) : 0;
    const hc = heatColor(progress);

    // The SAME steel chain runs through every segment, solved or not — the
    // flame (and its heat colour) is what marks a solved pair, so the chain
    // itself stays fully readable underneath it (no red-hot swap).
    if (steelOk && n > 1) {
      drawChain(steel, nodeX(0), nodeX(n - 1), bandCY, 1);
      for (let s = 0; s < segCount; s++) {
        if (segHeat[s] > 0.02) hotChain(nodeX(s), nodeX(s + 1), bandCY, t, s, segHeat[s], hc.glow);
      }
    }

    drawFire(t, bandCY, hc.deg);

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
    destroy() {
      disposed = true;
      cancelAnimationFrame(raf);
      if (fireEl.parentNode) fireEl.parentNode.removeChild(fireEl);
    },
  };
}
