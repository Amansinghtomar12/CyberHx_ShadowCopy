import React, { useEffect, useRef, useState } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { motion, useReducedMotion } from 'motion/react';
import AnimatedNumber from './components/AnimatedNumber';
import {
  Trophy, Crown, Medal, Activity, Radio, Flag,
  ArrowUp, ArrowDown, Minus, TrendingUp, Lock, EyeOff, RefreshCw
} from 'lucide-react';
import { supabase } from './lib/supabase';

/* Literal token values — recharts SVG attributes are the one place a raw hex is
   safer than var(). These mirror the category and neon ramps in src/index.css
   exactly; keep them in sync if the palette moves. */
const COLORS = [
  '#c6ff00', '#4fb3a4', '#8e86d6', '#e0b34a', '#6d9fd4',
  '#c97fa0', '#8fb573', '#d96a5c', '#93a1ad', '#ddff6b',
];

interface TeamScore {
  id: string;
  name: string;
  total_points: number;
  member_count: number;
  solved_count: number;
  last_solve: string | null;
}

interface GraphPoint {
  time: string;
  [team: string]: number | string;
}

/* ───────────────────────── presentational helpers ───────────────────────── */

const seriesColor = (i: number) => COLORS[i % COLORS.length];

/**
 * "updated 12s ago", ticking on its own.
 *
 * It owns its timer so the label can count up once a second without dragging
 * the standings table and a ten-series recharts graph through a re-render with
 * it. That is the whole reason this is a component and not a string.
 */
function RelativeTime({ at }: { at: Date | null }) {
  const [, force] = useState(0);
  useEffect(() => {
    if (!at) return;
    const t = setInterval(() => force(n => n + 1), 1000);
    return () => clearInterval(t);
  }, [at]);
  if (!at) return null;
  const secs = Math.max(0, Math.round((Date.now() - at.getTime()) / 1000));
  if (secs < 5) return <>just now</>;
  if (secs < 60) return <>{secs}s ago</>;
  const mins = Math.round(secs / 60);
  return <>{mins}m ago</>;
}

const formatClock = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
};

/** Rank ornament: crown / medals for the podium, plain mono index below. */
function RankMark({ rank }: { rank: number }) {
  if (rank > 3) {
    return (
      <span className="font-mono text-small text-text-muted tabular-nums">
        {String(rank).padStart(2, '0')}
      </span>
    );
  }
  const tone =
    rank === 1 ? 'var(--color-neon)'
      : rank === 2 ? 'var(--color-text-secondary)'
        : 'var(--color-cat-rev)';
  const Icon = rank === 1 ? Crown : Medal;
  return (
    <span
      className="inline-flex items-center justify-center w-7 h-7 rounded-inset border"
      style={{
        color: tone,
        borderColor: 'color-mix(in srgb, currentColor 34%, transparent)',
        backgroundColor: 'color-mix(in srgb, currentColor 10%, transparent)',
      }}
    >
      <Icon className="w-3.5 h-3.5" aria-hidden="true" />
    </span>
  );
}

/** Movement arrow — compares a team's position against the previous refresh. */
function RankDelta({ delta }: { delta: number | undefined }) {
  if (delta === undefined || delta === 0) {
    return (
      <span
        className="inline-flex items-center justify-center w-4 h-4 text-text-faint"
        title="No change"
      >
        <Minus className="w-3 h-3" aria-hidden="true" />
        <span className="sr-only">No rank change</span>
      </span>
    );
  }
  const up = delta > 0;
  const Icon = up ? ArrowUp : ArrowDown;
  return (
    <span
      className="inline-flex items-center gap-0.5 font-mono text-small tabular-nums"
      style={{ color: up ? 'var(--color-status-solved)' : 'var(--color-status-live)' }}
      title={`${up ? 'Up' : 'Down'} ${Math.abs(delta)} place${Math.abs(delta) === 1 ? '' : 's'}`}
    >
      <Icon className="w-3 h-3" aria-hidden="true" />
      {Math.abs(delta)}
      <span className="sr-only">
        {up ? 'up' : 'down'} {Math.abs(delta)} places since last refresh
      </span>
    </span>
  );
}

