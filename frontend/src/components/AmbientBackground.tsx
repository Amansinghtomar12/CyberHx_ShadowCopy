/**
 * AmbientBackground — the environment CyberHX exists inside.
 *
 * Fixed, behind everything, never takes pointer events. Its whole job is to
 * make the platform feel like a place rather than a page.
 *
 * THREE TIERS, CHOSEN FOR YOU
 *   high    — the full WebGL lattice at DPR 2
 *   medium  — the same lattice, fewer nodes, DPR 1.5 (phones, modest GPUs)
 *   static  — CSS gradients only: no WebGL, reduced-motion, or a device that
 *             told us it cannot afford more
 *
 *   The tier is decided once, from device memory, core count, coarse-pointer
 *   and the reduced-motion query. If WebGL fails to initialise for any reason
 *   we fall back to static rather than showing nothing — a black rectangle is
 *   the one outcome worse than a plain gradient.
 *
 * The public API is unchanged from v2: <AmbientBackground /> or
 * <AmbientBackground intensity="normal" />. Every page keeps working.
 */
import { useEffect, useRef, useState } from 'react';
import { createLattice, type LatticeHandle } from './environment/lattice';
import { getCapability } from './environment/performance';
import { setLatticeCapacity } from './environment/signals';

export interface AmbientBackgroundProps {
  /** 'subtle' (default) sits far behind the UI; 'normal' brings it forward. */
  intensity?: 'subtle' | 'normal';
  className?: string;
}

type Mode = 'high' | 'medium' | 'static';

/**
 * Capability is decided once, centrally, by the PerformanceManager. This used
 * to run its own checks, which meant the background and the cursor systems
 * could disagree about the same device.
 */
function detectMode(): Mode {
  const cap = getCapability();
  if (!cap.webgl) return 'static';
  return cap.tier === 'high' ? 'high' : 'medium';
}

export default function AmbientBackground({
  intensity = 'subtle',
  className = '',
}: AmbientBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<Mode>('static');

  // Decide after mount so SSR and the first paint are never blocked on it.
  useEffect(() => { setMode(detectMode()); }, []);

  useEffect(() => {
    if (mode === 'static' || !canvasRef.current) return;

    let handle: LatticeHandle | null = null;
    try {
      handle = createLattice(canvasRef.current, {
        tier: mode,
        presence: intensity === 'normal' ? 1 : 0.6,
      });
    } catch {
      handle = null;
    }
    // WebGL present but unusable (blocklisted driver, lost context on init).
    if (!handle) { setMode('static'); return; }
    // Tell the app how many nodes exist so it knows the capacity to map the
    // board into. On the static tier this stays 0 and publishing is a no-op.
    setLatticeCapacity(handle.nodeCount);

    const onPointer = (e: PointerEvent) => {
      handle?.setPointer(
        (e.clientX / window.innerWidth) * 2 - 1,
        -((e.clientY / window.innerHeight) * 2 - 1),
      );
    };
    // Pause completely in a hidden tab: no frames, no GPU, no battery.
    const onVisibility = () => handle?.setRunning(!document.hidden);

    let queued = false;
    const onResize = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; handle?.resize(); });
    };

    window.addEventListener('pointermove', onPointer, { passive: true });
    window.addEventListener('resize', onResize, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.removeEventListener('pointermove', onPointer);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
      handle?.destroy();
      setLatticeCapacity(0);
    };
  }, [mode, intensity]);

  return (
    <div
      aria-hidden="true"
      className={`ambient-root ${className}`}
      data-mode={mode}
      style={{ ['--ambient-grid-opacity' as string]: intensity === 'normal' ? '0.075' : '0.045' }}
    >
      {/* The static tier is also the base layer under WebGL: if a context is
          lost mid-session the page degrades to this instead of to black. */}
      <div className="ambient-layer ambient-wash" />
      {mode === 'static' && <div className="ambient-layer ambient-grid" />}
      {mode !== 'static' && <canvas ref={canvasRef} className="ambient-canvas" />}
      {/* Readability guarantee: the UI always wins against the environment. */}
      <div className="ambient-veil" />
      <div className="ambient-vignette" />
    </div>
  );
}
