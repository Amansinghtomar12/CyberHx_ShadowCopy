/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { 
  Download,
  X,
  User as UserIcon,
  Flag,
  Bell,
  Settings as SettingsIcon,
  LogOut,
  Users,
  Menu,
  ChevronDown,
  Zap,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Category, Challenge } from './types';
import { DBChallenge, supabase } from './lib/supabase';
import { useChallenges } from './hooks/useData';
import { submitFlag, getUnlockedHints, unlockHint } from './api/submitFlag';
import { useAuth } from './hooks/useAuth';
import Scoreboard from './Scoreboard';
import TeamsList from './TeamsList';
import UsersList from './UsersList';
import TeamProfile from './TeamProfile';
import UserProfile from './UserProfile';
import Settings from './Settings';
import AdminDashboard from './components/admin/AdminDashboard';

function dbToChallenge(c: DBChallenge, solveCount = 0): Challenge {
  return {
    id: c.id,
    title: c.title,
    category: c.category as Category,
    points: c.points,
    description: c.description,
    difficulty: c.difficulty,
    solvedCount: solveCount,
    author: c.author,
    flag: '',
    files: c.files?.map(f => ({ name: f.name, url: f.url })) ?? [],
    hints: c.hints?.map(h => ({ id: h.id, cost: h.cost, text: '' })) ?? [],
    tags: c.tags,
    connection_info: (c as any).connection_info ?? null,
  };
}

const DIFFICULTIES: { id: string; label: string }[] = [
  { id: 'Easy', label: 'Easy' },
  { id: 'Medium', label: 'Medium' },
  { id: 'Hard', label: 'Hard' },
];

