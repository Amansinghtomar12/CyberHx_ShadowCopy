// src/hooks/useData.ts
// Optimised for 4500+ concurrent users on Supabase Pro.
//
// Key changes vs the 60s-poll version:
//   - Challenges poll every 5 minutes (admin rarely edits mid-CTF).
//   - Visibility API: polling pauses entirely when the tab is hidden and
//     resumes with a fresh fetch when the user comes back.
//   - Stale-while-revalidate: cached data shows instantly; the poll refreshes
//     in the background, so the first paint is never a loading spinner after
//     the initial load.
//   - Exponential backoff on errors: after a failure the interval doubles
//     (capped at 5 minutes), then resets on the next success.
//
// WHERE THE SCOREBOARD ACTUALLY LIVES
//   Not here. The live board is Scoreboard.tsx, which runs its own loop and
//   does NOT use useScoreboard() below. It polls the standings every 15
//   seconds and the progression graph every 2 minutes, because the graph is
//   71% of a full refresh and a twelve-hour trend line does not need
//   second-level freshness. useScoreboard() is currently unused; if anything
//   adopts it, give it that same split rather than one interval for both.

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase, DBChallenge, UserScore, TeamScore } from '../lib/supabase';

// ── Shared polling helper ────────────────────────────────────────────
// Runs `fn` immediately, then on a repeating interval. Pauses when the
// document is hidden (Page Visibility API). On error the interval doubles
// up to `maxMs`; on success it resets to `intervalMs`.

export function usePolling(fn: () => Promise<void>, intervalMs: number, enabled = true) {
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout>;
    let delay = intervalMs;
    let cancelled = false;

    const tick = async () => {
      try {
        await fnRef.current();
        delay = intervalMs;
      } catch {
        delay = Math.min(delay * 2, 300_000);
      }
      if (!cancelled) timer = setTimeout(tick, delay);
    };

    // Initial fetch.
    tick();

    // Pause when tab is hidden, resume with a fresh fetch when visible.
    const onVisibility = () => {
      if (document.hidden) {
        clearTimeout(timer);
      } else {
        clearTimeout(timer);
        delay = intervalMs;
        tick();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [intervalMs, enabled]);
}

// ── Demand-driven refresh ────────────────────────────────────────────
// Long poll intervals are what let this platform serve 5000 people, but they
// also mean a player who clicks onto a view sees whatever was fetched up to
// fifteen minutes ago. The fix is not a shorter timer -- it is refetching when
// the player actually arrives, which is one request per deliberate navigation
// instead of a continuous stream from everyone at once.
//
// The throttle is the safety rail: without it, flipping between tabs would
// fire a request per click. With it, the cost of even an agitated user is
// bounded to one refresh per window.
export function useThrottled(fn: () => void, minMs = 20_000) {
  const last = useRef(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  return useCallback(() => {
    const now = Date.now();
    if (now - last.current < minMs) return;
    last.current = now;
    fnRef.current();
  }, [minMs]);
}

// ─────────────────────────────────────────
// CHALLENGES  (poll every 5 min)
// ─────────────────────────────────────────
const CHALLENGE_INTERVAL = 5 * 60_000;

export function useChallenges() {
  const [challenges, setChallenges] = useState<DBChallenge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchChallenges = useCallback(async () => {
    const { data, error } = await supabase
      .from('public_challenges')
      .select(`
        id, title, category, difficulty, points,
        description, author, is_visible, tags, created_at,
        max_attempts, connection_info,
        challenge_files (id, name, url),
        hints (id, cost)
      `)
      .eq('is_visible', true)
      .order('difficulty', { ascending: true });

    if (error) setError(error.message);
    else setChallenges((data as DBChallenge[]) ?? []);
    setLoading(false);
  }, []);

  usePolling(fetchChallenges, CHALLENGE_INTERVAL);

  return { challenges, loading, error, refetch: fetchChallenges };
}

// ─────────────────────────────────────────
// SCOREBOARD  (poll every 15 min)
// ─────────────────────────────────────────
const SCOREBOARD_INTERVAL = 15 * 60_000;

export function useScoreboard() {
  const [users, setUsers] = useState<UserScore[]>([]);
  const [teams, setTeams] = useState<TeamScore[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchScores = useCallback(async () => {
    const [usersRes, teamsRes] = await Promise.all([
      supabase
        .from('user_scores')
        .select('*')
        .order('total_points', { ascending: false })
        .limit(50),
      supabase
        .from('team_scores')
        .select('*')
        .order('total_points', { ascending: false })
        .limit(20),
    ]);

    if (usersRes.data) setUsers(usersRes.data as UserScore[]);
    if (teamsRes.data) setTeams(teamsRes.data as TeamScore[]);
    setLoading(false);
  }, []);

  usePolling(fetchScores, SCOREBOARD_INTERVAL);

  return { users, teams, loading, refetch: fetchScores };
}

// ─────────────────────────────────────────
// TEAMS  (one-shot, used on the Teams list page)
// ─────────────────────────────────────────
export function useTeams() {
  const [teams, setTeams] = useState<TeamScore[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('team_scores')
      .select('*')
      .order('total_points', { ascending: false })
      .then(({ data }) => {
        setTeams((data ?? []) as TeamScore[]);
        setLoading(false);
      });
  }, []);

  return { teams, loading };
}

// ─────────────────────────────────────────
// TEAM ACTIONS — all via secure RPCs
// ─────────────────────────────────────────
export function useTeamActions(userId: string | undefined) {
  const createTeam = async (name: string) => {
    if (!userId) return { error: 'Not logged in' };
    const { data, error } = await supabase.rpc('create_team', { p_name: name.trim() });
    if (error) return { error: error.message };
    if (data?.error) return { error: data.error };
    return { team: { id: data.team_id } };
  };

  const joinTeam = async (inviteCode: string) => {
    if (!userId) return { error: 'Not logged in' };
    const { data, error } = await supabase.rpc('join_team', { p_invite_code: inviteCode.trim() });
    if (error) return { error: error.message };
    if (data?.error) return { error: data.error };
    return { success: true };
  };

  const leaveTeam = async () => {
    if (!userId) return { error: 'Not logged in' };
    const { data, error } = await supabase.rpc('leave_team');
    if (error) return { error: error.message };
    if (data?.error) return { error: data.error };
    return { success: true };
  };

  return { createTeam, joinTeam, leaveTeam };
}
