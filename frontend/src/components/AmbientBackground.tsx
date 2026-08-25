/**
 * AmbientBackground — the depth layer CyberHX sits on.
 *
 * Purely decorative. It is fixed, behind everything, and NEVER receives pointer
 * events. Four parallax planes build the depth language:
 *   1. wash      — static colour field (CSS)
 *   2. grid      — a perspective grid receding toward the horizon (CSS)
 *   3. network   — drifting wireframe nodes + links, 3 depth bands (canvas)
 *   4. particles — sparse ambient motes (canvas, same pass)
 *   + vignette   — keeps the edges dark so text always wins
 *
 * Budget: ~30fps, DPR capped at 2 with a pixel budget, ≤42 nodes, paused when
 * the tab is hidden. Under prefers-reduced-motion nothing animates at all —
 * only the static wash + vignette render.
 *
 * Styles live in src/index.css under "AMBIENT BACKGROUND" (.ambient-*).
 */
import { useEffect, useRef, useState } from 'react';

export interface AmbientBackgroundProps {
  /** 'subtle' (default) sits far behind the UI; 'normal' is a touch more present. */
  intensity?: 'subtle' | 'normal';
  className?: string;
}

type Node = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  band: number;
};

type Mote = {
  x: number;
  y: number;
  vy: number;
  r: number;
  phase: number;
};

/** Depth bands: [parallaxPx, linkDistance, nodeAlpha, linkAlpha, speed]. */
const BANDS = [
  { parallax: 6, link: 132, node: 0.3, line: 0.1, speed: 0.0055, radius: 1.0 },
  { parallax: 15, link: 158, node: 0.42, line: 0.14, speed: 0.009, radius: 1.35 },
  { parallax: 28, link: 186, node: 0.6, line: 0.2, speed: 0.014, radius: 1.9 },
];

const PRESETS = {
  subtle: { counts: [14, 10, 6], motes: 16, alpha: 0.62, gridOpacity: 0.045 },
  normal: { counts: [20, 14, 8], motes: 26, alpha: 1, gridOpacity: 0.075 },
} as const;

const FRAME_MS = 1000 / 30;
const PIXEL_BUDGET = 4_400_000;

