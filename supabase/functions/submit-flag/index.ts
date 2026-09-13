// supabase/functions/submit-flag/index.ts
// HARDENED v4: per-IP budget at the edge, everything else in one DB transaction
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Default to the live site so an unset env never falls back to reflecting an
// arbitrary Origin. Set ALLOWED_ORIGINS (comma-separated) to override/extend.
const DEFAULT_ORIGINS = ['https://ctf.cyberhx.com'];
const _envOrigins = (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map(s => s.trim()).filter(Boolean);
const ALLOWED_ORIGINS = _envOrigins.length ? _envOrigins : DEFAULT_ORIGINS;

// What lives where:
//   here      CORS, the per-IP budget (before JWT verification, so a flood
//             costs one indexed SELECT and no RS256 verify), JWT verification,
//             input validation.
//   database  ban, team, event window, challenge, solved-check, the 10s
//             per-challenge cooldown, the attempt cap, hash compare and the
//             INSERT -- all inside submit_flag_tx in one transaction, with the
//             30/min cap and max-attempts triggers as the backstop. One round
//             trip instead of eight. See migration 20260901020000.

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

    // 0. The per-network budget (600/min per address) now lives inside
    // submit_flag_tx, after the caller is authenticated and known not to be
    // banned. Spending it here, before the JWT check and keyed on the
    // client-controllable leftmost x-forwarded-for hop, let anyone with the
    // anon key exhaust a rival campus's budget with a spoofed header and no
    // account. The address still travels with the request for that check
    // and for the audit column; it is never trusted for anything else.
    const clientIp = (req.headers.get('x-forwarded-for') ?? '')
      .split(',')[0]?.trim().slice(0, 64);

    // 1. Authenticate
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }

    // Verify the caller's JWT with the admin client. SUPABASE_ANON_KEY is a
    // deprecated reserved secret, and a second client is unnecessary: getUser
    // validates whatever token it is handed.
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(
      authHeader.replace(/^Bearer\s+/i, '')
    );
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }

    // 2. Validate input before spending a database call on it. A body that is
    // not JSON is the caller's mistake, not a server fault.
    let body: { challengeId?: unknown; flag?: unknown } | null = null;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid request body' }), {
        status: 400, headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }
    const { challengeId, flag } = body ?? {};

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

    // Reject control characters. Postgres TEXT columns cannot hold a NUL byte
    // and the plaintext audit log column would throw at insert time; without
    // this the whole request 500'd on any submission containing \x00 through
    // \x1F or \x7F. A well-formed flag never contains those, so refusing at
    // the API layer is safe.
    if (/[\x00-\x1F\x7F]/.test(flag)) {
      return new Response(JSON.stringify({ error: 'Invalid flag: control characters are not allowed' }), {
        status: 400, headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }

    // The RPC takes a uuid. Anything else used to fall out of PostgREST as a
    // cast error that the old code mapped to 404; keep that answer.
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(challengeId)) {
      return new Response(JSON.stringify({ error: 'Challenge not found' }), {
        status: 404, headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }

    // 3. Everything else -- ban, team, event window, challenge, solved-check,
    // attempt cap, cooldown, hash compare, insert -- is one transaction in
    // submit_flag_tx. It returns { status, body } in the exact shapes this
    // function used to build itself, so the client sees no difference; see
    // migration 20260901020000 for the contract and the two races it closes.
    const { data, error: rpcError } = await supabaseAdmin.rpc('submit_flag_tx', {
      p_user_id: user.id,
      p_challenge_id: challengeId,
      p_flag: flag,
      p_ip: clientIp || null,
    });

    if (rpcError || !data || typeof data.status !== 'number') {
      console.error('submit_flag_tx failed:', rpcError ?? data);
      throw rpcError ?? new Error('submit_flag_tx returned no status');
    }

    return new Response(JSON.stringify(data.body), {
      status: data.status, headers: { ...cors, 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('submit-flag error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...getCorsHeaders(req.headers.get('Origin')), 'Content-Type': 'application/json' }
    });
  }
});
