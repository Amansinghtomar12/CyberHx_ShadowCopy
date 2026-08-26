#!/usr/bin/env node
/**
 * Zero-dependency load generator for the CyberHX CTF platform.
 *
 * WHY THIS EXISTS
 *   Nobody can tell you the right Supabase compute size from a spec sheet. The
 *   only honest way to pick one is to push the real endpoints at the rate your
 *   event will produce and watch where latency turns upward. This reproduces
 *   the traffic mix the actual client generates, weighted by the real poll
 *   intervals in the code, so the number it gives you means something.
 *
 * WHAT IT SENDS
 *   The read paths every logged-in player hits on a timer. Weights come from
 *   the intervals in useData.ts / App.tsx:
 *
 *     notifications        every 2 min   -> 30/user/hour
 *     own submissions      every 2 min   -> 30/user/hour
 *     challenges           every 5 min   -> 12/user/hour
 *     scoreboard_state     every 15 min  ->  4/user/hour
 *     team_scores          every 15 min  ->  4/user/hour
 *
 *   ~80 requests per user per hour. 5000 users therefore land around
 *   110 req/s sustained, which is the default target below.
 *
 *   It does NOT submit flags. Writes would pollute your real event data, and
 *   the read paths are what actually saturate the database.
 *
 * USAGE
 *   Read-only endpoints still require a session, so give it a real player JWT
 *   (DevTools -> Application -> Local Storage -> sb-*-auth-token -> access_token).
 *
 *     export SUPABASE_URL="https://xxxx.supabase.co"
 *     export ANON_KEY="sb_publishable_..."
 *     export JWT="eyJ..."
 *     node scripts/loadtest.mjs --rate 110 --duration 120
 *
 *   Ramp to find the knee rather than guessing:
 *     node scripts/loadtest.mjs --ramp 20,60,110,200 --duration 60
 *
 * SAFETY
 *   Point this at production deliberately and never during the event. Start
 *   low. Watch CPU and memory in the Supabase dashboard while it runs -- the
 *   dashboard graph is the actual output of this exercise; the numbers printed
 *   here only tell you what the client experienced.
 */

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const SUPABASE_URL = process.env.SUPABASE_URL;
const ANON_KEY = process.env.ANON_KEY;
const JWT = process.env.JWT || ANON_KEY;

if (!SUPABASE_URL || !ANON_KEY) {
  console.error('Set SUPABASE_URL and ANON_KEY (and ideally JWT). See the header of this file.');
  process.exit(1);
}
if (!process.env.JWT) {
  console.warn('⚠  No JWT set — every authenticated endpoint will return 401 and the run will\n' +
               '   measure your rate limiter, not your database. Get one from DevTools.\n');
}

const DURATION = Number(arg('duration', 60));
const RAMP = arg('ramp', null);
const RATE = Number(arg('rate', 110));

const H = {
  apikey: ANON_KEY,
  Authorization: `Bearer ${JWT}`,
  'Content-Type': 'application/json',
  Accept: 'application/json',
};

// Weighted to match the real client's poll intervals (see header).
const MIX = [
  { w: 30, name: 'notifications', go: () =>
      fetch(`${SUPABASE_URL}/rest/v1/notifications?select=*&order=created_at.desc&limit=20`, { headers: H }) },
  { w: 30, name: 'own-submissions', go: () =>
      fetch(`${SUPABASE_URL}/rest/v1/submissions?select=challenge_id,is_correct&limit=200`, { headers: H }) },
  { w: 12, name: 'challenges', go: () =>
      fetch(`${SUPABASE_URL}/rest/v1/public_challenges?select=id,title,category,difficulty,points,description,author,is_visible,tags,created_at,max_attempts,connection_info&is_visible=eq.true`, { headers: H }) },
  { w: 4, name: 'scoreboard_state', go: () =>
      fetch(`${SUPABASE_URL}/rest/v1/rpc/scoreboard_state`, { method: 'POST', headers: H, body: '{}' }) },
  { w: 4, name: 'team_scores', go: () =>
      fetch(`${SUPABASE_URL}/rest/v1/team_scores?select=*&order=total_points.desc&limit=10`, { headers: H }) },
];

const TOTAL_W = MIX.reduce((a, m) => a + m.w, 0);
const pick = () => {
  let r = Math.random() * TOTAL_W;
  for (const m of MIX) { if ((r -= m.w) < 0) return m; }
  return MIX[0];
};

const pct = (sorted, p) =>
  sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] : 0;

