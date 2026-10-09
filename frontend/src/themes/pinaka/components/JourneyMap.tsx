/**
 * JourneyMap — the campaign as an engraved map, above the board.
 *
 * WHAT IT SAYS
 *   All of India (Natural Earth, India's point of view: Jammu and Kashmir and
 *   Ladakh in full, the Northeast, the islands) and Sri Lanka, with the road
 *   of the epic drawn as one loop through seven stations pinned to real
 *   places: Ayodhya, Chitrakoot, Panchavati, Kishkindha, Rameswaram, across
 *   the strait to Lanka, and the airborne return. The road is the board:
 *   each leg between stations is a sixth of it (journey/milestones.ts), so
 *   the team's arrow reaches Kishkindha at half the board and Ayodhya again
 *   with every flag taken. The head names the chapter the team has reached
 *   and the next milestone with the solves still needed; the list beside the
 *   map says what each station means. The viewer's own mark rides the same
 *   road at their personal share. Every number is one the platform already
 *   holds and passes in; the map invents nothing. The nodes are not links;
 *   the board below is the navigation.
 *
 * WHAT IT COSTS
 *   Two stacked SVGs (≈ 12 KB of path data, imported once) in one plate,
 *   collapsible to a single line that a player can leave collapsed for the
 *   whole event (the choice persists per device). The land, the coast, the
 *   water and the road are the lower drawing, rasterised once; the lit
 *   stretch, the stations and the travellers are the upper one, on its own
 *   compositing layer, so a pulsing ring repaints a few circles and labels
 *   and never the coastline or the clipped shore under it. The map keeps the
 *   viewBox's 12:13 shape and sizes to its panel: beside the head and the
 *   milestones from 700px of panel, beneath the head (and above the
 *   milestones) below that, and in a sideways-scrolling box only when the
 *   panel is narrower than the smallest readable map. Labels and markers are
 *   drawn in CSS pixels (each station group is scaled by 720 / rendered
 *   width), so they stay 11px whatever size the map is; the coast and the
 *   road use non-scaling hairlines for the same reason.
 *
 * MOTION
 *   The next milestone's ring pulses by opacity; the team arrow's halo
 *   breathes by opacity; the lit stretch settles by stroke-dashoffset in
 *   600ms. When progress changes the two travellers ride the road for 600ms
 *   (a requestAnimationFrame tween along the path, sampled with
 *   getPointAtLength, so the arrow follows the curve and turns with it).
 *   All of it stops under reduced motion and while the panel is off screen.
 */
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { useReducedMotion } from 'motion/react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { getCapability } from '../../../components/environment/performance';
import { WORLDS, devanagariNumber } from '../config';
import { PINAKA_STORAGE_KEYS } from '../keys';
import type { EventPhase } from '../hooks';
import {
  LAND, MAP_VIEWBOX, MAP_WIDTH, ROUTE_D, ROUTE_STATION_T, STATIONS, WATER_LINES, type StationKey,
} from './journey/geo';
import { MILESTONES, milestonesReached } from './journey/milestones';

interface JourneyMapProps {
  phase: EventPhase;
  /** The team's share of the board, 0..1. Clamped; NaN reads as 0. */
  progress: number;
  /** How many challenges the board holds, to say how many solves the next
      milestone needs. Omitted or 0: the milestone is given as a share. */
  total?: number;
  /** The viewer's own share of the board, 0..1. Clamped; NaN reads as 0.
      Omitted: no personal marker is drawn. */
  personal?: number;
  /** Start collapsed. The player's own toggle wins afterwards. */
  collapsed?: boolean;
}

/* Where each station's label sits, in CSS pixels from the ring. Ayodhya reads
   to the right and its return up-left, clear of the arc coming home;
   Chitrakoot and Rameswaram read to the left, Panchavati and Kishkindha to
   the right between the legs of the road, Lanka below the arc that leaves
   it. On a map narrower than LABELS_MIN_PX only the numerals are shown (the
   milestone list names them). */
