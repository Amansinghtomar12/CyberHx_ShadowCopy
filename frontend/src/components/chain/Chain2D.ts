// The chain renderer — a clean 2D canvas that draws a REAL interlocking steel
// chain: elongated tube links, alternating flat/edge, woven OVER-UNDER so they
// read as physically threaded (not stacked rings). Steel/gunmetal metal (not
// neon). The chain sways slowly and hangs with weight. When both challenges a
// segment connects are solved, that segment ignites with natural ORANGE fire
// that stays localised and lights the nearby metal; the steel remains visible.
//
// The clickable challenge boxes are HTML, positioned each frame from the node
// centres reported via onNodes, so they bob with the chain.

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

// Link geometry (px).
const LINK_LONG = 50;   // link length along the chain
const LINK_SHORT = 30;  // link width across
const TUBE = 8;         // metal rod thickness
const STEP = LINK_LONG * 0.5; // centre-to-centre (≈50% overlap → interlock)
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

  // One steel tube link (an oval ring). `flat` links are wider (seen face-on);
  // non-flat links are the narrower connectors threaded between them. `heat`
  // warms the steel toward orange-hot near fire.
  function drawLink(x: number, y: number, angle: number, flat: boolean, heat: number) {
    const rx = (flat ? LINK_LONG : LINK_LONG * 0.82) * 0.5;
    const ry = (flat ? LINK_SHORT : LINK_SHORT * 0.66) * 0.5;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.lineCap = 'round';
    const ring = () => { ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); };

    // 1. shadow silhouette
    ring(); ctx.lineWidth = TUBE + 2.5; ctx.strokeStyle = 'rgba(4,6,8,0.95)'; ctx.stroke();
    // 2. steel body — vertical gradient gives the rounded-rod read
    const g = ctx.createLinearGradient(0, -ry - TUBE, 0, ry + TUBE);
    if (heat > 0.02) {
      g.addColorStop(0, '#ffd9a0'); g.addColorStop(0.5, '#c8722f'); g.addColorStop(1, '#3a1f0c');
    } else {
      g.addColorStop(0, '#aeb8c2'); g.addColorStop(0.45, '#59636e'); g.addColorStop(1, '#171d23');
    }
    ring(); ctx.lineWidth = TUBE; ctx.strokeStyle = g; ctx.stroke();
    // 3. specular highlight along the top of the rod
    ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, Math.PI * 1.12, Math.PI * 1.88);
    ctx.lineWidth = TUBE * 0.34;
    ctx.strokeStyle = heat > 0.02 ? 'rgba(255,240,210,0.85)' : 'rgba(232,240,248,0.75)';
    ctx.stroke();
    // 4. hot rim near fire
    if (heat > 0.02) {
      ctx.shadowColor = 'rgba(255,140,40,0.9)'; ctx.shadowBlur = 12 * heat;
      ring(); ctx.lineWidth = TUBE * 0.4; ctx.strokeStyle = `rgba(255,170,70,${0.6 * heat})`; ctx.stroke();
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  }

  // Positions of the links along a segment, from box edge to box edge.
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

  function drawFire(links: { x: number; y: number }[], heat: number, t: number, sIdx: number) {
    // Soft warm glow hugging the burning links.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let k = 0; k < links.length; k++) {
      const p = links[k];
      const seed = sIdx * 13 + k;
      const flick = vnoise(t * 9 + seed * 5.3);
      const flick2 = vnoise(t * 13 + seed * 2.1);
      const h = LINK_SHORT * (1.3 + 1.0 * flick) * heat;
      const w = LINK_SHORT * (0.34 + 0.14 * flick2);
      const baseY = p.y - LINK_SHORT * 0.35;
      const tipX = p.x + (flick2 - 0.5) * LINK_SHORT * 0.7;
      const topY = baseY - h;
      const grad = ctx.createLinearGradient(p.x, baseY, tipX, topY);
      grad.addColorStop(0, 'rgba(120,40,5,0)');
      grad.addColorStop(0.25, `rgba(224,86,26,${0.4 * heat})`);
      grad.addColorStop(0.65, `rgba(255,150,50,${0.6 * heat})`);
      grad.addColorStop(1, `rgba(255,235,190,${0.9 * heat})`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(p.x - w, baseY);
      ctx.quadraticCurveTo(p.x - w * 0.5, baseY - h * 0.55, tipX, topY);
      ctx.quadraticCurveTo(p.x + w * 0.5, baseY - h * 0.55, p.x + w, baseY);
      ctx.quadraticCurveTo(p.x, baseY + LINK_SHORT * 0.2, p.x - w, baseY);
      ctx.fill();
      // bright core
      ctx.fillStyle = `rgba(255,240,205,${0.5 * heat})`;
      ctx.beginPath();
      ctx.ellipse(p.x, baseY - h * 0.28, w * 0.32, h * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
      // ember
      if (!opts.reducedMotion) {
        const rise = (t * 0.7 + seed) % 1;
        const ea = (1 - rise) * heat;
        if (ea > 0.03) {
          ctx.fillStyle = `rgba(255,190,110,${ea})`;
          ctx.beginPath();
          ctx.arc(p.x + (flick - 0.5) * LINK_SHORT, baseY - rise * LINK_SHORT * 2.4, 1.8 * (1 - rise) + 0.5, 0, Math.PI * 2);
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

    // Solved-node glow (behind the HTML boxes).
    for (let i = 0; i < n; i++) {
      if (!nodeSolved[i]) continue;
      const p = nodeAt(i, t);
      const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, LINK_LONG * 0.9);
      glow.addColorStop(0, 'rgba(198,255,0,0.20)');
      glow.addColorStop(1, 'rgba(198,255,0,0)');
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(p.x, p.y, LINK_LONG * 0.9, 0, Math.PI * 2); ctx.fill();
    }

    // Chain — two-pass weave: connector (edge) links behind, flat links in front.
    for (let s = 0; s < segCount; s++) {
      const links = segLinks(s, t);
      const heat = segHeat[s];
      for (let k = 0; k < links.length; k++) if (k % 2 === 1) drawLink(links[k].x, links[k].y, links[k].angle, false, heat);
      for (let k = 0; k < links.length; k++) if (k % 2 === 0) drawLink(links[k].x, links[k].y, links[k].angle, true, heat);
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
