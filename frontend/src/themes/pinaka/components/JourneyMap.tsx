/**
 * JourneyMap — the campaign as an engraved map, above the board.
 *
 * WHAT IT SAYS
 *   India and Sri Lanka from Natural Earth (journey/geo.ts), the road of the
 *   epic drawn as one loop — Ayodhya, Chitrakoot, Panchavati, Kishkindha,
 *   Rameswaram, across the strait to Lanka, and the airborne return — with
 *   five stations pinned to real places. Two travellers ride the road: the
 *   team's arrow sits at the team's share of the board, the viewer's own
 *   smaller mark at their personal share. Both are numbers the platform
 *   already holds and passes in; the map invents nothing. Stations light as
 *   the arrow passes them; the station of the chapter this screen lives in
 *   carries the pulsing ring. The nodes are not links; the board below is
 *   the navigation.
 *
 * WHAT IT COSTS
 *   One SVG (≈ 12 KB of path data, imported once), collapsible to a single
 *   plate that a player can leave collapsed for the whole event (the choice
 *   persists per device). The map keeps the viewBox's 9:8 shape and sizes to
 *   its panel: beside the head from 700px of panel, beneath it below that,
 *   and in a sideways-scrolling box when the panel is narrower than the
 *   smallest readable map. Labels and markers are drawn in CSS pixels (each
 *   station group is scaled by 720 / rendered width), so they stay 11px
 *   whatever size the map is; the coast and the road use non-scaling
 *   hairlines for the same reason.
 *
 * MOTION
 *   The current station's ring pulses by opacity; the team arrow's halo
 *   breathes by opacity; the lit stretch settles by stroke-dashoffset in
 *   600ms. When progress changes the two travellers ride the road for 600ms
 *   (a requestAnimationFrame tween along the path, sampled with
 *   getPointAtLength, so the arrow follows the curve and turns with it).
 *   All of it stops under reduced motion and while the panel is off screen.
 */
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { useReducedMotion } from 'motion/react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { getCapability } from '../../../components/environment/performance';
import { WORLDS, devanagariNumber, type World } from '../config';
import { PINAKA_STORAGE_KEYS } from '../keys';
import type { EventPhase } from '../hooks';
import {
  LAND, MAP_HEIGHT, MAP_VIEWBOX, MAP_WIDTH, ROUTE_D, ROUTE_STATION_T, STATIONS, WATER_LINES,
} from './journey/geo';

interface JourneyMapProps {
  world: World;
  phase: EventPhase;
  /** The team's share of the board, 0..1. Clamped; NaN reads as 0. */
  progress: number;
  /** The viewer's own share of the board, 0..1. Clamped; NaN reads as 0.
      Omitted: no personal marker is drawn. */
  personal?: number;
  /** Start collapsed. The player's own toggle wins afterwards. */
  collapsed?: boolean;
}

const ORDER: readonly World[] = ['ayodhya', 'vanavasa', 'setu', 'lanka', 'vijaya'];

const PHASE_LINE: Record<EventPhase, string> = {
  before: 'The hall gathers before dawn.',
  during: 'The forest is open; every path is a challenge.',
  after: 'The field is quiet. The record stands.',
};

/* Where each station's label sits, in CSS pixels from the ring. Ayodhya and
   its return share one point, so the two labels take the two right-hand
   sides; Chitrakoot and Rameswaram read to the left, Lanka to the right over
   open water. Chosen so no two labels touch at the smallest map (320px). */
const LABEL: Record<World, { dx: number; dy: number; anchor: 'start' | 'end'; text: string; ring: number }> = {
  ayodhya:  { dx: 11,  dy: -3, anchor: 'start', text: 'Ayodhya',    ring: 6.5 },
  vanavasa: { dx: -11, dy: 4,  anchor: 'end',   text: 'Chitrakoot', ring: 6.5 },
  setu:     { dx: -11, dy: 4,  anchor: 'end',   text: 'Rameswaram', ring: 6.5 },
  lanka:    { dx: 11,  dy: 4,  anchor: 'start', text: 'Lanka',      ring: 6.5 },
  vijaya:   { dx: 11,  dy: 13, anchor: 'start', text: 'The return', ring: 10.5 },
};

const TWEEN_MS = 600;
const easeOutQuint = (u: number) => 1 - Math.pow(1 - u, 5);

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

/** How many stations the traveller at fraction t has reached (Ayodhya counts
    from the start; the return only at the very end). */