export default function AmbientBackground({
  intensity = 'subtle',
  className = '',
}: AmbientBackgroundProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [reduced, setReduced] = useState(false);

  // Track the reduced-motion preference live.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setReduced(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  useEffect(() => {
    if (reduced) return;
    const canvas = canvasRef.current;
    const root = rootRef.current;
    if (!canvas || !root) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const preset = PRESETS[intensity] ?? PRESETS.subtle;
    let width = 0;
    let height = 0;
    let scale = 1;

    const nodes: Node[] = [];
    const motes: Mote[] = [];

    // Pointer parallax, eased. Values are -1..1.
    const target = { x: 0, y: 0 };
    const eased = { x: 0, y: 0 };
    let pointerQueued = false;
    let pendingX = 0;
    let pendingY = 0;

    const seed = (w: number, h: number) => {
      nodes.length = 0;
      motes.length = 0;
      for (let band = 0; band < BANDS.length; band++) {
        const count = preset.counts[band];
        for (let i = 0; i < count; i++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = BANDS[band].speed * (0.4 + Math.random() * 0.9);
          nodes.push({
            x: Math.random() * w,
            y: Math.random() * h,
            vx: Math.cos(angle) * speed * 60,
            vy: Math.sin(angle) * speed * 60,
            r: BANDS[band].radius * (0.75 + Math.random() * 0.6),
            band,
          });
        }
      }
      for (let i = 0; i < preset.motes; i++) {
        motes.push({
          x: Math.random() * w,
          y: Math.random() * h,
          vy: -(2 + Math.random() * 6),
          r: 0.5 + Math.random() * 1.1,
          phase: Math.random() * Math.PI * 2,
        });
      }
    };

    const resize = () => {
      const w = root.clientWidth || window.innerWidth;
      const h = root.clientHeight || window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const budgetScale = Math.sqrt(Math.min(1, PIXEL_BUDGET / Math.max(1, w * h * dpr * dpr)));
      scale = Math.max(1, dpr * budgetScale);
      width = w;
      height = h;
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      if (!nodes.length) seed(w, h);
    };

    resize();

    const flushPointer = () => {
      pointerQueued = false;
      target.x = pendingX;
      target.y = pendingY;
    };

    const onPointerMove = (e: PointerEvent) => {
      pendingX = (e.clientX / Math.max(1, window.innerWidth)) * 2 - 1;
      pendingY = (e.clientY / Math.max(1, window.innerHeight)) * 2 - 1;
      if (!pointerQueued) {
        pointerQueued = true;
        requestAnimationFrame(flushPointer);
      }
    };

    let raf = 0;
    let last = 0;
    let running = true;

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (!running) return;
      if (now - last < FRAME_MS) return;
      const dt = Math.min(64, now - last) / 1000;
      last = now;

      // Ease the parallax so the scene never snaps.
      eased.x += (target.x - eased.x) * 0.06;
      eased.y += (target.y - eased.y) * 0.06;

      // Hand the CSS planes their own, slower parallax.
      root.style.setProperty('--ambient-gx', `${(eased.x * -18).toFixed(2)}px`);
      root.style.setProperty('--ambient-gy', `${(eased.y * -10).toFixed(2)}px`);

      ctx.clearRect(0, 0, width, height);
      const t = now / 1000;
      const globalAlpha = preset.alpha;

      // Advance + wrap.
      const margin = 80;
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        n.x += n.vx * dt;
        n.y += n.vy * dt;
        if (n.x < -margin) n.x = width + margin;
        else if (n.x > width + margin) n.x = -margin;
        if (n.y < -margin) n.y = height + margin;
        else if (n.y > height + margin) n.y = -margin;
      }

      // Wireframe network, band by band (far → near).
      for (let band = 0; band < BANDS.length; band++) {
        const cfg = BANDS[band];
        const ox = eased.x * -cfg.parallax + Math.sin(t * 0.05 + band) * (cfg.parallax * 0.35);
        const oy = eased.y * -cfg.parallax + Math.cos(t * 0.04 + band) * (cfg.parallax * 0.25);
        const linkSq = cfg.link * cfg.link;
        const members: Node[] = [];
        for (let i = 0; i < nodes.length; i++) if (nodes[i].band === band) members.push(nodes[i]);

        ctx.lineWidth = band === 2 ? 0.8 : 0.6;
        for (let i = 0; i < members.length; i++) {
          const a = members[i];
          for (let j = i + 1; j < members.length; j++) {
            const b = members[j];
            const dx = a.x - b.x;
            const dy = a.y - b.y;
            const d2 = dx * dx + dy * dy;
            if (d2 > linkSq) continue;
            const strength = 1 - Math.sqrt(d2) / cfg.link;
            ctx.strokeStyle = `rgba(160, 196, 122, ${(strength * cfg.line * globalAlpha).toFixed(3)})`;
            ctx.beginPath();
            ctx.moveTo(a.x + ox, a.y + oy);
            ctx.lineTo(b.x + ox, b.y + oy);
            ctx.stroke();
          }
        }

        for (let i = 0; i < members.length; i++) {
          const n = members[i];
          const twinkle = 0.75 + 0.25 * Math.sin(t * 0.6 + n.x * 0.01);
          const a = cfg.node * globalAlpha * twinkle;
          ctx.fillStyle =
            band === 2
              ? `rgba(198, 255, 0, ${(a * 0.8).toFixed(3)})`
              : `rgba(150, 182, 205, ${(a * 0.6).toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(n.x + ox, n.y + oy, n.r, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Ambient motes — nearest plane, strongest parallax.
      const mx = eased.x * -34;
      const my = eased.y * -34;
      for (let i = 0; i < motes.length; i++) {
        const m = motes[i];
        m.y += m.vy * dt;
        if (m.y < -20) {
          m.y = height + 20;
          m.x = Math.random() * width;
        }
        const a = (0.16 + 0.14 * Math.sin(t * 0.9 + m.phase)) * globalAlpha;
        ctx.fillStyle = `rgba(220, 255, 150, ${a.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(m.x + mx, m.y + my, m.r, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const onVisibility = () => {
      running = !document.hidden;
      last = 0;
    };

    let resizeQueued = false;
    const onResize = () => {
      if (resizeQueued) return;
      resizeQueued = true;
      requestAnimationFrame(() => {
        resizeQueued = false;
        resize();
      });
    };

    raf = requestAnimationFrame(draw);
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('resize', onResize, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [intensity, reduced]);

  const gridOpacity = (PRESETS[intensity] ?? PRESETS.subtle).gridOpacity;

  return (
    <div
      ref={rootRef}
      aria-hidden="true"
      className={`ambient-root ${className}`}
      style={{ ['--ambient-grid-opacity' as string]: String(gridOpacity) }}
    >
      <div className="ambient-layer ambient-wash" />
      {!reduced && (
        <>
          <div className="ambient-layer ambient-grid" />
          <canvas ref={canvasRef} className="ambient-canvas" />
        </>
      )}
      <div className="ambient-vignette" />
    </div>
  );
}
