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
  Check,
  Lock,
  Lightbulb,
  SlidersHorizontal,
  ExternalLink,
  Terminal,
  Trophy,
  TriangleAlert,
  Globe,
  KeyRound,
  Image as ImageIcon,
  Binary,
  Bug,
  Fingerprint,
  Search,
  Boxes,
} from 'lucide-react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Category, Challenge } from './types';
import { DBChallenge, supabase } from './lib/supabase';
import { useChallenges, usePolling, useThrottled } from './hooks/useData';
import { submitFlag, getUnlockedHints, unlockHint } from './api/submitFlag';
import { useAuth } from './hooks/useAuth';
import Scoreboard from './Scoreboard';
import TeamsList from './TeamsList';
import UsersList from './UsersList';
import TeamProfile from './TeamProfile';
import UserProfile from './UserProfile';
import Settings from './Settings';
import AdminDashboard from './components/admin/AdminDashboard';
import AmbientBackground from './components/AmbientBackground';
import BreachConfirm from './components/BreachConfirm';
import CommandHeader from './components/CommandHeader';
import SurfaceLight from './components/environment/SurfaceLight';
import { setMood, type Mood } from './components/environment/mood';
import AnimatedView from './components/environment/AnimatedView';

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
// PRESENTATION HELPERS (visual only)
// ─────────────────────────────────────────
type IconCmp = React.ComponentType<{ className?: string }>;

/** Category → glyph. Keys match `Category` in types.ts; unknown values fall back. */
const CATEGORY_ICON: Record<string, IconCmp> = {
  web: Globe,
  crypto: KeyRound,
  steg: ImageIcon,
  rev: Binary,
  pwn: Bug,
  forensic: Fingerprint,
  osint: Search,
  misc: Boxes,
};

/** Category → hue, with a safe fallback if the DB carries an unmapped value. */
const catVar = (category: string) => `var(--color-cat-${category}, var(--color-cat-misc))`;

const DIFF_BADGE: Record<string, string> = {
  Easy: 'badge-easy',
  Medium: 'badge-medium',
  Hard: 'badge-hard',
};