// ─────────────────────────────────────────
// NOTIFICATION BELL COMPONENT
// ─────────────────────────────────────────
function NotificationBell({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unread, setUnread] = useState(0);
  const [lastSeen, setLastSeen] = useState<string>(() =>
    localStorage.getItem('notif_last_seen') || new Date(0).toISOString()
  );

  const playBeep = () => {
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 1);
    } catch {}
  };

  const fetchNotifs = async () => {
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);
    const notifs = data ?? [];
    const seen = localStorage.getItem('notif_last_seen') || new Date(0).toISOString();
    const unseen = notifs.filter(n => n.created_at > seen).length;
    if (unseen > 0) setUnread(prev => { if (unseen > prev) playBeep(); return unseen; });
    else setUnread(0);
    setNotifications(notifs);
  };

  useEffect(() => {
    if (!userId) return;
    fetchNotifs();
    const interval = setInterval(fetchNotifs, 30000);
    return () => clearInterval(interval);
  }, [userId]);

  const markAllRead = () => {
    const now = new Date().toISOString();
    localStorage.setItem('notif_last_seen', now);
    setLastSeen(now);
    setUnread(0);
  };

  const typeStyle: Record<string, string> = {
    info: 'text-blue-400 border-blue-500/30 bg-blue-500/10',
    success: 'text-green-400 border-green-500/30 bg-green-500/10',
    warning: 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10',
    danger: 'text-red-400 border-red-500/30 bg-red-500/10',
  };
  const typeIcon: Record<string, string> = { info: 'ℹ', success: '✓', warning: '⚠', danger: '⊘' };

  return (
    <div className="relative">
      <button onClick={() => { setOpen(o => !o); if (!open) markAllRead(); }}
        className="flex items-center gap-2 hover:text-white transition-all relative">
        <Bell className="w-3.5 h-3.5" />
        <span className="hidden sm:inline text-[11px] font-bold uppercase tracking-widest">Notifications</span>
        {unread > 0 && (
          <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[8px] font-bold rounded-full w-4 h-4 flex items-center justify-center animate-pulse">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-cyber-card border border-cyber-border rounded-lg shadow-2xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-cyber-border">
            <span className="text-[11px] font-bold text-white uppercase tracking-widest">Notifications</span>
            <button onClick={() => setOpen(false)} className="text-cyber-muted hover:text-white text-lg leading-none">×</button>
          </div>
          <div className="max-h-96 overflow-y-auto divide-y divide-cyber-border/50">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-cyber-muted text-xs">No notifications yet</div>
            ) : notifications.map(n => (
              <div key={n.id} className={`px-4 py-3 ${n.created_at > lastSeen ? 'bg-cyber-sidebar/40' : ''}`}>
                <div className={`inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded border mb-1.5 ${typeStyle[n.type] ?? typeStyle.info}`}>
                  {typeIcon[n.type] ?? 'ℹ'} {n.type}
                </div>
                <p className="text-white text-xs font-semibold mb-0.5">{n.title}</p>
                <p className="text-cyber-muted text-[11px] leading-relaxed">{n.message}</p>
                <p className="text-[9px] text-cyber-muted mt-1">{new Date(n.created_at).toLocaleString()}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const { user, profile } = useAuth();

  // ── Solve state ──────────────────────────────────────────
  const [solvedIds, setSolvedIds] = useState<string[]>([]);          // current user's solves
  const [teamSolvedIds, setTeamSolvedIds] = useState<string[]>([]);  // any team member's solves
  const [solvedByMap, setSolvedByMap] = useState<Record<string, string>>({}); // challengeId → "username"
  const [firstBloodMap, setFirstBloodMap] = useState<Record<string, string>>({}); // challengeId → "username"
  const [solveCounts, setSolveCounts] = useState<Record<string, number>>({});    // challengeId → count

  // ── Hints ────────────────────────────────────────────────
  const [usedHintIds, setUsedHintIds] = useState<Record<string, string[]>>({});
  const [hintTexts, setHintTexts] = useState<Record<string, string>>({});
  const [attempts, setAttempts] = useState<Record<string, number>>({});

  // ── UI ───────────────────────────────────────────────────
  const [selectedChallenge, setSelectedChallenge] = useState<Challenge | null>(null);
  const [selectedDiff, setSelectedDiff] = useState<string | 'all'>('all');
  const [currentView, setCurrentView] = useState<'challenges' | 'scoreboard' | 'teams' | 'users' | 'teamProfile' | 'userProfile' | 'settings' | 'admin'>('challenges');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);

  // ── Event ────────────────────────────────────────────────
  const [eventSettings, setEventSettings] = useState<any>(null);
  const [eventStatus, setEventStatus] = useState<'waiting' | 'live' | 'ended' | 'inactive'>('live');

  const { challenges: dbChallenges, loading: challengesLoading } = useChallenges();

  // Build challenges with real solve counts
  const challenges: Challenge[] = useMemo(
    () => dbChallenges.map(c => dbToChallenge(c, solveCounts[c.id] ?? 0)),
    [dbChallenges, solveCounts]
  );

  // ── Fetch everything on mount ────────────────────────────
  const fetchAllSolveData = useCallback(async () => {
    if (!user) return;

    // 1. Current user's own solves + attempts
    const { data: userSubs } = await supabase
      .from('submissions')
      .select('challenge_id, is_correct')
      .eq('user_id', user.id);

    const userSolved: string[] = [];
    const userAttempts: Record<string, number> = {};
    (userSubs ?? []).forEach(s => {
      userAttempts[s.challenge_id] = (userAttempts[s.challenge_id] || 0) + 1;
      if (s.is_correct) userSolved.push(s.challenge_id);
    });
    setSolvedIds(userSolved);
    setAttempts(userAttempts);

    // 2. Team solves — CTFd style: use submissions.team_id (snapshot at solve time)
    // User cannot carry points to new team
    const { data: profileData } = await supabase
      .from('safe_profiles')
      .select('team_id')
      .eq('id', user.id)
      .single();

    if (profileData?.team_id) {
      const { data: teamSubs } = await supabase
        .rpc('get_team_solves', { p_team_id: profileData.team_id });

      const solvedChallIds: string[] = [];
      const solvedBy: Record<string, string> = {};

      (teamSubs ?? []).forEach((s: any) => {
        if (!solvedChallIds.includes(s.challenge_id)) {
          solvedChallIds.push(s.challenge_id);
          solvedBy[s.challenge_id] = s.username ?? 'teammate';
        }
      });

      setTeamSolvedIds(solvedChallIds);
      setSolvedByMap(solvedBy);
    }

    // 3 & 4. Solve counts + First blood — via secure RPC (no submitted_flag exposed)
    const { data: solveData } = await supabase.rpc('get_solve_data');

    const counts: Record<string, number> = {};
    const fb: Record<string, string> = {};
    (solveData ?? []).forEach((s: any) => {
      counts[s.challenge_id] = Number(s.solve_count);
      if (s.first_blood_username) fb[s.challenge_id] = s.first_blood_username;
    });
    setSolveCounts(counts);
    setFirstBloodMap(fb);
  }, [user]);

  useEffect(() => {
    fetchAllSolveData();
  }, [fetchAllSolveData]);

  // ── Load unlocked hints + their texts ───────────────────
  useEffect(() => {
    if (!user) return;
    getUnlockedHints(user.id).then(async ids => {
      const grouped: Record<string, string[]> = {};
      challenges.forEach(c => {
        const unlocked = (c.hints ?? []).filter(h => ids.includes(h.id)).map(h => h.id);
        if (unlocked.length) grouped[c.id] = unlocked;
      });
      setUsedHintIds(grouped);

      // Load text for all already-unlocked hints via secure RPC
      const texts: Record<string, string> = {};
      await Promise.all(ids.map(async (hintId) => {
        const { data } = await supabase.rpc('get_hint_text', { hint_id: hintId });
        if (data) texts[hintId] = data;
      }));
      setHintTexts(texts);
    });
  }, [user]);

  // ── Polling: refresh every 30s instead of Realtime (scales to 10K+ users) ──
  // Realtime has 200 concurrent connection limit on free tier
  // Polling uses zero persistent connections
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(() => {
      fetchAllSolveData();
    }, 30000); // every 30 seconds
    return () => clearInterval(interval);
  }, [user, fetchAllSolveData]);

  // ── Event settings ───────────────────────────────────────
  useEffect(() => {
    supabase.from('event_settings').select('*').order('id', { ascending: false }).limit(1).maybeSingle().then(({ data }) => {
      if (!data) return;
      setEventSettings(data);
      if (!data.is_active) { setEventStatus('inactive'); return; }
      const now = new Date();
      const start = data.start_time ? new Date(data.start_time) : null;
      const end = data.end_time ? new Date(data.end_time) : null;
      if (start && now < start) setEventStatus('waiting');
      else if (end && now > end) setEventStatus('ended');
      else setEventStatus('live');
    });
  }, []);

  const challengesByDiff = useMemo(() => {
    const grouped: Record<string, Challenge[]> = {};
    challenges.forEach(c => {
      if (!grouped[c.difficulty]) grouped[c.difficulty] = [];
      grouped[c.difficulty].push(c);
    });
    return grouped;
  }, [challenges]);

  const displayedDiffs = useMemo(() => {
    if (selectedDiff === 'all') return DIFFICULTIES;
    return DIFFICULTIES.filter(d => d.id === selectedDiff);
  }, [selectedDiff]);

  const handleUnlockHint = useCallback(async (challengeId: string, hintId: string) => {
    if (!user) return;
    const result = await unlockHint(user.id, hintId);
    if (result.success) {
      setUsedHintIds(prev => {
        const current = prev[challengeId] || [];
        if (current.includes(hintId)) return prev;
        return { ...prev, [challengeId]: [...current, hintId] };
      });
      if (result.text) {
        setHintTexts(prev => ({ ...prev, [hintId]: result.text! }));
      }
    }
  }, [user]);

  const getPoints = (challenge: Challenge) => {
    const used = usedHintIds[challenge.id] || [];
    const deduction = challenge.hints?.filter(h => used.includes(h.id)).reduce((acc, h) => acc + h.cost, 0) || 0;
    return Math.max(0, challenge.points - deduction);
  };

  // CTFd: challenge is "solved" if current user OR any team member solved it
  const isChallengeSolved = (id: string) =>
    solvedIds.includes(id) || teamSolvedIds.includes(id);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.reload();
  };

  // Admin always sees challenges regardless of event status
  const canSubmit = profile?.is_admin || eventStatus === 'live';
  const isTeamMode = eventSettings?.mode === 'team';
  const hasTeam = !!(profile?.team_id);
  const needsTeam = !hasTeam && !profile?.is_admin;  // Always require team
  const canSeeChallenges = profile?.is_admin || eventStatus !== 'inactive';

  return (
    <div className="min-h-screen bg-cyber-bg text-cyber-text font-sans flex flex-col">
      {/* Header */}
      <nav className="bg-cyber-bg border-b border-cyber-border sticky top-0 z-50">
        <div className="max-w-screen-2xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4 lg:gap-8">
            <button 
              className="lg:hidden p-2 -ml-2 text-cyber-muted hover:text-white transition-colors"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
            <h1 className="font-bold text-lg tracking-tighter text-white flex items-center gap-2 cursor-pointer" onClick={() => { setCurrentView('challenges'); setMobileMenuOpen(false); }}>
              <div className="w-6 h-6 bg-cyber-neon/20 border border-cyber-neon/40 rounded flex items-center justify-center">
                <Flag className="w-3.5 h-3.5 text-cyber-neon" />
              </div>
              <span className="hidden sm:inline">CYBERHX</span>
            </h1>
            
            <div className="hidden lg:flex gap-6 text-[10px] font-bold uppercase tracking-widest text-cyber-muted">
              <button onClick={() => setCurrentView('users')} className={`transition-all hover:text-white ${currentView === 'users' ? 'text-white' : ''}`}>Users</button>
              <button onClick={() => setCurrentView('teams')} className={`transition-all hover:text-white ${currentView === 'teams' ? 'text-white' : ''}`}>Teams</button>
              <button onClick={() => setCurrentView('challenges')} className={`transition-all hover:text-white ${currentView === 'challenges' ? 'text-white' : ''}`}>Challenges</button>
              <button onClick={() => setCurrentView('scoreboard')} className={`transition-all hover:text-white ${currentView === 'scoreboard' ? 'text-white' : ''}`}>Scoreboard</button>
              {profile?.is_admin && (
                <button onClick={() => setCurrentView('admin')} className={`transition-all hover:text-cyber-neon ${currentView === 'admin' ? 'text-cyber-neon' : ''}`}>Admin</button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4 lg:gap-8 text-[10px] font-bold uppercase tracking-widest text-cyber-muted">
            <div className="hidden xl:flex items-center gap-6">
              <NotificationBell userId={user?.id ?? ''} />
              <button onClick={() => setCurrentView('teamProfile')} className="flex items-center gap-2 hover:text-white transition-all"><Users className="w-3.5 h-3.5" /> Team</button>
              <button onClick={() => setCurrentView('userProfile')} className="flex items-center gap-2 hover:text-white transition-all"><UserIcon className="w-3.5 h-3.5" /> {profile?.username ?? 'Profile'}</button>
              <button onClick={() => setCurrentView('settings')} className="flex items-center gap-2 hover:text-white transition-all"><SettingsIcon className="w-3.5 h-3.5" /> Settings</button>
              <button onClick={handleLogout} className="flex items-center gap-2 hover:text-red-400 transition-all"><LogOut className="w-3.5 h-3.5" /></button>
            </div>
          </div>
        </div>

        {/* Mobile Navigation Menu */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="lg:hidden border-t border-cyber-border bg-cyber-bg overflow-hidden"
            >
              <div className="px-6 py-8 flex flex-col gap-6 text-[11px] font-bold uppercase tracking-[0.2em] text-cyber-muted">
                <button onClick={() => { setCurrentView('users'); setMobileMenuOpen(false); }} className={`flex items-center gap-4 py-2 border-b border-cyber-border/30 transition-all ${currentView === 'users' ? 'text-cyber-neon border-cyber-neon/30' : 'hover:text-white'}`}>
                  <UserIcon className="w-4 h-4" /> Users
                </button>
                <button onClick={() => { setCurrentView('teams'); setMobileMenuOpen(false); }} className={`flex items-center gap-4 py-2 border-b border-cyber-border/30 transition-all ${currentView === 'teams' ? 'text-cyber-neon border-cyber-neon/30' : 'hover:text-white'}`}>
                  <Users className="w-4 h-4" /> Teams
                </button>
                <button onClick={() => { setCurrentView('scoreboard'); setMobileMenuOpen(false); }} className={`flex items-center gap-4 py-2 border-b border-cyber-border/30 transition-all ${currentView === 'scoreboard' ? 'text-cyber-neon border-cyber-neon/30' : 'hover:text-white'}`}>
                  <Flag className="w-4 h-4" /> Scoreboard
                </button>
                <button onClick={() => { setCurrentView('challenges'); setMobileMenuOpen(false); }} className={`flex items-center gap-4 py-2 border-b border-cyber-border/30 transition-all ${currentView === 'challenges' ? 'text-cyber-neon border-cyber-neon/30' : 'hover:text-white'}`}>
                  <Flag className="w-4 h-4" /> Challenges
                </button>
                {profile?.is_admin && (
                  <button onClick={() => { setCurrentView('admin'); setMobileMenuOpen(false); }} className={`flex items-center gap-4 py-2 border-b border-cyber-border/30 transition-all ${currentView === 'admin' ? 'text-cyber-neon border-cyber-neon/30' : 'hover:text-white'}`}>
                    <SettingsIcon className="w-4 h-4" /> Admin
                  </button>
                )}
                
                <div className="pt-4 grid grid-cols-2 gap-4">
                  <button onClick={() => { setCurrentView('teamProfile'); setMobileMenuOpen(false); }} className="flex flex-col items-center gap-2 p-4 bg-cyber-card border border-cyber-border rounded">
                    <Users className="w-4 h-4 text-cyber-neon" />
                    <span className="text-[9px]">My Team</span>
                  </button>
                  <button onClick={() => { setCurrentView('userProfile'); setMobileMenuOpen(false); }} className="flex flex-col items-center gap-2 p-4 bg-cyber-card border border-cyber-border rounded">
                    <UserIcon className="w-4 h-4 text-cyber-neon" />
                    <span className="text-[9px]">Profile</span>
                  </button>
                  <button onClick={() => { setCurrentView('settings'); setMobileMenuOpen(false); }} className="flex flex-col items-center gap-2 p-4 bg-cyber-card border border-cyber-border rounded">
                    <SettingsIcon className="w-4 h-4 text-cyber-neon" />
                    <span className="text-[9px]">Settings</span>
                  </button>
                  <button onClick={handleLogout} className="flex flex-col items-center gap-2 p-4 bg-cyber-card border border-cyber-border rounded">
                    <LogOut className="w-4 h-4 text-cyber-muted" />
                    <span className="text-[9px]">Log Out</span>
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      <div className="flex flex-1 max-w-screen-2xl mx-auto w-full relative">
        {currentView === 'challenges' ? (
          <>
            {/* Left Sidebar Filter (Desktop) */}
            <aside className="hidden lg:block w-72 border-r border-cyber-border p-8 shrink-0 text-left">
              <h3 className="text-[10px] font-bold text-cyber-muted uppercase tracking-[0.2em] mb-6">Difficulty Modules</h3>
              <ul className="space-y-4">
                <li>
                  <button 
                    onClick={() => setSelectedDiff('all')}
                    className={`text-[13px] font-medium transition-colors hover:text-cyber-neon flex items-center gap-3 w-full text-left ${selectedDiff === 'all' ? 'text-cyber-neon' : 'text-cyber-text'}`}
                  >
                    <span className={`w-1 h-1 rounded-full ${selectedDiff === 'all' ? 'bg-cyber-neon' : 'bg-cyber-border'}`} />
                    All Sequences
                  </button>
                </li>
                {DIFFICULTIES.map(diff => (
                  <li key={diff.id}>
                    <button 
                      onClick={() => setSelectedDiff(diff.id)}
                      className={`text-[13px] font-medium transition-colors hover:text-cyber-neon flex items-center gap-3 w-full text-left ${selectedDiff === diff.id ? 'text-cyber-neon' : 'text-cyber-text'}`}
                    >
                      <span className={`w-1 h-1 rounded-full ${selectedDiff === diff.id ? 'bg-cyber-neon' : 'bg-cyber-muted'}`} />
                      {diff.label} Modules
                    </button>
                  </li>
                ))}
              </ul>

              {/* Event status in sidebar */}
              {eventSettings && (
                <div className="mt-10 pt-8 border-t border-cyber-border">
                  <h3 className="text-[10px] font-bold text-cyber-muted uppercase tracking-[0.2em] mb-4">Event</h3>
                  <p className="text-[11px] font-bold text-white mb-1">{eventSettings.name}</p>
                  <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-[9px] font-bold uppercase tracking-widest ${
                    eventStatus === 'live' ? 'bg-cyber-neon/10 text-cyber-neon' :
                    eventStatus === 'waiting' ? 'bg-yellow-500/10 text-yellow-400' :
                    eventStatus === 'ended' ? 'bg-red-500/10 text-red-400' :
                    'bg-cyber-border/20 text-cyber-muted'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      eventStatus === 'live' ? 'bg-cyber-neon animate-pulse' :
                      eventStatus === 'waiting' ? 'bg-yellow-400' :
                      eventStatus === 'ended' ? 'bg-red-400' : 'bg-cyber-muted'
                    }`} />
                    {eventStatus === 'live' ? 'Live' : eventStatus === 'waiting' ? 'Starting Soon' : eventStatus === 'ended' ? 'Ended' : 'Inactive'}
                  </div>
                  {eventSettings.end_time && eventStatus === 'live' && (
                    <p className="text-[9px] text-cyber-muted mt-2">Ends: {new Date(eventSettings.end_time).toLocaleString()}</p>
                  )}
                  {eventSettings.start_time && eventStatus === 'waiting' && (
                    <p className="text-[9px] text-cyber-muted mt-2">Starts: {new Date(eventSettings.start_time).toLocaleString()}</p>
                  )}
                </div>
              )}
            </aside>

            {/* Mobile Filter Toggle */}
            <div className="lg:hidden absolute top-4 right-8 z-10">
              <button 
                onClick={() => setMobileFilterOpen(!mobileFilterOpen)}
                className="flex items-center gap-2 bg-cyber-card border border-cyber-border px-3 py-1.5 rounded text-[10px] font-bold uppercase tracking-widest text-cyber-muted hover:text-white"
              >
                Difficulty <ChevronDown className={`w-3.5 h-3.5 transition-transform ${mobileFilterOpen ? 'rotate-180' : ''}`} />
              </button>
              <AnimatePresence>
                {mobileFilterOpen && (
                  <motion.div 
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="absolute right-0 mt-2 bg-cyber-card border border-cyber-border rounded shadow-2xl p-4 min-w-[200px]"
                  >
                    <ul className="space-y-3">
                      <li>
                        <button onClick={() => { setSelectedDiff('all'); setMobileFilterOpen(false); }} className="text-[11px] uppercase font-bold tracking-widest hover:text-cyber-neon block w-full text-left">All Sequences</button>
                      </li>
                      {DIFFICULTIES.map(diff => (
                        <li key={diff.id}>
                          <button onClick={() => { setSelectedDiff(diff.id); setMobileFilterOpen(false); }} className="text-[11px] uppercase font-bold tracking-widest hover:text-cyber-neon block w-full text-left">{diff.label}</button>
                        </li>
                      ))}
                    </ul>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Main Content Area */}
            <main className="flex-1 px-4 sm:px-8 py-10 w-full">
              {/* Event banners */}
              {eventStatus === 'waiting' && !profile?.is_admin && (
                <div className="mb-8 p-4 bg-yellow-500/10 border border-yellow-500/40 rounded-lg">
                  <p className="text-yellow-400 text-[11px] font-bold uppercase tracking-widest">
                    ⏳ Event starts at: {eventSettings?.start_time ? new Date(eventSettings.start_time).toLocaleString() : '—'}
                  </p>
                </div>
              )}
              {eventStatus === 'ended' && !profile?.is_admin && (
                <div className="mb-8 p-4 bg-red-500/10 border border-red-500/40 rounded-lg">
                  <p className="text-red-400 text-[11px] font-bold uppercase tracking-widest">
                    🏁 Event has ended. Submissions are closed.
                  </p>
                </div>
              )}
              {eventStatus === 'live' && eventSettings?.name && (
                <div className="mb-8 p-4 bg-cyber-neon/10 border border-cyber-neon/40 rounded-lg flex items-center gap-3">
                  <span className="w-2 h-2 rounded-full bg-cyber-neon animate-pulse" />
                  <p className="text-cyber-neon text-[11px] font-bold uppercase tracking-widest">
                    {eventSettings.name} — Live {eventSettings?.end_time ? `· Ends ${new Date(eventSettings.end_time).toLocaleString()}` : ''}
                  </p>
                </div>
              )}

              <div className="mb-12 text-center lg:text-left mt-0">
                <div className="inline-block px-3 py-1 bg-cyber-neon/10 border border-cyber-neon/20 rounded-full mb-4">
                  <span className="text-[10px] font-bold text-cyber-neon uppercase tracking-widest">Awaiting Decryption Input</span>
                </div>
                <h2 className="text-3xl sm:text-4xl font-bold text-white mb-2 tracking-tight">Challenge Terminal</h2>
                <p className="text-cyber-muted text-xs sm:text-sm font-medium">Modules remain encrypted until a valid access key is provided.</p>
              </div>

              {challengesLoading ? (
                <div className="text-cyber-muted text-xs uppercase tracking-widest animate-pulse text-center py-20">Loading challenges...</div>
              ) : !canSeeChallenges ? (
                <div className="text-center py-20 text-cyber-muted text-xs uppercase tracking-widest">
                  Event is not active yet.
                </div>
              ) : needsTeam ? (
                <div className="text-center py-20">
                  <div className="inline-block px-4 py-2 bg-cyber-neon/10 border border-cyber-neon/30 rounded-full mb-6">
                    <span className="text-[10px] font-bold text-cyber-neon uppercase tracking-widest">Team Required</span>
                  </div>
                  <h2 className="text-2xl font-bold text-white mb-3">Join or Create a Team First</h2>
                  <p className="text-cyber-muted text-sm mb-8">This event is in team mode. You must be part of a team to access challenges.</p>
                  <button
                    onClick={() => setCurrentView('teamProfile')}
                    className="px-8 py-3 bg-cyber-neon text-black text-[12px] font-bold uppercase tracking-widest rounded-lg hover:bg-white transition-all"
                  >
                    Go to Teams →
                  </button>
                </div>
              ) : challenges.length === 0 ? (
                <div className="text-center py-20 text-cyber-muted text-xs uppercase tracking-widest">
                  No challenges yet — add some from the Admin panel.
                </div>
              ) : (
                displayedDiffs.map((diff) => (
                  challengesByDiff[diff.id] && challengesByDiff[diff.id].length > 0 && (
                    <div key={diff.id} className="mb-14">
                      <div className="flex items-center gap-4 mb-8">
                        <h3 className="text-2xl font-bold text-white">{diff.label}</h3>
                        <div className="h-px flex-1 bg-cyber-border opacity-50" />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
                        {challengesByDiff[diff.id].map((challenge) => (
                          <ChallengeCard 
                            key={challenge.id} 
                            challenge={challenge} 
                            points={getPoints(challenge)}
                            isSolved={isChallengeSolved(challenge.id)}
                            solvedBy={solvedByMap[challenge.id]}
                            isFirstBlood={!!firstBloodMap[challenge.id] && challenge.solvedCount >= 1}
                            onClick={() => setSelectedChallenge(challenge)}
                          />
                        ))}
                      </div>
                    </div>
                  )
                ))
              )}
            </main>
          </>
        ) : currentView === 'scoreboard' ? (
          <Scoreboard />
        ) : currentView === 'teams' ? (
          <TeamsList />
        ) : currentView === 'users' ? (
          <UsersList />
        ) : currentView === 'teamProfile' ? (
          <TeamProfile />
        ) : currentView === 'userProfile' ? (
          <UserProfile />
        ) : currentView === 'admin' ? (
          <AdminDashboard />
        ) : (
          <Settings />
        )}
      </div>

      {/* Challenge Modal */}
      <AnimatePresence>
        {selectedChallenge && (
          <ChallengeModal 
            challenge={selectedChallenge} 
            points={getPoints(selectedChallenge)}
            usedHints={usedHintIds[selectedChallenge.id] || []}
            hintTexts={hintTexts}
            onUnlockHint={(hintId) => handleUnlockHint(selectedChallenge.id, hintId)}
            onClose={() => setSelectedChallenge(null)}
            isSolved={isChallengeSolved(selectedChallenge.id)}
            canSubmit={canSubmit}
            attempts={attempts[selectedChallenge.id] || 0}
            maxAttempts={dbChallenges.find(c => c.id === selectedChallenge.id)?.max_attempts ?? 15}
            onAttempt={(challengeId, serverCount) => setAttempts(prev => ({ 
              ...prev, 
              [challengeId]: serverCount !== undefined ? serverCount : (prev[challengeId] || 0) + 1 
            }))}
            onSolve={(challengeId) => {
              setSolvedIds(prev => prev.includes(challengeId) ? prev : [...prev, challengeId]);
              setTeamSolvedIds(prev => prev.includes(challengeId) ? prev : [...prev, challengeId]);
              setSolvedByMap(prev => ({ ...prev, [challengeId]: profile?.username ?? 'you' }));
              setSolveCounts(prev => ({ ...prev, [challengeId]: (prev[challengeId] || 0) + 1 }));
            }}
            userId={user?.id ?? ''}
            firstBlood={firstBloodMap[selectedChallenge.id]}
          />
        )}
      </AnimatePresence>

      <footer className="border-t border-cyber-border py-8 px-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-[10px] font-bold text-cyber-muted uppercase tracking-[0.2em]">Cyberhx CTF Framework v2.0</p>
          <div className="flex gap-8 text-[10px] font-bold text-cyber-muted uppercase tracking-widest">
            <a href="#" className="hover:text-cyber-neon transition-colors">Privacy</a>
            <a href="#" className="hover:text-cyber-neon transition-colors">Terms</a>
            <a href="#" className="hover:text-cyber-neon transition-colors">Support</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

interface ChallengeCardProps {
  challenge: Challenge;
  points: number;
  isSolved: boolean;
  solvedBy?: string;
  isFirstBlood?: boolean;
  onClick: () => void;
}

const ChallengeCard: React.FC<ChallengeCardProps> = ({ challenge, points, isSolved, solvedBy, isFirstBlood, onClick }) => {
  return (
    <motion.div 
      whileHover={{ y: -4 }}
      onClick={onClick}
      className={`relative p-6 flex flex-col rounded-md cursor-pointer transition-all border shadow-2xl group ${
        isSolved 
        ? 'bg-cyber-neon border-cyber-neon' 
        : 'bg-cyber-card border-cyber-border hover:border-cyber-neon/50'
      }`}
    >
      {/* First blood badge */}
      {isFirstBlood && !isSolved && (
        <div className="absolute top-3 right-3 flex items-center gap-1 bg-red-500/20 border border-red-500/40 px-2 py-0.5 rounded-full">
          <Zap className="w-2.5 h-2.5 text-red-400" />
          <span className="text-[8px] font-bold uppercase tracking-widest text-red-400">First Blood</span>
        </div>
      )}

      <div className="flex justify-between items-start mb-6">
        <div className={`w-8 h-8 rounded flex items-center justify-center border transition-colors ${
          isSolved ? 'bg-black/20 border-black/10' : 'bg-cyber-bg border-cyber-border'
        }`}>
          <Flag className={`w-4 h-4 ${isSolved ? 'text-black' : 'text-cyber-neon'}`} />
        </div>
        <div className={`text-[10px] font-bold uppercase tracking-widest ${isSolved ? 'text-black/60' : 'text-cyber-muted'}`}>
          {points} PTS
        </div>
      </div>
      
      <h3 className={`text-lg font-bold mb-1 truncate ${isSolved ? 'text-black' : 'text-white group-hover:text-cyber-neon transition-colors'}`}>
        {challenge.title}
      </h3>
      <div className="flex items-center gap-2 mb-1">
        <p className={`text-[10px] font-bold uppercase tracking-widest ${isSolved ? 'text-black/50' : 'text-cyber-muted'}`}>
          {challenge.difficulty}
        </p>
        <div className={`w-1 h-1 rounded-full ${isSolved ? 'bg-black/30' : 'bg-cyber-muted/30'}`} />
        <p className={`text-[10px] font-bold uppercase tracking-widest ${isSolved ? 'text-black/50' : 'text-cyber-muted'}`}>
          {challenge.category}
        </p>
      </div>
      <div className={`text-[9px] font-bold uppercase tracking-widest ${isSolved ? 'text-black/40' : 'text-cyber-muted/60'}`}>
        {challenge.solvedCount} solve{challenge.solvedCount !== 1 ? 's' : ''}
      </div>
      {isSolved && solvedBy && (
        <p className="text-[9px] font-bold uppercase tracking-widest text-black/60 mt-1">
          ✓ {solvedBy}
        </p>
      )}
    </motion.div>
  );
}

interface ChallengeModalProps {
  challenge: Challenge;
  points: number;
  usedHints: string[];
  hintTexts: Record<string, string>;
  onUnlockHint: (hintId: string) => void;
  onClose: () => void;
  isSolved: boolean;
  canSubmit: boolean;
  attempts: number;
  maxAttempts: number;
  onAttempt: (challengeId: string, serverCount?: number) => void;
  onSolve: (challengeId: string) => void;
  userId: string;
  firstBlood?: string;
}

interface Solver {
  username: string;
  solved_at: string;
}

const ChallengeModal: React.FC<ChallengeModalProps> = ({ 
  challenge, 
  points,
  usedHints,
  hintTexts,
  onUnlockHint,
  onClose, 
  isSolved,
  canSubmit,
  attempts,
  maxAttempts,
  onAttempt,
  onSolve,  userId,
  firstBlood,
}) => {
  const [activeTab, setActiveTab] = useState<'challenge' | 'solves'>('challenge');
  const [flagInput, setFlagInput] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [solvers, setSolvers] = useState<Solver[]>([]);
  const [solversLoading, setSolversLoading] = useState(false);
  const [realSolveCount, setRealSolveCount] = useState(challenge.solvedCount);

  useEffect(() => {
    if (activeTab !== 'solves') return;
    setSolversLoading(true);
    supabase
      .rpc('get_challenge_solvers', { p_challenge_id: challenge.id })
      .then(({ data }) => {
        setRealSolveCount(data?.length ?? 0);
        setSolvers(
          (data ?? []).map((s: any) => ({
            username: s.username ?? 'unknown',
            solved_at: new Date(s.submitted_at).toLocaleString('en-GB', {
              year: 'numeric', month: '2-digit', day: '2-digit',
              hour: '2-digit', minute: '2-digit'
            }),
          }))
        );
        setSolversLoading(false);
      });
  }, [activeTab, challenge.id]);

  const isLocked = attempts >= maxAttempts && !isSolved;
  const eventEnded = !canSubmit && !isSolved && !isLocked;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLocked || isSolved || submitting || !flagInput.trim()) return;

    setSubmitting(true);
    setError('');

    const result = await submitFlag(challenge.id, flagInput.trim(), userId);
    
    if (!result.alreadySolved) {
      // Sync attempts from server response (maxAttempts - attemptsLeft = used)
      if (result.maxAttempts !== undefined && result.attemptsLeft !== undefined) {
        const usedAttempts = result.maxAttempts - result.attemptsLeft;
        onAttempt(challenge.id, usedAttempts);
      } else {
        onAttempt(challenge.id);
      }
    }

    if (result.correct) {
      onSolve(challenge.id);
      setSuccessMsg(result.message ?? 'Module Decrypted Successfully 🎉');
    } else if (result.locked) {
      setError('Terminal Locked: Maximum attempts reached.');
    } else {
      setError(result.message ?? 'Access Denied: Invalid Key Sequence');
    }

    setSubmitting(false);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-cyber-bg/95 backdrop-blur-md"
      />
      <motion.div 
        initial={{ scale: 0.98, opacity: 0, y: 10 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.98, opacity: 0, y: 10 }}
        className="relative w-full max-w-2xl bg-cyber-bg border border-cyber-border rounded-lg shadow-[0_0_50px_rgba(0,0,0,0.5)] overflow-hidden"
      >
        <div className="flex items-center justify-between px-8 py-5 border-b border-cyber-border bg-cyber-sidebar/50">
          <div className="flex gap-10">
            <button 
              onClick={() => setActiveTab('challenge')}
              className={`text-[11px] font-bold uppercase tracking-widest pb-1 transition-all ${
                activeTab === 'challenge' ? 'text-cyber-neon border-b-2 border-cyber-neon' : 'text-cyber-muted hover:text-white'
              }`}
            >
              Challenge
            </button>
            <button 
              onClick={() => setActiveTab('solves')}
              className={`text-[11px] font-bold uppercase tracking-widest pb-1 transition-all ${
                activeTab === 'solves' ? 'text-cyber-neon border-b-2 border-cyber-neon' : 'text-cyber-muted hover:text-white'
              }`}
            >
              Solves ({activeTab === 'solves' ? realSolveCount : challenge.solvedCount})
            </button>
          </div>
          <button onClick={onClose} className="p-1 text-cyber-muted hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-10 max-h-[85vh] overflow-y-auto custom-scrollbar">
          {activeTab === 'challenge' ? (
            <div className="flex flex-col items-center text-center">
              <h2 className="text-4xl font-bold text-white mb-2">{challenge.title}</h2>
              <div className="text-4xl font-light text-cyber-neon mb-4 tracking-tight">{points} PTS</div>
              <div className="flex items-center gap-4 text-[10px] font-bold text-cyber-muted uppercase tracking-[0.2em] mb-4">
                <span>Author: {challenge.author}</span>
                <span className="w-1 h-1 bg-cyber-border rounded-full" />
                <span>Category: {challenge.category}</span>
              </div>

              {/* First blood info */}
              {firstBlood && (
                <div className="flex items-center gap-2 mb-8 px-4 py-2 bg-red-500/10 border border-red-500/30 rounded-full">
                  <Zap className="w-3 h-3 text-red-400" />
                  <span className="text-[9px] font-bold uppercase tracking-widest text-red-400">First Blood: {firstBlood}</span>
                </div>
              )}

              <div className="w-full text-left bg-cyber-sidebar border border-cyber-border p-8 rounded-md mb-10 leading-relaxed text-cyber-text">
                <div className="prose prose-invert prose-sm max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {challenge.description}
                  </ReactMarkdown>
                </div>
              </div>

              {/* Hints */}
              {challenge.hints && challenge.hints.length > 0 && (
                <div className="w-full mb-10 text-left">
                  <h3 className="text-[10px] font-bold text-cyber-muted uppercase tracking-[0.2em] mb-4">Strategic Intelligence</h3>
                  <div className="space-y-3">
                    {challenge.hints.map((hint) => {
                      const isUnlocked = usedHints.includes(hint.id);
                      const text = hintTexts[hint.id];
                      return (
                        <div key={hint.id} className="border border-cyber-border rounded-md overflow-hidden bg-cyber-sidebar/30">
                          {isUnlocked && text ? (
                            <div className="p-4 bg-cyber-neon/5 text-sm text-cyber-text italic flex items-center gap-3">
                              <span className="text-cyber-neon">◆</span>
                              {text}
                            </div>
                          ) : (
                            <button 
                              onClick={() => onUnlockHint(hint.id)}
                              className="w-full p-4 flex items-center justify-between text-xs font-bold uppercase tracking-widest text-cyber-muted hover:text-white hover:bg-cyber-card transition-all"
                            >
                              <span>{isUnlocked ? 'Loading hint...' : 'Encrypted Intel Segment'}</span>
                              <span className="text-cyber-neon">-{hint.cost} PTS</span>
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Files + Resource Links */}
              {(() => {
                const files = challenge.files ?? [];
                let links: { label: string; url: string }[] = [];
                try {
                  const ci = (challenge as any).connection_info;
                  if (ci) links = JSON.parse(ci);
                } catch {}
                if (files.length === 0 && links.length === 0) return null;
                return (
                  <div className="flex flex-col items-center gap-3 mb-8 w-full">
                    {files.map((file: any, i: number) => (
                      <a
                        key={i}
                        href={file.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 bg-cyber-border text-white px-6 py-3 rounded-md text-[11px] font-bold uppercase tracking-widest hover:bg-white hover:text-black transition-all w-full justify-center"
                      >
                        <Download className="w-4 h-4" />
                        {file.name}
                      </a>
                    ))}
                    {links.map((link, i) => (
                      <a
                        key={`link-${i}`}
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 bg-cyber-neon/10 border border-cyber-neon/40 text-cyber-neon px-6 py-3 rounded-md text-[11px] font-bold uppercase tracking-widest hover:bg-cyber-neon hover:text-black transition-all w-full justify-center"
                      >
                        <Download className="w-4 h-4" />
                        {link.label || 'Download'}
                      </a>
                    ))}
                  </div>
                );
              })()}

              {/* Submit */}
              <div className="w-full">
                {isSolved ? (
                  <div className="bg-cyber-neon/10 border border-cyber-neon/50 text-cyber-neon py-5 rounded-md font-bold uppercase tracking-[0.2em] text-sm animate-pulse">
                    {successMsg || 'Module Decrypted Successfully ✓'}
                  </div>
                ) : isLocked ? (
                  <div className="bg-red-500/10 border border-red-500/50 text-red-500 py-5 rounded-md font-bold uppercase tracking-[0.2em] text-sm">
                    Terminal Locked: Maximum Brute-Force Attempts Reached
                  </div>
                ) : eventEnded ? (
                  <div className="bg-cyber-border/20 border border-cyber-border text-cyber-muted py-5 rounded-md font-bold uppercase tracking-[0.2em] text-sm">
                    Event Ended — Submissions Closed
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        placeholder="FLAG{ACCESS_KEY}" 
                        value={flagInput}
                        disabled={isLocked || submitting}
                        onChange={(e) => { setFlagInput(e.target.value); setError(''); }}
                        className={`flex-1 bg-cyber-sidebar border px-5 py-4 rounded-md focus:outline-none transition-all font-mono text-sm ${
                          error ? 'border-red-500' : 'border-cyber-border focus:border-cyber-muted'
                        } ${isLocked || submitting ? 'opacity-50 cursor-not-allowed' : ''}`}
                      />
                      <button 
                        type="submit"
                        disabled={isLocked || submitting}
                        className={`bg-transparent border border-cyber-border text-cyber-muted px-8 py-4 rounded-md text-[11px] font-bold uppercase tracking-widest transition-all ${
                          isLocked || submitting ? 'opacity-50 cursor-not-allowed' : 'hover:border-cyber-neon hover:text-white'
                        }`}
                      >
                        {submitting ? '...' : 'Submit'}
                      </button>
                    </div>
                    <div className="flex justify-between items-center px-1">
                      {error && (
                        <p className="text-red-500 text-[10px] uppercase font-bold tracking-widest text-left">{error}</p>
                      )}
                      <p className={`text-[9px] uppercase font-bold tracking-widest ml-auto ${attempts >= maxAttempts - 5 ? 'text-red-500' : 'text-cyber-muted'}`}>
                        Attempts: {attempts} / {maxAttempts}
                      </p>
                    </div>
                  </form>
                )}
              </div>
            </div>
          ) : (
            <div className="max-w-md mx-auto">
              <h3 className="text-sm font-bold uppercase tracking-[0.2em] mb-8 text-cyber-muted">
                Operatives Solved ({realSolveCount})
              </h3>
              <div className="space-y-3">
                {solversLoading ? (
                  <div className="text-center text-cyber-muted text-xs animate-pulse py-8">Loading...</div>
                ) : solvers.length === 0 ? (
                  <div className="text-center text-cyber-muted text-xs py-8">No solves yet — be the first!</div>
                ) : (
                  solvers.map((s, i) => (
                    <div key={i} className="flex justify-between items-center bg-cyber-sidebar/50 border border-cyber-border p-4 rounded text-xs">
                      <div className="flex items-center gap-2">
                        {i === 0 && <Zap className="w-3 h-3 text-red-400" />}
                        <span className={`font-bold ${i === 0 ? 'text-red-400' : 'text-cyber-neon'}`}>{s.username}</span>
                        {i === 0 && <span className="text-[8px] text-red-400 uppercase tracking-widest">First Blood</span>}
                      </div>
                      <span className="text-cyber-muted font-mono">{s.solved_at}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};