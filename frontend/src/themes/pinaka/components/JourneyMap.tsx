/**
 * JourneyMap — the road, as the organisers' map above the board.
 *
 * WHAT IT SAYS
 *   The organisers' own painting: the Ramayana from Ayodhya to Lanka, the
 *   road already dashed on it, the coast drawn on it and every place named
 *   in the mapmaker's hand. So the only thing left for this file to draw is
 *   where the team has got to — a quiet mark on each chapter they have
 *   closed, and a lit one on the chapter they are in.
 *
 *   It counts in chapters, because the rest of the skin does. The rail above
 *   the board, the list beside this map and the marks on it all read the one
 *   `Journey` the app passes in, so a tick in one place cannot mean
 *   something different from a tick in another — which it did, while the
 *   road ticked its stations off a share of the whole board and the rail
 *   counted chapters finished. The head names the chapter and what it still
 *   wants; the two figures beside it are the whole board's, a different
 *   question, labelled as one. Every number is one the platform already
 *   holds. The marks are not links: the board below is the navigation.
 *
 * WHAT IT COSTS
 *   One image, at two widths for srcSet to choose between, in a plate that
 *   collapses to a single line a player can leave collapsed for the whole
 *   event (the choice persists per device). The plate holds the map's own
 *   3:2 before the image lands, so the card never jumps, and never grows
 *   past its box. The marks are placed in per cent of it, so they hold
 *   their dots at every size it is drawn at.
 *
 * MOTION
 *   The lit mark's ring breathes by opacity. Nothing else moves. That stops
 *   under reduced motion, on the low and still tiers, and while the panel is
 *   off screen.
 */
