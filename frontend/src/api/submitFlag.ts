// src/api/submitFlag.ts
// Client-side functions for flag submission, hints — all via secure server-side RPCs/Edge Functions

import { supabase } from '../lib/supabase';

// The server refuses non-allowlisted players with a plain sentence; show a
// themed, on-brand refusal for it instead. Matched exactly against the
// server string in submit_flag_tx / unlock_hint.
const PLAY_GATE_SENTINEL = 'Your email is not on the registration list to play this event';
const PLAY_GATE_THEMED = 'ACCESS DENIED :: identity not on the roster — your email is not registered for this event.';
function themePlayGate(msg?: string): string | undefined {
  return msg === PLAY_GATE_SENTINEL ? PLAY_GATE_THEMED : msg;
}

// ── Submit flag via Edge Function (server-side validation) ────
export async function submitFlag(challengeId: string, flag: string, _userId: string) {
  // One request per submission. The server already answers "already solved"
  // and counts attempts; asking first cost two extra round trips per flag.
  const { data: invoked, error } = await supabase.functions.invoke('submit-flag', {
    body: { challengeId, flag },
  });

  let data = invoked;
  if (error) {
    // supabase-js reports every non-2xx as an error, but the function's
    // refusals (cooldown, attempt limit, no team, roster gate) carry a
    // readable body with the real message. Read it before giving up.
    const ctx = (error as { context?: Response }).context;
    try {
      data = ctx && typeof ctx.json === 'function' ? await ctx.json() : null;
    } catch {
      data = null;
    }
    if (!data || typeof data !== 'object') {
      return {
        correct: false,
        message: ctx?.status === 401
          ? 'Your session has expired — sign in again.'
          : 'The server could not check that flag. Try again in a moment.',
      };
    }
  }

  // The server refuses a late flag with { eventEnded: true } and no error
  // text; without this it read as a wrong flag.
  if (data.eventEnded && !data.correct) {
    return { correct: false, eventEnded: true, message: 'The event has ended — submissions are closed.' };
  }

  if (data.error) {
    return {
      correct: false,
      message: themePlayGate(data.error),
      attemptsLeft: data.attemptsLeft,
      maxAttempts: data.maxAttempts,
      locked: data.locked,
      alreadySolved: data.alreadySolved,
      eventEnded: data.eventEnded,
    };
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
    return { success: false, error: themePlayGate(data.error) };
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