/** Chart tooltip — dark overlay card, ranked series, mono figures. */
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const rows = [...payload]
    .filter((p: any) => typeof p.value === 'number')
    .sort((a: any, b: any) => (b.value as number) - (a.value as number))
    .slice(0, 10);
  return (
    <div className="surface-overlay px-3 py-2.5 min-w-[10rem] max-w-[15rem]">
      <div className="label-micro flex items-center gap-1.5 mb-2">
        <Activity className="w-3 h-3" aria-hidden="true" />
        {label}
      </div>
      <ul className="space-y-1">
        {rows.map((p: any) => (
          <li key={p.dataKey} className="flex items-center gap-2 text-small">
            <span
              className="w-1.5 h-1.5 rounded-pill shrink-0"
              style={{ backgroundColor: p.color }}
              aria-hidden="true"
            />
            <span className="truncate text-text-secondary">{p.dataKey}</span>
            <span className="ml-auto font-mono tabular-nums text-cyber-text">
              {Number(p.value).toLocaleString()}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Podium card for the top three. */
function PodiumCard({
  team, rank, leaderPoints, reduced,
}: { team: TeamScore; rank: number; leaderPoints: number; reduced: boolean }) {
  const tone =
    rank === 1 ? 'var(--color-neon)'
      : rank === 2 ? 'var(--color-text-secondary)'
        : 'var(--color-cat-rev)';
  const pct = leaderPoints > 0 ? Math.max(0.04, team.total_points / leaderPoints) : 0;

  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, delay: reduced ? 0 : rank * 0.05, ease: [0.22, 1, 0.36, 1] }}
      className={[
        'surface relative overflow-hidden p-5 flex flex-col gap-3',
        rank === 1 ? 'sm:order-2 sm:-translate-y-2' : '',
        rank === 2 ? 'sm:order-1' : '',
        rank === 3 ? 'sm:order-3' : '',
      ].join(' ')}
      style={
        rank === 1
          ? { borderColor: 'var(--color-border-neon)', boxShadow: 'var(--shadow-e3), var(--shadow-neon)' }
          : undefined
      }
    >
      <span
        className="absolute inset-x-0 top-0 h-px"
        style={{ background: `linear-gradient(90deg, transparent, ${tone}, transparent)` }}
        aria-hidden="true"
      />
      <div className="flex items-center justify-between gap-2">
        <RankMark rank={rank} />
        <span className="label-micro" style={{ color: tone }}>
          {rank === 1 ? 'Leader' : `Rank ${rank}`}
        </span>
      </div>

      <h4 className="text-h3 text-cyber-text truncate" title={team.name}>
        {team.name}
      </h4>

      <div className="flex items-baseline gap-2">
        <span className="font-mono text-h2 tabular-nums" style={{ color: tone }}>
          {team.total_points.toLocaleString()}
        </span>
        <span className="label-micro">pts</span>
      </div>

      <div className="h-1 rounded-pill bg-surface-inset overflow-hidden" aria-hidden="true">
        <motion.div
          className="h-full origin-left rounded-pill"
          style={{ backgroundColor: tone, width: '100%' }}
          initial={reduced ? false : { scaleX: 0 }}
          animate={{ scaleX: pct }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>

      <div className="flex items-center justify-between text-small text-text-muted">
        <span className="inline-flex items-center gap-1.5">
          <Flag className="w-3 h-3" aria-hidden="true" />
          <span className="font-mono tabular-nums">{team.solved_count ?? 0}</span> solves
        </span>
        <span className="font-mono tabular-nums">{formatClock(team.last_solve)}</span>
      </div>
    </motion.div>
  );
}

/**
 * Standings rows. Owns nothing but presentation: it remembers the previous
 * ordering of the same `teams` array so it can draw a movement arrow.
 */
function StandingsRows({ teams, reduced, meId }: { teams: TeamScore[]; reduced: boolean; meId: string | null }) {
  const prevRanks = useRef<Record<string, number>>({});
  const [deltas, setDeltas] = useState<Record<string, number>>({});

  useEffect(() => {
    const next: Record<string, number> = {};
    const changed: Record<string, number> = {};
    teams.forEach((t, i) => {
      next[t.id] = i;
      const before = prevRanks.current[t.id];
      if (before !== undefined && before !== i) changed[t.id] = before - i;
    });
    prevRanks.current = next;
    setDeltas(changed);
  }, [teams]);

  const leader = teams[0]?.total_points ?? 0;

  return (
    <>
      {teams.map((team, i) => {
        const rank = i + 1;
        const pct = leader > 0 ? Math.max(0.02, team.total_points / leader) : 0;
        const tone = rank <= 3 ? seriesColor(0) : 'var(--color-border-strong)';
        return (
          <motion.tr
            key={team.id}
            layout={reduced ? false : 'position'}
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{
              duration: 0.24,
              delay: reduced ? 0 : Math.min(i, 9) * 0.02,
              // Springs the row into its new place. Weight rather than a fixed
              // easing, so a jump of six places reads bigger than a jump of one.
              layout: { type: 'spring', stiffness: 380, damping: 34, mass: 0.9 },
            }}
            // Marks a row that actually moved this refresh, so the eye is told
            // *what changed* rather than being left to diff two screenshots.
            data-moved={deltas[team.id] === undefined ? undefined : (deltas[team.id] > 0 ? 'up' : 'down')}
            data-me={team.id === meId ? '' : undefined}
            className="standings-row group transition-colors duration-[var(--duration-fast)] hover:bg-surface-raised"
          >
            <td className="px-5 py-4 align-middle">
              <div className="flex items-center gap-2">
                <RankMark rank={rank} />
                <RankDelta delta={deltas[team.id]} />
              </div>
            </td>

            <td className="px-5 py-4 align-middle min-w-0">
              <div className="flex flex-col gap-1.5 min-w-0">
                <span
                  className={`truncate text-small ${rank === 1 ? 'text-cyber-neon font-semibold' : 'text-cyber-text'}`}
                  title={team.name}
                >
                  {team.name}
                  {team.id === meId && <span className="badge badge-neon ml-2 align-middle">You</span>}
                </span>
                <div className="h-0.5 w-full max-w-[12rem] rounded-pill bg-surface-inset overflow-hidden" aria-hidden="true">
                  <motion.div
                    className="h-full w-full origin-left rounded-pill"
                    style={{ backgroundColor: tone, opacity: rank <= 3 ? 0.9 : 0.55 }}
                    initial={reduced ? false : { scaleX: 0 }}
                    animate={{ scaleX: pct }}
                    transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                  />
                </div>
              </div>
            </td>

            <td className="hidden md:table-cell px-5 py-4 align-middle text-right">
              <span className="font-mono text-small tabular-nums text-text-muted">
                {formatClock(team.last_solve)}
              </span>
            </td>

            <td className="px-5 py-4 align-middle text-center">
              <span className="font-mono text-small tabular-nums text-text-secondary">
                {team.solved_count ?? 0}
              </span>
            </td>

            <td className="px-5 py-4 align-middle text-right">
              <AnimatedNumber
                value={team.total_points}
                className="font-mono text-small font-bold tabular-nums text-cyber-text"
              />
            </td>
          </motion.tr>
        );
      })}
    </>
  );
}

function EmptyState({
  icon: Icon, title, hint,
}: { icon: typeof Trophy; title: string; hint: string }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <span
        aria-hidden="true"
        className="flex h-12 w-12 items-center justify-center rounded-full border border-border-strong bg-surface-inset text-text-muted"
      >
        <Icon className="h-5 w-5" />
      </span>
      <p className="mt-4 text-h3 text-cyber-text">{title}</p>
      <p className="mt-1.5 max-w-xs text-small text-text-muted">{hint}</p>
    </div>
  );
}

