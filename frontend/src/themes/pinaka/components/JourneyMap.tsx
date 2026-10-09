/**
 * JourneyMap — the campaign in one line, above the board.
 *
 * WHAT IT SAYS
 *   Five chapters along a rising path, the one this screen lives in lit, and
 *   a gold fill whose length is the team's share of the board — a number the
 *   platform already holds and passes in. It is labelled "board progress"
 *   and nothing else: no rank, no standing, no invented state. The nodes are
 *   not links; the board below is the navigation.
 *
 * WHAT IT COSTS
 *   One SVG, ≤ 150px tall on a desktop, collapsible to a single plate that a
 *   player can leave collapsed for the whole event (the choice persists per
 *   device). On a phone the map scrolls sideways inside its own container;
 *   the page never does.
 *
 * MOTION
 *   The lit node pulses by opacity. A gleam slides along the lit stretch of
 *   the path every six seconds by transform (a gradient rect translating
 *   behind a mask). Both are CSS and both stop under reduced motion; the
 *   fill itself is a stroke-dashoffset that settles in 600ms.
 */
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { getCapability } from '../../../components/environment/performance';
import { WORLDS, devanagariNumber, type World } from '../config';
import { PINAKA_STORAGE_KEYS } from '../keys';
import type { EventPhase } from '../hooks';

interface JourneyMapProps {
  world: World;
  phase: EventPhase;
  /** The team's share of the board, 0..1. Clamped; NaN reads as 0. */
  progress: number;
  /** Start collapsed. The player's own toggle wins afterwards. */
  collapsed?: boolean;
}

const ORDER: readonly World[] = ['ayodhya', 'vanavasa', 'setu', 'lanka', 'vijaya'];

const PHASE_LINE: Record<EventPhase, string> = {
  before: 'The hall gathers before dawn.',
  during: 'The forest is open; every path is a challenge.',
  after: 'The field is quiet. The record stands.',
};

/* The path: five stations on a gentle climb, left to right. The curve is
   built through the stations with level tangents, so every node sits exactly
   on the line and the fill passes through each one. viewBox 720 × 100. */
const NODES: readonly { x: number; y: number }[] = [
  { x: 40, y: 76 },
  { x: 200, y: 65 },
  { x: 360, y: 52 },
  { x: 520, y: 38 },
  { x: 680, y: 26 },
];
const PATH_D = NODES.slice(1).reduce((d, n, i) => {
  const p = NODES[i];
  const mx = (p.x + n.x) / 2;
  return `${d} C${mx},${p.y} ${mx},${n.y} ${n.x},${n.y}`;
}, `M${NODES[0].x},${NODES[0].y}`);

/** Reduced motion from either source: the OS preference or the player's dial. */
function useStill(): boolean {
  const reduce = useReducedMotion() ?? false;
  return reduce || getCapability().tier === 'still';
}

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

function readCollapsed(): boolean {
  try { return localStorage.getItem(PINAKA_STORAGE_KEYS.journeyCollapsed) === '1'; } catch { return false; }
}
function writeCollapsed(v: boolean): void {
  try { localStorage.setItem(PINAKA_STORAGE_KEYS.journeyCollapsed, v ? '1' : '0'); } catch { /* fine */ }
}