function reachedCount(t: number): number {
  let n = 0;
  for (const s of ROUTE_STATION_T) if (t + 1e-4 >= s) n++;
  return n;
}

interface RoutePoint { x: number; y: number; angle: number }

/** The road without a DOM: straight runs between the stations, placed by their
    fractional length. Used where getPointAtLength is missing (tests, SSR). */
function approxPoint(t: number): RoutePoint {
  let i = 0;
  while (i < ROUTE_STATION_T.length - 2 && t > ROUTE_STATION_T[i + 1]) i++;
  const a = STATIONS[i], b = STATIONS[i + 1];
  const span = ROUTE_STATION_T[i + 1] - ROUTE_STATION_T[i] || 1;
  const u = Math.min(1, Math.max(0, (t - ROUTE_STATION_T[i]) / span));
  return {
    x: a.x + (b.x - a.x) * u,
    y: a.y + (b.y - a.y) * u,
    angle: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI,
  };
}

/** A point on the road at fraction t, with the road's heading there. */
function pointAt(path: SVGPathElement | null, t: number): RoutePoint {
  if (path && typeof path.getTotalLength === 'function') {
    try {
      const len = path.getTotalLength();
      if (len > 0) {
        const d = 0.002;
        const t0 = t >= 1 - d ? 1 - d : t;
        const a = path.getPointAtLength(len * t0);
        const b = path.getPointAtLength(len * (t0 + d));
        const here = path.getPointAtLength(len * t);
        return { x: here.x, y: here.y, angle: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI };
      }
    } catch { /* fall through */ }
  }
  return approxPoint(t);
}

/**
 * Keeps a marker on the road at `target`, riding there over 600ms when the
 * target changes (snapping when nothing may move). Writes the transform
 * straight to the element — one attribute per frame, no React render — and
 * reports the shown fraction so the stations can light as it passes.
 */
