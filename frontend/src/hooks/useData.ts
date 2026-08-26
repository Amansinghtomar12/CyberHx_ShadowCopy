// src/hooks/useData.ts
// Optimised for 4500+ concurrent users on Supabase Pro.
//
// Key changes vs the 60s-poll version:
//   - Scoreboard polls every 15 minutes (was 60s). 4500 users × 1 req/60s =
//     75 req/s; × 1 req/900s = 5 req/s. That is the single biggest win.
//   - Challenges poll every 5 minutes (admin rarely edits mid-CTF).
//   - Visibility API: polling pauses entirely when the tab is hidden and
//     resumes with a fresh fetch when the user comes back.
//   - Stale-while-revalidate: cached data shows instantly; the poll refreshes
//     in the background, so the first paint is never a loading spinner after
//     the initial load.
//   - Exponential backoff on errors: after a failure the interval doubles
//     (capped at 5 minutes), then resets on the next success.

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase, DBChallenge, UserScore, TeamScore } from '../lib/supabase';

// ── Shared polling helper ────────────────────────────────────────────
// Runs `fn` immediately, then on a repeating interval. Pauses when the
// document is hidden (Page Visibility API). On error the interval doubles
// up to `maxMs`; on success it resets to `intervalMs`.

function usePolling(fn: () => Promise<void>, intervalMs: number, enabled = true) {
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
