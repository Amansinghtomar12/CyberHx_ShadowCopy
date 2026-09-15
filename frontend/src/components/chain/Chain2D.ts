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

const LINK_L = 58;   // link length (long axis)
const LINK_H = 32;   // link height (short axis)
const ROD = 8.5;     // metal rod thickness
const PAD = 8;       // sprite padding
const STEP = LINK_L * 0.5; // centre spacing (~50% overlap → interlock)
const SS = 3;        // supersample for crisp sprites
const IGNITE_MS = 1300;

export function chainContentWidth(nodeCount: number): number {
  const n = Math.max(1, nodeCount);
  return NODE_MARGIN * 2 + (n - 1) * NODE_SPACING;
}

function hash(n: number): number { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); }
function vnoise(x: number): number {
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  return hash(i) * (1 - u) + hash(i + 1) * u;
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

  // Ring body — vertical chrome gradient (bright top, specular band, dark base,
  // cool bottom bounce).
  const grad = g.createLinearGradient(0, cy - LINK_H / 2, 0, cy + LINK_H / 2);
  if (hot) {
    grad.addColorStop(0.00, '#ffe8bd');
    grad.addColorStop(0.16, '#fff1d6');
    grad.addColorStop(0.34, '#f0a85a');
    grad.addColorStop(0.56, '#c46a24');
    grad.addColorStop(0.78, '#6f3410');
    grad.addColorStop(1.00, '#3a1c0a');
  } else {
    grad.addColorStop(0.00, '#dfe6ec');
    grad.addColorStop(0.16, '#ffffff');
    grad.addColorStop(0.34, '#b3bcc5');
    grad.addColorStop(0.56, '#6a747f');
    grad.addColorStop(0.78, '#2b333b');
    grad.addColorStop(1.00, '#465562');
  }
  g.beginPath(); outer(); inner(); g.fillStyle = grad; g.fill('evenodd');

  // Clip to the ring for the highlights.
  g.save();
  g.beginPath(); outer(); inner(); g.clip('evenodd');

  // Crisp specular line along the upper part of the rod.
  const spec = g.createLinearGradient(0, cy - LINK_H / 2 + ROD * 0.2, 0, cy - LINK_H / 2 + ROD * 1.1);
  spec.addColorStop(0, hot ? 'rgba(255,255,230,0.0)' : 'rgba(255,255,255,0.0)');
  spec.addColorStop(0.5, hot ? 'rgba(255,250,225,0.95)' : 'rgba(255,255,255,0.95)');
  spec.addColorStop(1, 'rgba(255,255,255,0.0)');
  g.fillStyle = spec;
  g.fillRect(cx - LINK_L / 2, cy - LINK_H / 2 + ROD * 0.1, LINK_L, ROD * 1.2);

  // Soft lower reflection.
  g.fillStyle = hot ? 'rgba(255,150,60,0.18)' : 'rgba(150,175,200,0.18)';
  g.fillRect(cx - LINK_L / 2, cy + LINK_H / 2 - ROD * 1.1, LINK_L, ROD);
  g.restore();

  // Edge definition.
  g.lineWidth = 1;
  g.strokeStyle = 'rgba(6,9,12,0.85)';
  g.beginPath(); outer(); g.stroke();
  g.strokeStyle = 'rgba(6,9,12,0.6)';
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

  // Soft, rounded fire: an ember-glow band low over the links, then per-link
  // flame tongues built from a few overlapping radial puffs (hot base → white
  // core, tapering as they rise). No hard triangles — reads like real flame.
  function drawFire(links: { x: number; y: number }[], heat: number, t: number, sIdx: number) {
    if (links.length === 0) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    // Warm ambient glow hugging the burning links.
    for (let k = 0; k < links.length; k++) {
      const p = links[k];
      const r = LINK_H * 1.9;
      const gl = ctx.createRadialGradient(p.x, p.y - LINK_H * 0.15, 0, p.x, p.y - LINK_H * 0.15, r);
      gl.addColorStop(0, `rgba(255,120,35,${0.16 * heat})`);
      gl.addColorStop(1, 'rgba(255,70,10,0)');
      ctx.fillStyle = gl;
      ctx.beginPath(); ctx.arc(p.x, p.y - LINK_H * 0.15, r, 0, Math.PI * 2); ctx.fill();
    }

    const PUFFS = 5;
    for (let k = 0; k < links.length; k++) {
      const p = links[k];
      const seed = sIdx * 13 + k;
      const flick = vnoise(t * 6 + seed * 3.1);
      const flick2 = vnoise(t * 9 + seed * 1.7);
      const hgt = LINK_H * (1.3 + 0.7 * flick) * heat;
      const baseY = p.y - LINK_H * 0.2;
      for (let j = 0; j < PUFFS; j++) {
        const fr = j / (PUFFS - 1);            // 0 base → 1 tip
        const sway = opts.reducedMotion ? 0 : Math.sin(t * 4 + seed + j * 1.3) * LINK_H * 0.18 * fr;
        const jx = p.x + sway + (flick2 - 0.5) * LINK_H * 0.3 * fr;
        const py = baseY - hgt * fr;
        const rad = LINK_H * (0.62 - 0.42 * fr) * (0.9 + 0.3 * flick);
        // hot orange low, yellow mid, near-white tip
        const cr = 255;
        const cg = fr < 0.45 ? 110 + 90 * (fr / 0.45) : 200 + 45 * ((fr - 0.45) / 0.55);
        const cb = fr < 0.45 ? 35 : 60 + 150 * ((fr - 0.45) / 0.55);
        const a = (0.5 - 0.28 * fr) * heat;
        const g = ctx.createRadialGradient(jx, py, 0, jx, py, rad);
        g.addColorStop(0, `rgba(${cr},${Math.round(cg)},${Math.round(cb)},${a})`);
        g.addColorStop(1, `rgba(${cr},${Math.round(cg)},${Math.round(cb)},0)`);
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(jx, py, rad, 0, Math.PI * 2); ctx.fill();
      }
      if (!opts.reducedMotion) {
        const rise = (t * 0.6 + seed * 0.37) % 1;
        const ea = (1 - rise) * heat * 0.9;
        if (ea > 0.03) {
          ctx.fillStyle = `rgba(255,200,120,${ea})`;
          ctx.beginPath();
          ctx.arc(p.x + (flick - 0.5) * LINK_H * 1.1, baseY - rise * LINK_H * 2.6, 1.5 * (1 - rise) + 0.5, 0, Math.PI * 2);
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

    for (let i = 0; i < n; i++) {
      if (!nodeSolved[i]) continue;
      const p = nodeAt(i, t);
      const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, LINK_L * 0.8);
      glow.addColorStop(0, 'rgba(198,255,0,0.18)');
      glow.addColorStop(1, 'rgba(198,255,0,0)');
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(p.x, p.y, LINK_L * 0.8, 0, Math.PI * 2); ctx.fill();
    }

    // Chain — two-pass weave: edge links behind, flat links in front.
    for (let s = 0; s < segCount; s++) {
      const links = segLinks(s, t);
      const heat = segHeat[s];
      for (let k = 0; k < links.length; k++) if (k % 2 === 1) stampLink(links[k].x, links[k].y, links[k].angle, true, heat);
      for (let k = 0; k < links.length; k++) if (k % 2 === 0) stampLink(links[k].x, links[k].y, links[k].angle, false, heat);
      if (heat > 0.02) drawFire(links, heat, t, s);
    }

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