import { useEffect, useId, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { getCapability } from '../../../components/environment/performance';
import { devanagariNumber } from '../config';
import { PINAKA_STORAGE_KEYS } from '../keys';
import type { EventPhase } from '../hooks';
import { CHAPTER_POINTS } from './journey/map';
import { CHAPTER_LIST } from '../chapters/config';
import type { Journey } from '../chapters/progress';
import mapLarge from '../assets/map/ramayana-map-1536.webp';
import mapSmall from '../assets/map/ramayana-map-768.webp';

interface JourneyMapProps {
  phase: EventPhase;
  /** The team's share of the board, 0..1. Clamped; NaN reads as 0. */
  progress: number;
  /** How many challenges the board holds, so the two figures in the head
      can be counts of real solves. Omitted or 0: they are given as shares. */
  total?: number;
  /** The viewer's own share of the board, 0..1. Clamped; NaN reads as 0.
      Omitted: no personal marker is drawn. */
  personal?: number;
  /** Start collapsed. The player's own toggle wins afterwards. */
  collapsed?: boolean;
  /**
   * Where the team stands in the six chapters — the same object the rail
   * above the board reads.
   *
   * The road used to tick its stations off a share of the whole board: at
   * two thirds solved it printed five ticks, while the rail, which counts
   * chapters finished, still showed the team in Ayodhya. Both were honest
   * about different things and they contradicted each other on one screen.
   * The chapter is what the rest of the skin counts in, so the road counts
   * in it too: a tick here means that chapter is done, and nothing else.
   */
  journey: Journey;
}

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

export default function JourneyMap({ phase, progress, total = 0, personal, collapsed, journey }: JourneyMapProps) {
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

  // Where the team stands, by chapters finished. `reachedP` is how many are
  // done, so it indexes the current one; the gate decides what "done" means
  // and this only reports it.
  const chapters = journey.chapters;
  const reachedP = chapters.filter(c => c.state === 'completed').length;
  const hereIdx = Math.min(CHAPTER_LIST.length - 1, Math.max(0, journey.currentIndex - 1));
  const here = CHAPTER_LIST[hereIdx];
  const nextChapter = hereIdx + 1 < CHAPTER_LIST.length ? CHAPTER_LIST[hereIdx + 1] : null;
  const hereProgress = chapters[hereIdx];
  const solved = total > 0 ? Math.round(p * total) : null;
  const tally = solved !== null ? `${solved} of ${total} solved` : `${pct}% of the board`;
  /** What the current chapter still wants, in its own challenges. */
  const leftHere = Math.max(0, (hereProgress?.total ?? 0) - (hereProgress?.solved ?? 0));
  const headLine =
    phase === 'before'
      ? 'The hall gathers before dawn. The road starts at Ayodhya.'
      : journey.finished
        ? 'Every chapter closed. The lamps are lit in Ayodhya.'
        : phase === 'after'
          ? `The field is quiet. The team's road ended at ${here.title}, ${tally}.`
          : leftHere > 0
            ? `${here.title}: ${leftHere} more solve${leftHere === 1 ? '' : 's'}${nextChapter ? ` and ${nextChapter.title} opens.` : ' to close the journey.'}`
            : `${here.title}. ${here.line}`;

  // Unique ids for the SVG defs: several boards may mount this at once.
  const uid = useId().replace(/[^A-Za-z0-9_-]/g, '');
  const mapId = `pk-journey-${uid}`;

  const hostRef = useRef<HTMLDivElement>(null);

  // Off screen the lit mark stops breathing: core.css pauses every animation
  // under data-offscreen, and nobody is looking.
  const [offscreen, setOffscreen] = useState(false);
  useEffect(() => {
    const el = hostRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setOffscreen(!e.isIntersecting), { rootMargin: '80px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

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
          <span className="label-micro pk-journey-eyebrow">The road</span>
          <h2 className="pk-journey-title">{here.title}</h2>
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
    `Map of the Ramayana, from Ayodhya to Lanka, in six chapters. ` +
    `The team has ${solved !== null ? `solved ${solved} of ${total} challenges` : `solved ${pct} percent of the board`}, ` +
    `closed ${reachedP} of ${chapters.length} chapters, and stands at ${here.title}.` +
    (nextChapter && leftHere > 0 && phase === 'during'
      ? ` ${leftHere} more solve${leftHere === 1 ? '' : 's'} opens ${nextChapter.title}.` : '') +
    (hasYou ? ` You have solved ${total > 0 ? `${Math.round(you * total)} of ${total}` : `${youPct} percent`}.` : '');

  /* ── Expanded ── */
  return (
    <div className="pk-journey-host" ref={hostRef} data-offscreen={offscreen ? 'true' : undefined}>
    <section className={`surface pk-carved pk-journey${still ? ' is-still' : ''}`} aria-label="Campaign map">
      <div className="pk-journey-head">
        <div className="pk-journey-headtext">
          <span className="label-micro pk-journey-eyebrow"><span className="hidden sm:inline">The road · </span>{pct}% of the board</span>
          <h2 className="pk-journey-title">{here.title}</h2>
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
        {CHAPTER_LIST.map((c, i) => {
          const cp = chapters[i];
          // 'reached' only where the chapter is actually closed. This is the
          // line the rail draws too, and it is the whole point of reading
          // both from one object: a tick here and a lock there was the bug.
          const state = cp?.state === 'completed' ? 'reached'
            : i === hereIdx && phase === 'during' ? 'next'
            : 'ahead';
          const final = phase === 'after' && i === hereIdx;
          const left = Math.max(0, (cp?.total ?? 0) - (cp?.solved ?? 0));
          return (
            <li key={c.id} data-state={state} data-final={final ? 'true' : undefined}>
              <span className="pk-journey-stations-num" lang="hi" aria-hidden="true">{devanagariNumber(i + 1)}</span>
              <span className="pk-journey-stations-name">{c.title}</span>
              <span className="pk-journey-stations-title">{c.subtitle}</span>
              <span className="pk-journey-stations-status">
                {state === 'reached'
                  ? <><span aria-hidden="true">✓ </span>{final ? 'Final stop' : 'Closed'}</>
                  : (cp?.total ?? 0) === 0
                    ? 'Nothing here yet'
                    : state === 'next'
                      ? `${left} more solve${left === 1 ? '' : 's'}`
                      : `${cp.total} operation${cp.total === 1 ? '' : 's'}`}
              </span>
              {(state === 'next' || final) && <span className="pk-journey-stations-place">{c.line}</span>}
            </li>
          );
        })}
      </ol>

      <div className="pk-journey-scroll" id={mapId}>
        {/* The plate: one image to assistive technology (the sentence
            above), the organisers' map and the team's mark to the browser. */}
        <div className="pk-journey-plate" role="img" aria-label={sentence}>
        {/* The organisers' own map. The road is dashed on it, the coast is
            drawn on it and every station is named on it in its own hand,
            so the only thing left for this component to say is where the
            team has got to — one mark, not a second map. */}
        <img
          className="pk-journey-map"
          src={mapLarge}
          srcSet={`${mapSmall} 768w, ${mapLarge} 1536w`}
          sizes="(max-width: 48rem) 92vw, 44rem"
          alt=""
          aria-hidden="true"
          decoding="async"
          width={1536}
          height={1024}
        />

        {/* Every chapter the team has closed, quietly, and the one they
            stand in, lit. The same six states the rail above the board
            shows, from the same object. The marks are placed in per cent
            of the image, so they hold their dots at any size. */}
        {CHAPTER_LIST.map((c, i) => {
          if (chapters[i]?.state === 'locked') return null;
          const pt = CHAPTER_POINTS[c.id];
          const isHere = i === hereIdx;
          return (
            <span
              key={c.id}
              className="pk-journey-mark"
              data-here={isHere ? '1' : undefined}
              data-side={pt.side}
              style={{ left: `${pt.x * 100}%`, top: `${pt.y * 100}%` }}
            >
              <span className="pk-journey-mark-ring" />
              {isHere && <span className="pk-journey-mark-name">{c.title}</span>}
            </span>
          );
        })}
        </div>
      </div>
    </section>
    </div>
  );
}
