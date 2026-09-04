// supabase/functions/scoreboard/index.ts
// CTFtime Feed — uses service_role (views depend on auth-gated tables)
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map(s => s.trim()).filter(Boolean);

function getCorsHeaders(origin: string | null) {
  if (ALLOWED_ORIGINS.length === 0) {
    return {
      'Access-Control-Allow-Origin': origin ?? '*',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
    };
  }
  const allowed = ALLOWED_ORIGINS.includes(origin ?? '');
  return {
    'Access-Control-Allow-Origin': allowed ? origin! : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
  };
}

// The feed is public and unauthenticated, so it is the one endpoint a
// stranger can hammer. Standings only change on a solve, and CTFtime polls
// every few minutes; a 30-second cache means a flood costs invocations,
// which are cheap, rather than database time, which is shared with players.
const CACHE_MS = 30_000;
let cached: { body: string; at: number } | null = null;

serve(async (req) => {
  const origin = req.headers.get('Origin');
  const cors = getCorsHeaders(origin);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  if (cached && Date.now() - cached.at < CACHE_MS) {
    return new Response(cached.body, {
      headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=30', 'X-Cache': 'HIT' },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: teams, error } = await supabase
      .from('team_scores')
      .select('name, total_points, last_solve')
      .order('total_points', { ascending: false })
      .order('last_solve', { ascending: true });

    if (error) throw error;

    const standings = (teams ?? []).map((team: any, index: number) => ({
      pos: index + 1,
      team: team.name,
      score: team.total_points ?? 0,
    }));

    const body = JSON.stringify({ standings });
    cached = { body, at: Date.now() };
    return new Response(body, {
      headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=30', 'X-Cache': 'MISS' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});
