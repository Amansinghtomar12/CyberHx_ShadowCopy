/**
 * SetuChain — the chained-challenge journey as the causeway of stones.
 *
 * A drop-in for ChainExperience under the Pinaka theme: the same view-model
 * in, the same controls out. The back button, the briefing (markdown and the
 * download link), the progress line, one real <button> per node that opens
 * the challenge, and the sound cues all land at the same moments as the
 * original. What changes is the picture: instead of a steel chain catching
 * fire, the nodes are floating stones laid across indigo water, joined by
 * threads of gold that light up once both ends are solved.
 *
 * Everything here is presentation. Props in, pixels out: no fetch, no store,
 * no clock. A member the player cannot see is exactly what the view-model
 * says it is — 'Locked node', no points, disabled — nothing is inferred.
 *
 * RENDERING
 *   Pure DOM and SVG, no canvas, no requestAnimationFrame. Stone positions
 *   are sampled once from a cubic Bézier (the causeway's gentle S) and applied
 *   as transforms, so nothing is laid out per frame. The only motion is CSS
 *   keyframes on transform and opacity (styles/setu.css); under reduced
 *   motion, or the 'still' tier, the root carries .is-still and the scene is
 *   a finished, static picture.
 *
 * LAYOUT
 *   ≥ 640px: a horizontal causeway in a scroll container (.custom-scrollbar)
 *   when the chain is wider than the viewport. < 640px: the stones stack
 *   down the page and the threads run vertically, so the page never scrolls
 *   sideways. The switch is a matchMedia listener, disposed on unmount.
 */
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useReducedMotion } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ArrowLeft, BookOpen, Flame, Check, Lock, X, Download } from 'lucide-react';
import { safeHttpUrl } from '../../../lib/url';
import { play } from '../../../audio/AudioManager';
import { getCapability } from '../../../components/environment/performance';
import type { ChainSeriesVM } from '../../../components/chain/chainModel';
import { devanagariNumber } from '../config';

interface Props {
  series: ChainSeriesVM;
  onOpenChallenge: (challengeId: string) => void;
  onBack: () => void;
}

/* Verbatim from ChainExperience: the briefing renders the same way here. */
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

/** Difficulty colour from the platform token; the key is the VM's label. */
function diffColor(difficulty: string): string {
  return `var(--color-diff-${difficulty.toLowerCase()})`;
}

/* ── Geometry ────────────────────────────────────────────────────────────── */

/** Horizontal causeway (≥ 640px). */
const ROW = { spacing: 300, margin: 170, height: 276, amp: 26 };
/** Vertical causeway (< 640px): a fixed 320px-wide stage, centred. */
const COL = { spacing: 196, margin: 118, width: 320, amp: 40 };
/** Stone body under each card, in px. */
const STONE = { rx: 90, ry: 52 };

/** Deterministic per-index jitter, the same recipe Chain2D uses. */
function hash(n: number): number {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
}

interface Pt { x: number; y: number }

