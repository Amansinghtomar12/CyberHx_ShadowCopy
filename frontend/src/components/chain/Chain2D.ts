// The chain renderer — a high-detail 2D canvas chain, themed to the platform
// (dark ground, acid-lime #c6ff00 accent). It draws a REAL interlocking metal
// chain: elongated tube links, alternating face/edge orientation and
// overlapping so they physically interlock, with 3D metallic shading and a
// green sheen. When both challenges a segment connects are solved, that segment
// is engulfed in real-time GREEN fire (Ghost-Rider style, theme colour): a
// broad glow, licking flames, rising embers, and green-hot metal.
//
// The renderer owns the chain art + node geometry; the clickable challenge
// boxes are HTML, positioned each frame from the node centres it reports via
// onNodes, so they bob with the chain.

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

export const NODE_SPACING = 340;   // distance between node centres (content px)
export const NODE_MARGIN = 150;    // left/right padding so end boxes fit
export const STAGE_HEIGHT = 340;   // stage height in CSS px
const BOX_HALF = 84;               // half the challenge box width (link inset)
const LINK = 76;                   // link long-axis length
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

export function createChain2D(canvas: HTMLCanvasElement, opts: Chain2DOptions): Chain2DHandle {
  const ctx = canvas.getContext('2d')!;
  const n = Math.max(1, opts.nodeCount);
  const segCount = Math.max(0, n - 1);

  const nodeSolved = new Array<boolean>(n).fill(false);
  const segHeat = new Float32Array(segCount);
  const segTarget = new Float32Array(segCount);
  const segIgniteAt = new Float32Array(segCount).fill(-1);

  let cssW = 1, cssH = STAGE_HEIGHT, dpr = 1;
  let raf = 0, disposed = false;
  const t0 = performance.now();
  const swayAmp = opts.reducedMotion ? 0 : 9;

  function nodeAt(i: number, t: number): Chain2DNode {
    const x = NODE_MARGIN + i * NODE_SPACING;
    const y = cssH / 2 + Math.sin(t * 1.0 + i * 0.9) * swayAmp;
    return { x, y };
  }
  // Point along a segment, with a hanging droop + slow shake.
  function seg(i: number, f: number, t: number): Chain2DNode {
    const a = nodeAt(i, t), b = nodeAt(i + 1, t);
    const x = a.x + (b.x - a.x) * f;
    const droop = Math.sin(f * Math.PI) * 16 * (opts.reducedMotion ? 0.35 : 1);
    const shake = opts.reducedMotion ? 0 : Math.sin(t * 1.4 + x * 0.02) * swayAmp * 0.5;
    return { x, y: a.y + (b.y - a.y) * f + droop + shake };
  }

  // A single metallic tube link. kind 'face' = ring seen flat (long oval),
  // 'edge' = ring threaded through, seen side-on (narrow, taller). heat 0..1
  // shifts the steel to green-hot.
  function drawLink(x: number, y: number, angle: number, kind: 'face' | 'edge', heat: number) {
    const rx = kind === 'face' ? LINK * 0.5 : LINK * 0.2;
    const ry = kind === 'face' ? LINK * 0.3 : LINK * 0.37;
    const tube = LINK * 0.15;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.lineCap = 'round';
    const ring = () => { ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); };

    // 1. dark base — the tube's shadow silhouette.
    ring(); ctx.lineWidth = tube * 1.2; ctx.strokeStyle = 'rgba(3,6,3,0.92)'; ctx.stroke();

    // 2. body — vertical gradient gives the rounded-tube read; green-tinted steel.
    const g = ctx.createLinearGradient(0, -ry - tube, 0, ry + tube);
    if (heat > 0.02) {
      g.addColorStop(0, '#f2ffc4'); g.addColorStop(0.45, '#a9e226'); g.addColorStop(1, '#284407');
    } else {
      g.addColorStop(0, '#c4ceb6'); g.addColorStop(0.5, '#4a5446'); g.addColorStop(1, '#11150e');
    }
    ring(); ctx.lineWidth = tube; ctx.strokeStyle = g; ctx.stroke();

    // 3. green sheen ring (subtle when cold, strong when hot).
    ring(); ctx.lineWidth = tube * 0.5;
    ctx.strokeStyle = heat > 0.02 ? 'rgba(233,255,176,0.85)' : 'rgba(198,255,0,0.12)';
    ctx.stroke();

    // 4. specular highlight along the top of the tube.
    ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, Math.PI * 1.15, Math.PI * 1.85);
    ctx.lineWidth = tube * 0.3;
    ctx.strokeStyle = heat > 0.02 ? 'rgba(255,255,235,0.9)' : 'rgba(236,246,226,0.7)';
    ctx.stroke();

    // 5. hot glow.
    if (heat > 0.02) {
      ctx.shadowColor = 'rgba(160,230,20,0.95)';
      ctx.shadowBlur = 20 * heat;
      ring(); ctx.lineWidth = tube * 0.42; ctx.strokeStyle = `rgba(205,255,95,${0.75 * heat})`; ctx.stroke();
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  }

  function drawSegmentLinks(s: number, t: number, heat: number) {
    const a = nodeAt(s, t), b = nodeAt(s + 1, t);
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    if (dist < 1) return;
    const inset = (BOX_HALF + 4) / dist;
    const startF = Math.min(0.5, inset), endF = Math.max(0.5, 1 - inset);
    const usable = dist * (endF - startF);
    const count = Math.max(3, Math.round(usable / (LINK * 0.52)));
    for (let k = 0; k <= count; k++) {
      const f = startF + (endF - startF) * (k / count);
      const p = seg(s, f, t);
      const p2 = seg(s, Math.min(endF, f + 0.01), t);
      const angle = Math.atan2(p2.y - p.y, p2.x - p.x);
      drawLink(p.x, p.y, angle, k % 2 === 0 ? 'face' : 'edge', heat);
    }
  }

  function drawFire(s: number, t: number, heat: number) {
    const a = nodeAt(s, t), b = nodeAt(s + 1, t);
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    if (dist < 1) return;
    const inset = (BOX_HALF + 4) / dist;
    const startF = Math.min(0.5, inset), endF = Math.max(0.5, 1 - inset);

    // Broad green glow enveloping the whole burning segment.
    ctx.save();
    ctx.beginPath();
    for (let k = 0; k <= 24; k++) {
      const p = seg(s, startF + (endF - startF) * (k / 24), t);
      if (k === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    }
    ctx.strokeStyle = `rgba(150,230,20,${0.16 * heat})`;
    ctx.lineWidth = LINK * 1.15;
    ctx.lineCap = 'round';
    ctx.shadowColor = 'rgba(170,255,30,0.9)';
    ctx.shadowBlur = 34 * heat;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.restore();

    // Licking flames + embers along the chain.
    const usable = dist * (endF - startF);
    const flames = Math.max(6, Math.round(usable / (LINK * 0.42)));
    for (let k = 0; k <= flames; k++) {
      const f = startF + (endF - startF) * (k / flames);
      const p = seg(s, f, t);
      const seed = s * 13 + k;
      const flick = vnoise(t * 9 + seed * 5.3);
      const flick2 = vnoise(t * 13 + seed * 2.1);
      const h = LINK * (0.7 + 1.1 * flick) * heat;
      const w = LINK * (0.22 + 0.12 * flick2);
      const baseY = p.y - LINK * 0.18;
      const tipX = p.x + (flick2 - 0.5) * LINK * 0.5;
      const topY = baseY - h;
      const grad = ctx.createLinearGradient(p.x, baseY, tipX, topY);
      grad.addColorStop(0, 'rgba(120,190,20,0)');
      grad.addColorStop(0.2, `rgba(130,200,20,${0.4 * heat})`);
      grad.addColorStop(0.6, `rgba(198,255,0,${0.6 * heat})`);
      grad.addColorStop(1, `rgba(240,255,190,${0.9 * heat})`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(p.x - w, baseY);
      ctx.quadraticCurveTo(p.x - w * 0.5, baseY - h * 0.55, tipX, topY);
      ctx.quadraticCurveTo(p.x + w * 0.5, baseY - h * 0.55, p.x + w, baseY);
      ctx.quadraticCurveTo(p.x, baseY + LINK * 0.12, p.x - w, baseY);
      ctx.fill();
      // bright core
      ctx.fillStyle = `rgba(240,255,205,${0.5 * heat})`;
      ctx.beginPath();
      ctx.ellipse(p.x, baseY - h * 0.28, w * 0.34, h * 0.32, 0, 0, Math.PI * 2);
      ctx.fill();
      // rising ember
      if (!opts.reducedMotion) {
        const rise = (t * 0.7 + seed) % 1;
        const ex = p.x + (flick - 0.5) * LINK * 0.5;
        const ey = baseY - rise * LINK * 2.2;
        const ea = (1 - rise) * heat;
        if (ea > 0.02) {
          ctx.fillStyle = `rgba(215,255,120,${ea})`;
          ctx.beginPath();
          ctx.arc(ex, ey, 2.2 * (1 - rise) + 0.6, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
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

    // Solved-node anchor glow (behind the HTML boxes).
    for (let i = 0; i < n; i++) {
      if (!nodeSolved[i]) continue;
      const p = nodeAt(i, t);
      const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, LINK * 1.3);
      glow.addColorStop(0, 'rgba(198,255,0,0.24)');
      glow.addColorStop(1, 'rgba(198,255,0,0)');
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(p.x, p.y, LINK * 1.3, 0, Math.PI * 2); ctx.fill();
    }

    // Metal links.
    ctx.globalCompositeOperation = 'source-over';
    for (let s = 0; s < segCount; s++) drawSegmentLinks(s, t, segHeat[s]);

    // Green fire (additive) over the burning segments.
    ctx.globalCompositeOperation = 'lighter';
    for (let s = 0; s < segCount; s++) if (segHeat[s] > 0.02) drawFire(s, t, segHeat[s]);
    ctx.globalCompositeOperation = 'source-over';

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
      cssW = Math.max(1, w);
      cssH = Math.max(1, h);
      dpr = Math.min(ratio, 2.5); // crisp on 4K / retina
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