const LABEL: Record<StationKey, { dx: number; dy: number; anchor: 'start' | 'end'; text: string; ring: number }> = {
  ayodhya:    { dx: 11,  dy: -3, anchor: 'start', text: 'Ayodhya',    ring: 6.5 },
  chitrakoot: { dx: -11, dy: 4,  anchor: 'end',   text: 'Chitrakoot', ring: 6.5 },
  panchavati: { dx: 11,  dy: 4,  anchor: 'start', text: 'Panchavati', ring: 6.5 },
  kishkindha: { dx: 11,  dy: 4,  anchor: 'start', text: 'Kishkindha', ring: 6.5 },
  rameswaram: { dx: -11, dy: 4,  anchor: 'end',   text: 'Rameswaram', ring: 6.5 },
  lanka:      { dx: 9,   dy: 17, anchor: 'start', text: 'Lanka',      ring: 6.5 },
  return:     { dx: -13, dy: -12, anchor: 'end',  text: 'The return', ring: 10.5 },
};

/** Below this rendered width the place names would crowd the map's edges. */
const LABELS_MIN_PX = 340;

/**
 * Where on the road a board share sits: piecewise along the legs, so the
 * share at which a milestone is reached lands exactly on its station (the
 * legs are a sixth of the board each but of very different lengths).
 */
function routeT(p: number): number {
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  let i = 0;
  while (i < MILESTONES.length - 2 && p >= MILESTONES[i + 1].at) i++;
  const a = MILESTONES[i].at, b = MILESTONES[i + 1].at;
  const u = (p - a) / (b - a || 1);
  return ROUTE_STATION_T[i] + u * (ROUTE_STATION_T[i + 1] - ROUTE_STATION_T[i]);
}

/** The solves a milestone takes on this board, so a threshold is a count of
    real solves rather than a rounded percentage that can read as reached. */
function solvesAt(at: number, total: number): number {
  return Math.ceil(at * total - 1e-9);
}

/** "3 more solves", or the share when the board size is unknown. */
function stillNeeded(at: number, p: number, total: number): string {
  if (total > 0) {
    const need = Math.max(1, solvesAt(at, total) - Math.round(p * total));
    return `${need} more solve${need === 1 ? '' : 's'}`;
  }
  return `at ${Math.round(at * 100)}% of the board`;
}

/** Where a milestone not yet reached sits: "at 26 solves", or "at 67%". */
function threshold(at: number, total: number): string {
  return total > 0 ? `at ${solvesAt(at, total)} solves` : `at ${Math.round(at * 100)}%`;
}

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
  // routeT() lands exactly on a station's t at its threshold, and the tween
  // ends exactly on its target, so the tolerance only absorbs float noise.
  for (const s of ROUTE_STATION_T) if (t + 1e-9 >= s) n++;
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