function cubic(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt {
  const u = 1 - t;
  const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
  return { x: a * p0.x + b * p1.x + c * p2.x + d * p3.x, y: a * p0.y + b * p1.y + c * p2.y + d * p3.y };
}

interface Causeway {
  width: number;
  height: number;
  /** The S-curve, as an SVG path. */
  wake: string;
  /** One point per node, sampled at even t along the curve. */
  nodes: Pt[];
}

/**
 * The causeway: a cubic whose control points are evenly spaced along the
 * main axis (so the main-axis coordinate is linear in t and stones land at
 * even intervals) and swing across it for the S. A single stone sits at the
 * curve's midpoint.
 */
function layoutCauseway(count: number, vertical: boolean): Causeway {
  const n = Math.max(1, count);
  if (vertical) {
    const height = COL.margin * 2 + (n - 1) * COL.spacing;
    const cx = COL.width / 2, y0 = COL.margin, y1 = height - COL.margin;
    const p0 = { x: cx + COL.amp * 0.5, y: y0 };
    const p1 = { x: cx - COL.amp * 1.6, y: y0 + (y1 - y0) / 3 };
    const p2 = { x: cx + COL.amp * 1.6, y: y0 + (2 * (y1 - y0)) / 3 };
    const p3 = { x: cx - COL.amp * 0.5, y: y1 };
    const nodes = Array.from({ length: n }, (_, i) => (n > 1 ? cubic(p0, p1, p2, p3, i / (n - 1)) : { x: cx, y: height / 2 }));
    return { width: COL.width, height, wake: pathOf(p0, p1, p2, p3), nodes };
  }
  const width = ROW.margin * 2 + (n - 1) * ROW.spacing;
  const cy = ROW.height / 2, x0 = ROW.margin, x1 = width - ROW.margin;
  const p0 = { x: x0, y: cy + ROW.amp * 0.5 };
  const p1 = { x: x0 + (x1 - x0) / 3, y: cy - ROW.amp * 1.6 };
  const p2 = { x: x0 + (2 * (x1 - x0)) / 3, y: cy + ROW.amp * 1.6 };
  const p3 = { x: x1, y: cy - ROW.amp * 0.5 };
  const nodes = Array.from({ length: n }, (_, i) => (n > 1 ? cubic(p0, p1, p2, p3, i / (n - 1)) : { x: width / 2, y: cy }));
  return { width, height: ROW.height, wake: pathOf(p0, p1, p2, p3), nodes };
}

function pathOf(p0: Pt, p1: Pt, p2: Pt, p3: Pt): string {
  const f = (v: number) => v.toFixed(1);
  return `M${f(p0.x)} ${f(p0.y)} C${f(p1.x)} ${f(p1.y)} ${f(p2.x)} ${f(p2.y)} ${f(p3.x)} ${f(p3.y)}`;
}

/**
 * A stone: eleven points around an ellipse, each nudged by a seeded amount,
 * joined through their midpoints with quadratic curves so the outline reads
 * as worn rock rather than a gem. Centred on the origin; placed by transform.
 */
function stonePath(seed: number, rx: number, ry: number): string {
  const K = 11;
  const pts: Pt[] = [];
  for (let k = 0; k < K; k++) {
    const a = (k / K) * Math.PI * 2 + (hash(seed * 31 + k) - 0.5) * 0.2;
    const r = 1 + (hash(seed * 53 + k + 7) - 0.5) * 0.16;
    pts.push({ x: Math.cos(a) * rx * r, y: Math.sin(a) * ry * r });
  }
  const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const f = (v: number) => v.toFixed(1);
  let d = `M${f(mid(pts[K - 1], pts[0]).x)} ${f(mid(pts[K - 1], pts[0]).y)}`;
  for (let k = 0; k < K; k++) {
    const v = pts[k], m = mid(v, pts[(k + 1) % K]);
    d += ` Q${f(v.x)} ${f(v.y)} ${f(m.x)} ${f(m.y)}`;
  }
  return d + ' Z';
}

/* ── Hooks ───────────────────────────────────────────────────────────────── */

/** Reduced motion from either source: the OS preference or the player's dial. */
function useStill(): boolean {
  const reduce = useReducedMotion() ?? false;
  return reduce || getCapability().tier === 'still';
}

/** True below Tailwind's sm breakpoint: the causeway turns vertical. */
function useNarrow(): boolean {
  const query = '(max-width: 639px)';
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const sync = () => setNarrow(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);
  return narrow;
}

/* ── Component ───────────────────────────────────────────────────────────── */

export default function SetuChain({ series, onOpenChallenge, onBack }: Props) {
  const still = useStill();
  const vertical = useNarrow();
  const [showReadme, setShowReadme] = useState(false);
  // The briefing is a dialog: it takes focus when it opens, closes on Escape
  // and hands focus back to the button that opened it.
  const closeRef = useRef<HTMLButtonElement>(null);
  const briefingRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!showReadme) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowReadme(false); };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      briefingRef.current?.focus({ preventScroll: true });
    };
  }, [showReadme]);

  // Off screen, the gleam, the ring and the water stop: an SVG child
  // animation repaints the whole drawing every frame, and nobody is looking.
  const hostRef = useRef<HTMLDivElement>(null);
  const [offscreen, setOffscreen] = useState(false);
  useEffect(() => {
    const el = hostRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setOffscreen(!e.isIntersecting), { rootMargin: '80px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const gradId = useId().replace(/[^a-zA-Z0-9_-]/g, '');

  const readmeUrl = useMemo(() => safeHttpUrl(series.readmeUrl ?? ''), [series.readmeUrl]);
  const nodeCount = series.nodes.length;
  const scene = useMemo(() => layoutCauseway(nodeCount, vertical), [nodeCount, vertical]);
  const stones = useMemo(
    () => Array.from({ length: nodeCount }, (_, i) => stonePath(i + 1, STONE.rx, STONE.ry)),
    [nodeCount],
  );

  // The stone the player stands on: the first unsolved node after the last
  // solved one. Nothing is "current" once the far shore is reached.
  const currentIndex = useMemo(() => {
    let last = -1;
    series.nodes.forEach((nd, i) => { if (nd.solved) last = i; });
    const idx = series.nodes.findIndex((nd, i) => i > last && !nd.solved);
    return idx;
  }, [series.nodes]);

  // Same cue as ChainExperience: a thread lighting up is a 'legendary' moment.
  // Seeded with the mount value so re-entering a series stays quiet.
  const prevActive = useRef(series.activeSegmentCount);
  useEffect(() => {
    const active = series.activeSegmentCount;
    if (active > prevActive.current) play('legendary');
    prevActive.current = active;
  }, [series.activeSegmentCount]);

  const pct = series.total ? Math.round((series.solvedCount / series.total) * 100) : 0;

  return (
    <div
      ref={hostRef}
      className={`pk-setu overflow-hidden rounded-lg border${still ? ' is-still' : ''}`}
      data-layout={vertical ? 'column' : 'row'}
      data-offscreen={offscreen ? 'true' : undefined}
    >
      {/* Header */}
      <div className="pk-setu-head flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="btn btn-ghost btn-sm inline-flex items-center gap-1.5" aria-label="Back to chains">
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          <div>
            <div className="label-micro text-text-muted">{series.category} / chained</div>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
              <div className="pk-display text-h3 font-bold text-cyber-text">{series.title}</div>
              {series.difficulty && (
                <span className="text-micro font-semibold uppercase" style={{ color: diffColor(series.difficulty) }}>
                  {series.difficulty}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {series.activeSegmentCount > 0 && (
            <span className="badge badge-neon inline-flex items-center gap-1">
              <Flame className="h-3.5 w-3.5" /> {series.activeSegmentCount} lit
            </span>
          )}
          {readmeUrl && (
            <a href={readmeUrl} target="_blank" rel="noopener noreferrer" download className="btn btn-primary btn-sm inline-flex items-center gap-1.5">
              <Download className="h-4 w-4" /> Download briefing
            </a>
          )}
          {series.readme.trim() !== '' && (
            <button ref={briefingRef} onClick={() => setShowReadme(true)} className="btn btn-secondary btn-sm inline-flex items-center gap-1.5">
              <BookOpen className="h-4 w-4" /> Briefing
            </button>
          )}
        </div>
      </div>

      {series.description && (
        <p className="pk-setu-desc pk-prose px-4 pb-3 text-text-secondary">{series.description}</p>
      )}

      {/* The causeway. The water fills the frame; the stones scroll over it. */}
      <div className="pk-setu-sea relative w-full">
        <div className="pk-setu-water" aria-hidden="true" />
        <div
          className={`pk-setu-stage relative w-full custom-scrollbar ${vertical ? 'overflow-hidden' : 'overflow-x-auto overflow-y-hidden'}`}
          style={vertical ? undefined : { height: scene.height }}
        >
          <div className="pk-setu-canvas relative mx-auto" style={{ width: scene.width, height: scene.height }}>
            <svg
              className="absolute inset-0"
              width={scene.width}
              height={scene.height}
              viewBox={`0 0 ${scene.width} ${scene.height}`}
              aria-hidden="true"
              focusable="false"
            >
              <defs>
                {/* Stone: lit from above, darker where it meets the water. */}
                <linearGradient id={`${gradId}-stone`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#2a2f41" />
                  <stop offset="0.55" stopColor="#1a1e2c" />
                  <stop offset="1" stopColor="#0e1119" />
                </linearGradient>
                <linearGradient id={`${gradId}-gold`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#f6dfa3" />
                  <stop offset="0.5" stopColor="#e3bb66" />
                  <stop offset="1" stopColor="#c49a45" />
                </linearGradient>
              </defs>

              {/* The causeway's wake: the line the stones were laid along. */}
              <path className="pk-setu-wake" d={scene.wake} />

              {/* Threads between consecutive stones. Straight chords, so the
                  gleam can ride them with a translate alone. */}
              {series.segments.map((seg, i) => {
                const a = scene.nodes[i], b = scene.nodes[i + 1];
                if (!a || !b) return null;
                const dx = b.x - a.x, dy = b.y - a.y;
                const len = Math.hypot(dx, dy);
                const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
                const gleamStyle = { '--pk-seg-len': `${len.toFixed(1)}px`, '--pk-seg-delay': `${(i * 0.9).toFixed(2)}s` } as CSSProperties;
                return (
                  <g key={`${seg.from}-${seg.to}`} className="pk-setu-thread" data-active={seg.active ? 'true' : undefined}>
                    {seg.active && <line className="pk-setu-thread-haze" x1={a.x} y1={a.y} x2={b.x} y2={b.y} />}
                    <line className="pk-setu-thread-line" x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
                    {seg.active && (
                      <g transform={`translate(${a.x.toFixed(1)} ${a.y.toFixed(1)}) rotate(${angle.toFixed(2)})`}>
                        <rect className="pk-setu-gleam" x="-16" y="-1.25" width="32" height="2.5" rx="1.25" style={gleamStyle} />
                      </g>
                    )}
                  </g>
                );
              })}

              {/* Stones, then their rings. */}
              {series.nodes.map((node, i) => {
                const p = scene.nodes[i];
                const state = node.solved ? 'solved' : i === currentIndex ? 'current' : node.challenge ? 'open' : 'locked';
                const at = `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`;
                return (
                  <g key={node.challengeId} className="pk-setu-stone" data-state={state} transform={at}>
                    {/* reflection in the water */}
                    <ellipse className="pk-setu-reflection" cx="0" cy={STONE.ry + 18} rx={STONE.rx * 0.72} ry="5" />
                    {/* the body and its rim */}
                    <path className="pk-setu-rock" d={stones[i]} fill={`url(#${gradId}-stone)`} />
                    <path className="pk-setu-rim" d={stones[i]} fill="none" />
                    {/* a hairline of light along the top edge */}
                    <path className="pk-setu-rock-light" d={stones[i]} fill="none" />
                    {state === 'current' && (
                      <>
                        <ellipse className="pk-setu-ring" cx="0" cy="0" rx={STONE.rx + 14} ry={STONE.ry + 12} />
                        <ellipse className="pk-setu-ring-still" cx="0" cy="0" rx={STONE.rx + 6} ry={STONE.ry + 5} />
                      </>
                    )}
                  </g>
                );
              })}
            </svg>

            {/* The cards: one real button per node, in chain order. */}
            {series.nodes.map((node, i) => {
              const p = scene.nodes[i];
              const locked = !node.challenge;
              const state = node.solved ? 'solved' : i === currentIndex ? 'current' : locked ? 'locked' : 'open';
              return (
                <button
                  key={node.challengeId}
                  onClick={() => { if (!locked) { play('open'); onOpenChallenge(node.challengeId); } }}
                  disabled={locked}
                  aria-label={`Chain ${node.position}: ${node.title}. ${node.solved ? 'Solved' : 'Unsolved'}${locked ? ', unavailable' : ''}.`}
                  className="pk-setu-card focus-ring absolute left-0 top-0 flex w-[150px] flex-col items-start gap-1 rounded-md border px-3 py-2 text-left transition-colors"
                  data-state={state}
                  style={{ transform: `translate(-50%,-50%) translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)` }}
                >
                  {state === 'current' && (
                    <span className="pk-setu-numeral" aria-hidden="true">{devanagariNumber(node.position)}</span>
                  )}
                  <span className="flex w-full items-center justify-between">
                    <span className="label-micro font-mono text-text-muted">STONE {String(node.position).padStart(2, '0')}</span>
                    {node.solved ? <Check className="pk-setu-check h-4 w-4" /> : locked ? <Lock className="h-3.5 w-3.5 text-text-muted" /> : null}
                  </span>
                  <span className="line-clamp-2 text-small font-semibold text-cyber-text">{node.title}</span>
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-micro text-text-muted">
                    {node.difficulty && <span style={{ color: diffColor(node.difficulty) }}>{node.difficulty}</span>}
                    {node.points != null && <span className="font-mono">{node.points}p</span>}
                    {node.solveCount > 0 && <span className="font-mono">{node.solveCount}★</span>}
                  </span>
                  {node.solvedByTeammate && <span className="badge badge-solved">Teammate</span>}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Progress */}
      <div className="pk-setu-foot px-4 py-3">
        <div className="flex items-center justify-between text-micro text-text-muted">
          <span className="label-micro">Causeway progress</span>
          <span className="font-mono">{series.solvedCount} / {series.total}</span>
        </div>
        <div className="pk-setu-progress mt-1.5" role="progressbar" aria-label="Causeway progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
          <div className="pk-setu-progress-fill" style={{ transform: `scaleX(${pct / 100})` }} />
        </div>
      </div>

      {/* Screen-reader chain state */}
      <ol className="sr-only">
        {series.nodes.map((nd) => (
          <li key={nd.challengeId}>Chain {nd.position}: {nd.title} — {nd.solved ? 'solved' : 'unsolved'}{nd.challenge ? '' : ' (unavailable)'}</li>
        ))}
      </ol>

      {showReadme && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label="Chain briefing">
          <div className="surface-raised pk-carved relative max-h-[80%] w-full max-w-2xl overflow-y-auto rounded-lg border border-border-subtle p-6">
            <button ref={closeRef} onClick={() => setShowReadme(false)} className="btn btn-ghost btn-sm absolute right-3 top-3" aria-label="Close briefing">
              <X className="h-4 w-4" />
            </button>
            <div className="label-micro text-text-muted">{series.category} / chained</div>
            <h2 className="pk-display mb-4 text-h3 font-bold text-cyber-text">{series.title}</h2>
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
