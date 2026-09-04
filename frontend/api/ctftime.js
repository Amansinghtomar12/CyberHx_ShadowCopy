// CTFtime scoreboard feed, served from ctf.cyberhx.com.
//
// CTFtime fetches this URL with no headers, and Supabase's function gateway
// needs the project API key, so something has to sit in between. Putting
// that something on Vercel also puts Cloudflare and Vercel's edge cache in
// front of the feed: the answer is cached for 30 seconds, so a flood on
// this URL is absorbed here and Supabase sees at most a couple of requests
// a minute. If FEED_KEY is set here and in the Supabase function's secrets,
// the function refuses any caller that does not present it, which closes
// the direct route too.

const PROJECT_URL = process.env.VITE_SUPABASE_URL || 'https://ikdyrqwdltinghuecvsb.supabase.co';
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || '';
const FEED_KEY = process.env.FEED_KEY || '';

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const headers = { apikey: ANON_KEY, accept: 'application/json' };
  if (FEED_KEY) headers['x-feed-key'] = FEED_KEY;

  let upstream;
  try {
    upstream = await fetch(`${PROJECT_URL}/functions/v1/scoreboard`, { headers });
  } catch {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(502).json({ error: 'Feed unavailable' });
  }

  if (!upstream.ok) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(502).json({ error: 'Feed unavailable' });
  }

  const body = await upstream.text();
  // s-maxage is what Vercel's edge honours; stale-while-revalidate keeps
  // answering from the last good copy while a fresh one is fetched.
  res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=30, stale-while-revalidate=120');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  return res.status(200).send(body);
}