/** Tailwind-only styling for react-markdown output (no typography plugin here). */
const MARKDOWN_PROSE = [
  'text-body text-text-secondary break-words',
  '[&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
  '[&_p]:my-3',
  '[&_a]:text-cyber-neon [&_a]:underline [&_a]:underline-offset-2 [&_a]:decoration-border-neon',
  '[&_strong]:text-cyber-text [&_strong]:font-bold',
  '[&_em]:text-cyber-text',
  '[&_h1]:text-h3 [&_h2]:text-h3 [&_h3]:text-h3',
  '[&_h1]:text-cyber-text [&_h2]:text-cyber-text [&_h3]:text-cyber-text [&_h4]:text-cyber-text',
  '[&_h1]:mt-6 [&_h2]:mt-6 [&_h3]:mt-5 [&_h1]:mb-2 [&_h2]:mb-2 [&_h3]:mb-2',
  '[&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-1',
  '[&_ul_::marker]:text-cyber-neon [&_ol_::marker]:text-cyber-muted',
  '[&_code]:font-mono [&_code]:text-[0.8125em] [&_code]:text-cyber-neon',
  '[&_code]:bg-surface-inset [&_code]:border [&_code]:border-border-subtle',
  '[&_code]:rounded-inset [&_code]:px-1.5 [&_code]:py-0.5',
  '[&_pre]:my-4 [&_pre]:bg-surface-inset [&_pre]:border [&_pre]:border-border-subtle',
  '[&_pre]:rounded-inset [&_pre]:p-4 [&_pre]:overflow-x-auto',
  '[&_pre_code]:bg-transparent [&_pre_code]:border-0 [&_pre_code]:p-0 [&_pre_code]:text-cyber-text',
  '[&_blockquote]:my-4 [&_blockquote]:border-l-2 [&_blockquote]:border-border-neon [&_blockquote]:pl-4 [&_blockquote]:text-text-muted',
  '[&_hr]:my-6 [&_hr]:border-border-base',
  '[&_img]:max-w-full [&_img]:rounded-inset',
  '[&_table]:my-4 [&_table]:block [&_table]:w-full [&_table]:overflow-x-auto [&_table]:text-small',
  '[&_th]:text-left [&_th]:text-cyber-text [&_th]:font-bold [&_th]:px-3 [&_th]:py-2',
  '[&_td]:px-3 [&_td]:py-2 [&_td]:border-t [&_td]:border-border-subtle',
].join(' ');

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
  const reduce = useReducedMotion();

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
    const interval = setInterval(fetchNotifs, 120_000);
    return () => clearInterval(interval);
  }, [userId]);

  const markAllRead = () => {
    const now = new Date().toISOString();
    localStorage.setItem('notif_last_seen', now);
    setLastSeen(now);
    setUnread(0);
  };

  const typeStyle: Record<string, string> = {
    info: 'badge-info',
    success: 'badge-solved',
    warning: 'badge-medium',
    danger: 'badge-hard',
  };
  const typeIcon: Record<string, string> = { info: 'ℹ', success: '✓', warning: '⚠', danger: '⊘' };

  return (
    <div className="relative">
      <button onClick={() => { setOpen(o => !o); if (!open) markAllRead(); }}
        aria-label="Notifications"
        aria-expanded={open}
        className="btn btn-ghost btn-sm relative">
        <Bell className="w-3.5 h-3.5" />
        <span className="hidden xl:inline">Notifications</span>
        {unread > 0 && (
          <span
            aria-hidden="true"
            className="absolute -top-1 -right-1 z-10 min-w-4 h-4 px-1 rounded-pill bg-status-live text-cyber-bg text-micro tracking-normal font-bold leading-none flex items-center justify-center shadow-e2">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={reduce ? false : { opacity: 0, y: -6, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? undefined : { opacity: 0, y: -6, scale: 0.985 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="surface-overlay absolute right-0 top-full mt-2 w-[min(21rem,calc(100vw-1.5rem))] z-50 overflow-hidden origin-top-right"
          >
            <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border-base bg-surface-rail">
              <span className="label-micro text-cyber-text">Notifications</span>
              <button onClick={() => setOpen(false)} aria-label="Close notifications"
                className="btn btn-ghost btn-sm btn-icon">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="max-h-[min(24rem,60vh)] overflow-y-auto custom-scrollbar divide-y divide-border-subtle">
              {notifications.length === 0 ? (
                <div className="px-4 py-10 text-center">
                  <Bell className="w-5 h-5 mx-auto mb-3 text-text-faint" />
                  <p className="text-small text-text-muted">No notifications yet</p>
                </div>
              ) : notifications.map(n => (
                <div key={n.id} className={`relative px-4 py-3 ${n.created_at > lastSeen ? 'bg-neon-wash' : ''}`}>
                  {n.created_at > lastSeen && (
                    <span aria-hidden="true" className="absolute left-0 inset-y-0 w-0.5 bg-cyber-neon" />
                  )}
                  <div className={`badge ${typeStyle[n.type] ?? typeStyle.info} mb-2`}>
                    <span aria-hidden="true">{typeIcon[n.type] ?? 'ℹ'}</span> {n.type}
                  </div>
                  <p className="text-small font-semibold text-cyber-text mb-0.5 break-words">{n.title}</p>
                  <p className="text-small text-text-muted leading-relaxed break-words">{n.message}</p>
                  <p className="mt-1.5 font-mono text-small text-text-muted">{new Date(n.created_at).toLocaleString()}</p>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
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

  const { challenges: dbChallenges, loading: challengesLoading, refetch: refetchChallenges } = useChallenges();

  const reduce = useReducedMotion();

  // Your score, derived rather than fetched. Mirrors the database exactly --
  // GREATEST(total_points - hint_spend, 0) -- so the number in the header and
  // the number on the scoreboard cannot drift apart. Costs no query.
  const myScore = useMemo(() => {
    const earned = dbChallenges
      .filter(c => solvedIds.includes(c.id) || teamSolvedIds.includes(c.id))
      .reduce((sum, c) => sum + (c.points ?? 0), 0);
    const spent = Object.entries(usedHintIds).reduce((sum, [chId, hintIds]) => {
      const ch = dbChallenges.find(c => c.id === chId);
      if (!ch) return sum;
      return sum + (ch.hints ?? [])
        .filter(h => hintIds.includes(h.id))
        .reduce((h, hint) => h + (hint.cost ?? 0), 0);
    }, 0);
    return Math.max(0, earned - spent);
  }, [dbChallenges, solvedIds, teamSolvedIds, usedHintIds]);

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

  // Solve counts, first blood and teammates' solves change constantly during
  // an event. usePolling also refetches when the tab becomes visible again,
  // so coming back from another window shows the real board.
  usePolling(fetchAllSolveData, 5 * 60_000, !!user);

  // Arriving at the board is a much better refresh signal than a timer: it
  // means the player is looking at this data right now. Throttled so that
  // clicking between views repeatedly costs one refresh, not one per click.
  const refreshBoard = useThrottled(() => {
    void refetchChallenges();
    void fetchAllSolveData();
  }, 20_000);

  useEffect(() => {
    if (currentView === 'challenges') refreshBoard();
  }, [currentView, refreshBoard]);

  // Same geometry, same palette, different energy. Moving from the board to
  // the scoreboard should feel like walking into a busier room rather than
  // loading another site, so the lattice eases between these over ~1s.
  useEffect(() => {
    const MOODS: Record<string, Mood> = {
      challenges: 'focus',
      scoreboard: 'compete',
      teams: 'compete',
      users: 'compete',
      admin: 'focus',
    };
    setMood(MOODS[currentView] ?? 'calm');
  }, [currentView]);

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

  // ── Polling: refresh every 2 min instead of Realtime ──
  // Realtime has 200 concurrent connection limit on free/pro tier.
  // Polling uses zero persistent connections.
  // At 4500 users, 1 req/120s = 37.5 req/s (vs 75 at 60s).
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(fetchAllSolveData, 120_000);
    const onVis = () => { if (!document.hidden) fetchAllSolveData(); };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVis);
    };
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
  const isTeamMode = eventSettings?.mode !== 'individual';
  const hasTeam = !!(profile?.team_id);
  const needsTeam = !hasTeam;  // Server refuses teamless solves; admins included
  const canSeeChallenges = profile?.is_admin || eventStatus !== 'inactive';

  // ── Presentation-only derivations ────────────────────────
  const eventBadgeClass =
    eventStatus === 'live' ? 'badge-live' :
    eventStatus === 'waiting' ? 'badge-medium' :
    eventStatus === 'ended' ? 'badge-hard' : 'badge-locked';
  const eventLabel =
    eventStatus === 'live' ? 'Live' :
    eventStatus === 'waiting' ? 'Starting Soon' :
    eventStatus === 'ended' ? 'Ended' : 'Inactive';
  const activeDiffLabel = selectedDiff === 'all' ? 'All Sequences' : selectedDiff;
  const totalSolvedCount = challenges.filter(c => isChallengeSolved(c.id)).length;

  const navItems: { id: typeof currentView; label: string; icon: IconCmp }[] = [
    { id: 'users', label: 'Users', icon: UserIcon },
    { id: 'teams', label: 'Teams', icon: Users },
    { id: 'challenges', label: 'Challenges', icon: Terminal },
    { id: 'scoreboard', label: 'Scoreboard', icon: Trophy },
  ];

  return (
    <div className="min-h-screen bg-cyber-bg text-cyber-text font-sans">
      <AmbientBackground />
      <SurfaceLight />

      <div className="page-shell min-h-screen flex flex-col">
        {/* Header */}
        <nav className="bg-cyber-bg/85 backdrop-blur-xl border-b border-border-base sticky top-0 z-50">
          <div className="max-w-screen-2xl mx-auto px-3 sm:px-5 lg:px-6 h-16 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 lg:gap-6 min-w-0">
              <button
                className="btn btn-ghost btn-sm btn-icon lg:hidden -ml-1 shrink-0"
                aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
                aria-expanded={mobileMenuOpen}
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              >
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>

              <h1 className="min-w-0">
                <button
                  type="button"
                  className="group flex items-center gap-2.5 focus-ring rounded-inset"
                  onClick={() => { setCurrentView('challenges'); setMobileMenuOpen(false); }}
                >
                  <span className="w-7 h-7 shrink-0 bg-neon-wash border border-border-neon rounded-inset flex items-center justify-center shadow-neon transition-transform duration-[var(--duration-base)] ease-out-quint group-hover:scale-105">
                    <Flag className="w-3.5 h-3.5 text-cyber-neon" />
                  </span>
                  <span className="hidden sm:inline text-h3 tracking-tight text-cyber-text">CYBERHX</span>
                </button>
              </h1>

              <div className="hidden lg:flex items-center gap-1">
                {navItems.map(item => (
                  <button
                    key={item.id}
                    onClick={() => setCurrentView(item.id)}
                    aria-current={currentView === item.id ? 'page' : undefined}
                    className={`tab ${currentView === item.id ? 'is-active' : ''}`}
                  >
                    {item.label}
                  </button>
                ))}
                {profile?.is_admin && (
                  <button
                    onClick={() => setCurrentView('admin')}
                    aria-current={currentView === 'admin' ? 'page' : undefined}
                    className={`tab ${currentView === 'admin' ? 'is-active text-cyber-neon' : 'text-cyber-neon/70'}`}
                  >
                    Admin
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <NotificationBell userId={user?.id ?? ''} />
              <span className="divider-vertical hidden lg:block mx-1 h-6 self-center" />
              <div className="hidden lg:flex items-center gap-1">
                <button onClick={() => setCurrentView('teamProfile')} aria-label="My team"
                  className={`btn btn-ghost btn-sm ${currentView === 'teamProfile' ? 'text-cyber-text' : ''}`}>
                  <Users className="w-3.5 h-3.5" /> <span className="hidden xl:inline">Team</span>
                </button>
                <button onClick={() => setCurrentView('userProfile')} aria-label="My profile"
                  className={`btn btn-ghost btn-sm max-w-[10rem] ${currentView === 'userProfile' ? 'text-cyber-text' : ''}`}>
                  <UserIcon className="w-3.5 h-3.5" />
                  <span className="hidden xl:inline truncate">{profile?.username ?? 'Profile'}</span>
                </button>
                <button onClick={() => setCurrentView('settings')} aria-label="Settings"
                  className={`btn btn-ghost btn-sm btn-icon ${currentView === 'settings' ? 'text-cyber-text' : ''}`}>
                  <SettingsIcon className="w-3.5 h-3.5" />
                </button>
                <button onClick={handleLogout} aria-label="Log out"
                  className="btn btn-ghost btn-sm btn-icon hover:text-status-live">
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Mobile Navigation Menu */}
          <AnimatePresence>
            {mobileMenuOpen && (
              <motion.div
                initial={reduce ? false : { opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduce ? undefined : { opacity: 0, y: -8 }}
                transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                className="lg:hidden border-t border-border-base bg-cyber-bg/95 backdrop-blur-xl overflow-hidden max-h-[calc(100vh-4rem)] overflow-y-auto custom-scrollbar"
              >
                <div className="px-4 py-6 flex flex-col gap-1">
                  <p className="label-micro mb-2">Navigate</p>
                  <button onClick={() => { setCurrentView('users'); setMobileMenuOpen(false); }} className={`flex items-center gap-3 rounded-control px-3 py-3 text-label uppercase transition-colors ${currentView === 'users' ? 'bg-surface-raised text-cyber-neon' : 'text-text-secondary hover:bg-surface-card hover:text-cyber-text'}`}>
                    <UserIcon className="w-4 h-4" /> Users
                  </button>
                  <button onClick={() => { setCurrentView('teams'); setMobileMenuOpen(false); }} className={`flex items-center gap-3 rounded-control px-3 py-3 text-label uppercase transition-colors ${currentView === 'teams' ? 'bg-surface-raised text-cyber-neon' : 'text-text-secondary hover:bg-surface-card hover:text-cyber-text'}`}>
                    <Users className="w-4 h-4" /> Teams
                  </button>
                  <button onClick={() => { setCurrentView('scoreboard'); setMobileMenuOpen(false); }} className={`flex items-center gap-3 rounded-control px-3 py-3 text-label uppercase transition-colors ${currentView === 'scoreboard' ? 'bg-surface-raised text-cyber-neon' : 'text-text-secondary hover:bg-surface-card hover:text-cyber-text'}`}>
                    <Trophy className="w-4 h-4" /> Scoreboard
                  </button>
                  <button onClick={() => { setCurrentView('challenges'); setMobileMenuOpen(false); }} className={`flex items-center gap-3 rounded-control px-3 py-3 text-label uppercase transition-colors ${currentView === 'challenges' ? 'bg-surface-raised text-cyber-neon' : 'text-text-secondary hover:bg-surface-card hover:text-cyber-text'}`}>
                    <Terminal className="w-4 h-4" /> Challenges
                  </button>
                  {profile?.is_admin && (
                    <button onClick={() => { setCurrentView('admin'); setMobileMenuOpen(false); }} className={`flex items-center gap-3 rounded-control px-3 py-3 text-label uppercase transition-colors ${currentView === 'admin' ? 'bg-surface-raised text-cyber-neon' : 'text-text-secondary hover:bg-surface-card hover:text-cyber-text'}`}>
                      <SettingsIcon className="w-4 h-4" /> Admin
                    </button>
                  )}

                  <p className="label-micro mt-6 mb-2">Account</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => { setCurrentView('teamProfile'); setMobileMenuOpen(false); }} className="surface flex flex-col items-center gap-2 p-4 transition-colors hover:bg-surface-raised">
                      <Users className="w-4 h-4 text-cyber-neon" />
                      <span className="label-micro text-text-secondary">My Team</span>
                    </button>
                    <button onClick={() => { setCurrentView('userProfile'); setMobileMenuOpen(false); }} className="surface flex flex-col items-center gap-2 p-4 transition-colors hover:bg-surface-raised">
                      <UserIcon className="w-4 h-4 text-cyber-neon" />
                      <span className="label-micro text-text-secondary">Profile</span>
                    </button>
                    <button onClick={() => { setCurrentView('settings'); setMobileMenuOpen(false); }} className="surface flex flex-col items-center gap-2 p-4 transition-colors hover:bg-surface-raised">
                      <SettingsIcon className="w-4 h-4 text-cyber-neon" />
                      <span className="label-micro text-text-secondary">Settings</span>
                    </button>
                    <button onClick={handleLogout} className="surface flex flex-col items-center gap-2 p-4 transition-colors hover:bg-surface-raised hover:border-border-strong">
                      <LogOut className="w-4 h-4 text-status-live" />
                      <span className="label-micro text-text-secondary">Log Out</span>
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </nav>

        <div className="flex flex-1 max-w-screen-2xl mx-auto w-full relative">
          <AnimatePresence mode="wait" initial={false}>
          <AnimatedView viewKey={currentView}>
          {currentView === 'challenges' ? (
            <>
              {/* Left Sidebar Filter (Desktop) */}
              <aside className="hidden lg:block w-64 xl:w-72 border-r border-border-base px-5 xl:px-6 py-8 shrink-0 text-left">
                <div className="sticky top-24 space-y-8">
                  <div>
                    <h3 className="label-micro mb-3">Difficulty Modules</h3>
                    <ul className="space-y-1">
                      <li>
                        <button
                          onClick={() => setSelectedDiff('all')}
                          aria-current={selectedDiff === 'all' ? 'true' : undefined}
                          className={`group relative flex w-full items-center gap-3 rounded-control px-3 py-2 text-left transition-colors duration-[var(--duration-base)] ${selectedDiff === 'all' ? 'bg-surface-raised text-cyber-neon' : 'text-text-secondary hover:bg-surface-card hover:text-cyber-text'}`}
                        >
                          {selectedDiff === 'all' && <span aria-hidden="true" className="absolute inset-y-2 left-0 w-0.5 rounded-pill bg-cyber-neon" />}
                          <span aria-hidden="true" className={`w-1.5 h-1.5 rounded-pill ${selectedDiff === 'all' ? 'bg-cyber-neon' : 'bg-border-strong group-hover:bg-text-muted'}`} />
                          <span className="text-small font-medium">All Sequences</span>
                          <span className="ml-auto font-mono text-small text-text-muted">{challenges.length}</span>
                        </button>
                      </li>
                      {DIFFICULTIES.map(diff => (
                        <li key={diff.id}>
                          <button
                            onClick={() => setSelectedDiff(diff.id)}
                            aria-current={selectedDiff === diff.id ? 'true' : undefined}
                            className={`group relative flex w-full items-center gap-3 rounded-control px-3 py-2 text-left transition-colors duration-[var(--duration-base)] ${selectedDiff === diff.id ? 'bg-surface-raised text-cyber-neon' : 'text-text-secondary hover:bg-surface-card hover:text-cyber-text'}`}
                          >
                            {selectedDiff === diff.id && <span aria-hidden="true" className="absolute inset-y-2 left-0 w-0.5 rounded-pill bg-cyber-neon" />}
                            <span
                              aria-hidden="true"
                              className="w-1.5 h-1.5 rounded-pill"
                              style={{ backgroundColor: `var(--color-diff-${diff.id.toLowerCase()})` }}
                            />
                            <span className="text-small font-medium">{diff.label} Modules</span>
                            <span className="ml-auto font-mono text-small text-text-muted">{challengesByDiff[diff.id]?.length ?? 0}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Progress */}
                  {challenges.length > 0 && (
                    <div className="surface p-4">
                      <div className="flex items-baseline justify-between mb-3">
                        <h3 className="label-micro">Progress</h3>
                        <span className="font-mono text-small text-cyber-neon">
                          {totalSolvedCount}<span className="text-text-muted">/{challenges.length}</span>
                        </span>
                      </div>
                      <div className="surface-inset h-1.5 w-full overflow-hidden rounded-pill">
                        <div
                          className="h-full rounded-pill bg-cyber-neon"
                          style={{ width: `${challenges.length ? Math.round((totalSolvedCount / challenges.length) * 100) : 0}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Event status in sidebar */}
                  {eventSettings && (
                    <div className="pt-6 border-t border-border-subtle">
                      <h3 className="label-micro mb-3">Event</h3>
                      <p className="text-small font-bold text-cyber-text mb-2 break-words">{eventSettings.name}</p>
                      <div className={`badge ${eventBadgeClass}`}>
                        {eventLabel}
                      </div>
                      {eventSettings.end_time && eventStatus === 'live' && (
                        <p className="text-small text-text-muted mt-3 leading-relaxed">
                          Ends <span className="font-mono text-text-secondary">{new Date(eventSettings.end_time).toLocaleString()}</span>
                        </p>
                      )}
                      {eventSettings.start_time && eventStatus === 'waiting' && (
                        <p className="text-small text-text-muted mt-3 leading-relaxed">
                          Starts <span className="font-mono text-text-secondary">{new Date(eventSettings.start_time).toLocaleString()}</span>
                        </p>
                      )}
                      {isTeamMode && (
                        <p className="label-micro mt-3">Team mode</p>
                      )}
                    </div>
                  )}
                </div>
              </aside>

              {/* Main Content Area */}
              <main className="flex-1 min-w-0 px-4 sm:px-6 lg:px-8 py-8 lg:py-10 w-full">
                <CommandHeader
                  status={eventStatus}
                  eventName={eventSettings?.name}
                  startTime={eventSettings?.start_time}
                  endTime={eventSettings?.end_time}
                  score={myScore}
                  solved={solvedIds.length}
                  total={challenges.length}
                  teamSolved={teamSolvedIds.length}
                  hasTeam={!!profile?.team_id}
                />

                {/* Mobile / tablet difficulty filter */}
                <div className="lg:hidden relative mb-6 z-20">
                  <button
                    onClick={() => setMobileFilterOpen(!mobileFilterOpen)}
                    aria-expanded={mobileFilterOpen}
                    className="btn btn-secondary btn-md btn-block justify-between"
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{activeDiffLabel}</span>
                    </span>
                    <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform duration-[var(--duration-base)] ${mobileFilterOpen ? 'rotate-180' : ''}`} />
                  </button>
                  <AnimatePresence>
                    {mobileFilterOpen && (
                      <motion.div
                        initial={reduce ? false : { opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={reduce ? undefined : { opacity: 0, y: -8 }}
                        transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                        className="surface-overlay absolute left-0 right-0 z-30 mt-2 p-2"
                      >
                        <ul className="space-y-1">
                          <li>
                            <button
                              onClick={() => { setSelectedDiff('all'); setMobileFilterOpen(false); }}
                              className={`flex w-full items-center justify-between rounded-control px-3 py-2.5 text-left text-label uppercase transition-colors ${selectedDiff === 'all' ? 'bg-surface-raised text-cyber-neon' : 'text-text-secondary hover:bg-surface-card hover:text-cyber-text'}`}
                            >
                              All Sequences
                              <span className="font-mono text-small text-text-muted">{challenges.length}</span>
                            </button>
                          </li>
                          {DIFFICULTIES.map(diff => (
                            <li key={diff.id}>
                              <button
                                onClick={() => { setSelectedDiff(diff.id); setMobileFilterOpen(false); }}
                                className={`flex w-full items-center justify-between rounded-control px-3 py-2.5 text-left text-label uppercase transition-colors ${selectedDiff === diff.id ? 'bg-surface-raised text-cyber-neon' : 'text-text-secondary hover:bg-surface-card hover:text-cyber-text'}`}
                              >
                                <span className="flex items-center gap-2.5">
                                  <span aria-hidden="true" className="w-1.5 h-1.5 rounded-pill" style={{ backgroundColor: `var(--color-diff-${diff.id.toLowerCase()})` }} />
                                  {diff.label}
                                </span>
                                <span className="font-mono text-small text-text-muted">{challengesByDiff[diff.id]?.length ?? 0}</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {challengesLoading ? (
                  <div>
                    <span className="sr-only" role="status">Loading challenges…</span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5">
                      {[0, 1, 2, 3, 4, 5].map(i => (
                        <div key={i} className="surface p-5">
                          <div className="flex items-center justify-between mb-6">
                            <div className="skeleton w-9 h-9 rounded-inset" />
                            <div className="skeleton skeleton-text w-10" />
                          </div>
                          <div className="skeleton skeleton-text w-3/5 h-4 mb-3" />
                          <div className="skeleton skeleton-text w-2/5 mb-6" />
                          <div className="skeleton skeleton-text w-1/3" />
                        </div>
                      ))}
                    </div>
                  </div>
                ) : !canSeeChallenges ? (
                  <div className="surface flex flex-col items-center text-center px-6 py-16">
                    <span
                      aria-hidden="true"
                      className="mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-border-strong bg-surface-inset text-text-muted"
                    >
                      <Lock className="h-5 w-5" />
                    </span>
                    <h3 className="text-h3 text-cyber-text mb-2">Event is not active yet</h3>
                    <p className="text-body text-text-muted max-w-sm">Challenges unlock the moment the organisers bring the event online.</p>
                  </div>
                ) : needsTeam ? (
                  <div className="surface flex flex-col items-center text-center px-6 py-16">
                    <span className="badge badge-neon mb-5">Team Required</span>
                    <h2 className="text-h2 text-cyber-text mb-3">Join or Create a Team First</h2>
                    <p className="text-body text-text-muted mb-8 max-w-md">This event is in team mode. You must be part of a team to access challenges.</p>
                    <button
                      onClick={() => setCurrentView('teamProfile')}
                      className="btn btn-primary btn-lg"
                    >
                      Go to Teams
                    </button>
                  </div>
                ) : challenges.length === 0 ? (
                  <div className="surface flex flex-col items-center text-center px-6 py-16">
                    <span
                      aria-hidden="true"
                      className="mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-border-strong bg-surface-inset text-text-muted"
                    >
                      <Terminal className="h-5 w-5" />
                    </span>
                    <h3 className="text-h3 text-cyber-text mb-2">No challenges yet</h3>
                    <p className="text-body text-text-muted max-w-sm">Add some from the Admin panel and they will appear here.</p>
                  </div>
                ) : (
                  displayedDiffs.map((diff) => (
                    challengesByDiff[diff.id] && challengesByDiff[diff.id].length > 0 && (
                      <section key={diff.id} className="mb-8 sm:mb-section">
                        <div className="flex items-center gap-4 mb-5">
                          <h3 className="text-h2 text-cyber-text">{diff.label}</h3>
                          <span className={`badge ${DIFF_BADGE[diff.id] ?? ''} font-mono`}>
                            {challengesByDiff[diff.id].length}
                          </span>
                          <span aria-hidden="true" className="divider flex-1" />
                        </div>
                        <div className="stagger grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5">
                          {challengesByDiff[diff.id].map((challenge, i) => (
                            <ChallengeCard
                              key={challenge.id}
                              index={i}
                              challenge={challenge}
                              points={getPoints(challenge)}
                              isSolved={isChallengeSolved(challenge.id)}
                              solvedBy={solvedByMap[challenge.id]}
                              isFirstBlood={!!firstBloodMap[challenge.id] && challenge.solvedCount >= 1}
                              onClick={() => setSelectedChallenge(challenge)}
                            />
                          ))}
                        </div>
                      </section>
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
          </AnimatedView>
          </AnimatePresence>
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

        <footer className="mt-auto border-t border-border-base py-8 px-4 sm:px-6">
          <div className="max-w-screen-2xl mx-auto flex flex-col md:flex-row justify-between items-center gap-5">
            <div className="flex items-center gap-2.5">
              <span aria-hidden="true" className="w-5 h-5 bg-neon-wash border border-border-neon rounded-inset flex items-center justify-center">
                <Flag className="w-2.5 h-2.5 text-cyber-neon" />
              </span>
              <p className="label-micro">Cyberhx CTF Framework v2.0</p>
            </div>
            <div className="flex flex-wrap justify-center gap-x-6 gap-y-2">
              <a href="#" className="label-micro hover:text-cyber-neon transition-colors rounded-inset">Privacy</a>
              <a href="#" className="label-micro hover:text-cyber-neon transition-colors rounded-inset">Terms</a>
              <a href="#" className="label-micro hover:text-cyber-neon transition-colors rounded-inset">Support</a>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}

interface ChallengeCardProps {
  challenge: Challenge;
  /** Position in its group — drives the staggered entrance only. */
  index?: number;
  points: number;
  isSolved: boolean;
  solvedBy?: string;
  isFirstBlood?: boolean;
  onClick: () => void;
}

const ChallengeCard: React.FC<ChallengeCardProps> = ({ challenge, index = 0, points, isSolved, solvedBy, isFirstBlood, onClick }) => {
  const reduce = useReducedMotion();
  const tiltRef = useRef<HTMLDivElement>(null);
  const CategoryIcon = CATEGORY_ICON[challenge.category] ?? Boxes;
  const hue = catVar(challenge.category);

  // Pointer-driven perspective tilt — transform only, disabled under reduced motion.
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = tiltRef.current;
    if (!el || reduce) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    el.style.setProperty('--tilt-x', `${(0.5 - py) * 4}deg`);
    el.style.setProperty('--tilt-y', `${(px - 0.5) * 5}deg`);
    el.style.setProperty('--spec-x', `${e.clientX - r.left}px`);
    el.style.setProperty('--spec-y', `${e.clientY - r.top}px`);
  };

  const resetTilt = () => {
    const el = tiltRef.current;
    if (!el) return;
    el.style.setProperty('--tilt-x', '0deg');
    el.style.setProperty('--tilt-y', '0deg');
  };

  return (
    <div className="h-full [perspective:1100px]" style={{ ['--i' as string]: index }}>
      <div
        ref={tiltRef}
        onPointerMove={handlePointerMove}
        onPointerLeave={resetTilt}
        className="h-full"
        style={{
          transform: 'rotateX(var(--tilt-x, 0deg)) rotateY(var(--tilt-y, 0deg))',
          transformStyle: 'preserve-3d',
          transition: 'transform var(--duration-base) var(--ease-out-quint)',
        }}
      >
        <button
          type="button"
          onClick={onClick}
          /* Runs its own tilt + specular above; keeps SurfaceLight off it. */
          data-selflit=""
          className={`card-interactive group relative flex h-full w-full flex-col overflow-hidden p-5 text-left ${
            isSolved ? 'border-border-neon' : ''
          }`}
        >
          {/* category hairline */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-px opacity-70"
            style={{ background: `linear-gradient(90deg, transparent, ${hue}, transparent)` }}
          />
          {/* solved wash */}
          {isSolved && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-0"
              style={{ background: 'linear-gradient(180deg, var(--color-neon-wash), transparent 55%)' }}
            />
          )}
          {/* pointer specular — transform + opacity only */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -left-24 -top-24 h-48 w-48 rounded-pill opacity-0 transition-opacity duration-[var(--duration-base)] group-hover:opacity-70"
            style={{
              background: 'radial-gradient(circle, var(--color-neon-glow), transparent 68%)',
              transform: 'translate3d(var(--spec-x, 0px), var(--spec-y, 0px), 0)',
            }}
          />

          <div className="relative flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <span
                aria-hidden="true"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-inset border"
                style={{
                  color: hue,
                  borderColor: 'var(--color-border-base)',
                  backgroundColor: 'var(--color-surface-inset)',
                }}
              >
                <CategoryIcon className="h-4 w-4" />
              </span>
              <span className="label-micro truncate" style={{ color: hue }}>
                {challenge.category}
              </span>
            </div>
            <div className="shrink-0 text-right">
              <div className="font-mono text-h3 leading-none text-cyber-neon">{points}</div>
              <div className="label-micro mt-1.5">pts</div>
            </div>
          </div>

          <h3 className="relative mt-5 text-h3 text-cyber-text truncate transition-colors duration-[var(--duration-base)] group-hover:text-cyber-neon">
            {challenge.title}
          </h3>

          <div className="relative mt-3 flex flex-wrap items-center gap-1.5">
            <span className={`badge ${DIFF_BADGE[challenge.difficulty] ?? ''}`}>{challenge.difficulty}</span>
            {isSolved && (
              <span className="badge badge-solved">
                <Check className="h-2.5 w-2.5" /> Solved
              </span>
            )}
            {isFirstBlood && !isSolved && (
              <span className="badge badge-live">First Blood</span>
            )}
          </div>

          <div className="relative mt-auto flex items-center justify-between gap-3 pt-5 text-small">
            <span className="inline-flex items-center gap-1.5 text-text-muted">
              <Users className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="font-mono">{challenge.solvedCount}</span>
              solve{challenge.solvedCount !== 1 ? 's' : ''}
            </span>
            {isSolved && solvedBy && (
              <span className="inline-flex min-w-0 items-center gap-1.5 text-status-solved">
                <Check className="h-3 w-3 shrink-0" aria-hidden="true" />
                <span className="truncate font-mono">{solvedBy}</span>
              </span>
            )}
          </div>
        </button>
      </div>
    </div>
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
  // Only a solve that happens in this session replays the acknowledgement.
  // isSolved is already true when reopening a finished challenge.
  const [justBreached, setJustBreached] = useState(false);
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
      // alreadySolved comes back when a concurrent request won the race; that
      // is not a fresh breach and should not be celebrated twice.
      if (!result.alreadySolved) setJustBreached(true);
    } else if (result.locked) {
      setError('Terminal Locked: Maximum attempts reached.');
    } else {
      setError(result.message ?? 'Access Denied: Invalid Key Sequence');
    }

    setSubmitting(false);
  };

  // ── Presentation-only derivations ────────────────────────
  const reduce = useReducedMotion();
  const hue = catVar(challenge.category);
  const CategoryIcon = CATEGORY_ICON[challenge.category] ?? Boxes;
  const attemptsPct = maxAttempts > 0 ? Math.min(100, Math.round((attempts / maxAttempts) * 100)) : 0;
  const attemptsCritical = attempts >= maxAttempts - 5;
  const flagInputId = `flag-input-${challenge.id}`;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6">
      <motion.div
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={reduce ? undefined : { opacity: 0 }}
        transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
        onClick={onClose}
        className="scrim"
      />
      <motion.div
        initial={reduce ? false : { scale: 0.985, opacity: 0, y: 10 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={reduce ? undefined : { scale: 0.985, opacity: 0, y: 10 }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        role="dialog"
        aria-modal="true"
        aria-label={challenge.title}
        className="surface-overlay relative w-full max-w-2xl overflow-hidden"
      >
        <AnimatePresence>
          {justBreached && (
            <BreachConfirm points={points} onDone={() => setJustBreached(false)} />
          )}
        </AnimatePresence>
        <div className="flex items-center justify-between gap-3 px-3 sm:px-5 py-3 border-b border-border-base bg-surface-rail">
          <div className="flex min-w-0 gap-1">
            <button
              onClick={() => setActiveTab('challenge')}
              aria-current={activeTab === 'challenge' ? 'true' : undefined}
              className={`tab ${activeTab === 'challenge' ? 'is-active' : ''}`}
            >
              Challenge
            </button>
            <button
              onClick={() => setActiveTab('solves')}
              aria-current={activeTab === 'solves' ? 'true' : undefined}
              className={`tab ${activeTab === 'solves' ? 'is-active' : ''}`}
            >
              <span className="truncate">Solves</span>
              <span className="font-mono text-text-muted">({activeTab === 'solves' ? realSolveCount : challenge.solvedCount})</span>
            </button>
          </div>
          <button onClick={onClose} aria-label="Close challenge" className="btn btn-ghost btn-sm btn-icon shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 sm:p-6 md:p-8 max-h-[calc(100vh-10rem)] overflow-y-auto custom-scrollbar">
          {activeTab === 'challenge' ? (
            <div className="flex flex-col">
              {/* Title block */}
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <span className="inline-flex items-center gap-2 label-micro" style={{ color: hue }}>
                    <CategoryIcon className="w-3 h-3" />
                    {challenge.category}
                  </span>
                  <h2 className="mt-2 text-h2 sm:text-h1 text-cyber-text break-words">{challenge.title}</h2>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-mono text-h1 leading-none text-cyber-neon text-glow">{points}</div>
                  <div className="label-micro mt-1.5">points</div>
                </div>
              </div>

              {/* Meta strip */}
              <div className="mt-5 flex flex-wrap items-center gap-2">
                <span className={`badge ${DIFF_BADGE[challenge.difficulty] ?? ''}`}>{challenge.difficulty}</span>
                {isSolved && <span className="badge badge-solved"><Check className="w-2.5 h-2.5" /> Solved</span>}
                {isLocked && <span className="badge badge-locked"><Lock className="w-2.5 h-2.5" /> Locked</span>}
                <span className="badge">
                  <Users className="w-2.5 h-2.5" /> <span className="font-mono">{challenge.solvedCount}</span> solves
                </span>
                <span className="badge">By {challenge.author}</span>
                {firstBlood && (
                  <span className="badge badge-live">
                    <Zap className="w-2.5 h-2.5" /> First Blood: {firstBlood}
                  </span>
                )}
              </div>

              <hr className="divider my-6" />

              {/* Description */}
              <div className="surface-inset rounded-card p-4 sm:p-5 text-left">
                <div className={MARKDOWN_PROSE}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {challenge.description}
                  </ReactMarkdown>
                </div>
              </div>

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
                  <div className="mt-6 w-full">
                    <h3 className="label-micro mb-3">Attachments</h3>
                    <div className="flex flex-col gap-2">
                      {files.map((file: any, i: number) => (
                        <a
                          key={i}
                          href={file.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-secondary btn-md btn-block justify-start gap-3"
                        >
                          <Download className="w-4 h-4 shrink-0" />
                          <span className="truncate">{file.name}</span>
                        </a>
                      ))}
                      {links.map((link, i) => (
                        <a
                          key={`link-${i}`}
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-outline btn-md btn-block justify-start gap-3"
                        >
                          <ExternalLink className="w-4 h-4 shrink-0" />
                          <span className="truncate">{link.label || 'Download'}</span>
                        </a>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Hints */}
              {challenge.hints && challenge.hints.length > 0 && (
                <div className="mt-6 w-full text-left">
                  <h3 className="label-micro mb-3">Strategic Intelligence</h3>
                  <div className="space-y-2">
                    {challenge.hints.map((hint) => {
                      const isUnlocked = usedHints.includes(hint.id);
                      const text = hintTexts[hint.id];
                      return (
                        <div key={hint.id} className="overflow-hidden rounded-control border border-border-base bg-surface-card">
                          {isUnlocked && text ? (
                            <div className="flex items-start gap-3 border-l-2 border-cyber-neon bg-neon-wash p-4">
                              <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyber-neon" aria-hidden="true" />
                              <p className="text-body text-text-secondary break-words">{text}</p>
                            </div>
                          ) : (
                            <button
                              onClick={() => onUnlockHint(hint.id)}
                              className="flex w-full items-center justify-between gap-3 p-4 text-left text-label uppercase text-text-muted transition-colors duration-[var(--duration-base)] hover:bg-surface-raised hover:text-cyber-text"
                            >
                              <span className="flex min-w-0 items-center gap-2.5">
                                <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                <span className="truncate">{isUnlocked ? 'Loading hint...' : 'Encrypted Intel Segment'}</span>
                              </span>
                              <span className="badge badge-neon shrink-0 font-mono">-{hint.cost} pts</span>
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Submit */}
              <div className="mt-8 w-full">
                {isSolved ? (
                  <div className="flex items-center gap-3 rounded-card border border-border-neon bg-neon-wash p-5">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-pill bg-cyber-neon">
                      <Check className="h-4 w-4 text-neon-ink" />
                    </span>
                    <p className="text-label uppercase text-cyber-neon break-words">
                      {successMsg || 'Module Decrypted Successfully ✓'}
                    </p>
                  </div>
                ) : isLocked ? (
                  <div className="flex items-center gap-3 rounded-card border p-5" style={{ borderColor: 'var(--color-border-danger)', backgroundColor: 'var(--color-diff-hard-wash)' }}>
                    <Lock className="h-5 w-5 shrink-0 text-diff-hard" aria-hidden="true" />
                    <p className="text-label uppercase text-diff-hard">Terminal Locked: Maximum Brute-Force Attempts Reached</p>
                  </div>
                ) : eventEnded ? (
                  <div className="flex items-center gap-3 rounded-card border border-border-base bg-surface-inset p-5">
                    <TriangleAlert className="h-5 w-5 shrink-0 text-text-muted" aria-hidden="true" />
                    <p className="text-label uppercase text-text-muted">Event Ended — Submissions Closed</p>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="surface p-4 sm:p-5">
                    <label htmlFor={flagInputId} className="field-label">Submit Access Key</label>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <input
                        id={flagInputId}
                        type="text"
                        placeholder="FLAG{ACCESS_KEY}"
                        value={flagInput}
                        disabled={isLocked || submitting}
                        onChange={(e) => { setFlagInput(e.target.value); setError(''); }}
                        aria-invalid={error ? true : undefined}
                        className={`input h-[2.875rem] flex-1 ${error ? 'is-invalid' : ''}`}
                      />
                      <button
                        type="submit"
                        disabled={isLocked || submitting}
                        className={`btn btn-primary btn-lg shrink-0 ${submitting ? 'is-loading' : ''}`}
                      >
                        {submitting ? '...' : 'Submit'}
                      </button>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                      {error && (
                        <p role="alert" className="text-label uppercase text-diff-hard break-words">{error}</p>
                      )}
                      <div className="ml-auto flex items-center gap-2.5">
                        <span aria-hidden="true" className="hidden h-1 w-20 overflow-hidden rounded-pill bg-surface-inset sm:block">
                          <span
                            className="block h-full rounded-pill"
                            style={{
                              width: `${attemptsPct}%`,
                              backgroundColor: attemptsCritical ? 'var(--color-diff-hard)' : 'var(--color-border-strong)',
                            }}
                          />
                        </span>
                        <p className={`label-micro ${attemptsCritical ? 'text-diff-hard' : ''}`}>
                          Attempts <span className="font-mono">{attempts}/{maxAttempts}</span>
                        </p>
                      </div>
                    </div>
                  </form>
                )}
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-md">
              <h3 className="label-micro mb-5">
                Operatives Solved (<span className="font-mono">{realSolveCount}</span>)
              </h3>
              <div className="space-y-2">
                {solversLoading ? (
                  <>
                    <span className="sr-only" role="status">Loading solves…</span>
                    {[0, 1, 2, 3].map(i => (
                      <div key={i} className="surface-inset flex items-center justify-between gap-3 p-4">
                        <div className="skeleton skeleton-text w-28" />
                        <div className="skeleton skeleton-text w-24" />
                      </div>
                    ))}
                  </>
                ) : solvers.length === 0 ? (
                  <div className="surface flex flex-col items-center px-6 py-16 text-center">
                    <span
                      aria-hidden="true"
                      className="flex h-12 w-12 items-center justify-center rounded-full border border-border-strong bg-surface-inset text-text-muted"
                    >
                      <Zap className="h-5 w-5" />
                    </span>
                    <p className="mt-4 text-h3 text-cyber-text">No solves yet</p>
                    <p className="mt-1.5 max-w-xs text-small text-text-muted">Be the first to land this flag.</p>
                  </div>
                ) : (
                  solvers.map((s, i) => (
                    <div key={i} className="surface-inset flex items-center justify-between gap-3 p-4 text-small">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="w-5 shrink-0 font-mono text-small text-text-muted">{i + 1}</span>
                        {i === 0 && <Zap className="h-3 w-3 shrink-0 text-status-live" aria-hidden="true" />}
                        <span className={`truncate font-bold ${i === 0 ? 'text-status-live' : 'text-cyber-neon'}`}>{s.username}</span>
                        {i === 0 && <span className="badge badge-live hidden sm:inline-flex">First Blood</span>}
                      </div>
                      <span className="shrink-0 font-mono text-small text-text-muted">{s.solved_at}</span>
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