export default function JourneyMap({ world, phase, progress, collapsed }: JourneyMapProps) {
  const still = useStill();
  const [isCollapsed, setCollapsed] = useState<boolean>(() => collapsed ?? readCollapsed());
  // The prop is an instruction from the app; the toggle is the player's. A
  // changed prop is applied, then the player may overrule it again.
  useEffect(() => { if (collapsed !== undefined) setCollapsed(collapsed); }, [collapsed]);

  const p = clamp01(progress);
  const pct = Math.round(p * 100);
  const idx = Math.max(0, ORDER.indexOf(world));
  const current = WORLDS[world] ?? WORLDS.ayodhya;

  // Unique ids for the SVG defs: several boards may mount this at once.
  const uid = useId().replace(/[^A-Za-z0-9_-]/g, '');
  const mapId = `pk-journey-${uid}`;
  const clipId = `${mapId}-lit`;
  const maskId = `${mapId}-gleam`;
  const gradId = `${mapId}-grad`;

  // Where the lit stretch ends, in viewBox x. The gleam is clipped to it so
  // it never runs ahead of the fill. Measured from the path once per change;
  // the path is monotonic in x, so a vertical cut is exact.
  const fillRef = useRef<SVGPathElement>(null);
  const [litX, setLitX] = useState(0);
  useLayoutEffect(() => {
    if (still || isCollapsed) return;
    const el = fillRef.current;
    if (!el) return;
    try {
      setLitX(el.getPointAtLength(el.getTotalLength() * p).x + 3);
    } catch {
      setLitX(NODES[0].x + (NODES[NODES.length - 1].x - NODES[0].x) * p);
    }
  }, [p, still, isCollapsed]);

  // On a phone the map is wider than its box and scrolls. Bring the lit
  // station into the middle of the box, so the current chapter is the first
  // thing seen rather than whatever happens to be at the left edge.
  const scrollRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (isCollapsed) return;
    const el = scrollRef.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;
    const x = (NODES[idx].x / 720) * el.scrollWidth;
    el.scrollLeft = Math.max(0, Math.min(x - el.clientWidth / 2, el.scrollWidth - el.clientWidth));
  }, [idx, isCollapsed]);

  function toggle() {
    const next = !isCollapsed;
    setCollapsed(next);
    writeCollapsed(next);
  }

  const toggleButton = (
    <button
      type="button"
      className="btn btn-ghost btn-sm pk-journey-toggle"
      onClick={toggle}
      aria-expanded={!isCollapsed}
      aria-controls={mapId}
      aria-label={isCollapsed ? 'Show the campaign map' : 'Hide the campaign map'}
    >
      {isCollapsed ? <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" /> : <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />}
      <span>{isCollapsed ? 'Show map' : 'Hide map'}</span>
    </button>
  );

  /* ── Collapsed: one plate, the toggle still in reach ── */
  if (isCollapsed) {
    return (
      <section className="surface pk-carved pk-journey is-collapsed" aria-label="Campaign map">
        <span className="label-micro pk-journey-eyebrow">Chapter {current.chapter}</span>
        <h2 className="pk-journey-title">{current.title}</h2>
        <p className="pk-journey-line hidden sm:block">{PHASE_LINE[phase]}</p>
        <span className="pk-journey-progress" aria-label={`Board progress ${pct} percent`}>
          <span className="label-micro">Board progress</span>
          <span className="font-mono text-small pk-journey-pct">{pct}%</span>
        </span>
        <div id={mapId} hidden />
        {toggleButton}
      </section>
    );
  }

  /* ── Expanded ── */
  return (
    <section className={`surface pk-carved pk-journey${still ? ' is-still' : ''}`} aria-label="Campaign map">
      <div className="pk-journey-head">
        <span className="label-micro pk-journey-eyebrow"><span className="hidden sm:inline">The campaign · </span>Chapter {current.chapter}</span>
        <h2 className="pk-journey-title">{current.title}</h2>
        <p className="pk-journey-line">{PHASE_LINE[phase]}</p>
      </div>

      <div className="pk-journey-side">
        <span className="pk-journey-progress" aria-label={`Board progress ${pct} percent`}>
          <span className="label-micro">Board progress</span>
          <span className="font-mono text-small pk-journey-pct">{pct}%</span>
        </span>
        {toggleButton}
      </div>

      <div className="pk-journey-scroll" id={mapId} ref={scrollRef}>
        <svg
          className="pk-journey-svg"
          viewBox="0 0 720 100"
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label={`Campaign map. Chapter ${current.chapter}, ${current.title}. Board progress ${pct} percent.`}
        >
          <defs>
            <clipPath id={clipId}>
              <rect x="0" y="0" width={Math.max(0, litX)} height="100" />
            </clipPath>
            <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#fff" stopOpacity="0" />
              <stop offset="0.5" stopColor="#fff" stopOpacity="1" />
              <stop offset="1" stopColor="#fff" stopOpacity="0" />
            </linearGradient>
            <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="720" height="100">
              {/* the sweep: translates across the map by CSS, see journey.css */}
              <rect className="pk-journey-gleam-sweep" x="-160" y="0" width="160" height="100" fill={`url(#${gradId})`} />
            </mask>
          </defs>

          {/* the road, in bronze */}
          <path className="pk-journey-track" d={PATH_D} />
          {/* the lit stretch: the board share, as a drawn length */}
          <path
            ref={fillRef}
            className="pk-journey-fill"
            d={PATH_D}
            pathLength="100"
            style={{ strokeDashoffset: 100 - pct }}
          />
          {/* the gleam travelling the lit stretch */}
          {!still && pct > 0 && (
            <g clipPath={`url(#${clipId})`} mask={`url(#${maskId})`}>
              <path className="pk-journey-gleam" d={PATH_D} />
            </g>
          )}

          {ORDER.map((w, i) => {
            const n = NODES[i];
            const state = i < idx ? 'passed' : i === idx ? 'lit' : 'ahead';
            return (
              <g key={w} className="pk-journey-node" data-state={state} transform={`translate(${n.x} ${n.y})`}>
                {state === 'lit' && !still && <circle className="pk-journey-pulse" r="12" />}
                <circle className="pk-journey-ring" r="8" />
                <circle className="pk-journey-dot" r="2.6" />
                <text className="pk-journey-numeral" y="-15" textAnchor="middle" lang="hi">
                  {devanagariNumber(i + 1)}
                </text>
                <text className="pk-journey-label" y="24" textAnchor="middle">
                  {WORLDS[w].chapter} · {WORLDS[w].title}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </section>
  );
}
