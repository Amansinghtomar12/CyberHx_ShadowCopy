// supabase/functions/submit-flag/index.ts
// HARDENED v3: rate limiting, atomic attempts, strict CORS
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map(s => s.trim()).filter(Boolean);
const RATE_LIMIT_SECONDS = 10; // min seconds between submissions per user per challenge
const GLOBAL_RATE_LIMIT = 30; // max submissions per user per minute across all challenges

// In-memory rate limit store (per Edge Function instance)
const globalRateLimits = new Map<string, number[]>();

function getCorsHeaders(origin: string | null) {
  // Strict CORS: only allow configured origins
  if (ALLOWED_ORIGINS.length === 0) {
    return {
      'Access-Control-Allow-Origin': origin ?? '*',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'X-Content-Type-Options': 'nosniff',
    };
  }
  const allowed = ALLOWED_ORIGINS.includes(origin ?? '');
  return {
    'Access-Control-Allow-Origin': allowed ? origin! : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'X-Content-Type-Options': 'nosniff',
  };
}

function checkGlobalRateLimit(userId: string): boolean {
  const now = Date.now();
  const window = 60_000; // 1 minute
  const timestamps = globalRateLimits.get(userId) ?? [];
  const recent = timestamps.filter(t => now - t < window);
  globalRateLimits.set(userId, recent);
  return recent.length < GLOBAL_RATE_LIMIT;
}

function recordGlobalAttempt(userId: string) {
  const timestamps = globalRateLimits.get(userId) ?? [];
  timestamps.push(Date.now());
  globalRateLimits.set(userId, timestamps);
}

