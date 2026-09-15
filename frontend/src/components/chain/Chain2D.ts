// The chain renderer — 2D canvas, but each link is a PRE-RENDERED polished-steel
// sprite (an elongated stadium ring with real chrome shading and specular
// highlights), stamped and woven along the path so the result reads like an
// actual metal chain — not a hand-drawn ring. Links alternate flat / edge and
// draw over-under so they look physically interlocked. Solved-pair segments
// ignite with natural orange fire and the steel near it heats up (a second,
// orange sprite cross-faded by heat). Slow, weighted sway.
//
// Clickable challenge boxes are HTML, positioned each frame from the node
// centres reported via onNodes.

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

export const NODE_SPACING = 300;
export const NODE_MARGIN = 130;
export const STAGE_HEIGHT = 300;
const BOX_HALF = 78;

const LINK_L = 60;   // link length (long axis)
const LINK_H = 34;   // link height (short axis)
const ROD = 10;      // metal rod thickness
const PAD = 9;       // sprite padding
const STEP = LINK_L * 0.5; // centre spacing (~50% overlap → interlock)
const SS = 3;        // supersample for crisp sprites
const IGNITE_MS = 1300;
const FIRE_SCALE = 0.32; // low-res factor for the procedural fire buffer
const FLAME_H = 108;     // flame height in CSS px at full heat
const FIRE_MS = 33;      // rebuild the fire buffer at ~30fps (cheap on mobile)

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

// Render one polished link into an offscreen canvas. `hot` gives the orange
// heated variant. Returns { canvas, w, h } in CSS px.
function makeLinkSprite(hot: boolean) {
  const w = LINK_L + PAD * 2;
  const h = LINK_H + PAD * 2;
  const c = document.createElement('canvas');
  c.width = Math.round(w * SS);
  c.height = Math.round(h * SS);
  const g = c.getContext('2d')!;
  g.scale(SS, SS);
  const cx = w / 2, cy = h / 2;

  const outer = () => g.roundRect(cx - LINK_L / 2, cy - LINK_H / 2, LINK_L, LINK_H, LINK_H / 2);
  const inner = () => g.roundRect(cx - LINK_L / 2 + ROD, cy - LINK_H / 2 + ROD, LINK_L - 2 * ROD, LINK_H - 2 * ROD, (LINK_H - 2 * ROD) / 2);

  // Ring body — a chrome-horizon vertical gradient: bright "sky" highlight up
  // top, a dark horizon band through the middle, a second bright "ground"
  // reflection lower down. That double-bright ramp is what makes each rod read
  // as a rounded polished tube instead of a flat band.
  const grad = g.createLinearGradient(0, cy - LINK_H / 2, 0, cy + LINK_H / 2);
  if (hot) {
    grad.addColorStop(0.00, '#ffdca0');
    grad.addColorStop(0.14, '#fff0d0');
    grad.addColorStop(0.30, '#f5a24e');
    grad.addColorStop(0.46, '#7a3410');
    grad.addColorStop(0.56, '#93481a');
    grad.addColorStop(0.72, '#ffcf85');
    grad.addColorStop(0.86, '#c06a26');
    grad.addColorStop(1.00, '#5a2a0c');
  } else {
    grad.addColorStop(0.00, '#e8eef3');
    grad.addColorStop(0.13, '#ffffff');
    grad.addColorStop(0.30, '#9aa6b0');
    grad.addColorStop(0.46, '#3f4852');
    grad.addColorStop(0.55, '#59636d');
    grad.addColorStop(0.72, '#f1f5f8');
    grad.addColorStop(0.86, '#aeb8c0');
    grad.addColorStop(1.00, '#58626b');
  }
  g.beginPath(); outer(); inner(); g.fillStyle = grad; g.fill('evenodd');

  // Inner-hole shadow so the opening reads as a real pierced ring.
  g.save();
  g.beginPath(); inner(); g.clip();
  g.shadowColor = 'rgba(0,0,0,0.55)'; g.shadowBlur = 4; g.lineWidth = 3;
  g.strokeStyle = 'rgba(0,0,0,0.5)'; g.beginPath(); inner(); g.stroke();
  g.restore();

  // Clip to the ring for the speculars.
  g.save();
  g.beginPath(); outer(); inner(); g.clip('evenodd');

  // Crisp specular on the TOP rod.
  const topY = cy - LINK_H / 2;
  const s1 = g.createLinearGradient(0, topY + ROD * 0.15, 0, topY + ROD * 1.0);
  s1.addColorStop(0, 'rgba(255,255,255,0)');
  s1.addColorStop(0.5, hot ? 'rgba(255,248,225,0.95)' : 'rgba(255,255,255,0.98)');
  s1.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = s1;
  g.fillRect(cx - LINK_L / 2, topY + ROD * 0.05, LINK_L, ROD * 1.1);

  // Secondary specular on the BOTTOM rod (ground bounce).
  const botY = cy + LINK_H / 2;
  const s2 = g.createLinearGradient(0, botY - ROD * 1.0, 0, botY - ROD * 0.15);
  s2.addColorStop(0, 'rgba(255,255,255,0)');
  s2.addColorStop(0.5, hot ? 'rgba(255,210,150,0.7)' : 'rgba(240,248,255,0.75)');
  s2.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = s2;
  g.fillRect(cx - LINK_L / 2, botY - ROD * 1.1, LINK_L, ROD * 1.0);
  g.restore();

  // Edge definition.
  g.lineWidth = 1.1;
  g.strokeStyle = 'rgba(4,7,10,0.9)';
  g.beginPath(); outer(); g.stroke();
  g.lineWidth = 0.9;
  g.strokeStyle = 'rgba(4,7,10,0.55)';
  g.beginPath(); inner(); g.stroke();

  return { canvas: c, w, h };
}

