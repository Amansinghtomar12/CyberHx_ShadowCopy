import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useReducedMotion } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ArrowLeft, BookOpen, Flame, Check, Lock, X } from 'lucide-react';
import { getCapability } from '../environment/performance';
import { createChainEngine, type ChainEngineHandle, type NodeScreen, type QualityTier } from './ChainEngine';
import { createChainFallback } from './ChainCanvas2D';
import type { ChainSeriesVM } from './chainModel';
import { lerp } from './chainMath';
import { play } from '../../audio/AudioManager';

interface Props {
  series: ChainSeriesVM;
  onOpenChallenge: (challengeId: string) => void;
  onBack: () => void;
}

const README_PROSE = [
  'text-body text-text-secondary break-words leading-relaxed',
  '[&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_p]:my-3',
  '[&_a]:text-cyber-neon [&_a]:underline [&_a]:underline-offset-2',
  '[&_strong]:text-cyber-text [&_strong]:font-bold',
  '[&_h1]:text-h2 [&_h2]:text-h3 [&_h3]:text-body [&_h1]:font-bold [&_h2]:font-bold [&_h3]:font-bold',
  '[&_h1]:mt-5 [&_h2]:mt-5 [&_h3]:mt-4 [&_h1]:mb-2 [&_h2]:mb-2 [&_h3]:mb-2 [&_h1]:text-cyber-text [&_h2]:text-cyber-text [&_h3]:text-cyber-text',
  '[&_ul]:my-3 [&_ul]:pl-5 [&_ul]:list-disc [&_ol]:my-3 [&_ol]:pl-5 [&_ol]:list-decimal [&_li]:my-1',
  '[&_code]:font-mono [&_code]:text-cyber-neon [&_code]:bg-surface-sunken [&_code]:px-1 [&_code]:rounded',
  '[&_pre]:bg-surface-sunken [&_pre]:p-3 [&_pre]:rounded-md [&_pre]:overflow-x-auto [&_pre]:my-3',
  '[&_blockquote]:border-l-2 [&_blockquote]:border-border-neon [&_blockquote]:pl-3 [&_blockquote]:text-text-muted',
].join(' ');

