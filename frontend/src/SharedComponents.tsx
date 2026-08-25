import React from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';
import { motion, useReducedMotion } from 'motion/react';
import {
  Activity,
  CheckCircle2,
  Clock,
  Flag,
  Inbox,
  Layers,
  LineChart,
  Trophy,
  XCircle
} from 'lucide-react';

/* ────────────────────────────────────────────────────────────────────────────
   Local presentational helpers (no behaviour, no exports)
   ──────────────────────────────────────────────────────────────────────── */

const EASE_OUT_QUINT = [0.22, 1, 0.36, 1] as const;

/* Literal token values — SVG presentation attributes are the one place where a
   raw hex is safer than var(). These mirror src/index.css exactly. */
const TOKEN = {
  neon: '#c6ff00',
  neonDim: '#8fb800',
  neonBright: '#ddff6b',
  solved: '#a6e04a',
  fail: '#e0705f',
  border: '#1a242d',
  borderSubtle: '#131c25',
  muted: '#8a949d'
};

const CAT_KEYS = ['web', 'crypto', 'steg', 'rev', 'pwn', 'forensic', 'osint', 'misc'];

/** Maps an arbitrary category label onto the design-system category hue. */
const catColor = (category: unknown): string => {
  const key = String(category ?? '').trim().toLowerCase();
  return CAT_KEYS.includes(key) ? `var(--color-cat-${key})` : 'var(--color-cat-misc)';
};

/** Section heading used above each telemetry block. */
const BlockHeader = ({
  icon,
  title,
  readout
}: {
  icon: React.ReactNode;
  title: string;
  readout?: React.ReactNode;
}) => (
  <div className="flex items-center justify-between gap-3">
    <span className="flex min-w-0 items-center gap-2">
      <span aria-hidden="true" className="shrink-0 text-cyber-neon">
        {icon}
      </span>
      <span className="label-micro truncate">{title}</span>
    </span>
    {readout != null && (
      <span className="shrink-0 font-mono text-small text-text-secondary tabular-nums">
        {readout}
      </span>
    )}
  </div>
);

/** Empty-state plate shared by all three components. */
const EmptyPlate = ({
  icon,
  title,
  body,
  className = ''
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  className?: string;
}) => (
  <div
    className={`flex flex-col items-center justify-center px-6 py-16 text-center ${className}`}
  >
    <span
      aria-hidden="true"
      className="flex h-12 w-12 items-center justify-center rounded-full border border-border-strong bg-surface-inset text-text-muted"
    >
      {icon}
    </span>
    <p className="mt-4 text-h3 text-cyber-text">{title}</p>
    <p className="mt-1.5 max-w-xs text-small text-text-muted">{body}</p>
  </div>
);

