// 2D canvas fallback for the chain — used when WebGL2 is unavailable, the FX
// dial is off, reduced-motion is on, or the device is the lowest tier. It is a
// real, animated, stylised chain (metallic links, solved-node glow, fire on
// active segments), NOT a broken/blank state. Same handle shape as the WebGL
// engine, so ChainExperience and the HTML overlay treat them identically.

import type { ChainEngineHandle, NodeScreen } from './ChainEngine';
import { lerp } from './chainMath';

export interface Fallback2DOptions {
  nodeCount: number;
  reducedMotion: boolean;
  onFrame?: (nodes: NodeScreen[]) => void;
}

export function createChainFallback(
  canvas: HTMLCanvasElement,
  opts: Fallback2DOptions,
): ChainEngineHandle {
  const ctx = canvas.getContext('2d')!;
  const n = Math.max(1, opts.nodeCount);
  const segCount = Math.max(0, n - 1);
  const nodeSolved = new Array<boolean>(n).fill(false);
  const segActive = new Array<boolean>(segCount).fill(false);
  const segHeat = new Float32Array(segCount);

  let cssW = 1, cssH = 1, dpr = 1;
  let raf = 0;
  let disposed = false;
  const t0 = performance.now();

  function nodePos(i: number): { x: number; y: number; t: number; size: number } {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const x = cssW * (0.26 + 0.5 * t) + Math.sin(t * 3.0) * cssW * 0.05;
    const y = cssH * (0.82 - 0.64 * t);
    const size = lerp(cssH * 0.055, cssH * 0.02, t);
    return { x, y, t, size };
  }

  function drawLink(x: number, y: number, r: number, angle: number, heat: number, glow: number) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.lineWidth = Math.max(2, r * 0.42);
    // metal gradient
    const g = ctx.createLinearGradient(-r, -r, r, r);
    g.addColorStop(0, '#3a3f47');
    g.addColorStop(0.5, '#767d88');
    g.addColorStop(1, '#2c3038');
    ctx.strokeStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, 0, r, r * 0.62, 0, 0, Math.PI * 2);
    ctx.stroke();
    if (glow > 0) {
      ctx.strokeStyle = `rgba(40,200,220,${0.5 * glow})`;
      ctx.lineWidth = Math.max(1, r * 0.2);
      ctx.stroke();
    }
    if (heat > 0) {
      ctx.strokeStyle = `rgba(255,${Math.round(120 + 100 * heat)},40,${0.85 * heat})`;
      ctx.lineWidth = Math.max(1, r * 0.3);
      ctx.stroke();
    }
    ctx.restore();
  }

  function frame(now: number) {
    if (disposed) return;
    const time = (now - t0) / 1000;

    for (let s = 0; s < segCount; s++) {
      const goal = segActive[s] ? 1 : 0;
      segHeat[s] += (goal - segHeat[s]) * 0.06;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    // dark stage
    const bg = ctx.createRadialGradient(cssW * 0.5, cssH * 0.6, 10, cssW * 0.5, cssH * 0.6, cssH);
    bg.addColorStop(0, 'rgba(12,16,22,0.9)');
    bg.addColorStop(1, 'rgba(4,6,10,0.98)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, cssW, cssH);

    // links between nodes
    for (let s = 0; s < segCount; s++) {
      const a = nodePos(s), b = nodePos(s + 1);
      const links = 5;
      const heat = segHeat[s];
      for (let k = 1; k < links; k++) {
        const f = k / links;
        const x = lerp(a.x, b.x, f);
        const y = lerp(a.y, b.y, f);
        const r = lerp(a.size, b.size, f) * 0.7;
        const angle = Math.atan2(b.y - a.y, b.x - a.x) + (k % 2) * Math.PI * 0.5;
        drawLink(x, y, r, angle, heat, 0);
      }
      // fire on active segment
      if (heat > 0.02) {
        const flick = opts.reducedMotion ? 0.5 : 0.5 + 0.5 * Math.sin(time * 12 + s);
        for (let k = 1; k < links; k++) {
          const f = k / links;
          const x = lerp(a.x, b.x, f);
          const y = lerp(a.y, b.y, f) - lerp(a.size, b.size, f) * (0.6 + flick * 0.5);
          const fr = lerp(a.size, b.size, f) * (0.9 + heat * 0.6);
          const fg = ctx.createRadialGradient(x, y, 0, x, y, fr);
          fg.addColorStop(0, `rgba(255,240,200,${0.7 * heat})`);
          fg.addColorStop(0.4, `rgba(255,140,30,${0.55 * heat})`);
          fg.addColorStop(1, 'rgba(180,30,5,0)');
          ctx.fillStyle = fg;
          ctx.beginPath();
          ctx.arc(x, y, fr, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // node rings
    for (let i = 0; i < n; i++) {
      const p = nodePos(i);
      drawLink(p.x, p.y, p.size, (i % 2) * Math.PI * 0.5, 0, nodeSolved[i] ? 1 : 0);
    }

    if (opts.onFrame) {
      const screens: NodeScreen[] = [];
      for (let i = 0; i < n; i++) {
        const p = nodePos(i);
        screens.push({ x: p.x, y: p.y, depth: p.t, visible: true });
      }
      opts.onFrame(screens);
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
      for (let s = 0; s < segCount; s++) segActive[s] = !!active[s];
    },
    destroy() {
      disposed = true;
      cancelAnimationFrame(raf);
    },
  };
}