function useTraveller(
  ref: RefObject<SVGGElement | null>,
  pathRef: RefObject<SVGPathElement | null>,
  target: number,
  rotate: boolean,
  snap: boolean,
  onShown?: (t: number) => void,
) {
  const shownRef = useRef<number | null>(null);
  useLayoutEffect(() => {
    const g = ref.current;
    if (!g) return;
    const apply = (t: number) => {
      const p = pointAt(pathRef.current, t);
      g.setAttribute('transform', `translate(${p.x.toFixed(2)} ${p.y.toFixed(2)})${rotate ? ` rotate(${p.angle.toFixed(1)})` : ''}`);
      shownRef.current = t;
      onShown?.(t);
    };
    const from = shownRef.current;
    const hidden = typeof document !== 'undefined' && document.hidden;
    if (from === null || snap || hidden || Math.abs(target - from) < 1e-4) {
      apply(target);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const step = (now: number) => {
      const u = Math.min(1, (now - t0) / TWEEN_MS);
      apply(from + (target - from) * easeOutQuint(u));
      if (u < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [ref, pathRef, target, rotate, snap, onShown]);
}

export default function JourneyMap({ world, phase, progress, personal, collapsed }: JourneyMapProps) {
  const still = useStill();
  const [isCollapsed, setCollapsed] = useState<boolean>(() => collapsed ?? readCollapsed());
  // The prop is an instruction from the app; the toggle is the player's. A
  // changed prop is applied, then the player may overrule it again.
  useEffect(() => { if (collapsed !== undefined) setCollapsed(collapsed); }, [collapsed]);

  const p = clamp01(progress);
  const pct = Math.round(p * 100);
  const hasYou = personal !== undefined;
  const you = clamp01(personal ?? 0);
  const youPct = Math.round(you * 100);
  const idx = Math.max(0, ORDER.indexOf(world));
  const current = WORLDS[world] ?? WORLDS.ayodhya;
  const station = STATIONS[idx];

  // Unique ids for the SVG defs: several boards may mount this at once.
  const uid = useId().replace(/[^A-Za-z0-9_-]/g, '');
  const mapId = `pk-journey-${uid}`;
  const landClipId = `${mapId}-land`;

  const hostRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const routeRef = useRef<SVGPathElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const teamRef = useRef<SVGGElement>(null);
  const youRef = useRef<SVGGElement>(null);

  // Off screen, the pulse and the halo stop (core.css pauses every animation
  // under data-offscreen) and the travellers snap instead of riding: an SVG
  // child animation repaints the whole drawing every frame, and nobody is
  // looking.
  const [offscreen, setOffscreen] = useState(false);
  useEffect(() => {
    const el = hostRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setOffscreen(!e.isIntersecting), { rootMargin: '80px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Labels and markers are drawn in CSS pixels inside groups scaled by
  // k = viewBox width / rendered width, so an 11px label is 11px at any map
  // size. Measured once on mount and again whenever the panel resizes.
  const [k, setK] = useState(2);
  useLayoutEffect(() => {
    if (isCollapsed) return;
    const el = svgRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.getBoundingClientRect().width;
      if (w > 0) setK(prev => (Math.abs(MAP_WIDTH / w - prev) < 0.005 ? prev : MAP_WIDTH / w));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [isCollapsed]);

  // Stations light as the team's arrow passes them, so the count follows the
  // fraction actually shown (the tween), not the target.
  const [reached, setReached] = useState(() => reachedCount(p));
  const reachedRef = useRef(reached);
  const onTeamShown = useCallback((t: number) => {
    const n = reachedCount(t);
    if (n !== reachedRef.current) { reachedRef.current = n; setReached(n); }
  }, []);
  const snap = still || offscreen || isCollapsed;
  useTraveller(teamRef, routeRef, p, true, snap, onTeamShown);
  useTraveller(youRef, routeRef, you, false, snap);

  // In a narrow panel the map is wider than its box and scrolls. Bring the
  // team's arrow into the middle of the box, so where the team stands is the
  // first thing seen rather than whatever happens to be at the left edge.
  useLayoutEffect(() => {
    if (isCollapsed) return;
    const el = scrollRef.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;
    const x = (pointAt(routeRef.current, p).x / MAP_WIDTH) * el.scrollWidth;
    el.scrollLeft = Math.max(0, Math.min(x - el.clientWidth / 2, el.scrollWidth - el.clientWidth));
  }, [p, isCollapsed]);

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

  const figures = (
    <>
      <span className="pk-journey-progress" data-marker="team">
        <span className="label-micro">Board progress</span>
        <span className="font-mono text-small pk-journey-pct">{pct}%</span>
      </span>
      {hasYou && (
        <span className="pk-journey-progress" data-marker="you">
          <span className="label-micro">You</span>
          <span className="font-mono text-small pk-journey-pct">{youPct}%</span>
        </span>
      )}
    </>
  );

  /* ── Collapsed: one plate, the toggle still in reach ── */
  if (isCollapsed) {
    return (
      <div className="pk-journey-host" ref={hostRef}>
        <section className="surface pk-carved pk-journey is-collapsed" aria-label="Campaign map">
          <span className="label-micro pk-journey-eyebrow">Chapter {current.chapter}</span>
          <h2 className="pk-journey-title">{current.title}</h2>
          <p className="pk-journey-line hidden sm:block">{PHASE_LINE[phase]}</p>
          <span className="pk-journey-figures">{figures}</span>
          <div id={mapId} hidden />
          {toggleButton}
        </section>
      </div>
    );
  }

  /* ── The sentence a screen reader gets instead of the drawing ── */
  const last = STATIONS[Math.max(1, Math.min(reached, STATIONS.length)) - 1];
  const where = reached >= STATIONS.length ? 'home at Ayodhya' : p > 0 ? `past ${last.place}` : 'at Ayodhya';
  const sentence =
    `Campaign map of India and Sri Lanka. Chapter ${current.chapter}, ${current.title}, at ${station.place}. ` +
    `The team's arrow is ${pct} percent along the road, ${where}.` +
    (hasYou ? ` You are ${youPct} percent along the road.` : '');
  const svgStyle = { '--pk-k': k.toFixed(4) } as CSSProperties;

  /* ── Expanded ── */
  return (
    <div className="pk-journey-host" ref={hostRef} data-offscreen={offscreen ? 'true' : undefined}>
    <section className={`surface pk-carved pk-journey${still ? ' is-still' : ''}`} aria-label="Campaign map">
      <div className="pk-journey-head">
        <span className="label-micro pk-journey-eyebrow"><span className="hidden sm:inline">The campaign · </span>Chapter {current.chapter}</span>
        <h2 className="pk-journey-title">{current.title}</h2>
        <p className="pk-journey-line">{PHASE_LINE[phase]}</p>
      </div>
      {/* the legend: the two figures, each with the mark that rides the road */}
      <div className="pk-journey-figures">{figures}</div>

      {/* the stations, as a list beside the map (wide panels only): which
          chapter each is, where it is, and whether the team has reached it */}
      <ol className="pk-journey-stations" aria-label="Stations of the road">
        {ORDER.map((w, i) => (
          <li
            key={w}
            data-state={i < reached ? 'reached' : 'ahead'}
            data-current={i === idx ? 'true' : undefined}
          >
            <span className="pk-journey-stations-num" lang="hi" aria-hidden="true">{devanagariNumber(i + 1)}</span>
            <span className="pk-journey-stations-name">{WORLDS[w].chapter} · {WORLDS[w].title}</span>
            <span className="pk-journey-stations-place">{STATIONS[i].place}</span>
          </li>
        ))}
      </ol>

      <div className="pk-journey-side">
        {toggleButton}
      </div>

      <div className="pk-journey-scroll" id={mapId} ref={scrollRef}>
        <svg
          ref={svgRef}
          className="pk-journey-svg"
          viewBox={MAP_VIEWBOX}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label={sentence}
          style={svgStyle}
        >
          <defs>
            <clipPath id={landClipId}>
              {LAND.filter(l => l.main).map(l => <path key={l.name} d={l.d} />)}
            </clipPath>
          </defs>

          {/* the neighbours, faint, so the subcontinent reads as a place */}
          {LAND.filter(l => !l.main).map(l => (
            <path key={l.name} className="pk-journey-land is-faint" d={l.d} vectorEffect="non-scaling-stroke" />
          ))}
          {/* India and Sri Lanka: stone fill, an inner glow along the coast
              (a wide translucent stroke clipped to the land), a gold hairline */}
          {LAND.filter(l => l.main).map(l => (
            <path key={l.name} className="pk-journey-land" d={l.d} />
          ))}
          <g clipPath={`url(#${landClipId})`}>
            {LAND.filter(l => l.main).map(l => (
              <path key={l.name} className="pk-journey-shore" d={l.d} vectorEffect="non-scaling-stroke" />
            ))}
          </g>
          {LAND.filter(l => l.main).map(l => (
            <path key={l.name} className="pk-journey-coast" d={l.d} vectorEffect="non-scaling-stroke" />
          ))}
          {/* open water */}
          {WATER_LINES.map((d, i) => (
            <path key={i} className="pk-journey-water" d={d} vectorEffect="non-scaling-stroke" />
          ))}

          {/* the road, in bronze */}
          <path ref={routeRef} className="pk-journey-track" d={ROUTE_D} vectorEffect="non-scaling-stroke" />
          {/* the lit stretch: the board share, as a drawn length */}
          <path
            className="pk-journey-fill"
            d={ROUTE_D}
            pathLength="100"
            vectorEffect="non-scaling-stroke"
            style={{ strokeDashoffset: 100 - pct }}
          />

          {/* the stations, drawn in CSS pixels (scaled by k) */}
          {ORDER.map((w, i) => {
            const s = STATIONS[i];
            const l = LABEL[w];
            const state = i < reached ? 'reached' : 'ahead';
            const isCurrent = i === idx;
            return (
              <g
                key={w}
                className="pk-journey-node"
                data-world={w}
                data-state={state}
                data-current={isCurrent ? 'true' : undefined}
                transform={`translate(${s.x} ${s.y}) scale(${k.toFixed(4)})`}
              >
                {isCurrent && !still && <circle className="pk-journey-pulse" r={l.ring + 4.5} />}
                <circle className="pk-journey-ring" r={l.ring} />
                {w !== 'vijaya' && <circle className="pk-journey-dot" r="2.2" />}
                <text className="pk-journey-label" x={l.dx} y={l.dy} textAnchor={l.anchor}>
                  <tspan className="pk-journey-numeral" lang="hi">{devanagariNumber(i + 1)}</tspan>
                  <tspan className="pk-journey-place" dx="4">{l.text}</tspan>
                </text>
              </g>
            );
          })}

          {/* the viewer's own mark: a small diamond, under the team's arrow */}
          {hasYou && (
            <g ref={youRef} className="pk-journey-you">
              <title>you</title>
              <g transform={`scale(${k.toFixed(4)})`}>
                <path d="M0 -5 5 0 0 5 -5 0Z" />
              </g>
            </g>
          )}
          {/* the team's arrow, turned to the road */}
          <g ref={teamRef} className="pk-journey-team">
            <title>the team</title>
            <g transform={`scale(${k.toFixed(4)})`}>
              {!still && <circle className="pk-journey-halo" r="11" />}
              <path className="pk-journey-arrow" d="M-7 -5.5 7 0 -7 5.5 -3.4 0Z" />
            </g>
          </g>
        </svg>
      </div>
    </section>
    </div>
  );
}
