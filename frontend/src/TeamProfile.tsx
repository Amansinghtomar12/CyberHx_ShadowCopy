import React, { useEffect, useState } from 'react';
import {
  Users, Plus, LogIn, Copy, Check, Trash2,
  KeyRound, Crown, Trophy, Target, ShieldAlert, AlertCircle,
} from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { supabase } from './lib/supabase';
import { useAuth } from './hooks/useAuth';
import { ProgressBars, SolvesTable, ScoreChart } from './SharedComponents';

// ─────────────────────────────────────────
// CTFd LOGIC:
// - Team score = unique challenges solved by any member
// - Members table shows each member's individual solve count
// - Points belong to TEAM, not individual users
// - Tie break = earliest solve time
// ─────────────────────────────────────────

/* ── presentational helpers (markup only, zero logic) ───────────── */

const StatTile = ({
  icon: Icon, label, value, suffix, accent,
}: {
  icon: React.ElementType;
  label: string;
  value: React.ReactNode;
  suffix?: string;
  accent?: boolean;
}) => (
  <div className="surface-inset flex items-center gap-3 px-4 py-3.5 min-w-0">
    <span
      aria-hidden="true"
      className="flex w-8 h-8 shrink-0 items-center justify-center rounded-inset border border-border-subtle bg-surface-card"
    >
      <Icon className={`w-4 h-4 ${accent ? 'text-cyber-neon' : 'text-text-muted'}`} />
    </span>
    <span className="min-w-0">
      <span className="label-micro block mb-0.5">{label}</span>
      <span className={`block font-mono text-h3 leading-none truncate ${accent ? 'text-cyber-neon' : 'text-cyber-text'}`}>
        {value}
        {suffix && <span className="text-small text-text-muted font-mono ml-1">{suffix}</span>}
      </span>
    </span>
  </div>
);

const MemberMonogram = ({ name }: { name?: string }) => (
  <span
    aria-hidden="true"
    className="hidden sm:flex w-8 h-8 shrink-0 items-center justify-center rounded-inset
               bg-surface-inset border border-border-subtle font-mono text-small font-bold
               text-text-secondary shadow-well"
  >
    {(name?.trim()?.[0] ?? '?').toUpperCase()}
  </span>
);

const FormError = ({ message }: { message: string }) => (
  <p
    role="alert"
    className="flex items-start gap-2 rounded-inset border border-border-danger
               bg-diff-hard-wash px-3 py-2 text-small text-diff-hard"
  >
    <AlertCircle aria-hidden="true" className="w-4 h-4 shrink-0 mt-0.5" />
    <span className="min-w-0 break-words">{message}</span>
  </p>
);

