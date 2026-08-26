import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import {
  Activity,
  CalendarDays,
  Crosshair,
  Flag,
  Globe2,
  Layers,
  ShieldCheck,
  Target,
  Users,
  XCircle,
} from 'lucide-react';
import { supabase } from './lib/supabase';
import { useAuth } from './hooks/useAuth';
import { ProgressBars, SolvesTable, ScoreChart } from './SharedComponents';

/* ── presentational helpers (no logic, no data) ────────────────────────── */

const EASE_OUT_QUINT = [0.22, 1, 0.36, 1] as const;

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const StatTile = ({
  icon,
  label,
  value,
  hint,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  hint?: string;
  accent?: string;
}) => (
  <div
    className="surface relative overflow-hidden p-4 sm:p-5"
    title={hint}
    style={accent ? ({ ['--tile-accent' as any]: accent } as React.CSSProperties) : undefined}
  >
    <span
      aria-hidden="true"
      className="absolute inset-x-0 top-0 h-px opacity-70"
      style={{
        background:
          'linear-gradient(90deg, transparent, var(--tile-accent, var(--color-neon)), transparent)',
      }}
    />
    <div className="flex items-center gap-2 text-text-muted">
      <span
        aria-hidden="true"
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-inset"
        style={{
          color: 'var(--tile-accent, var(--color-neon))',
          backgroundColor: 'color-mix(in srgb, var(--tile-accent, var(--color-neon)) 12%, transparent)',
        }}
      >
        {icon}
      </span>
      <span className="label-micro truncate">{label}</span>
    </div>
    <div className="mt-3 font-mono text-h2 leading-none font-bold text-cyber-text tabular-nums">
      {value}
    </div>
    {hint && <p className="mt-1.5 text-small text-text-muted">{hint}</p>}
  </div>
);

const ProfileSkeleton = () => (
  <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-8 lg:py-page">
    <span className="sr-only" role="status">
      Loading profile
    </span>
    <div className="surface p-5 sm:p-gutter">
      <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
        <div className="skeleton h-20 w-20 shrink-0 rounded-full sm:h-24 sm:w-24" />
        <div className="w-full max-w-sm space-y-3">
          <div className="skeleton skeleton-text h-6 w-2/3" />
          <div className="skeleton skeleton-text w-1/2" />
          <div className="skeleton skeleton-text w-1/3" />
        </div>
      </div>
    </div>
    <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="surface p-5">
          <div className="skeleton skeleton-text w-1/2" />
          <div className="skeleton mt-4 h-7 w-16 rounded-inset" />
        </div>
      ))}
    </div>
    <div className="skeleton mt-6 h-64 w-full rounded-card" />
  </div>
);

/* ── page ───────────────────────────────────────────────────────────────── */