export default function ChainExperience({ series, onOpenChallenge, onBack }: Props) {
  const reduced = !!useReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);
  const glCanvasRef = useRef<HTMLCanvasElement>(null);
  const c2dCanvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<ChainEngineHandle | null>(null);
  const chipEls = useRef<(HTMLButtonElement | null)[]>([]);
  const seriesRef = useRef(series);
  seriesRef.current = series;
  const prevActive = useRef<number>(-1);

  const [renderMode, setRenderMode] = useState<'gl' | '2d'>('2d');
  const [showReadme, setShowReadme] = useState(false);

  const nodeCount = series.nodes.length;

  const applyState = (h: ChainEngineHandle | null) => {
    const s = seriesRef.current;
    h?.setState(s.nodes.map((n) => n.solved), s.segments.map((seg) => seg.active));
  };

  // Create the renderer once per mount (the parent keys this component by series
  // id, so switching series remounts cleanly).
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const cap = getCapability();
    const wantGL = cap.webgl && cap.motion && (cap.tier === 'high' || cap.tier === 'medium') && !reduced;

    const positionChips = (screens: NodeScreen[]) => {
      for (let i = 0; i < screens.length; i++) {
        const el = chipEls.current[i];
        if (!el) continue;
        const s = screens[i];
        el.style.transform =
          `translate(-50%,-50%) translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px) scale(${lerp(1, 0.72, s.depth).toFixed(3)})`;
        el.style.opacity = s.visible ? '1' : '0';
        el.style.zIndex = String(2000 - Math.round(s.depth * 1000));
      }
    };

    let handle: ChainEngineHandle | null = null;
    if (wantGL && glCanvasRef.current) {
      const tier: QualityTier = cap.tier === 'high' ? (cap.cinematic ? 'ultra' : 'high') : 'medium';
      handle = createChainEngine(glCanvasRef.current, {
        nodeCount, tier, reducedMotion: reduced, onFrame: positionChips,
      });
      if (handle) setRenderMode('gl');
    }
    if (!handle && c2dCanvasRef.current) {
      handle = createChainFallback(c2dCanvasRef.current, {
        nodeCount, reducedMotion: reduced, onFrame: positionChips,
      });
      setRenderMode('2d');
    }
    engineRef.current = handle;

    const size = () => {
      const r = container.getBoundingClientRect();
      handle?.resize(r.width, r.height, window.devicePixelRatio || 1);
    };
    size();
    applyState(handle);
    prevActive.current = seriesRef.current.activeSegmentCount;

    const ro = new ResizeObserver(size);
    ro.observe(container);
    window.addEventListener('resize', size);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', size);
      handle?.destroy();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeCount, reduced]);

  // Push solve/fire state on every change; fire the ignition sound when a NEW
  // segment lights up.
  useEffect(() => {
    applyState(engineRef.current);
    const active = series.activeSegmentCount;
    if (prevActive.current >= 0 && active > prevActive.current) play('legendary');
    prevActive.current = active;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series]);

  const pct = series.total ? Math.round((series.solvedCount / series.total) * 100) : 0;

  const diffColor = useMemo(() => ({
    Easy: 'var(--color-diff-easy, #7dd3fc)',
    Medium: 'var(--color-diff-medium, #fcd34d)',
    Hard: 'var(--color-diff-hard, #fb923c)',
    Insane: 'var(--color-diff-insane, #c084fc)',
  } as Record<string, string>), []);

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-hidden rounded-lg border border-border-subtle bg-black"
      style={{ height: 'min(72vh, 720px)' }}
    >
      {/* Renderers (stacked; only the active one is visible). */}
      <canvas
        ref={glCanvasRef}
        aria-hidden="true"
        className="absolute inset-0 h-full w-full"
        style={{ display: renderMode === 'gl' ? 'block' : 'none' }}
      />
      <canvas
        ref={c2dCanvasRef}
        aria-hidden="true"
        className="absolute inset-0 h-full w-full"
        style={{ display: renderMode === '2d' ? 'block' : 'none' }}
      />

      {/* Header HUD */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[3000] flex items-start justify-between gap-3 p-4">
        <div className="pointer-events-auto flex items-center gap-3">
          <button
            onClick={onBack}
            className="btn btn-ghost btn-sm inline-flex items-center gap-1.5"
            aria-label="Back to chains"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          <div>
            <div className="label-micro text-text-muted">{series.category} / chained</div>
            <div className="text-h3 font-bold text-cyber-text">{series.title}</div>
          </div>
        </div>
        <div className="pointer-events-auto flex items-center gap-2">
          {series.activeSegmentCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-orange-500/15 px-2 py-1 text-micro font-semibold text-orange-300">
              <Flame className="h-3.5 w-3.5" /> {series.activeSegmentCount} ignited
            </span>
          )}
          {series.readme.trim() !== '' && (
            <button
              onClick={() => setShowReadme(true)}
              className="btn btn-secondary btn-sm inline-flex items-center gap-1.5"
            >
              <BookOpen className="h-4 w-4" /> Briefing
            </button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[3000] p-4">
        <div className="flex items-center justify-between text-micro text-text-muted">
          <span className="label-micro">Chain progress</span>
          <span className="font-mono">{series.solvedCount} / {series.total}</span>
        </div>
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken">
          <div
            className="h-full rounded-full transition-[width] duration-700"
            style={{ width: `${pct}%`, background: 'linear-gradient(90deg,#c6ff00,#ff7a18)' }}
          />
        </div>
      </div>

      {/* Node overlay — accessible, positioned each frame by the renderer. */}
      <div className="pointer-events-none absolute inset-0 z-[2500]">
        {series.nodes.map((node, i) => {
          const locked = !node.challenge;
          return (
            <button
              key={node.challengeId}
              ref={(el) => { chipEls.current[i] = el; }}
              onClick={() => { if (!locked) { play('open'); onOpenChallenge(node.challengeId); } }}
              disabled={locked}
              aria-label={`Chain ${node.position}: ${node.title}. ${node.solved ? 'Solved' : 'Unsolved'}${locked ? ', unavailable' : ''}.`}
              className={[
                'pointer-events-auto absolute left-0 top-0 flex max-w-[180px] flex-col items-start gap-0.5 rounded-lg border px-2.5 py-1.5 text-left backdrop-blur-sm transition-colors',
                node.solved
                  ? 'border-border-neon bg-cyber-neon/10 shadow-[0_0_20px_rgba(198,255,0,0.25)]'
                  : 'border-border-subtle bg-surface-raised/80 hover:border-border-strong',
                locked ? 'cursor-not-allowed opacity-70' : 'cursor-pointer',
              ].join(' ')}
              style={{ willChange: 'transform' }}
            >
              <span className="flex items-center gap-1.5">
                <span className="label-micro font-mono text-text-muted">#{String(node.position).padStart(2, '0')}</span>
                {node.solved
                  ? <Check className="h-3.5 w-3.5 text-cyber-neon" />
                  : locked
                    ? <Lock className="h-3 w-3 text-text-muted" />
                    : null}
              </span>
              <span className="line-clamp-1 text-small font-semibold text-cyber-text">{node.title}</span>
              <span className="flex items-center gap-2 text-micro text-text-muted">
                {node.difficulty && (
                  <span style={{ color: diffColor[node.difficulty] }}>{node.difficulty}</span>
                )}
                {node.points != null && <span className="font-mono">{node.points} pts</span>}
                {node.solveCount > 0 && <span className="font-mono">{node.solveCount}★</span>}
              </span>
            </button>
          );
        })}
      </div>

      {/* Screen-reader-first list — the chain's state without any WebGL. */}
      <ol className="sr-only">
        {series.nodes.map((n) => (
          <li key={n.challengeId}>
            Chain {n.position}: {n.title} — {n.solved ? 'solved' : 'unsolved'}
            {n.challenge ? '' : ' (unavailable)'}
          </li>
        ))}
      </ol>

      {/* Briefing / README */}
      {showReadme && (
        <div className="absolute inset-0 z-[4000] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label="Chain briefing">
          <div className="surface-raised relative max-h-[80%] w-full max-w-2xl overflow-y-auto rounded-lg border border-border-subtle p-6">
            <button onClick={() => setShowReadme(false)} className="btn btn-ghost btn-sm absolute right-3 top-3" aria-label="Close briefing">
              <X className="h-4 w-4" />
            </button>
            <div className="label-micro text-text-muted">{series.category} / chained</div>
            <h2 className="mb-4 text-h3 font-bold text-cyber-text">{series.title}</h2>
            <div className={README_PROSE}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {series.readme || '_No briefing provided for this operation._'}
              </ReactMarkdown>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