export default function JourneyMap({ phase, progress, total = 0, personal, collapsed }: JourneyMapProps) {
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
  const teamT = routeT(p);
  const youT = routeT(you);

  // Where the team stands on the road, by the board's own numbers: the last
  // milestone reached, its chapter, and the next one with what it still needs.
  const reachedP = milestonesReached(p);
  const here = STATIONS[reachedP - 1];
  const chapter = WORLDS[here.world];
  const next = reachedP < MILESTONES.length ? MILESTONES[reachedP] : null;
  const nextStation = next ? STATIONS[reachedP] : null;
  const solved = total > 0 ? Math.round(p * total) : null;
  const tally = solved !== null ? `${solved} of ${total} solved` : `${pct}% of the board`;
  const headLine =
    phase === 'before'
      ? 'The hall gathers before dawn. The road starts at Ayodhya.'
      : !next
        ? 'Every flag taken. The lamps are lit in Ayodhya.'
        : phase === 'after'
          ? `The field is quiet. The team's road ended ${reachedP > 1 ? `at ${here.place}` : 'near Ayodhya'}, ${tally}.`
          : `Next: ${nextStation!.place}, ${next.title.toLowerCase()} — ${stillNeeded(next.at, p, total)}.`;

  // Unique ids for the SVG defs: several boards may mount this at once.
  const uid = useId().replace(/[^A-Za-z0-9_-]/g, '');
  const mapId = `pk-journey-${uid}`;
  const landClipId = `${mapId}-land`;

  const hostRef = useRef<HTMLDivElement>(null);
  const plateRef = useRef<HTMLDivElement>(null);
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
  // size. Measured once on mount and again whenever the panel resizes (the
  // plate and both SVGs share one width).
  const [k, setK] = useState(2);
  useLayoutEffect(() => {
    if (isCollapsed) return;
    const el = plateRef.current;
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
  const [reached, setReached] = useState(() => reachedCount(teamT));
  const reachedRef = useRef(reached);
  const onTeamShown = useCallback((t: number) => {
    const n = reachedCount(t);
    if (n !== reachedRef.current) { reachedRef.current = n; setReached(n); }
  }, []);
  const snap = still || offscreen || isCollapsed;
  useTraveller(teamRef, routeRef, teamT, true, snap, onTeamShown);
  useTraveller(youRef, routeRef, youT, false, snap);

  // In a narrow panel the map is wider than its box and scrolls. Bring the
  // team's arrow into the middle of the box, so where the team stands is the
  // first thing seen rather than whatever happens to be at the left edge.
  useLayoutEffect(() => {
    if (isCollapsed) return;
    const el = scrollRef.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;
    const x = (pointAt(routeRef.current, teamT).x / MAP_WIDTH) * el.scrollWidth;
    el.scrollLeft = Math.max(0, Math.min(x - el.clientWidth / 2, el.scrollWidth - el.clientWidth));
  }, [teamT, isCollapsed]);

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

  // The two figures as counts of real solves when the board size is known:
  // the team's (which moves the arrow) and the viewer's own (the diamond).
  const figures = (
    <>
      <span className="pk-journey-progress" data-marker="team">
        <span className="label-micro">Board progress</span>
        <span className="font-mono text-small pk-journey-pct">
          {pct}%{solved !== null && <span className="pk-journey-count"> · {solved}/{total}</span>}
        </span>
      </span>
      {hasYou && (
        <span className="pk-journey-progress" data-marker="you">
          <span className="label-micro">You</span>
          <span className="font-mono text-small pk-journey-pct">
            {total > 0 ? `${Math.round(you * total)}/${total}` : `${youPct}%`}
          </span>
        </span>
      )}
    </>
  );

  /* ── Collapsed: one plate, the toggle still in reach ── */
  if (isCollapsed) {
    return (
      <div className="pk-journey-host" ref={hostRef}>
        <section className="surface pk-carved pk-journey is-collapsed" aria-label="Campaign map">
          <span className="label-micro pk-journey-eyebrow">Chapter {chapter.chapter}</span>
          <h2 className="pk-journey-title">{chapter.title}</h2>
          <p className="pk-journey-line hidden sm:block">{headLine}</p>
          <span className="pk-journey-figures">{figures}</span>
          <div id={mapId} hidden />
          {toggleButton}
        </section>
      </div>
    );
  }

  /* ── The sentence a screen reader gets instead of the drawing ── */
  const sentence =
    `Campaign map of India and Sri Lanka: the road from Ayodhya to Lanka and back, in seven stations. ` +
    `The team has ${solved !== null ? `solved ${solved} of ${total} challenges` : `solved ${pct} percent of the board`} and reached ` +
    `${reachedP === MILESTONES.length ? 'Ayodhya again, the end of the road' : here.place}, chapter ${chapter.chapter}, ${chapter.title}.` +
    (next && nextStation && phase === 'during' ? ` Next is ${nextStation.place}, ${stillNeeded(next.at, p, total)}.` : '') +
    (hasYou ? ` You have solved ${total > 0 ? `${Math.round(you * total)} of ${total}` : `${youPct} percent`}.` : '');

  /* ── Expanded ── */
  return (
    <div className="pk-journey-host" ref={hostRef} data-offscreen={offscreen ? 'true' : undefined}>
    <section className={`surface pk-carved pk-journey${still ? ' is-still' : ''}`} aria-label="Campaign map">
      <div className="pk-journey-head">
        <div className="pk-journey-headtext">
          <span className="label-micro pk-journey-eyebrow"><span className="hidden sm:inline">The campaign · </span>Chapter {chapter.chapter}</span>
          <h2 className="pk-journey-title">{chapter.title}</h2>
          <p className="pk-journey-line">{headLine}</p>
        </div>
        {toggleButton}
      </div>
      {/* the legend: the two figures, each with the mark that rides the road */}
      <div className="pk-journey-figures">{figures}</div>

      {/* the milestones: each station, what reaching it means, the solves it
          takes on this board, and whether the team is there yet. 'next' only
          while the event is live; afterwards the last one reached is final. */}
      <ol className="pk-journey-stations" aria-label="Milestones of the road">
        {MILESTONES.map((m, i) => {
          const s = STATIONS[i];
          const state = i < reachedP ? 'reached' : i === reachedP && phase === 'during' ? 'next' : 'ahead';
          const final = phase === 'after' && i === reachedP - 1;
          return (
            <li key={m.key} data-state={state} data-final={final ? 'true' : undefined}>
              <span className="pk-journey-stations-num" lang="hi" aria-hidden="true">{devanagariNumber(i + 1)}</span>
              <span className="pk-journey-stations-name">{m.key === 'return' ? 'The return' : s.place}</span>
              <span className="pk-journey-stations-title">{m.title}</span>
              <span className="pk-journey-stations-status">
                {state === 'reached'
                  ? <><span aria-hidden="true">✓ </span>{final ? 'Final stop' : 'Reached'}</>
                  : state === 'next' ? stillNeeded(m.at, p, total) : threshold(m.at, total)}
              </span>
              {(state === 'next' || final) && <span className="pk-journey-stations-place">{m.line}</span>}
            </li>
          );
        })}
      </ol>

      <div className="pk-journey-scroll" id={mapId} ref={scrollRef}>
        {/* The plate: one image to assistive technology (the sentence above),
            two drawings to the browser, stacked in one grid cell. */}
        <div ref={plateRef} className="pk-journey-plate" role="img" aria-label={sentence} data-compact={MAP_WIDTH / k < LABELS_MIN_PX ? 'true' : undefined}>
        {/* 1. The land and the road: still, rasterised once. */}
        <svg
          className="pk-journey-svg pk-journey-svg-land"
          viewBox={MAP_VIEWBOX}
          preserveAspectRatio="xMidYMid meet"
          aria-hidden="true"
          focusable="false"
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
        </svg>

        {/* 2. What moves: the lit stretch, the stations, the travellers. Its
            own layer (journey.css), so the pulse and the halo repaint only
            this drawing. Same viewBox, so the coordinates are the same. */}
        <svg
          className="pk-journey-svg pk-journey-svg-road"
          viewBox={MAP_VIEWBOX}
          preserveAspectRatio="xMidYMid meet"
          aria-hidden="true"
          focusable="false"
        >
          {/* the lit stretch, ending exactly under the team's arrow. pathLength
              puts the dash in percent of the road; the stroke scales with the
              drawing (no non-scaling-stroke: with it, Chromium draws the dash
              in screen units and the lit stretch runs ahead of the arrow), so
              its width is given in user units, k per CSS pixel. */}
          <path
            className="pk-journey-fill"
            d={ROUTE_D}
            pathLength="100"
            style={{ strokeDashoffset: 100 - teamT * 100, strokeWidth: 1.75 * k }}
          />

          {/* the stations, drawn in CSS pixels (scaled by k) */}
          {STATIONS.map((s, i) => {
            const l = LABEL[s.key];
            const state = i < reached ? 'reached' : 'ahead';
            // the pulse marks where the team is heading: the next milestone
            const isNext = i === reached && phase === 'during';
            return (
              <g
                key={s.key}
                className="pk-journey-node"
                data-key={s.key}
                data-state={state}
                data-current={isNext ? 'true' : undefined}
                transform={`translate(${s.x} ${s.y}) scale(${k.toFixed(4)})`}
              >
                {isNext && !still && <circle className="pk-journey-pulse" r={l.ring + 4.5} />}
                <circle className="pk-journey-ring" r={l.ring} />
                {s.key !== 'return' && <circle className="pk-journey-dot" r="2.2" />}
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
      </div>
    </section>
    </div>
  );
}
