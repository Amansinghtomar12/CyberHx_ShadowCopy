import React, { useEffect, useRef, useState } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { motion, useReducedMotion } from 'motion/react';
import {
  Trophy, Crown, Medal, Activity, Radio, Flag,
  ArrowUp, ArrowDown, Minus, TrendingUp
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
function StandingsRows({ teams, reduced }: { teams: TeamScore[]; reduced: boolean }) {
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
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.24, delay: reduced ? 0 : Math.min(i, 9) * 0.02 }}
            className="group transition-colors duration-[var(--duration-fast)] hover:bg-surface-raised"
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
              <span className="font-mono text-small font-bold tabular-nums text-cyber-text">
                {team.total_points.toLocaleString()}
              </span>
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

export default function Scoreboard() {
  const [teams, setTeams] = useState<TeamScore[]>([]);
  const [graphData, setGraphData] = useState<GraphPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchScoreboard();
    const interval = setInterval(fetchScoreboard, 60000);
    return () => clearInterval(interval);
  }, []);

  const fetchScoreboard = async () => {
    // 1. Get top teams
    const { data: teamData } = await supabase
      .from('team_scores')
      .select('*')
      .order('total_points', { ascending: false })
      .order('last_solve', { ascending: true })
      .limit(10);

    if (!teamData?.length) { setLoading(false); return; }
    setTeams(teamData as TeamScore[]);

    const top10Teams = teamData as TeamScore[];
    const top10Names = top10Teams.map(t => t.name);
    const teamIdToName: Record<string, string> = {};
    top10Teams.forEach(t => { teamIdToName[t.id] = t.name; });

    // 2. ✅ Secure RPC — challenges table directly access nahi hoti
    const { data: subs, error } = await supabase
      .rpc('get_solve_data', {
        team_ids: top10Teams.map(t => t.id)
      });

    if (error || !subs?.length) { setLoading(false); return; }

    // 3. CTFd style graph: per team, count unique challenges only
    const teamPoints: Record<string, number> = {};
    const teamSeenChallenges: Record<string, Set<string>> = {};
    top10Names.forEach(name => {
      teamPoints[name] = 0;
      teamSeenChallenges[name] = new Set();
    });

    const points: GraphPoint[] = [];

    subs.forEach((s: any) => {
      const teamName = teamIdToName[s.team_id];
      if (!teamName || !top10Names.includes(teamName)) return;

      if (teamSeenChallenges[teamName].has(s.challenge_id)) return;
      teamSeenChallenges[teamName].add(s.challenge_id);

      // ✅ FIX: s.points use karo, s.challenges?.points nahi
      teamPoints[teamName] += s.points ?? 0;

      const time = new Date(s.submitted_at).toLocaleTimeString('en-US', {
        hour: '2-digit', minute: '2-digit'
      });

      const point: GraphPoint = { time };
      top10Names.forEach(name => { point[name] = teamPoints[name]; });
      points.push(point);
    });

    setGraphData(points);
    setLoading(false);
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
          <span className="badge badge-live">Live</span>
          <span className="badge badge-neon font-mono tabular-nums">
            {teams.length} {teams.length === 1 ? 'team' : 'teams'}
          </span>
          <span className="text-small text-text-muted">Refreshes every 60s</span>
        </div>
      </header>

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
                    height={40}
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
                  <StandingsRows teams={teams} reduced={reduced} />
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