/* ─────────────────────────────── page ─────────────────────────────── */

interface ScoreboardProps {
  /** The viewer's team, so the board can answer "where am I?" first. */
  myTeamId?: string | null;
}

/** One number in the "you" strip. */
function Stat({ label, tone, children }: { label: string; tone?: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="label-micro">{label}</div>
      <div className="readout mt-1 text-h3 leading-none tabular-nums truncate" style={{ color: tone ?? 'var(--color-text-primary)' }}>
        {children}
      </div>
    </div>
  );
}

export default function Scoreboard({ myTeamId = null }: ScoreboardProps) {
  const [teams, setTeams] = useState<TeamScore[]>([]);
  /**
   * The viewer's own row and place. The standings only carry the top ten, so
   * for most of a 5,000-player field this is the only line on the page that
   * is about *them*. Free when the team is in the ten already fetched; two
   * small reads (one indexed row, one count) on the graph's two-minute cadence
   * when it is not -- ~29 cheap queries a second at full scale, not 233.
   */
  const [mine, setMine] = useState<{ team: TeamScore; rank: number } | null>(null);
  const lastMineAt = useRef(0);
  // The polling loop closes over the first render; the prop must not.
  const myTeamRef = useRef<string | null>(myTeamId);
  useEffect(() => {
    myTeamRef.current = myTeamId;
    if (myTeamId) kick.current?.();   // profile arrived after the board did
  }, [myTeamId]);
  const [graphData, setGraphData] = useState<GraphPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [frozen, setFrozen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [ended, setEnded] = useState(false);
  const [freezeAt, setFreezeAt] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  /* Which freeze generation the standings on screen were fetched for.
     null  = the data on screen is live.
     <iso> = the data on screen is the snapshot taken at that freeze_time.
     While frozen these cannot change, so we skip the two expensive calls
     (team_scores + get_score_progression) and poll only the boolean. That
     turns the final hour of an event -- peak traffic, everyone watching the
     board -- into a single tiny read per client per cycle. */
  const fetchedFor = useRef<string | null>(null);

  /* When the graph was last redrawn. A ref, not state, because the polling
     loop below closes over the first render and must not read stale state. */
  const lastGraphAt = useRef(0);
  const [refreshing, setRefreshing] = useState(false);
  /* Lets the manual button interrupt the sleeping timer instead of queueing
     behind up to fifteen seconds of it. */
  const kick = useRef<(() => void) | null>(null);

  /**
   * TWO CADENCES, BECAUSE THE TWO HALVES COST VERY DIFFERENT AMOUNTS
   *
   * Measured against a seeded database at full event scale -- 5,000 players,
   * 800 teams, 50 operations, 100,000 submissions:
   *
   *   scoreboard_state()      0.30ms   the cheap "has anything changed" poll
   *   team_scores top 10      0.81ms   the standings table
   *   get_score_progression   2.71ms   the graph -- 71% of a full refresh
   *
   * The table is the thing people stare at and it wants to be live. The graph
   * is a twelve-hour trend line that nobody reads to the second, and it is
   * almost three quarters of the cost. Splitting them is what makes a 15s
   * standings refresh affordable: at the worst moment of an event -- the final
   * hour with ~3,500 people watching -- polling everything at 15s would be
   * ~890ms of database CPU per second, and this split brings it to ~290ms.
   *
   * The old 15-MINUTE interval was chosen when both halves refreshed together.
   * It was the right call then and the wrong experience for a CTF: a scoreboard
   * that is a quarter of an hour stale is not a scoreboard.
   */
  const STANDINGS_MS = 15_000;
  const GRAPH_MS = 120_000;

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let delay = STANDINGS_MS;
    let cancelled = false;

    const tick = async () => {
      try { await refresh(); delay = STANDINGS_MS; }
      catch { delay = Math.min(delay * 2, 300_000); }
      if (!cancelled) timer = setTimeout(tick, delay);
    };

    tick();

    // Restart the cycle now rather than waiting out the current sleep.
    kick.current = () => { clearTimeout(timer); delay = STANDINGS_MS; tick(); };

    const onVis = () => {
      if (document.hidden) { clearTimeout(timer); }
      else { clearTimeout(timer); delay = STANDINGS_MS; tick(); }
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      cancelled = true;
      kick.current = null;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  /**
   * The manual control. Throttled to 8 seconds: a button that does nothing
   * feels broken, but 3,500 people holding one down would cost more than the
   * polling it is meant to complement.
   */
  const lastManual = useRef(0);
  const refreshNow = () => {
    const now = Date.now();
    if (refreshing || now - lastManual.current < 8_000) return;
    lastManual.current = now;
    setRefreshing(true);
    // force: redraw the graph too, and ignore the frozen-snapshot shortcut.
    // Pressing refresh should do something visible even when frozen.
    refresh({ force: true })
      .catch(() => {})
      .finally(() => {
        setRefreshing(false);
        kick.current?.();
      });
  };

  /** One cheap RPC, then the heavy pair only when the data can have moved.
      scoreboard_state also performs the auto-freeze the first time anyone
      looks after the event's end time has passed. */
  const refresh = async (opts: { force?: boolean } = {}) => {
    const { data: state } = await supabase.rpc('scoreboard_state');

    const isHidden = !!state?.scores_hidden;
    const isFrozen = !!state?.masked;
    const at: string | null = state?.freeze_time ?? null;
    setHidden(isHidden);
    setFrozen(isFrozen);
    setFreezeAt(at);
    setEnded(!!state?.ended);

    // Hidden: the views return no rows for us anyway, so do not ask.
    if (isHidden) {
      setTeams([]); setGraphData([]); setMine(null); fetchedFor.current = null;
      lastGraphAt.current = 0; lastMineAt.current = 0;
      setLoading(false);
      return;
    }

    // Frozen and already showing this generation's snapshot: nothing can have
    // changed, so skip the expensive calls entirely. This is what keeps the
    // final hour -- peak traffic, everyone watching -- at one 0.3ms read per
    // client per cycle. A manual press still forces through it.
    if (isFrozen && fetchedFor.current === at && !opts.force) { setLoading(false); return; }

    // The standings, every cycle. 0.81ms.
    const top = await fetchStandings();
    fetchedFor.current = isFrozen ? at : null;
    setLastRefresh(new Date());
    setLoading(false);
    if (!top) { setMine(null); return; }

    // Where the viewer stands. In the ten we already hold: free, every cycle.
    // Outside them: rationed like the graph.
    const me = myTeamRef.current;
    const i = me ? top.findIndex(t => t.id === me) : -1;
    if (i >= 0) {
      setMine({ team: top[i], rank: i + 1 });
    } else if (me && (opts.force || Date.now() - lastMineAt.current >= GRAPH_MS)) {
      await fetchMine(me);
      lastMineAt.current = Date.now();
    } else if (!me) {
      setMine(null);
    }

    // The graph, only when it has actually gone stale. 2.71ms, so this is the
    // one worth rationing.
    if (opts.force || Date.now() - lastGraphAt.current >= GRAPH_MS) {
      await fetchGraph(top);
      lastGraphAt.current = Date.now();
    }
  };

  /** Top ten teams. Returns them so the graph does not refetch what we have. */
  const fetchStandings = async (): Promise<TeamScore[] | null> => {
    const { data: teamData } = await supabase
      .from('team_scores')
      .select('*')
      .order('total_points', { ascending: false })
      .order('last_solve', { ascending: true })
      .limit(10);

    if (!teamData?.length) return null;
    setTeams(teamData as TeamScore[]);
    return teamData as TeamScore[];
  };

  /** The viewer's row plus its place: one indexed read, one count. The
      count mirrors the standings' own order -- points, then earliest last
      solve -- so the number here is the one the table would show. */
  const fetchMine = async (teamId: string) => {
    const { data: rows } = await supabase
      .from('team_scores').select('*').eq('id', teamId).limit(1);
    const team = rows?.[0] as TeamScore | undefined;
    if (!team) { setMine(null); return; }

    const pts = Number(team.total_points ?? 0);
    const ahead = team.last_solve
      ? `total_points.gt.${pts},and(total_points.eq.${pts},last_solve.lt.${team.last_solve})`
      : `total_points.gt.${pts},and(total_points.eq.${pts},last_solve.not.is.null)`;
    const { count } = await supabase
      .from('team_scores').select('id', { count: 'exact', head: true }).or(ahead);
    setMine({ team, rank: (count ?? 0) + 1 });
  };

  const fetchGraph = async (top10Teams: TeamScore[]) => {
    const top10Names = top10Teams.map(t => t.name);
    const teamIdToName: Record<string, string> = {};
    top10Teams.forEach(t => { teamIdToName[t.id] = t.name; });

    // 2. One row per scoring event for these teams: solves as positive points,
    //    hint unlocks as negative, already ordered by time. Attribution matches
    //    recompute_scores, so the curve ends where the standings table says.
    const { data: events, error } = await supabase
      .rpc('get_score_progression', { p_team_ids: top10Teams.map(t => t.id) });

    if (error || !events?.length) { setGraphData([]); return; }

    // 3. CTFd style graph: running total per team, each event counted once.
    const teamPoints: Record<string, number> = {};
    const seen: Record<string, Set<string>> = {};
    top10Names.forEach(name => {
      teamPoints[name] = 0;
      seen[name] = new Set();
    });

    const points: GraphPoint[] = [];
    const snapshot = (at: Date): GraphPoint => {
      const point: GraphPoint = { time: formatClock(at.toISOString()) };
      top10Names.forEach(name => { point[name] = teamPoints[name]; });
      return point;
    };

    // Baseline: every team flat on zero a minute before the first event.
    // Without it a competition with one solve has a single x-value, and an
    // area chart with one point draws isolated dots rather than a line, which
    // reads as broken rather than as early.
    const firstAt = new Date(events[0].occurred_at);
    points.push(snapshot(new Date(firstAt.getTime() - 60_000)));

    events.forEach((e: any) => {
      const teamName = teamIdToName[e.team_id];
      if (!teamName || !(teamName in teamPoints)) return;

      // event_key is the challenge id for a solve and the unlock id for a
      // hint, so one key per event and no collisions between the two kinds.
      if (seen[teamName].has(e.event_key)) return;
      seen[teamName].add(e.event_key);

      // Clamped at zero to match team_scores, which floors the net total.
      teamPoints[teamName] = Math.max(0, teamPoints[teamName] + (e.points ?? 0));

      points.push(snapshot(new Date(e.occurred_at)));
    });

    // Carry the standings forward to now, so the board reads as live between
    // solves instead of stopping at whenever the last one landed. Skipped when
    // it would just repeat the last label.
    const now = snapshot(new Date());
    if (now.time !== points[points.length - 1]?.time) points.push(now);

    setGraphData(points);
  };

  const top10Names = teams.slice(0, 10).map(t => t.name);
  const reduced = !!useReducedMotion();
  const podium = teams.slice(0, 3);
  const leaderPoints = teams[0]?.total_points ?? 0;

  return (
    <div className="flex-1 w-full min-w-0 mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      {/* ── header ───────────────────────────────────────────────── */}
      <header className="mb-8 sm:mb-section flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="label-micro flex items-center gap-1.5 mb-2">
            <Radio className="w-3 h-3 text-cyber-neon" aria-hidden="true" />
            Live telemetry
          </p>
          <h2 className="text-h1 text-cyber-text">Scoreboard</h2>
          <div
            className="mt-3 h-px w-24 rounded-pill"
            style={{ background: 'linear-gradient(90deg, var(--color-neon), transparent)' }}
            aria-hidden="true"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {hidden ? (
            <span className="badge badge-hard inline-flex items-center gap-1.5">
              <EyeOff className="w-3 h-3" aria-hidden="true" /> Hidden
            </span>
          ) : frozen ? (
            <span className="badge badge-medium inline-flex items-center gap-1.5">
              <Lock className="w-3 h-3" aria-hidden="true" /> {ended ? 'Final' : 'Frozen'}
            </span>
          ) : (
            <span className="badge badge-live">Live</span>
          )}
          {!hidden && (
            <span className="badge badge-neon font-mono tabular-nums">
              {teams.length} {teams.length === 1 ? 'team' : 'teams'}
            </span>
          )}
          <span className="text-small text-text-muted">
            {hidden
              ? 'Hidden by the organisers'
              : frozen
                ? ended
                  ? `Final standings as of ${freezeAt ? formatClock(freezeAt) : 'the close'}`
                  : `Frozen${freezeAt ? ` at ${formatClock(freezeAt)}` : ''} — final standings hidden until the reveal`
                : <>Updated <RelativeTime at={lastRefresh} /></>}
          </span>
          {!hidden && (
            <button
              type="button"
              onClick={refreshNow}
              disabled={refreshing}
              aria-label="Refresh the scoreboard now"
              title="Refresh now"
              className="btn btn-ghost btn-sm btn-icon"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
            </button>
          )}
        </div>
      </header>

      {/* ── blackout ─────────────────────────────────────────────── */}
      {hidden ? (
        <section className="surface p-10 sm:p-16 text-center">
          <span
            aria-hidden="true"
            className="grid place-items-center w-14 h-14 mx-auto rounded-card border"
            style={{
              borderColor: 'var(--color-border-danger)',
              backgroundColor: 'var(--color-diff-hard-wash)',
              color: 'var(--color-diff-hard)',
            }}
          >
            <EyeOff className="w-6 h-6" />
          </span>
          <h3 className="mt-5 text-h2 text-cyber-text">Scoreboard hidden</h3>
          <p className="mt-2 mx-auto max-w-md text-body text-text-secondary">
            The organisers have taken the standings offline for now. Keep solving —
            every flag you submit still counts, and the board will return.
          </p>
        </section>
      ) : (
      <>

      {/* ── podium ───────────────────────────────────────────────── */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-3 mb-8 sm:mb-section" aria-hidden="true">
          {[0, 1, 2].map(i => (
            <div key={i} className="surface p-5 space-y-3">
              <div className="skeleton h-7 w-7 rounded-inset" />
              <div className="skeleton skeleton-text w-2/3" />
              <div className="skeleton h-6 w-1/2 rounded-inset" />
              <div className="skeleton skeleton-text w-full" />
            </div>
          ))}
        </div>
      ) : podium.length > 0 ? (
        <section aria-label="Top three teams" className="mb-8 sm:mb-section">
          <h3 className="label-micro mb-3 flex items-center gap-1.5">
            <Trophy className="w-3 h-3" aria-hidden="true" /> Podium
          </h3>
          <div className="grid gap-4 sm:grid-cols-3 sm:items-end">
            {podium.map((team, i) => (
              <PodiumCard
                key={team.id}
                team={team}
                rank={i + 1}
                leaderPoints={leaderPoints}
                reduced={reduced}
              />
            ))}
          </div>
        </section>
      ) : null}

      {/* ── graph ────────────────────────────────────────────────── */}
      <section className="mb-8 sm:mb-section">
        <div className="surface overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b border-border-subtle">
            <div className="min-w-0">
              <h3 className="text-h3 text-cyber-text flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-cyber-neon" aria-hidden="true" />
                Score progression
              </h3>
              <p className="text-small text-text-muted mt-0.5">
                Cumulative points, top 10 teams
              </p>
            </div>
            <span className="label-micro font-mono tabular-nums">
              {top10Names.length} series
            </span>
          </div>

          <div className="px-1 sm:px-3 pb-2 pt-4 h-[300px] sm:h-[380px] lg:h-[440px]">
            {loading ? (
              <div className="h-full flex items-end gap-2 px-4 pb-8" aria-hidden="true">
                {[38, 52, 44, 66, 58, 78, 70, 90].map((h, i) => (
                  <div key={i} className="skeleton flex-1 rounded-inset" style={{ height: `${h}%` }} />
                ))}
              </div>
            ) : graphData.length === 0 ? (
              <div className="h-full flex items-center justify-center">
                <EmptyState
                  icon={Activity}
                  title="Awaiting the first solve"
                  hint="The progression curve starts drawing as soon as a team lands a flag."
                />
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={graphData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <defs>
                    {top10Names.map((name, i) => (
                      <linearGradient key={name} id={`sb-grad-${i}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={seriesColor(i)} stopOpacity={i === 0 ? 0.28 : 0.16} />
                        <stop offset="100%" stopColor={seriesColor(i)} stopOpacity={0} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid
                    strokeDasharray="2 6"
                    stroke="var(--color-border-base)"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="time"
                    stroke="var(--color-text-faint)"
                    tick={{ fill: 'var(--color-text-muted)', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }}
                    tickLine={false}
                    axisLine={{ stroke: 'var(--color-border-base)' }}
                    minTickGap={24}
                    dy={8}
                  />
                  <YAxis
                    stroke="var(--color-text-faint)"
                    tick={{ fill: 'var(--color-text-muted)', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }}
                    tickLine={false}
                    axisLine={false}
                    width={44}
                    dx={-4}
                  />
                  <Tooltip
                    content={<ChartTooltip />}
                    cursor={{ stroke: 'var(--color-border-strong)', strokeDasharray: '3 3' }}
                  />
                  <Legend
                    verticalAlign="bottom"
                    height={64}
                    iconType="circle"
                    iconSize={7}
                    wrapperStyle={{ paddingTop: 16 }}
                    formatter={(value: any) => (
                      <span className="label-micro align-middle">
                        {String(value)}
                      </span>
                    )}
                  />
                  {top10Names.map((name, i) => (
                    <Area
                      key={name}
                      type="monotone"
                      dataKey={name}
                      stroke={seriesColor(i)}
                      strokeWidth={i === 0 ? 2.25 : 1.5}
                      fill={`url(#sb-grad-${i})`}
                      fillOpacity={1}
                      isAnimationActive={!reduced}
                      animationDuration={520}
                      dot={false}
                      activeDot={{
                        r: 4,
                        strokeWidth: 2,
                        stroke: 'var(--color-surface-card)',
                        fill: seriesColor(i),
                      }}
                    />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </section>

      {/* ── you ──────────────────────────────────────────────────── */}
      {mine && !loading && (() => {
        const r = mine.rank; const pts = Number(mine.team.total_points ?? 0);
        const above = r > 1 && r <= teams.length ? teams[r - 2] : null;
        const tenth = teams[9] ?? teams[teams.length - 1];
        let gap: { label: string; value: string; tone?: string } | null = null;
        if (r === 1 && teams[1]) gap = { label: 'Lead', value: `+${Math.max(0, pts - Number(teams[1].total_points)).toLocaleString()}`, tone: 'var(--color-neon)' };
        else if (above) gap = { label: `Behind #${r - 1}`, value: `${(Number(above.total_points) - pts).toLocaleString()} pts` };
        else if (r > teams.length && tenth) gap = { label: `To #${teams.length}`, value: `${Math.max(0, Number(tenth.total_points) - pts + 1).toLocaleString()} pts` };
        return (
          <section aria-label="Your team's position" className="mb-4">
            <div className="surface flex flex-wrap items-center gap-x-6 gap-y-4 px-4 sm:px-6 py-4" style={{ boxShadow: 'inset 2px 0 0 var(--color-neon), var(--shadow-e2)' }}>
              <div className="flex min-w-0 items-center gap-3">
                <span className="badge badge-neon shrink-0">You</span>
                <span className="truncate text-body font-semibold text-cyber-text" title={mine.team.name}>{mine.team.name}</span>
                {r > teams.length && (
                  <span className="hidden sm:inline label-micro">outside the top {teams.length}</span>
                )}
              </div>
              <div className="ml-auto flex flex-wrap items-end gap-x-6 gap-y-2">
                <Stat label="Place" tone={r <= 3 ? 'var(--color-neon)' : undefined}>#{r}</Stat>
                <Stat label="Score">{pts.toLocaleString()}</Stat>
                <Stat label="Solves">{mine.team.solved_count}</Stat>
                {gap && <Stat label={gap.label} tone={gap.tone}>{gap.value}</Stat>}
              </div>
            </div>
          </section>
        );
      })()}

      {/* ── standings ────────────────────────────────────────────── */}
      <section aria-label="Team standings">
        <div className="surface overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b border-border-subtle">
            <h3 className="text-h3 text-cyber-text flex items-center gap-2">
              <Trophy className="w-4 h-4 text-cyber-neon" aria-hidden="true" />
              Standings
            </h3>
            <span className="label-micro">Ties broken by earliest solve</span>
          </div>

          {/* the table scrolls in its own box — the page never does */}
          <div className="max-h-[28rem] overflow-auto custom-scrollbar">
            <table className="w-full min-w-[30rem] text-left border-collapse">
              <caption className="sr-only">
                Team standings, ordered by total points then earliest last solve
              </caption>
              <thead className="sticky top-0 z-10">
                <tr className="bg-surface-rail border-b border-border-base">
                  <th scope="col" className="label-micro px-5 py-3.5 w-28">Place</th>
                  <th scope="col" className="label-micro px-5 py-3.5">Team</th>
                  <th scope="col" className="label-micro hidden md:table-cell px-5 py-3.5 text-right">Last solve</th>
                  <th scope="col" className="label-micro px-5 py-3.5 text-center">Solves</th>
                  <th scope="col" className="label-micro px-5 py-3.5 text-right">Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {loading ? (
                  [0, 1, 2, 3, 4].map(i => (
                    <tr key={i} aria-hidden="true">
                      <td className="px-5 py-4"><div className="skeleton h-5 w-10 rounded-inset" /></td>
                      <td className="px-5 py-4"><div className="skeleton skeleton-text w-40" /></td>
                      <td className="hidden md:table-cell px-5 py-4"><div className="skeleton skeleton-text w-16 ml-auto" /></td>
                      <td className="px-5 py-4"><div className="skeleton skeleton-text w-8 mx-auto" /></td>
                      <td className="px-5 py-4"><div className="skeleton skeleton-text w-14 ml-auto" /></td>
                    </tr>
                  ))
                ) : teams.length === 0 ? (
                  <tr>
                    <td colSpan={5}>
                      <EmptyState
                        icon={Trophy}
                        title="No teams on the board yet"
                        hint="Standings populate the moment the first flag is accepted."
                      />
                    </td>
                  </tr>
                ) : (
                  <StandingsRows teams={teams} reduced={reduced} meId={myTeamId} />
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      </>
      )}
    </div>
  );
}
