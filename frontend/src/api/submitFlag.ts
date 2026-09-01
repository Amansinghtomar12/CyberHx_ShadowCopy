// src/api/submitFlag.ts
// Client-side functions for flag submission, hints — all via secure server-side RPCs/Edge Functions

import { supabase } from '../lib/supabase';

// ── Submit flag via Edge Function (server-side validation) ────
export async function submitFlag(challengeId: string, flag: string, userId: string) {
  // Check if already solved (client-side quick check)
  const { data: solvedCheck } = await supabase
    .from('submissions')
    .select('id')
    .eq('user_id', userId)
    .eq('challenge_id', challengeId)
    .eq('is_correct', true)
    .maybeSingle();

  if (solvedCheck) {
    return { correct: true, alreadySolved: true, message: 'Already solved!' };
  }

  // Check attempt count
  const { count } = await supabase
    .from('submissions')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('challenge_id', challengeId);

  // Submit via Edge Function
  const { data, error } = await supabase.functions.invoke('submit-flag', {
    body: { challengeId, flag },
  });

  if (error) {
    return { correct: false, message: 'Server error. Try again.' };
  }

  if (data.error) {
    return { correct: false, message: data.error };
  }

  return {
    correct: data.correct,
    message: data.correct
      ? 'Operation compromised'
      : 'Access Denied: Invalid Key Sequence',
    points: data.points,
    attemptsLeft: data.attemptsLeft,
    maxAttempts: data.maxAttempts,
    locked: data.locked,
    alreadySolved: data.alreadySolved,
    eventEnded: data.eventEnded,
  };
}

// ── Unlock a hint via secure RPC ──────────────────────
export async function unlockHint(userId: string, hintId: string) {
  const { data, error } = await supabase.rpc('unlock_hint', { p_hint_id: hintId });

  if (error) {
    return { success: false, error: error.message };
  }

  if (data?.error) {
    return { success: false, error: data.error };
  }

  return { success: true, text: data?.text };
}

// ── Admin: reset event scores via secure RPC ──────────
export async function resetEventScores() {
  const { data, error } = await supabase.rpc('admin_reset_event');

  if (error) {
    return { success: false, error: error.message };
  }

  if (data?.error) {
    return { success: false, error: data.error };
  }

  return { success: true };
}

// ── Get list of hint IDs the user has already unlocked ─
export async function getUnlockedHints(userId: string): Promise<string[]> {
  const { data } = await supabase
    .from('hint_unlocks')
    .select('hint_id')
    .eq('user_id', userId);

  return (data ?? []).map((h: any) => h.hint_id);
}