export default function UserProfile() {
  const { user, profile } = useAuth();
  const [solves, setSolves] = useState<any[]>([]);
  const [fails, setFails] = useState(0);
  const [scoreData, setScoreData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    fetchProfile();
  }, [user]);

  const fetchProfile = async () => {
    if (!user) return;

    // Fetch correct submissions — deduplicate by challenge (CTFd: only first solve counts)
    const { data: correctSubs } = await supabase
      .from('submissions')
      .select('submitted_at, challenge_id, challenges(title, category, points)')
      .eq('user_id', user.id)
      .eq('is_correct', true)
      .order('submitted_at', { ascending: true });

    // CTFd: keep only first solve per challenge
    const seenChallenges = new Set<string>();
    const dedupedSubs = (correctSubs ?? []).filter((s: any) => {
      if (seenChallenges.has(s.challenge_id)) return false;
      seenChallenges.add(s.challenge_id);
      return true;
    });

    // Fetch fail count
    const { count: failCount } = await supabase
      .from('submissions')
      // 'id', not '*': submitted_flag is revoked from authenticated (it is the
      // admin-only plaintext audit column), and a '*' select list reaches it.
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_correct', false);

    const solvesFormatted = dedupedSubs.map((s: any) => ({
      title: s.challenges?.title ?? '?',
      category: s.challenges?.category ?? '?',
      value: s.challenges?.points ?? 0,
      time: new Date(s.submitted_at).toLocaleString('en-US', {
        month: 'long', day: 'numeric', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      }),
    }));

    // Build score over time
    let cumulative = 0;
    const graph = solvesFormatted.map((s) => {
      cumulative += s.value;
      return { time: s.time, score: cumulative };
    });

    setSolves(solvesFormatted);
    setFails(failCount ?? 0);
    setScoreData(graph);
    setLoading(false);
  };

  // Category breakdown
  const categoryMap: Record<string, number> = {};
  solves.forEach(s => {
    categoryMap[s.category] = (categoryMap[s.category] || 0) + s.value;
  });
  const totalCatPoints = Object.values(categoryMap).reduce((a, b) => a + b, 0) || 1;
  // Category ramp, mirroring --color-cat-* in src/index.css (recharts needs literals).
  const COLORS = ['#c6ff00', '#4fb3a4', '#8e86d6', '#c97fa0', '#cfa15c', '#6d9fd4', '#8fb573', '#93a1ad'];
  const categories = Object.entries(categoryMap).map(([name, val], i) => ({
    name, value: (val / totalCatPoints) * 100, color: COLORS[i % COLORS.length]
  }));

  if (loading) return <ProfileSkeleton />;

  /* presentation-only derived values ------------------------------------ */
  const displayName = profile?.username ?? user?.email ?? '';
  const initial = (displayName || '?').trim().charAt(0).toUpperCase();
  const attempts = solves.length + fails;
  const accuracy = attempts > 0 ? Math.round((solves.length / attempts) * 100) : 0;
  const categoryCount = Object.keys(categoryMap).length;
  const joined = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
      })
    : null;
  const reduced = prefersReducedMotion();
  const rise = reduced
    ? { initial: undefined, animate: undefined, transition: undefined }
    : {
        initial: { opacity: 0, y: 12 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.32, ease: EASE_OUT_QUINT },
      };

  return (
    <div className="flex-1">
      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-8 lg:py-page">

        {/* ── identity header ─────────────────────────────────────────── */}
        <motion.header
          {...rise}
          className="surface relative overflow-hidden p-5 sm:p-gutter"
        >
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-px"
            style={{
              background:
                'linear-gradient(90deg, transparent, var(--color-border-neon) 30%, var(--color-neon) 50%, var(--color-border-neon) 70%, transparent)',
            }}
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -top-24 -right-16 h-56 w-56 rounded-full opacity-[0.14] blur-3xl"
            style={{ background: 'radial-gradient(circle, var(--color-neon), transparent 68%)' }}
          />

          <div className="relative flex flex-col items-center gap-5 text-center sm:flex-row sm:items-center sm:gap-6 sm:text-left">
            {/* avatar */}
            <div className="relative shrink-0">
              <div
                className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border sm:h-24 sm:w-24"
                style={{
                  borderColor: 'var(--color-border-neon)',
                  backgroundColor: 'var(--color-surface-inset)',
                  boxShadow: 'var(--shadow-neon)',
                }}
              >
                {profile?.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span
                    aria-hidden="true"
                    className="font-mono text-h1 font-bold text-cyber-neon"
                  >
                    {initial}
                  </span>
                )}
              </div>
              <span
                aria-hidden="true"
                className="badge absolute -bottom-1 left-1/2 -translate-x-1/2 bg-surface-overlay"
              >
                Player
              </span>
            </div>

            {/* name + meta */}
            <div className="min-w-0 flex-1">
              <p className="label-micro">Operator profile</p>
              <h1 className="mt-1.5 text-h1 break-words text-cyber-text">
                {displayName}
              </h1>

              <div className="mt-3 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                {profile?.team_id && (
                  <span className="badge badge-neon">
                    <Users className="h-3 w-3" aria-hidden="true" />
                    Team member
                  </span>
                )}
                {profile?.is_admin && (
                  <span className="badge badge-info">
                    <ShieldCheck className="h-3 w-3" aria-hidden="true" />
                    Admin
                  </span>
                )}
                {profile?.country && (
                  <span className="badge">
                    <Globe2 className="h-3 w-3" aria-hidden="true" />
                    {profile.country}
                  </span>
                )}
                {profile?.affiliation && (
                  <span className="badge">
                    <Layers className="h-3 w-3" aria-hidden="true" />
                    {profile.affiliation}
                  </span>
                )}
                {joined && (
                  <span className="badge" title={`Joined ${joined}`}>
                    <CalendarDays className="h-3 w-3" aria-hidden="true" />
                    Since {joined}
                  </span>
                )}
              </div>

              {profile?.bio && (
                <p className="mt-4 max-w-2xl text-body text-text-secondary">
                  {profile.bio}
                </p>
              )}
            </div>

            {/* headline number — solves */}
            <div
              className="w-full shrink-0 rounded-card border px-5 py-4 text-center sm:w-auto sm:min-w-[9.5rem]"
              style={{
                borderColor: 'var(--color-border-neon)',
                backgroundColor: 'var(--color-neon-wash)',
              }}
            >
              {/* CTFd: User profile shows solve count only, not personal points */}
              {/* Points belong to the TEAM, not the individual */}
              <div className="font-mono text-h1 leading-none font-bold text-cyber-neon tabular-nums text-glow">
                {solves.length}
              </div>
              <div className="label-micro mt-2">
                challenge{solves.length !== 1 ? 's' : ''} solved
              </div>
            </div>
          </div>
        </motion.header>

        {/* ── stat rail ───────────────────────────────────────────────── */}
        <section aria-label="Performance summary" className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <StatTile
            icon={<Flag className="h-3.5 w-3.5" />}
            label="Solves"
            value={solves.length}
            hint="First-blood-deduped correct flags"
            accent="var(--color-status-solved)"
          />
          <StatTile
            icon={<XCircle className="h-3.5 w-3.5" />}
            label="Failed"
            value={fails}
            hint="Incorrect flag submissions"
            accent="var(--color-status-live)"
          />
          <StatTile
            icon={<Target className="h-3.5 w-3.5" />}
            label="Accuracy"
            value={`${accuracy}%`}
            hint={`${attempts} total submission${attempts !== 1 ? 's' : ''}`}
            accent="var(--color-neon)"
          />
          <StatTile
            icon={<Layers className="h-3.5 w-3.5" />}
            label="Categories"
            value={categoryCount}
            hint="Distinct categories touched"
            accent="var(--color-status-info)"
          />
        </section>

        {/* ── body ────────────────────────────────────────────────────── */}
        <div className="mt-8">
          {solves.length === 0 ? (
            <motion.div
              {...rise}
              className="surface flex flex-col items-center px-6 py-16 text-center"
            >
              <span
                aria-hidden="true"
                className="flex h-12 w-12 items-center justify-center rounded-full border border-border-strong bg-surface-inset text-text-muted"
              >
                <Crosshair className="h-5 w-5" />
              </span>
              <h2 className="mt-4 text-h3 text-cyber-text">No solves yet</h2>
              <p className="mt-1.5 max-w-sm text-small text-text-muted">
                Nothing on the board so far — go crack some challenges and your
                timeline will build itself here.
              </p>
              <span className="badge badge-locked mt-5">Awaiting first flag</span>
            </motion.div>
          ) : (
            <>
              <SolvesTable solves={solves} />
              <div className="flex items-center gap-3 pb-6">
                <Activity className="h-3.5 w-3.5 shrink-0 text-cyber-neon" aria-hidden="true" />
                <span className="label-micro shrink-0">Breakdown</span>
                <hr className="divider flex-1" />
              </div>
              <ProgressBars solvedCount={solves.length} failCount={fails} categories={categories} />
              {scoreData.length > 0 && (
                <ScoreChart data={scoreData} />
              )}
            </>
          )}
        </div>

        <footer className="mt-section border-t border-border-subtle py-8 text-center">
          <p className="label-micro">CyberHX · Operator record</p>
        </footer>
      </div>
    </div>
  );
}