serve(async (req) => {
  const origin = req.headers.get('Origin');
  const cors = getCorsHeaders(origin);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { ...cors, 'Content-Type': 'application/json' }
    });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // 1. Authenticate
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }

    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }

    // 2. Global rate limit (in-memory, per Edge Function instance)
    if (!checkGlobalRateLimit(user.id)) {
      return new Response(JSON.stringify({
        correct: false, error: 'Too many submissions. Slow down.'
      }), { status: 429, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    // 3. Check banned
    const { data: profile } = await supabaseAdmin
      .from('profiles').select('is_banned, team_id').eq('id', user.id).single();

    if (!profile || profile.is_banned) {
      return new Response(JSON.stringify({ error: 'Account banned' }), {
        status: 403, headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }

    // 4. Parse + validate input
    const { challengeId, flag } = await req.json();

    if (!challengeId || typeof challengeId !== 'string' || challengeId.length > 50) {
      return new Response(JSON.stringify({ error: 'Invalid challenge ID' }), {
        status: 400, headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }
    if (!flag || typeof flag !== 'string' || flag.length > 500 || flag.length === 0) {
      return new Response(JSON.stringify({ error: 'Invalid flag' }), {
        status: 400, headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }

    // 5. Check active event
    const { data: event } = await supabaseAdmin
      .from('event_settings').select('id, is_active, start_time, end_time').eq('id', 1).single();

    if (!event?.is_active) {
      return new Response(JSON.stringify({ correct: false, error: 'Event not active' }), {
        headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }

    const now = new Date();
    if (event.start_time && new Date(event.start_time) > now) {
      return new Response(JSON.stringify({ correct: false, error: 'Event has not started' }), {
        headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }
    if (event.end_time && new Date(event.end_time) < now) {
      return new Response(JSON.stringify({ correct: false, eventEnded: true }), {
        headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }

    // 6. Get challenge
    const { data: challenge, error: challengeError } = await supabaseAdmin
      .from('challenges').select('id, points, is_visible, max_attempts')
      .eq('id', challengeId).single();

    if (challengeError || !challenge || !challenge.is_visible) {
      return new Response(JSON.stringify({ error: 'Challenge not found' }), {
        status: 404, headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }

    // 7. Already solved?
    const { data: solvedCheck } = await supabaseAdmin
      .from('submissions').select('id')
      .eq('user_id', user.id).eq('challenge_id', challengeId).eq('is_correct', true).limit(1);

    if (solvedCheck && solvedCheck.length > 0) {
      return new Response(JSON.stringify({ correct: true, alreadySolved: true }), {
        headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }

    // 8. Check attempt limit
    const maxAttempts: number = challenge.max_attempts > 0 ? challenge.max_attempts : 9999;

    const { count: usedAttempts } = await supabaseAdmin
      .from('submissions').select('*', { count: 'exact', head: true })
      .eq('user_id', user.id).eq('challenge_id', challengeId);

    if ((usedAttempts ?? 0) >= maxAttempts) {
      return new Response(JSON.stringify({
        correct: false, locked: true, maxAttempts, attemptsLeft: 0
      }), { headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    // 9. ★ Per-challenge rate limit: 10 second cooldown
    const { data: recentSub } = await supabaseAdmin
      .from('submissions').select('submitted_at')
      .eq('user_id', user.id).eq('challenge_id', challengeId)
      .order('submitted_at', { ascending: false }).limit(1).maybeSingle();

    if (recentSub) {
      const secondsSinceLast = (Date.now() - new Date(recentSub.submitted_at).getTime()) / 1000;
      if (secondsSinceLast < RATE_LIMIT_SECONDS) {
        return new Response(JSON.stringify({
          correct: false,
          error: `Too fast. Wait ${Math.ceil(RATE_LIMIT_SECONDS - secondsSinceLast)}s.`
        }), { status: 429, headers: { ...cors, 'Content-Type': 'application/json' } });
      }
    }

    // 10. Get flag hash from secrets (service_role only)
    const { data: secret } = await supabaseAdmin
      .from('challenge_secrets').select('flag_hash, flag_type, flag_regex')
      .eq('challenge_id', challengeId).single();

    if (!secret) {
      console.error('No secret for challenge:', challengeId);
      return new Response(JSON.stringify({ error: 'Challenge misconfigured' }), {
        status: 500, headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }

    // 11. Compare flag
    const trimmedFlag = flag.trim();
    let isCorrect = false;

    if (secret.flag_type === 'static') {
      const encoder = new TextEncoder();
      const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(trimmedFlag));
      const submittedHash = Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, '0')).join('');
      isCorrect = submittedHash === secret.flag_hash;
    } else if (secret.flag_type === 'regex' && secret.flag_regex) {
      try { isCorrect = new RegExp(secret.flag_regex).test(trimmedFlag); }
      catch { isCorrect = false; }
    }

    const attemptsLeft = maxAttempts - (usedAttempts ?? 0) - 1;

    // 12. Hash submitted flag for storage
    const submittedFlagHash = await (async () => {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(trimmedFlag));
      return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    })();

    // 13. Log submission (trigger_enforce_max_attempts runs here atomically)
    const { error: insertError } = await supabaseAdmin.from('submissions').insert({
      user_id: user.id,
      challenge_id: challengeId,
      team_id: profile.team_id,
      submitted_flag_hash: submittedFlagHash,
      is_correct: isCorrect,
      ip_address: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    });

    // If the DB trigger blocked it (max attempts race condition protection)
    if (insertError) {
      if (insertError.message?.includes('Max attempts exceeded')) {
        return new Response(JSON.stringify({
          correct: false, locked: true, maxAttempts, attemptsLeft: 0
        }), { headers: { ...cors, 'Content-Type': 'application/json' } });
      }
      throw insertError;
    }

    // Record in global rate limiter
    recordGlobalAttempt(user.id);

    return new Response(JSON.stringify({
      correct: isCorrect,
      points: isCorrect ? challenge.points : 0,
      attemptsLeft: isCorrect ? maxAttempts : attemptsLeft,
      maxAttempts,
    }), { headers: { ...cors, 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error('submit-flag error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...getCorsHeaders(req.headers.get('Origin')), 'Content-Type': 'application/json' }
    });
  }
});