async function phase(rate, seconds) {
  const lat = [];
  const codes = new Map();
  const perEndpoint = new Map();
  let sent = 0, done = 0, failed = 0, authFailed = 0;
  const started = Date.now();
  const inFlight = new Set();

  const fire = () => {
    const m = pick();
    sent++;
    const t0 = performance.now();
    const p = m.go()
      .then(r => {
        codes.set(r.status, (codes.get(r.status) ?? 0) + 1);
        // 401/403 mean the JWT is missing or expired -- a setup problem, not
        // the database running out of room. Counting them as capacity failures
        // is how you end up buying compute you did not need.
        if (r.status === 401 || r.status === 403) authFailed++;
        else if (r.status >= 400) failed++;
        return r.text();
      })
      .catch(() => { failed++; codes.set('network-error', (codes.get('network-error') ?? 0) + 1); })
      .finally(() => {
        const ms = performance.now() - t0;
        lat.push(ms);
        const e = perEndpoint.get(m.name) ?? { n: 0, sum: 0, max: 0 };
        e.n++; e.sum += ms; e.max = Math.max(e.max, ms);
        perEndpoint.set(m.name, e);
        done++; inFlight.delete(p);
      });
    inFlight.add(p);
  };

  // Even spacing rather than bursts: a real crowd arrives smoothly.
  const gapMs = 1000 / rate;
  await new Promise(resolve => {
    const timer = setInterval(() => {
      if (Date.now() - started >= seconds * 1000) { clearInterval(timer); resolve(); return; }
      fire();
    }, gapMs);
  });
  await Promise.allSettled([...inFlight]);

  lat.sort((a, b) => a - b);
  const elapsed = (Date.now() - started) / 1000;
  return {
    rate, sent, done, failed, authFailed,
    authPct: done ? ((authFailed / done) * 100).toFixed(2) : '0.00',
    actualRps: (done / elapsed).toFixed(1),
    errPct: done ? ((failed / done) * 100).toFixed(2) : '0.00',
    p50: pct(lat, 0.50).toFixed(0),
    p95: pct(lat, 0.95).toFixed(0),
    p99: pct(lat, 0.99).toFixed(0),
    max: lat.length ? lat[lat.length - 1].toFixed(0) : '0',
    codes: [...codes.entries()].sort((a, b) => b[1] - a[1]),
    perEndpoint: [...perEndpoint.entries()]
      .map(([k, v]) => [k, (v.sum / v.n).toFixed(0), v.max.toFixed(0)])
      .sort((a, b) => Number(b[1]) - Number(a[1])),
  };
}

function report(r) {
  console.log(`\n── ${r.rate} req/s target ─────────────────────────────`);
  console.log(`   achieved   ${r.actualRps} req/s over ${r.done} requests`);
  console.log(`   latency    p50 ${r.p50}ms   p95 ${r.p95}ms   p99 ${r.p99}ms   max ${r.max}ms`);
  console.log(`   errors     ${r.failed} capacity (${r.errPct}%)   ${r.authFailed} auth/401 (${r.authPct}%)`);
  console.log(`   statuses   ${r.codes.map(([c, n]) => `${c}:${n}`).join('  ')}`);
  console.log(`   slowest    ${r.perEndpoint.slice(0, 3).map(([k, avg, mx]) => `${k} avg ${avg}ms/max ${mx}ms`).join('   ')}`);

  const p95 = Number(r.p95), err = Number(r.errPct), auth = Number(r.authPct);
  if (auth > 50)       console.log(`   ⚠  mostly 401s — your JWT is missing or expired. This run measured nothing.`);
  else if (err > 1)    console.log(`   ❌ over 1% capacity errors — past what the instance can serve`);
  else if (p95 > 1500) console.log(`   ❌ p95 above 1.5s — players will call this broken`);
  else if (p95 > 700)  console.log(`   ⚠  p95 above 700ms — usable, but this is the knee. Size up.`);
  else                 console.log(`   ✅ healthy at this rate`);
}

(async () => {
  console.log(`Target ${SUPABASE_URL}`);
  console.log(`Mix: ${MIX.map(m => `${m.name}(${((m.w / TOTAL_W) * 100).toFixed(0)}%)`).join('  ')}`);

  const rates = RAMP ? RAMP.split(',').map(Number) : [RATE];
  const results = [];
  for (const rate of rates) {
    const r = await phase(rate, DURATION);
    report(r);
    results.push(r);
  }

  if (results.length > 1) {
    console.log(`\n═══ SUMMARY ═══════════════════════════════════════`);
    console.log(`  rate    achieved   p50     p95     p99     errors`);
    for (const r of results) {
      console.log(`  ${String(r.rate).padEnd(7)} ${String(r.actualRps).padEnd(10)} ${String(r.p50 + 'ms').padEnd(7)} ${String(r.p95 + 'ms').padEnd(7)} ${String(r.p99 + 'ms').padEnd(7)} ${r.errPct}%`);
    }
    const ok = results.filter(r =>
      Number(r.p95) < 700 && Number(r.errPct) < 1 && Number(r.authPct) < 50);
    console.log(ok.length
      ? `\n  Highest healthy rate: ${ok[ok.length - 1].rate} req/s.` +
        `\n  You need ~110 req/s for 5000 users. ${ok[ok.length - 1].rate >= 110
          ? 'This instance is big enough.' : 'SIZE UP before the event.'}`
      : `\n  No tested rate stayed healthy. Size up and re-run.`);
  }
  console.log(`\nThe real output is the CPU/memory graph in your Supabase dashboard\n` +
              `during this run. Watch it there.\n`);
})();
