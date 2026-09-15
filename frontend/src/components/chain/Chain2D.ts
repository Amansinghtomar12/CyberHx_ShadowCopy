// The chain renderer — a clean 2D canvas, themed to the platform (dark ground,
// acid-lime #c6ff00 accent). A horizontal row of interlocking metal links that
// sway slowly like a hanging chain. When both challenges a segment connects are
// solved, that segment ignites with a real-time GREEN fire (matching the site
// theme) and its links glow. No WebGL, no 3D.
//
// The renderer owns only the chain art + node geometry; the clickable challenge
// boxes are HTML, positioned each frame from the node centres it reports via
// onNodes (so the boxes bob with the chain).

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

export const NODE_SPACING = 248;   // distance between node centres (content px)
export const NODE_MARGIN = 130;    // left/right padding so end boxes fit
export const STAGE_HEIGHT = 300;   // stage height in CSS px

export function chainContentWidth(nodeCount: number): number {
  const n = Math.max(1, nodeCount);
  return NODE_MARGIN * 2 + (n - 1) * NODE_SPACING;
}

const IGNITE_MS = 1300;

// Cheap deterministic value noise for flame flicker.
function hash(n: number): number {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
}
function vnoise(x: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return hash(i) * (1 - u) + hash(i + 1) * u;
}

