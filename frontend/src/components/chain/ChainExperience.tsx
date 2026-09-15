import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useReducedMotion } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ArrowLeft, BookOpen, Flame, Check, Lock, X, Download } from 'lucide-react';
import { safeHttpUrl } from '../../lib/url';
import { getCapability } from '../environment/performance';
import { createChain3D, type Chain3DHandle, type Chain3DNodeScreen } from './ChainScene3D';
import type { ChainSeriesVM } from './chainModel';
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

const DIFF_COLOR: Record<string, string> = {
  Easy: 'var(--color-diff-easy, #7dd3fc)',
  Medium: 'var(--color-diff-medium, #fcd34d)',
  Hard: 'var(--color-diff-hard, #fb923c)',
  Insane: 'var(--color-diff-insane, #c084fc)',
};

export default function ChainExperience({ series, onOpenChallenge, onBack }: Props) {
  const reduced = !!useReducedMotion();
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chipEls = useRef<(HTMLButtonElement | null)[]>([]);
  const handleRef = useRef<Chain3DHandle | null>(null);
  const seriesRef = useRef(series);
  seriesRef.current = series;
  const prevActive = useRef<number>(-1);

  const [showReadme, setShowReadme] = useState(false);
  const [mode, setMode] = useState<'3d' | 'fallback'>('3d');

  const nodeCount = series.nodes.length;
  const readmeUrl = useMemo(() => safeHttpUrl(series.readmeUrl ?? ''), [series.readmeUrl]);

  const applyState = (h: Chain3DHandle | null) => {
    const s = seriesRef.current;
    h?.setState(s.nodes.map((nd) => nd.solved), s.segments.map((seg) => seg.active));
  };

  useEffect(() => {
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    if (!stage || !canvas) return;
    const cap = getCapability();
    const quality: 'high' | 'medium' | 'low' =
      cap.tier === 'high' ? 'high' : cap.tier === 'medium' ? 'medium' : 'low';

    const positionChips = (nodes: Chain3DNodeScreen[]) => {
      for (let i = 0; i < nodes.length; i++) {
        const el = chipEls.current[i];
        if (!el) continue;
        const s = nodes[i];
        el.style.transform =
          `translate(-50%,-50%) translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px) scale(${s.scale.toFixed(2)})`;
        el.style.opacity = s.visible ? '1' : '0';
        el.style.pointerEvents = s.visible ? 'auto' : 'none';
      }
    };

    const handle = createChain3D(canvas, { nodeCount, reducedMotion: reduced, quality, onNodes: positionChips });
    if (!handle) { setMode('fallback'); return; }
    handleRef.current = handle;

    const size = () => {
      const r = stage.getBoundingClientRect();
      handle.resize(r.width, r.height, window.devicePixelRatio || 1);
    };
    size();
    applyState(handle);
    prevActive.current = seriesRef.current.activeSegmentCount;

    const ro = new ResizeObserver(size);
    ro.observe(stage);
    window.addEventListener('resize', size);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', size);
      handle.destroy();
      handleRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeCount, reduced]);

  useEffect(() => {
    applyState(handleRef.current);
    const active = series.activeSegmentCount;
    if (prevActive.current >= 0 && active > prevActive.current) play('legendary');
    prevActive.current = active;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series]);

  const pct = series.total ? Math.round((series.solvedCount / series.total) * 100) : 0;

  const Header = (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="btn btn-ghost btn-sm inline-flex items-center gap-1.5" aria-label="Back to chains">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <div>
          <div className="label-micro text-text-muted">{series.category} / chained</div>
          <div className="text-h3 font-bold text-cyber-text">{series.title}</div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {series.activeSegmentCount > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-orange-500/15 px-2 py-1 text-micro font-semibold text-orange-300">
            <Flame className="h-3.5 w-3.5" /> {series.activeSegmentCount} ignited
          </span>
        )}
        {readmeUrl && (
          <a href={readmeUrl} target="_blank" rel="noopener noreferrer" download className="btn btn-primary btn-sm inline-flex items-center gap-1.5">
            <Download className="h-4 w-4" /> Download briefing
          </a>
        )}
        {series.readme.trim() !== '' && (
          <button onClick={() => setShowReadme(true)} className="btn btn-secondary btn-sm inline-flex items-center gap-1.5">
            <BookOpen className="h-4 w-4" /> Briefing
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="overflow-hidden rounded-lg border border-border-subtle bg-black">
      {Header}

      {mode === '3d' ? (
        <div ref={stageRef} className="relative w-full" style={{ height: 'min(74vh, 760px)' }}>
          <canvas ref={canvasRef} aria-hidden="true" className="absolute inset-0 h-full w-full" />

          {/* Compact node labels, projected onto the chain. */}
          <div className="pointer-events-none absolute inset-0">
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
                    'absolute left-0 top-0 flex w-[132px] flex-col items-start gap-0.5 rounded border px-2 py-1 text-left backdrop-blur-sm transition-colors',
                    node.solved
                      ? 'border-cyber-neon/70 bg-black/55 shadow-[0_0_14px_rgba(198,255,0,0.25)]'
                      : 'border-white/15 bg-black/50 hover:border-cyber-neon/60',
                    locked ? 'cursor-not-allowed opacity-70' : 'cursor-pointer',
                  ].join(' ')}
                  style={{ opacity: 0, willChange: 'transform' }}
                >
                  <span className="flex w-full items-center justify-between">
                    <span className="label-micro font-mono text-text-muted">CHAIN {String(node.position).padStart(2, '0')}</span>
                    {node.solved ? <Check className="h-3.5 w-3.5 text-cyber-neon" /> : locked ? <Lock className="h-3 w-3 text-text-muted" /> : null}
                  </span>
                  <span className="line-clamp-1 text-small font-semibold text-cyber-text">{node.title}</span>
                  <span className="flex items-center gap-2 text-micro text-text-muted">
                    {node.difficulty && <span style={{ color: DIFF_COLOR[node.difficulty] }}>{node.difficulty}</span>}
                    {node.points != null && <span className="font-mono">{node.points}p</span>}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Progress overlay */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 p-4">
            <div className="flex items-center justify-between text-micro text-text-muted">
              <span className="label-micro">Chain progress</span>
              <span className="font-mono">{series.solvedCount} / {series.total}</span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${pct}%`, background: 'linear-gradient(90deg,#8fb800,#c6ff00)' }} />
            </div>
          </div>
        </div>
      ) : (
        // Fallback: functional node list when WebGL/three is unavailable.
        <div className="p-4">
          <p className="mb-3 text-small text-text-muted">3D view unavailable on this device — challenges are fully playable below.</p>
          <div className="flex flex-wrap items-stretch gap-2">
            {series.nodes.map((node, i) => (
              <React.Fragment key={node.challengeId}>
                <button
                  onClick={() => { if (node.challenge) onOpenChallenge(node.challengeId); }}
                  disabled={!node.challenge}
                  className={`flex w-[150px] flex-col items-start gap-1 rounded-md border px-3 py-2 text-left ${node.solved ? 'border-border-neon bg-cyber-neon/10' : 'border-border-strong bg-surface-raised'}`}
                >
                  <span className="label-micro font-mono text-text-muted">CHAIN {String(node.position).padStart(2, '0')}</span>
                  <span className="line-clamp-2 text-small font-semibold text-cyber-text">{node.title}</span>
                  <span className="text-micro text-text-muted">{node.solved ? 'Solved' : 'Unsolved'}</span>
                </button>
                {i < series.segments.length && (
                  <span className={`self-center text-h3 ${series.segments[i].active ? 'text-orange-400' : 'text-border-strong'}`}>›</span>
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
      )}

      {/* Screen-reader chain state */}
      <ol className="sr-only">
        {series.nodes.map((nd) => (
          <li key={nd.challengeId}>Chain {nd.position}: {nd.title} — {nd.solved ? 'solved' : 'unsolved'}{nd.challenge ? '' : ' (unavailable)'}</li>
        ))}
      </ol>

      {showReadme && (
        <div className="fixed inset-0 z-[4000] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label="Chain briefing">
          <div className="surface-raised relative max-h-[80%] w-full max-w-2xl overflow-y-auto rounded-lg border border-border-subtle p-6">
            <button onClick={() => setShowReadme(false)} className="btn btn-ghost btn-sm absolute right-3 top-3" aria-label="Close briefing">
              <X className="h-4 w-4" />
            </button>
            <div className="label-micro text-text-muted">{series.category} / chained</div>
            <h2 className="mb-4 text-h3 font-bold text-cyber-text">{series.title}</h2>
            {readmeUrl && (
              <a href={readmeUrl} target="_blank" rel="noopener noreferrer" download className="btn btn-primary btn-sm mb-4 inline-flex items-center gap-1.5">
                <Download className="h-4 w-4" /> Download briefing file
              </a>
            )}
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
