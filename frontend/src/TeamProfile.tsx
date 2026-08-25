import React, { useEffect, useState } from 'react';
import { Users, Plus, LogIn, Copy, Check, Trash2 } from 'lucide-react';
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
      .select('*', { count: 'exact', head: true })
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
  const COLORS = ['#c6ff00', '#ff00ff', '#00ffff', '#ff8800', '#ff0000', '#ffffff'];
  const categories = Object.entries(categoryMap).map(([name, val], i) => ({
    name, value: (val / totalCatPoints) * 100, color: COLORS[i % COLORS.length]
  }));

  if (loading) return (
    <div className="flex-1 flex items-center justify-center text-cyber-muted text-xs uppercase tracking-widest animate-pulse">
      Loading team...
    </div>
  );

  // ── NO TEAM ──────────────────────────────────────────────
  if (!team) return (
    <div className="flex-1 flex items-center justify-center px-8">
      <div className="w-full max-w-md">
        <div className="text-center mb-12">
          <div className="w-16 h-16 bg-cyber-card border border-cyber-border rounded-full flex items-center justify-center mx-auto mb-6">
            <Users className="w-8 h-8 text-cyber-muted" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">No Team Yet</h2>
          <p className="text-cyber-muted text-xs uppercase tracking-widest">Create a new team or join an existing one</p>
        </div>

        {mode === 'none' && (
          <div className="flex flex-col gap-4">
            <button onClick={() => setMode('create')}
              className="flex items-center justify-center gap-3 w-full bg-cyber-neon text-black py-4 rounded-md text-[11px] font-bold uppercase tracking-widest hover:bg-cyber-neon/90 transition-all">
              <Plus className="w-4 h-4" /> Create Team
            </button>
            <button onClick={() => setMode('join')}
              className="flex items-center justify-center gap-3 w-full bg-transparent border border-cyber-border text-cyber-muted py-4 rounded-md text-[11px] font-bold uppercase tracking-widest hover:border-cyber-neon hover:text-white transition-all">
              <LogIn className="w-4 h-4" /> Join Team
            </button>
          </div>
        )}

        {mode === 'create' && (
          <div className="bg-cyber-card border border-cyber-border rounded-lg p-8 space-y-4">
            <h3 className="text-[11px] font-bold uppercase tracking-widest text-cyber-muted mb-6">Create New Team</h3>
            <input type="text" placeholder="Team name" value={teamName}
              onChange={e => { setTeamName(e.target.value); setActionError(''); }}
              className="w-full bg-cyber-sidebar border border-cyber-border px-4 py-3 rounded text-sm text-white focus:outline-none focus:border-cyber-neon transition-all" />
            {actionError && <p className="text-red-500 text-[10px] uppercase tracking-widest">{actionError}</p>}
            <div className="flex gap-3 pt-2">
              <button onClick={handleCreateTeam} disabled={actionLoading || !teamName.trim()}
                className="flex-1 bg-cyber-neon text-black py-3 rounded text-[11px] font-bold uppercase tracking-widest hover:bg-cyber-neon/90 transition-all disabled:opacity-50">
                {actionLoading ? 'Creating...' : 'Create'}
              </button>
              <button onClick={() => { setMode('none'); setActionError(''); }}
                className="flex-1 border border-cyber-border text-cyber-muted py-3 rounded text-[11px] font-bold uppercase tracking-widest hover:text-white transition-all">
                Cancel
              </button>
            </div>
          </div>
        )}

        {mode === 'join' && (
          <div className="bg-cyber-card border border-cyber-border rounded-lg p-8 space-y-4">
            <h3 className="text-[11px] font-bold uppercase tracking-widest text-cyber-muted mb-6">Join Team</h3>
            <input type="text" placeholder="Enter invite code" value={inviteCode}
              onChange={e => { setInviteCode(e.target.value); setActionError(''); }}
              className="w-full bg-cyber-sidebar border border-cyber-border px-4 py-3 rounded text-sm text-white focus:outline-none focus:border-cyber-neon transition-all font-mono tracking-widest uppercase" />
            {actionError && <p className="text-red-500 text-[10px] uppercase tracking-widest">{actionError}</p>}
            <div className="flex gap-3 pt-2">
              <button onClick={handleJoinTeam} disabled={actionLoading || !inviteCode.trim()}
                className="flex-1 bg-cyber-neon text-black py-3 rounded text-[11px] font-bold uppercase tracking-widest hover:bg-cyber-neon/90 transition-all disabled:opacity-50">
                {actionLoading ? 'Joining...' : 'Join'}
              </button>
              <button onClick={() => { setMode('none'); setActionError(''); }}
                className="flex-1 border border-cyber-border text-cyber-muted py-3 rounded text-[11px] font-bold uppercase tracking-widest hover:text-white transition-all">
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // ── HAS TEAM ─────────────────────────────────────────────
  return (
    <div className="flex-1 max-w-6xl mx-auto w-full px-8 py-12">
      <div className="text-center mb-16">
        <h1 className="text-5xl font-bold text-white mb-4 tracking-tight">{team.name}</h1>
        {rank && <div className="text-2xl text-cyber-muted font-light mb-2">{rank}{rank === 1 ? 'st' : rank === 2 ? 'nd' : rank === 3 ? 'rd' : 'th'} place</div>}
        {/* CTFd style: Team points shown here, not individual */}
        <div className="text-2xl text-cyber-muted font-light mb-6">{teamTotalPoints} points</div>

        <div className="inline-flex items-center gap-3 bg-cyber-card border border-cyber-border px-4 py-2 rounded-md mb-8">
          <span className="text-[10px] font-bold uppercase tracking-widest text-cyber-muted">Invite Code:</span>
          <span className="font-mono font-bold text-cyber-neon tracking-widest">{team.invite_code}</span>
          <button onClick={copyInviteCode} className="text-cyber-muted hover:text-white transition-colors">
            {copied ? <Check className="w-4 h-4 text-cyber-neon" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Members Table — CTFd style: show solve count per member, NOT points */}
      <div className="mb-20">
        <h3 className="text-xl font-bold text-white mb-6">Members</h3>
        <div className="overflow-hidden rounded-lg border border-cyber-border bg-cyber-card">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-cyber-sidebar/50 border-b border-cyber-border text-[10px] font-bold text-cyber-muted uppercase tracking-widest">
                <th className="px-6 py-4">User Name</th>
                <th className="px-6 py-4 text-center">Solves</th>
                <th className="px-6 py-4 text-right">Points Contributed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cyber-border/50">
              {members.length === 0 ? (
                <tr><td colSpan={3} className="px-6 py-8 text-center text-cyber-muted">No members</td></tr>
              ) : members.map((m, i) => (
                <tr key={i} className="hover:bg-cyber-sidebar/30 transition-colors">
                  <td className="px-6 py-4 flex items-center gap-3">
                    <span className="text-cyber-neon font-medium">{m.username}</span>
                    {m.isCaptain && (
                      <span className="bg-blue-600 text-white text-[8px] font-bold px-1.5 py-0.5 rounded uppercase">Captain</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-center text-white font-mono">{m.solved_count}</td>
                  <td className="px-6 py-4 text-right text-cyber-muted font-mono text-[10px]">{m.total_points} pts</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[9px] text-cyber-muted uppercase tracking-widest mt-2 text-right">
          * Team score counts each challenge once regardless of who solved it
        </p>
      </div>

      {/* Solves — only first solve per challenge shown (CTFd style) */}
      {solves.length > 0 ? (
        <>
          <SolvesTable solves={solves} />
          <ProgressBars solvedCount={solves.length} failCount={fails} categories={categories} />
          {scoreData.length > 0 && <ScoreChart data={scoreData} />}
        </>
      ) : (
        <div className="text-center text-cyber-muted text-xs uppercase tracking-widest py-12">
          No solves yet — go crack some challenges!
        </div>
      )}

      <footer className="mt-20 text-center py-8 border-t border-cyber-border">
        <p className="text-[10px] font-bold text-cyber-muted uppercase tracking-[0.2em]">Cyberhx Platform © 2026</p>
      </footer>
    </div>
  );
}