/** A precision meter: inset track, tick overlay, animated segments. */
const Meter = ({
  segments,
  label
}: {
  segments: { key: string; percent: number; color: string; title: string }[];
  label: string;
}) => {
  const reduce = useReducedMotion();
  return (
    <div
      className="relative h-2.5 w-full overflow-hidden rounded-pill border border-border-subtle bg-surface-inset shadow-well"
      role="img"
      aria-label={label}
    >
      <div className="flex h-full w-full">
        {segments.map((seg) => (
          <motion.div
            key={seg.key}
            title={seg.title}
            className="h-full"
            style={{
              width: `${seg.percent}%`,
              backgroundColor: seg.color,
              transformOrigin: 'left center'
            }}
            initial={reduce ? false : { scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.45, ease: EASE_OUT_QUINT }}
          />
        ))}
      </div>
      {/* measurement ticks — decorative, static */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-40 mix-blend-overlay"
        style={{
          backgroundImage:
            'repeating-linear-gradient(90deg, rgba(6,11,16,.55) 0 1px, transparent 1px 10%)'
        }}
      />
    </div>
  );
};

/** One legend row: dot, name, mono percentage. */
const LegendItem = ({
  color,
  name,
  value
}: {
  color: string;
  name: string;
  value: number;
}) => (
  <li className="flex min-w-0 items-center gap-2">
    <span
      aria-hidden="true"
      className="h-2 w-2 shrink-0 rounded-full"
      style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}` }}
    />
    <span className="label-micro min-w-0 flex-1 truncate text-text-secondary">{name}</span>
    <span className="shrink-0 font-mono text-small tabular-nums text-text-muted">
      {value.toFixed(1)}%
    </span>
  </li>
);

/** One solve record card (mobile). Owns its own reduced-motion check. */
const SolveCard = ({ index, children }: { index: number; children: React.ReactNode }) => {
  const reduce = useReducedMotion();
  return (
    <motion.li
      className="surface relative overflow-hidden p-4"
      initial={reduce ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: reduce ? 0 : 0.24,
        ease: EASE_OUT_QUINT,
        delay: reduce ? 0 : Math.min(index, 8) * 0.02,
      }}
    >
      {children}
    </motion.li>
  );
};

/* ────────────────────────────────────────────────────────────────────────────
   ProgressBars
   ──────────────────────────────────────────────────────────────────────── */

export const ProgressBars = ({ solvedCount, failCount, categories }: { solvedCount: number, failCount: number, categories: {name: string, value: number, color: string}[] }) => {
  const total = solvedCount + failCount;
  const solvedPercent = (solvedCount / total) * 100;

  const hasAttempts = total > 0;
  const failPercent = 100 - solvedPercent;

  return (
    <div className="mb-8 sm:mb-section grid grid-cols-1 gap-4 lg:grid-cols-2">
      {/* ── accuracy ─────────────────────────────────────────────────── */}
      <section className="surface p-5 sm:p-gutter">
        <BlockHeader
          icon={<Activity className="h-3.5 w-3.5" />}
          title="Submission accuracy"
          readout={hasAttempts ? `${total} attempt${total === 1 ? '' : 's'}` : undefined}
        />

        {hasAttempts ? (
          <>
            <div className="mt-4 flex items-baseline gap-2">
              <span className="font-mono text-h2 tabular-nums text-cyber-text">
                {solvedPercent.toFixed(1)}
                <span className="text-h3 text-text-muted">%</span>
              </span>
              <span className="label-micro">accepted</span>
            </div>

            <div className="mt-3">
              <Meter
                label={`${solvedPercent.toFixed(1)} percent of submissions accepted`}
                segments={[
                  {
                    key: 'solved',
                    percent: solvedPercent,
                    color: 'var(--color-status-solved)',
                    title: `Solves — ${solvedPercent.toFixed(1)}%`
                  },
                  {
                    key: 'fails',
                    percent: failPercent,
                    color: 'var(--color-diff-hard)',
                    title: `Fails — ${failPercent.toFixed(1)}%`
                  }
                ]}
              />
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-3">
              <div className="surface-inset flex items-center gap-2.5 px-3 py-2.5">
                <CheckCircle2
                  aria-hidden="true"
                  className="h-4 w-4 shrink-0"
                  style={{ color: 'var(--color-status-solved)' }}
                />
                <div className="min-w-0">
                  <dt className="label-micro truncate">Solves</dt>
                  <dd className="font-mono text-small tabular-nums text-cyber-text">
                    {solvedCount}
                    <span className="ml-1.5 text-text-muted">{solvedPercent.toFixed(1)}%</span>
                  </dd>
                </div>
              </div>
              <div className="surface-inset flex items-center gap-2.5 px-3 py-2.5">
                <XCircle
                  aria-hidden="true"
                  className="h-4 w-4 shrink-0"
                  style={{ color: 'var(--color-diff-hard)' }}
                />
                <div className="min-w-0">
                  <dt className="label-micro truncate">Fails</dt>
                  <dd className="font-mono text-small tabular-nums text-cyber-text">
                    {failCount}
                    <span className="ml-1.5 text-text-muted">{failPercent.toFixed(1)}%</span>
                  </dd>
                </div>
              </div>
            </dl>
          </>
        ) : (
          <EmptyPlate
            icon={<Activity className="h-5 w-5" />}
            title="No submissions"
            body="Accuracy telemetry appears after the first flag attempt."
          />
        )}
      </section>

      {/* ── category spread ──────────────────────────────────────────── */}
      <section className="surface p-5 sm:p-gutter">
        <BlockHeader
          icon={<Layers className="h-3.5 w-3.5" />}
          title="Category spread"
          readout={
            categories.length > 0
              ? `${categories.length} categor${categories.length === 1 ? 'y' : 'ies'}`
              : undefined
          }
        />

        {categories.length > 0 ? (
          <>
            <div className="mt-4 lg:mt-14">
              <Meter
                label="Distribution of solves across categories"
                segments={categories.map((cat, i) => ({
                  key: `${cat.name}-${i}`,
                  percent: cat.value,
                  color: cat.color,
                  title: `${cat.name} — ${cat.value.toFixed(1)}%`
                }))}
              />
            </div>

            <ul className="mt-4 grid grid-cols-1 gap-x-5 gap-y-2 sm:grid-cols-2">
              {categories.map((cat, i) => (
                <LegendItem key={i} color={cat.color} name={cat.name} value={cat.value} />
              ))}
            </ul>
          </>
        ) : (
          <EmptyPlate
            icon={<Layers className="h-5 w-5" />}
            title="Nothing mapped yet"
            body="Solve a challenge and its category lands on this meter."
          />
        )}
      </section>
    </div>
  );
};

/* ────────────────────────────────────────────────────────────────────────────
   SolvesTable
   ──────────────────────────────────────────────────────────────────────── */

export const SolvesTable = ({ solves }: { solves: any[] }) => (
  <section className="mb-8 sm:mb-section">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h3 className="flex items-center gap-2.5 text-h2 text-cyber-text">
        <Flag aria-hidden="true" className="h-4 w-4 shrink-0 text-cyber-neon" />
        Solves
      </h3>
      {solves.length > 0 && (
        <span className="badge badge-solved">
          {solves.length} captured
        </span>
      )}
    </div>

    {solves.length === 0 ? (
      <div className="surface">
        <EmptyPlate
          icon={<Inbox className="h-5 w-5" />}
          title="No solves recorded"
          body="Once a flag lands, every capture shows up here with its category, value and timestamp."
        />
      </div>
    ) : (
      <>
        {/* ── mobile: stacked record cards ───────────────────────────── */}
        <ul className="flex flex-col gap-2.5 md:hidden">
          {solves.map((solve, i) => (
            <SolveCard key={i} index={i}>
              <span
                aria-hidden="true"
                className="absolute inset-y-0 left-0 w-0.5"
                style={{ backgroundColor: catColor(solve.category) }}
              />
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 flex-1 break-words text-h3 text-cyber-neon">
                  {solve.title}
                </p>
                <span className="shrink-0 font-mono text-small font-bold tabular-nums text-cyber-text">
                  {solve.value}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <span className="flex items-center gap-1.5">
                  <span
                    aria-hidden="true"
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: catColor(solve.category) }}
                  />
                  <span className="label-micro">{solve.category}</span>
                </span>
                {solves.some(s => s.solver) && (
                  <span className="truncate font-mono text-small text-text-secondary">
                    {solve.solver ?? '—'}
                  </span>
                )}
                <span className="ml-auto flex items-center gap-1.5 font-mono text-small text-text-muted">
                  <Clock aria-hidden="true" className="h-3 w-3 shrink-0" />
                  {solve.time}
                </span>
              </div>
            </SolveCard>
          ))}
        </ul>

        {/* ── tablet / desktop: table ────────────────────────────────── */}
        <div className="hidden md:block">
          <div className="surface overflow-hidden">
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full min-w-[36rem] border-collapse text-left">
                <thead>
                  <tr className="border-b border-border-base bg-surface-rail">
                    <th scope="col" className="label-micro px-5 py-3.5 font-bold">Challenge</th>
                    <th scope="col" className="label-micro px-5 py-3.5 font-bold">Category</th>
                    <th scope="col" className="label-micro px-5 py-3.5 text-right font-bold">Value</th>
                    {solves.some(s => s.solver) && <th scope="col" className="label-micro px-5 py-3.5 font-bold">Solver</th>}
                    <th scope="col" className="label-micro px-5 py-3.5 text-right font-bold">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {solves.map((solve, i) => (
                    <tr
                      key={i}
                      className="group border-t border-border-subtle transition-colors duration-[var(--duration-fast)] hover:bg-surface-raised"
                    >
                      <td className="px-5 py-4">
                        <span className="text-small font-semibold text-cyber-neon underline-offset-4 group-hover:underline">
                          {solve.title}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <span className="flex items-center gap-2">
                          <span
                            aria-hidden="true"
                            className="h-1.5 w-1.5 shrink-0 rounded-full"
                            style={{ backgroundColor: catColor(solve.category) }}
                          />
                          <span className="label-micro">{solve.category}</span>
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right font-mono text-small font-bold tabular-nums text-cyber-text">
                        {solve.value}
                      </td>
                      {solves.some(s => s.solver) && (
                        <td className="px-5 py-4 font-mono text-small text-text-secondary">
                          {solve.solver ?? '—'}
                        </td>
                      )}
                      <td className="whitespace-nowrap px-5 py-4 text-right font-mono text-small tabular-nums text-text-muted">
                        {solve.time}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </>
    )}
  </section>
);

/* ────────────────────────────────────────────────────────────────────────────
   ScoreChart
   ──────────────────────────────────────────────────────────────────────── */

const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="tooltip">
      <p className="label-micro mb-1">{String(label ?? '')}</p>
      <p className="flex items-center gap-2 font-mono text-small tabular-nums text-cyber-neon">
        <Trophy aria-hidden="true" className="h-3 w-3 shrink-0" />
        {payload[0]?.value} pts
      </p>
    </div>
  );
};

export const ScoreChart = ({ data }: { data: any[] }) => (
  <section className="surface relative mb-8 sm:mb-section overflow-hidden p-5 sm:p-gutter">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <BlockHeader icon={<LineChart className="h-3.5 w-3.5" />} title="Score over time" />
      {data.length > 0 && (
        <span className="font-mono text-small tabular-nums text-cyber-neon">
          {data[data.length - 1]?.score} pts
        </span>
      )}
    </div>

    {data.length === 0 ? (
      <EmptyPlate
        icon={<LineChart className="h-5 w-5" />}
        title="No score history"
        body="The curve starts drawing itself with the first accepted flag."
      />
    ) : (
      <div className="mt-5 h-[240px] w-full sm:h-[300px] lg:h-[340px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
            <defs>
              <linearGradient id="colorPoints" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={TOKEN.neon} stopOpacity={0.38} />
                <stop offset="55%" stopColor={TOKEN.neonDim} stopOpacity={0.14} />
                <stop offset="100%" stopColor={TOKEN.neonDim} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="2 6" stroke={TOKEN.border} vertical={false} />
            <XAxis dataKey="time" hide />
            <YAxis
              stroke={TOKEN.muted}
              fontSize={10}
              tickLine={false}
              axisLine={false}
              width={44}
              tick={{ fill: TOKEN.muted, fontFamily: 'var(--font-mono, monospace)' }}
            />
            <Tooltip
              content={<ChartTooltip />}
              cursor={{ stroke: TOKEN.borderSubtle, strokeWidth: 1 }}
            />
            <Area
              type="monotone"
              dataKey="score"
              stroke={TOKEN.neon}
              fillOpacity={1}
              fill="url(#colorPoints)"
              strokeWidth={2}
              dot={{ r: 2.5, fill: TOKEN.neon, stroke: '#060b10', strokeWidth: 1.5 }}
              activeDot={{ r: 5, fill: TOKEN.neonBright, stroke: '#060b10', strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    )}
  </section>
);