export function createChain2D(canvas: HTMLCanvasElement, opts: Chain2DOptions): Chain2DHandle {
  const ctx = canvas.getContext('2d')!;
  const n = Math.max(1, opts.nodeCount);
  const segCount = Math.max(0, n - 1);

  const nodeSolved = new Array<boolean>(n).fill(false);
  const segActive = new Array<boolean>(segCount).fill(false);
  const segHeat = new Float32Array(segCount);     // animated 0..1
  const segTarget = new Float32Array(segCount);
  const segIgniteAt = new Float32Array(segCount).fill(-1);

  let cssW = 1, cssH = STAGE_HEIGHT, dpr = 1;
  let raf = 0;
  let disposed = false;
  const t0 = performance.now();

  const swayAmp = opts.reducedMotion ? 0 : 8;

  function nodeAt(i: number, t: number): Chain2DNode {
    const x = NODE_MARGIN + i * NODE_SPACING;
    const y = cssH / 2 + Math.sin(t * 1.1 + x * 0.018) * swayAmp;
    return { x, y };
  }
  function pointOnSeg(i: number, f: number, t: number): Chain2DNode {
    const a = nodeAt(i, t);
    const b = nodeAt(i + 1, t);
    const x = a.x + (b.x - a.x) * f;
    // Extra chain droop between the two boxes, plus the shared sway.
    const droop = Math.sin(f * Math.PI) * 10 * (opts.reducedMotion ? 0.4 : 1);
    const y = a.y + (b.y - a.y) * f + droop + Math.sin(t * 1.3 + x * 0.03) * swayAmp * 0.5;
    return { x, y };
  }

  const linkR = Math.min(24, cssH * 0.085);

  function drawLink(x: number, y: number, r: number, vertical: boolean, heat: number) {
    ctx.save();
    ctx.translate(x, y);
    const rx = vertical ? r * 0.62 : r;
    const ry = vertical ? r : r * 0.62;
    // Metal body.
    const g = ctx.createLinearGradient(-r, -r, r, r);
    g.addColorStop(0, '#1b2229');
    g.addColorStop(0.5, heat > 0.02 ? '#8aa63a' : '#5c6772');
    g.addColorStop(1, '#161c22');
    ctx.strokeStyle = g;
    ctx.lineWidth = Math.max(2.5, r * 0.42);
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
    // Idle neon rim so the dark chain still reads against the dark ground.
    ctx.strokeStyle = 'rgba(198,255,0,0.10)';
    ctx.lineWidth = Math.max(1, r * 0.16);
    ctx.stroke();
    // Heated: green-hot ring + glow.
    if (heat > 0.02) {
      ctx.shadowColor = 'rgba(198,255,0,0.9)';
      ctx.shadowBlur = 16 * heat;
      ctx.strokeStyle = `rgba(210,255,120,${0.85 * heat})`;
      ctx.lineWidth = Math.max(1.5, r * 0.3);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  }

  function drawFlame(x: number, y: number, size: number, heat: number, t: number, seed: number) {
    const flick = vnoise(t * 9 + seed * 5.3);
    const flick2 = vnoise(t * 14 + seed * 2.1);
    const h = size * (1.5 + 1.1 * flick) * heat;
    const w = size * (0.7 + 0.25 * flick2);
    const tipX = x + (flick2 - 0.5) * size * 0.8;
    const topY = y - h;
    // Outer green flame tongue.
    const grad = ctx.createLinearGradient(x, y, tipX, topY);
    grad.addColorStop(0, `rgba(120,190,20,${0.0})`);
    grad.addColorStop(0.15, `rgba(120,190,20,${0.35 * heat})`);
    grad.addColorStop(0.55, `rgba(198,255,0,${0.55 * heat})`);
    grad.addColorStop(1, `rgba(233,255,176,${0.85 * heat})`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(x - w, y);
    ctx.quadraticCurveTo(x - w * 0.5, y - h * 0.55, tipX, topY);
    ctx.quadraticCurveTo(x + w * 0.5, y - h * 0.55, x + w, y);
    ctx.quadraticCurveTo(x, y + size * 0.25, x - w, y);
    ctx.fill();
    // Bright core.
    ctx.fillStyle = `rgba(240,255,200,${0.5 * heat})`;
    ctx.beginPath();
    ctx.ellipse(x, y - h * 0.28, w * 0.34, h * 0.34, 0, 0, Math.PI * 2);
    ctx.fill();
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

    // Links per segment.
    ctx.globalCompositeOperation = 'source-over';
    for (let s = 0; s < segCount; s++) {
      const heat = segHeat[s];
      const links = 6;
      for (let k = 1; k < links; k++) {
        const p = pointOnSeg(s, k / links, t);
        drawLink(p.x, p.y, linkR * 0.72, k % 2 === 0, heat);
      }
    }

    // Green fire on active segments (additive glow on top of the links).
    ctx.globalCompositeOperation = 'lighter';
    for (let s = 0; s < segCount; s++) {
      const heat = segHeat[s];
      if (heat <= 0.02) continue;
      const links = 6;
      for (let k = 1; k < links; k++) {
        const p = pointOnSeg(s, k / links, t);
        const licked = opts.reducedMotion ? p.y - linkR * 0.4 : p.y - linkR * 0.5;
        drawFlame(p.x, licked, linkR * 0.95, heat, t, s * 7 + k);
      }
      // A bright pulse travelling along the segment.
      if (!opts.reducedMotion) {
        const pf = (t * 0.5 + s * 0.2) % 1;
        const pp = pointOnSeg(s, pf, t);
        const glow = ctx.createRadialGradient(pp.x, pp.y, 0, pp.x, pp.y, linkR * 1.6);
        glow.addColorStop(0, `rgba(233,255,176,${0.5 * heat})`);
        glow.addColorStop(1, 'rgba(198,255,0,0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(pp.x, pp.y, linkR * 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Solved-node anchor glow (behind the HTML box).
    for (let i = 0; i < n; i++) {
      if (!nodeSolved[i]) continue;
      const p = nodeAt(i, t);
      const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, linkR * 2.4);
      glow.addColorStop(0, 'rgba(198,255,0,0.28)');
      glow.addColorStop(1, 'rgba(198,255,0,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(p.x, p.y, linkR * 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
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
      dpr = Math.min(ratio, 2);
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
        segActive[s] = !!active[s];
      }
    },
    destroy() {
      disposed = true;
      cancelAnimationFrame(raf);
    },
  };
}