export function createChain2D(canvas: HTMLCanvasElement, opts: Chain2DOptions): Chain2DHandle {
  const ctx = canvas.getContext('2d')!;
  const n = Math.max(1, opts.nodeCount);
  const segCount = Math.max(0, n - 1);

  const cold = makeLinkSprite(false);
  const hotS = makeLinkSprite(true);

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
  const swayAmp = opts.reducedMotion ? 0 : 7;

  function nodeAt(i: number, t: number): Chain2DNode {
    const x = NODE_MARGIN + i * NODE_SPACING;
    const y = cssH / 2 + Math.sin(t * 0.9 + i * 0.8) * swayAmp;
    return { x, y };
  }
  function seg(i: number, f: number, t: number): Chain2DNode {
    const a = nodeAt(i, t), b = nodeAt(i + 1, t);
    const x = a.x + (b.x - a.x) * f;
    const droop = Math.sin(f * Math.PI) * 14 * (opts.reducedMotion ? 0.3 : 1);
    return { x, y: a.y + (b.y - a.y) * f + droop };
  }

  function stampLink(x: number, y: number, angle: number, narrow: boolean, heat: number) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    // Alternate links stand on edge, rotated 90° and foreshortened, so they read
    // as a real interlocked chain instead of a row of flat beads.
    if (narrow) { ctx.rotate(Math.PI / 2); ctx.scale(1, 0.5); }
    ctx.drawImage(cold.canvas, -cold.w / 2, -cold.h / 2, cold.w, cold.h);
    if (heat > 0.02) {
      ctx.globalAlpha = heat;
      ctx.drawImage(hotS.canvas, -hotS.w / 2, -hotS.h / 2, hotS.w, hotS.h);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  function segLinks(s: number, t: number): { x: number; y: number; angle: number }[] {
    const a = nodeAt(s, t), b = nodeAt(s + 1, t);
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    if (dist < 1) return [];
    const inset = (BOX_HALF + 2) / dist;
    const startF = Math.min(0.5, inset), endF = Math.max(0.5, 1 - inset);
    const usable = dist * (endF - startF);
    const count = Math.max(3, Math.round(usable / STEP));
    const out: { x: number; y: number; angle: number }[] = [];
    for (let k = 0; k <= count; k++) {
      const f = startF + (endF - startF) * (k / count);
      const p = seg(s, f, t);
      const p2 = seg(s, Math.min(endF, f + 0.01), t);
      out.push({ x: p.x, y: p.y, angle: Math.atan2(p2.y - p.y, p2.x - p.x) });
    }
    return out;
  }

  // Procedural turbulent fire. A scrolling multi-octave value-noise field is
  // thresholded against a vertical falloff and colour-ramped (dark red → orange
  // → yellow → near-white), rendered into a small buffer and up-scaled with
  // smoothing so it blurs into soft, realistic flame — not cartoon shapes.
  // The per-pixel pass is throttled to ~30fps; the glow/embers run every frame.
  function rebuildFireBuffer(t: number) {
    const w = Math.max(1, Math.round(cssW * FIRE_SCALE));
    const h = Math.max(1, Math.round(cssH * FIRE_SCALE));
    if (!fireBuf) { fireBuf = document.createElement('canvas'); fireCtx = fireBuf.getContext('2d'); }
    if (fireBuf.width !== w || fireBuf.height !== h) { fireBuf.width = w; fireBuf.height = h; }
    const fc = fireCtx!;
    const img = fc.createImageData(w, h);
    const d = img.data;
    const ft = opts.reducedMotion ? 1.7 : t; // freeze the scroll under reduced motion

    for (let s = 0; s < segCount; s++) {
      const heat = segHeat[s];
      if (heat < 0.02) continue;
      const links = segLinks(s, t);
      if (links.length === 0) continue;
      const xL = links[0].x, xR = links[links.length - 1].x;
      const yL = links[0].y, yR = links[links.length - 1].y;
      const seed = s * 37.7;
      const flameH = FLAME_H * heat;
      const bx0 = Math.max(0, Math.floor((xL - LINK_H) * FIRE_SCALE));
      const bx1 = Math.min(w - 1, Math.ceil((xR + LINK_H) * FIRE_SCALE));
      const by0 = Math.max(0, Math.floor((Math.min(yL, yR) - flameH - 12) * FIRE_SCALE));
      const by1 = Math.min(h - 1, Math.ceil((Math.max(yL, yR) + 12) * FIRE_SCALE));
      for (let ly = by0; ly <= by1; ly++) {
        const py = ly / FIRE_SCALE;
        for (let lx = bx0; lx <= bx1; lx++) {
          const px = lx / FIRE_SCALE;
          const fx = (px - xL) / ((xR - xL) || 1);
          if (fx < -0.1 || fx > 1.1) continue;
          const baseY = yL + (yR - yL) * Math.min(1, Math.max(0, fx));
          const above = baseY - py;
          if (above < -9) continue;
          const nh = above / flameH;
          if (nh > 1.08) continue;
          const nn = fbm2(px * 0.02 + seed, py * 0.032 - ft * 1.5);
          const warp = fbm2(px * 0.055 + seed * 2, py * 0.07 - ft * 2.2);
          let v = (nn * 0.72 + warp * 0.28) * 1.55 - nh;
          if (above < 0) v -= (-above) * 0.06;
          const eo = Math.abs(fx - 0.5) * 2;
          const edge = eo < 0.9 ? 1 : 1 - (eo - 0.9) / 0.2;
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

  function drawFire(now: number, t: number) {
    let anyHot = false;
    for (let s = 0; s < segCount; s++) if (segHeat[s] >= 0.02) { anyHot = true; break; }
    if (!anyHot) return;

    if (lastFire < 0 || now - lastFire >= FIRE_MS) { rebuildFireBuffer(t); lastFire = now; }
    if (fireBuf) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(fireBuf, 0, 0, cssW, cssH);
      ctx.restore();
    }

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let s = 0; s < segCount; s++) {
      const heat = segHeat[s];
      if (heat < 0.02) continue;
      const links = segLinks(s, t);
      for (let k = 0; k < links.length; k++) {
        const p = links[k];
        // warm ambient glow hugging each burning link
        const r = LINK_H * 1.7;
        const gl = ctx.createRadialGradient(p.x, p.y - LINK_H * 0.2, 0, p.x, p.y - LINK_H * 0.2, r);
        gl.addColorStop(0, `rgba(255,120,35,${0.14 * heat})`);
        gl.addColorStop(1, 'rgba(255,70,10,0)');
        ctx.fillStyle = gl;
        ctx.beginPath(); ctx.arc(p.x, p.y - LINK_H * 0.2, r, 0, Math.PI * 2); ctx.fill();
        // rising embers
        if (!opts.reducedMotion) {
          const seed = s * 13 + k;
          const rise = (t * 0.5 + seed * 0.37) % 1;
          const ea = (1 - rise) * heat * 0.9;
          if (ea > 0.04) {
            ctx.fillStyle = `rgba(255,205,130,${ea})`;
            ctx.beginPath();
            ctx.arc(p.x + (vnoise(seed + Math.floor(t * 0.5 + seed * 0.37)) - 0.5) * LINK_H * 1.4,
              p.y - LINK_H * 0.2 - rise * FLAME_H * 1.15, 1.5 * (1 - rise) + 0.4, 0, Math.PI * 2);
            ctx.fill();
          }
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

    for (let i = 0; i < n; i++) {
      if (!nodeSolved[i]) continue;
      const p = nodeAt(i, t);
      const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, LINK_L * 0.7);
      glow.addColorStop(0, 'rgba(198,255,0,0.12)');
      glow.addColorStop(1, 'rgba(198,255,0,0)');
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(p.x, p.y, LINK_L * 0.7, 0, Math.PI * 2); ctx.fill();
    }

    // Chain — two-pass weave: edge links behind, flat links in front.
    for (let s = 0; s < segCount; s++) {
      const links = segLinks(s, t);
      const heat = segHeat[s];
      for (let k = 0; k < links.length; k++) if (k % 2 === 1) stampLink(links[k].x, links[k].y, links[k].angle, true, heat);
      for (let k = 0; k < links.length; k++) if (k % 2 === 0) stampLink(links[k].x, links[k].y, links[k].angle, false, heat);
    }

    // Fire is drawn over the whole chain in one pass (procedural noise buffer).
    drawFire(now, t);

    if (opts.onNodes) {
      const nodes: Chain2DNode[] = [];
      for (let i = 0; i < n; i++) nodes.push(nodeAt(i, t));
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
