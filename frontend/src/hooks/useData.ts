// src/hooks/useData.ts
// All data-fetching hooks — unchanged logic, hardened data access

import { useState, useEffect, useCallback } from 'react';
import { supabase, DBChallenge, UserScore, TeamScore } from '../lib/supabase';

// ─────────────────────────────────────────
// CHALLENGES
// ─────────────────────────────────────────
export function useChallenges() {
  const [challenges, setChallenges] = useState<DBChallenge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
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

  useEffect(() => { fetch(); }, [fetch]);

  return { challenges, loading, error, refetch: fetch };
}

// ─────────────────────────────────────────
// SCOREBOARD
// ─────────────────────────────────────────
export function useScoreboard() {
  const [users, setUsers] = useState<UserScore[]>([]);
  const [teams, setTeams] = useState<TeamScore[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
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

  // submissions is not in the supabase_realtime publication, so this channel
  // never delivered an event; it only held a websocket open per player against
  // the free tier's concurrent connection limit. Poll instead, matching the
  // approach the rest of the app already takes.
  useEffect(() => {
    fetch();
    const interval = setInterval(fetch, 60000);
    return () => clearInterval(interval);
  }, [fetch]);

  return { users, teams, loading, refetch: fetch };
}

// ─────────────────────────────────────────
// TEAMS
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
