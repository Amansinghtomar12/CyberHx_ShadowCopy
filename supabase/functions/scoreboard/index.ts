// supabase/functions/scoreboard/index.ts
// CTFtime Feed — uses service_role (views depend on auth-gated tables)
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map(s => s.trim()).filter(Boolean);
// When set, only callers presenting this key are answered. The proxy on
// ctf.cyberhx.com sends it, so the public route is the cached one and a
// flood aimed straight at this function is refused before any query.
const FEED_KEY = Deno.env.get('FEED_KEY') ?? '';

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
  if (FEED_KEY && req.headers.get('x-feed-key') !== FEED_KEY) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...cors, 'Content-Type': 'application/json' },
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

    return new Response(JSON.stringify({ standings }), {
      headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=30' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});