export default function TeamProfile() {
  const { user } = useAuth();
  const [team, setTeam] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [solves, setSolves] = useState<any[]>([]);
  const [fails, setFails] = useState(0);
  const [scoreData, setScoreData] = useState<any[]>([]);
  const [rank, setRank] = useState<number | null>(null);
  const [teamTotalPoints, setTeamTotalPoints] = useState(0);
  const [loading, setLoading] = useState(true);

  const [mode, setMode] = useState<'none' | 'create' | 'join'>('none');
  const [teamName, setTeamName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!user) return;
    fetchTeam();
  }, [user]);

  const fetchTeam = async () => {
    if (!user) return;
    setLoading(true);

    const { data: profileData } = await supabase
      .from('safe_profiles')
      .select('team_id')
      .eq('id', user.id)
      .single();

    if (!profileData?.team_id) {
      setTeam(null);
      setLoading(false);
      return;
    }

    const teamId = profileData.team_id;

    // Get team info (public_teams view — no invite_code exposure)
    const { data: teamData } = await supabase
      .from('public_teams')
      .select('id, name, captain_id, website, affiliation, country, created_at, is_banned')
      .eq('id', teamId)
      .single();
    const { data: myInvite } = await supabase.rpc('get_my_team_invite');
    setTeam(teamData ? { ...teamData, invite_code: myInvite } : null);

    // CTFd: Team solves via secure RPC (doesn't need profiles FK join)
    const { data: teamSolves } = await supabase
      .rpc('get_team_solves', { p_team_id: teamId });

    // Map RPC result to match expected format
    const correctSubs = (teamSolves ?? []).map((s: any) => ({
      submitted_at: s.submitted_at,
      challenge_id: s.challenge_id,
      user_id: null,
      profiles: { username: s.username },
      challenges: null, // points fetched separately below
    }));

    // Get challenge points for team score calculation
    const { data: challengeData } = await supabase
      .from('public_challenges')
      .select('id, title, category, points');
    const challengeMap = new Map((challengeData ?? []).map((c: any) => [c.id, c]));

    // Enrich with challenge data
    correctSubs.forEach((s: any) => {
      const ch = challengeMap.get(s.challenge_id);
      if (ch) s.challenges = { title: ch.title, category: ch.category, points: ch.points };
    });

    // Also calculate team points directly from submissions.team_id
    const seen = new Set<string>();
    let pts = 0;
    (correctSubs ?? []).forEach((s: any) => {
      if (!seen.has(s.challenge_id)) {
        seen.add(s.challenge_id);
        pts += s.challenges?.points ?? 0;
      }
    });
    setTeamTotalPoints(pts);

    // Get team rank
    const { data: allTeams } = await supabase
      .from('team_scores')
      .select('id')
      .order('total_points', { ascending: false })
      .order('last_solve', { ascending: true }); // tie break by time (CTFd style)
    const teamRank = (allTeams ?? []).findIndex(t => t.id === teamId) + 1;
    setRank(teamRank > 0 ? teamRank : null);

    // Get all team members (safe_profiles view — no email/role)
    const { data: memberProfiles } = await supabase
      .from('safe_profiles')
      .select('id, username')
      .eq('team_id', teamId);
    const memberIds = (memberProfiles ?? []).map((m: any) => m.id);

    // Get each member's individual solve count (NOT points — CTFd style)
    const { data: memberSolveCounts } = await supabase
      .from('user_scores')
      .select('id, username, solved_count, total_points')
      .in('id', memberIds)
      .order('solved_count', { ascending: false });

    setMembers((memberSolveCounts ?? []).map((m: any) => ({
      ...m,
      isCaptain: m.id === teamData?.captain_id,
    })));

    // CTFd style: get UNIQUE solves per team using submissions.team_id
    // This prevents point carrying when user switches teams
    const allCorrectSubs = correctSubs ?? [];

    // Deduplicate: keep only first solve per challenge (CTFd logic)
    const seenChallenges = new Set<string>();
    const uniqueSolves: any[] = [];
    (allCorrectSubs ?? []).forEach((s: any) => {
      if (!seenChallenges.has(s.challenge_id)) {
        seenChallenges.add(s.challenge_id);
        uniqueSolves.push(s);
      }
    });

    const solvesFormatted = uniqueSolves.map((s: any) => ({
      title: s.challenges?.title ?? '?',
      category: s.challenges?.category ?? '?',
      value: s.challenges?.points ?? 0,
      solver: s.profiles?.username ?? '?',
      time: new Date(s.submitted_at).toLocaleString('en-US', {
        month: 'long', day: 'numeric', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      }),
    }));

    // Score over time graph
    let cumulative = 0;
    const graph = solvesFormatted.map(s => {
      cumulative += s.value;
      return { time: s.time, score: cumulative };
    });

    // Fails = wrong attempts from this team (by team_id snapshot)
    const { count: failCount } = await supabase
      .from('submissions')
      // 'id', not '*': submitted_flag is revoked from authenticated (it is the
      // admin-only plaintext audit column), and a '*' select list reaches it.
      .select('id', { count: 'exact', head: true })
      .eq('team_id', teamId)
      .eq('is_correct', false);

    setSolves(solvesFormatted);
    setFails(failCount ?? 0);
    setScoreData(graph);
    setLoading(false);
  };

  const handleCreateTeam = async () => {
    if (!user || !teamName.trim()) return;
    setActionLoading(true);
    setActionError('');

    const { data, error } = await supabase.rpc('create_team', { p_name: teamName.trim() });
    setActionLoading(false);
    if (error || data?.error) { setActionError(error?.message ?? data.error); return; }
    setMode('none');
    setTeamName('');
    fetchTeam();
  };

  const handleJoinTeam = async () => {
    if (!user || !inviteCode.trim()) return;
    setActionLoading(true);
    setActionError('');

    const { data, error } = await supabase.rpc('join_team', { p_invite_code: inviteCode.trim() });
    setActionLoading(false);
    if (error || data?.error) { setActionError(error?.message ?? data.error ?? 'Invalid invite code.'); return; }
    setMode('none');
    setInviteCode('');
    fetchTeam();
  };

  const handleLeaveTeam = async () => {
    if (!user) return;
    if (team?.captain_id === user.id && members.length > 1) {
      alert('You are the captain. Transfer captaincy before leaving, or delete the team.');
      return;
    }
    if (!confirm('Leave this team? Your solves stay on record.')) return;
    await supabase.rpc('leave_team');
    setTeam(null); setMembers([]); setSolves([]);
    fetchTeam();
  };

  const copyInviteCode = () => {
    if (team?.invite_code) {
      navigator.clipboard.writeText(team.invite_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Category breakdown
  const categoryMap: Record<string, number> = {};
  solves.forEach(s => { categoryMap[s.category] = (categoryMap[s.category] || 0) + s.value; });
  const totalCatPoints = Object.values(categoryMap).reduce((a, b) => a + b, 0) || 1;
  const COLORS = ['#c6ff00', '#4fb3a4', '#8e86d6', '#c97fa0', '#cfa15c', '#6d9fd4', '#8fb573', '#93a1ad'];
  const categories = Object.entries(categoryMap).map(([name, val], i) => ({
    name, value: (val / totalCatPoints) * 100, color: COLORS[i % COLORS.length]
  }));

  const reduceMotion = useReducedMotion();
  const rise = reduceMotion
    ? {}
    : {
        initial: { opacity: 0, transform: 'translateY(8px)' },
        animate: { opacity: 1, transform: 'translateY(0px)' },
        transition: { duration: 0.24, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
      };

  if (loading) return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 py-24">
      <span
        aria-hidden="true"
        className="w-9 h-9 rounded-full border-2 border-border-strong border-t-cyber-neon animate-spin"
      />
      <span className="label-micro" role="status">Loading team...</span>
    </div>
  );

  // ── NO TEAM ──────────────────────────────────────────────
  if (!team) return (
    <div className="flex-1 flex items-center justify-center px-4 sm:px-6 py-14 sm:py-20">
      <motion.div className="w-full max-w-md" {...rise}>
        <div className="text-center mb-10">
          <div className="relative w-16 h-16 mx-auto mb-6">
            <span
              aria-hidden="true"
              className="absolute inset-0 rounded-full bg-neon-wash blur-xl"
            />
            <div className="relative w-16 h-16 surface-raised rounded-full flex items-center justify-center shadow-e3">
              <Users aria-hidden="true" className="w-7 h-7 text-cyber-neon" />
            </div>
          </div>
          <span className="label-micro block mb-3">Team</span>
          <h2 className="text-h1 text-cyber-text mb-3">No Team Yet</h2>
          <p className="text-body text-text-muted max-w-xs mx-auto">
            Create a new team or join an existing one with an invite code.
          </p>
        </div>

        {mode === 'none' && (
          <div className="flex flex-col gap-3">
            <button onClick={() => setMode('create')}
              className="btn btn-primary btn-lg btn-block">
              <Plus aria-hidden="true" className="w-4 h-4" /> Create Team
            </button>
            <button onClick={() => setMode('join')}
              className="btn btn-secondary btn-lg btn-block">
              <LogIn aria-hidden="true" className="w-4 h-4" /> Join Team
            </button>
          </div>
        )}

        {mode === 'create' && (
          <div className="surface p-gutter space-y-4">
            <div>
              <h3 className="text-h3 text-cyber-text">Create New Team</h3>
              <p className="text-small text-text-muted mt-1">You become the captain.</p>
            </div>

            <div className="space-y-2">
              <label className="field-label" htmlFor="team-name">Team name</label>
              <input id="team-name" type="text" placeholder="Team name" value={teamName}
                onChange={e => { setTeamName(e.target.value); setActionError(''); }}
                className={`input w-full ${actionError ? 'is-invalid' : ''}`} />
            </div>
            {actionError && <FormError message={actionError} />}
            <div className="flex flex-col-reverse sm:flex-row gap-3 pt-1">
              <button onClick={() => { setMode('none'); setActionError(''); }}
                className="btn btn-ghost btn-md flex-1">
                Cancel
              </button>
              <button onClick={handleCreateTeam} disabled={actionLoading || !teamName.trim()}
                className={`btn btn-primary btn-md flex-1 ${actionLoading ? 'is-loading' : ''}`}>
                {actionLoading ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        )}

        {mode === 'join' && (
          <div className="surface p-gutter space-y-4">
            <div>
              <h3 className="text-h3 text-cyber-text">Join Team</h3>
              <p className="text-small text-text-muted mt-1">Ask your captain for the invite code.</p>
            </div>

            <div className="space-y-2">
              <label className="field-label" htmlFor="invite-code">Invite code</label>
              <input id="invite-code" type="text" placeholder="Enter invite code" value={inviteCode}
                onChange={e => { setInviteCode(e.target.value); setActionError(''); }}
                className={`input w-full font-mono uppercase tracking-code ${actionError ? 'is-invalid' : ''}`} />
            </div>
            {actionError && <FormError message={actionError} />}
            <div className="flex flex-col-reverse sm:flex-row gap-3 pt-1">
              <button onClick={() => { setMode('none'); setActionError(''); }}
                className="btn btn-ghost btn-md flex-1">
                Cancel
              </button>
              <button onClick={handleJoinTeam} disabled={actionLoading || !inviteCode.trim()}
                className={`btn btn-primary btn-md flex-1 ${actionLoading ? 'is-loading' : ''}`}>
                {actionLoading ? 'Joining...' : 'Join'}
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );

  // ── HAS TEAM ─────────────────────────────────────────────
  return (
    <div className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
      {/* ── Hero ──────────────────────────────────────────── */}
      <motion.header className="mb-8" {...rise}>
        <p className="label-micro">Team profile</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-3">
          <h1 className="text-h1 text-cyber-text break-words min-w-0">{team.name}</h1>
          {rank && (
            <span className="badge badge-neon shrink-0">
              <Trophy aria-hidden="true" className="w-3 h-3" />
              {rank}{rank === 1 ? 'st' : rank === 2 ? 'nd' : rank === 3 ? 'rd' : 'th'} place
            </span>
          )}
        </div>

        {/* CTFd style: Team points shown here, not individual */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-6">
          <StatTile icon={Trophy} label="Rank" value={rank ? `#${rank}` : '—'} />
          <StatTile icon={Target} label="Points" value={teamTotalPoints} suffix="pts" accent />
          <StatTile icon={Users} label="Members" value={members.length} />
        </div>
      </motion.header>

      {/* ── Invite code — treat it like a credential ───────── */}
      <motion.section
        aria-label="Team invite code"
        className="surface p-gutter mb-8 sm:mb-section overflow-hidden"
        {...rise}
      >
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
          <span
            aria-hidden="true"
            className="hidden sm:flex w-10 h-10 shrink-0 items-center justify-center rounded-control
                       border border-border-neon bg-neon-wash shadow-neon"
          >
            <KeyRound className="w-4 h-4 text-cyber-neon" />
          </span>

          <div className="min-w-0 flex-1">
            <span className="label-micro block mb-2">Invite code</span>
            <div className="surface-inset flex items-center gap-2 px-3 py-2.5 overflow-x-auto custom-scrollbar">
              <code className="font-mono text-body font-bold text-cyber-neon tracking-code whitespace-nowrap text-glow">
                {team.invite_code}
              </code>
            </div>
            <p className="flex items-start gap-1.5 text-small text-text-muted mt-2">
              <ShieldAlert aria-hidden="true" className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>Anyone holding this code can join your team. Share it only with teammates.</span>
            </p>
          </div>

          <div className="shrink-0 sm:self-center">
            <button
              onClick={copyInviteCode}
              className={`btn btn-md w-full sm:w-auto ${copied ? 'btn-success' : 'btn-secondary'}`}
              aria-label={copied ? 'Invite code copied to clipboard' : 'Copy invite code to clipboard'}
            >
              {copied
                ? <><Check aria-hidden="true" className="w-4 h-4" /> Copied</>
                : <><Copy aria-hidden="true" className="w-4 h-4" /> Copy</>}
            </button>
            <span className="sr-only" role="status" aria-live="polite">
              {copied ? 'Invite code copied' : ''}
            </span>
          </div>
        </div>
      </motion.section>

      {/* Members Table — CTFd style: show solve count per member, NOT points */}
      <section className="mb-8 sm:mb-section">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 mb-4">
          <h3 className="text-h2 text-cyber-text">Members</h3>
          <span className="text-small text-text-muted font-mono">{members.length}</span>
        </div>

        <div className="surface overflow-hidden">
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full min-w-[19rem] text-left border-collapse">
              <thead>
                <tr className="bg-surface-rail border-b border-border-base">
                  <th scope="col" className="px-5 py-3.5 label-micro whitespace-nowrap">User Name</th>
                  <th scope="col" className="px-5 py-3.5 label-micro text-center">Solves</th>
                  <th scope="col" className="px-5 py-3.5 label-micro text-right whitespace-nowrap">Points Contributed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {members.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-6 py-16 text-center">
                      <span
                        aria-hidden="true"
                        className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-border-strong bg-surface-inset text-text-muted"
                      >
                        <Users className="h-5 w-5" />
                      </span>
                      <p className="text-h3 text-cyber-text">No members</p>
                      <p className="mt-1.5 text-small text-text-muted">Share the invite code above to build your roster.</p>
                    </td>
                  </tr>
                ) : members.map((m, i) => (
                  <tr key={i} className="group transition-colors duration-[var(--duration-fast)] hover:bg-surface-raised">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <MemberMonogram name={m.username} />
                        <span className="truncate text-body font-medium text-cyber-neon transition-colors group-hover:text-neon-bright">
                          {m.username}
                        </span>
                        {m.isCaptain && (
                          <span className="badge badge-neon shrink-0">
                            <Crown aria-hidden="true" className="w-3 h-3" />
                            Captain
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-center font-mono text-body text-cyber-text tabular-nums">
                      {m.solved_count}
                    </td>
                    <td className="px-5 py-4 text-right whitespace-nowrap">
                      <span className="font-mono text-small text-text-secondary tabular-nums">{m.total_points}</span>
                      <span className="label-micro ml-1.5 align-baseline">pts</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <p className="label-micro mt-3 text-right leading-relaxed">
          * Team score counts each challenge once regardless of who solved it
        </p>
      </section>

      {/* Solves — only first solve per challenge shown (CTFd style) */}
      {solves.length > 0 ? (
        <>
          <SolvesTable solves={solves} />
          <ProgressBars solvedCount={solves.length} failCount={fails} categories={categories} />
          {scoreData.length > 0 && <ScoreChart data={scoreData} />}
        </>
      ) : (
        <div className="surface px-6 py-16 text-center">
          <span
            aria-hidden="true"
            className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-border-strong bg-surface-inset text-text-muted"
          >
            <Target className="h-5 w-5" />
          </span>
          <p className="text-h3 text-cyber-text">No solves yet</p>
          <p className="mt-1.5 text-small text-text-muted">Go crack some challenges — your team score starts at the first flag.</p>
        </div>
      )}

      <footer className="mt-section pt-8 border-t border-border-subtle text-center">
        <p className="label-micro">Cyberhx Platform © 2026</p>
      </footer>
    </div>
  );
}
