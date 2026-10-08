'use strict';
/**
 * mock.cjs — a route-based stand-in for the Supabase backend.
 *
 * Everything in here is SYNTHETIC. Fictional teams (Vanara Scouts, Lanka
 * Watch, ...), fictional players (player_one ...) and an invented ledger. No
 * real event data lives in this file.
 *
 * createMock(opts) builds one consistent dataset for a moment in time and
 * returns a `handle(route)` that answers PostgREST tables under /rest/v1/<t>,
 * RPCs under /rest/v1/rpc/<name>, GoTrue under /auth/v1/*, and the
 * submit-flag edge function. Unknown tables answer [] and unknown RPCs null,
 * and both are recorded in `mock.gaps` so holes are visible, never silent.
 */
const crypto = require('crypto');

const HOST = 'mock.supabase.co';
const ME_ID = '11111111-1111-4111-8111-111111111111';
const MY_TEAM_ID = '22222222-0000-4000-8000-000000000001';
const EVENT_START = '2026-11-14T04:30:00Z';
const EVENT_END = '2026-11-14T16:30:00Z';
const T0 = Date.parse(EVENT_START);
const T1 = Date.parse(EVENT_END);

const uuid = (seed) => {
  const h = crypto.createHash('sha1').update(String(seed)).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
const iso = (ms) => new Date(ms).toISOString();
const atMin = (m) => iso(T0 + m * 60_000);
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
function rng(seed) { // mulberry32: deterministic, so every run draws the same board
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const DEFAULT_EVENT = {
  id: 1, name: 'CyberHX Open 2026', description: 'Twelve hours. Ten categories. One board.',
  start_time: EVENT_START, end_time: EVENT_END, is_active: true, is_paused: false, paused_at: null, pause_message: null,
  mode: 'teams', team_size: 4, allow_team_changes: true, registration_open: true, registration_allowlist_only: false,
  freeze_scoreboard: false, freeze_time: null, auto_froze_at: null, hide_scores: false,
  chain_experience_enabled: true, b2r_enabled: true, created_at: '2026-10-01T00:00:00Z',
};

// ── Catalogue ──────────────────────────────────────────────────────────────
const LINK = (label, url) => JSON.stringify([{ label, url }]);
const FILE = (key, name, size) => ({ id: uuid('file:' + key), name, url: `https://files.example.test/${key}/${name}`, size_bytes: size });
const HINT = (key, cost, content) => ({ id: uuid('hint:' + key), cost, content });
const DESC = (title, body) => `${body}\n\n**Flag format:** \`CTF{...}\`\n\n> Operation *${title}* — synthetic brief for visual QA.`;

let order = 0;
function ch(key, title, category, difficulty, points, x = {}) {
  order += 1;
  return {
    id: uuid('ch:' + key), key, title, category, difficulty, points,
    description: x.description || DESC(title, x.body || `Recover the key hidden in **${title}**. Attachments and connection details, when present, are below.`),
    author: x.author || 'quartermaster', is_visible: true, tags: x.tags || [category, difficulty.toLowerCase()],
    created_at: iso(T0 - (400 - order) * 3_600_000), max_attempts: x.max_attempts ?? 15,
    connection_info: x.link || null, files: x.files || [], hints: x.hints || [],
  };
}

const FREE = [
  ch('robots', 'Robots Welcome', 'web', 'Easy', 100, { body: 'A crawler politely declined to index one path. Humans were not supposed to read it either.\n\n1. Read what the robots were told.\n2. Follow the path they avoided.\n3. The index speaks JSON.', link: LINK('Target: robots.lab.example.test', 'https://robots.lab.example.test/'), files: [FILE('robots', 'robots-site.zip', 4_300_000)], hints: [HINT('robots-0', 0, 'Check /robots.txt — the crawler rules name a path humans were not meant to read.'), HINT('robots-1', 500, 'The disallowed path serves a JSON index; one key holds the flag, base64-encoded.')] }),
  ch('cookie', 'Cookie Monster', 'web', 'Medium', 250, { link: LINK('Target: bakery.lab.example.test', 'https://bakery.lab.example.test/') }),
  ch('template', 'Template of Doom', 'web', 'Hard', 500, { link: LINK('Target: render.lab.example.test', 'https://render.lab.example.test/'), max_attempts: 10 }),
  ch('caesar', "Caesar's Ghost", 'crypto', 'Easy', 100, { body: 'Thirteen is a lucky number for someone.' }),
  ch('padding', 'Padding Oracle Lite', 'crypto', 'Medium', 300, { files: [FILE('padding', 'oracle.py', 2_100)] }),
  ch('lattice', 'Lattice Whisper', 'crypto', 'Hard', 600, { files: [FILE('lattice', 'params.txt', 900)], hints: [HINT('lattice-0', 500, 'The modulus is tiny for the dimension. LLL finishes before your coffee does.')] }),
  ch('pixel', 'Pixel Dust', 'steg', 'Easy', 100, { files: [FILE('pixel', 'banner.png', 1_850_000)] }),
  ch('audible', 'Audible Noise', 'steg', 'Medium', 250, { files: [FILE('audible', 'transmission.wav', 12_600_000)] }),
  ch('strings', 'Strings Attached', 'rev', 'Easy', 150, { files: [FILE('strings', 'puzzlebox', 48_000)] }),
  ch('unpack', 'Unpacking Day', 'rev', 'Medium', 300, { files: [FILE('unpack', 'packed.exe', 310_000)] }),
  ch('vm', 'Vanishing VM', 'rev', 'Hard', 550, { files: [FILE('vm', 'vm.bin', 92_000), FILE('vm2', 'program.vmc', 4_400)] }),
  ch('stack', 'Stack Smash 101', 'pwn', 'Easy', 150, { link: LINK('nc pwn.lab.example.test 31337', 'https://pwn.lab.example.test/stack') }),
  ch('heap', 'Heap of Trouble', 'pwn', 'Medium', 350, { link: LINK('nc pwn.lab.example.test 31338', 'https://pwn.lab.example.test/heap'), files: [FILE('heap', 'heap.tar.gz', 1_200_000)], hints: [HINT('heap-0', 0, 'tcache. Always tcache.')] }),
  ch('ret2lanka', 'Ret2Lanka', 'pwn', 'Hard', 650, { link: LINK('nc pwn.lab.example.test 31339', 'https://pwn.lab.example.test/lanka') }),
  ch('deleted', 'Deleted Not Gone', 'forensic', 'Easy', 100, { files: [FILE('deleted', 'usb.img.xz', 38_000_000)] }),
  ch('memory', 'Memory Lane', 'forensic', 'Medium', 300, { files: [FILE('memory', 'memdump.lime.7z', 512_000_000)] }),
  ch('hanuman', 'Where Was Hanuman', 'osint', 'Easy', 100, { body: 'One photograph, one skyline, one timestamp. Name the bridge.' }),
  ch('metadata', 'Metadata Trail', 'osint', 'Medium', 250, { files: [FILE('metadata', 'gallery.zip', 9_900_000)] }),
  ch('apk', 'APK Lockbox', 'mobile', 'Medium', 300, { files: [FILE('apk', 'lockbox.apk', 6_700_000)] }),
  ch('intent', 'Intent to Leak', 'mobile', 'Hard', 500, { files: [FILE('intent', 'leaky.apk', 8_100_000)] }),
  ch('recon', 'Pre-Boot Recon', 'b2r', 'Easy', 100, { body: 'Before you root anything, enumerate. The service banner says more than it should.', link: LINK('Target: 10.10.14.7', 'https://b2r.lab.example.test/recon') }),
  ch('sanity', 'Sanity Check', 'misc', 'Easy', 50, { body: 'The flag is in the rules page. Yes, really.' }),
  ch('pyjail', 'Pyjail Picnic', 'misc', 'Medium', 250, { link: LINK('nc misc.lab.example.test 4000', 'https://misc.lab.example.test/jail') }),
  ch('ravana', "Ravana's Thousand Locks", 'misc', 'Insane', 1000, { body: 'Ten heads, ten ciphers, one key. Each lock rekeys the next; the order is not the order you think.\n\n```\n$ ./locks --heads 10 --mode chained\n[*] head 0 sealed\n```', link: LINK('Target: locks.lab.example.test', 'https://locks.lab.example.test/'), hints: [HINT('ravana-0', 500, 'Head seven is the weak one. Break it first and the rest fall in reverse.')], max_attempts: 5 }),
];
const CHAIN_A = [ // Ashoka Vatika
  ch('garden', 'Garden Gate', 'web', 'Easy', 100), ch('sita', "Sita's Cipher", 'crypto', 'Medium', 200),
  ch('leap', "Hanuman's Leap", 'web', 'Medium', 250), ch('tail', 'Burning Tail', 'pwn', 'Hard', 400), ch('ring', 'Ring of Rama', 'crypto', 'Hard', 500),
];
const CHAIN_B = [ // Setu Bridge
  ch('stone', 'First Stone', 'forensic', 'Easy', 100), ch('logs', 'Floating Logs', 'forensic', 'Medium', 250),
  ch('tide', 'Tide Tables', 'osint', 'Medium', 250), ch('strait', 'Across the Strait', 'rev', 'Hard', 500),
];
const b2rFlag = (key, title, pts, diff) => ch(key, title, 'b2r', diff, pts, { tags: ['b2r'], link: LINK('Target: 10.10.14.21', 'https://b2r.lab.example.test/') });
const B2R_FLAGS = {
  ravanaU: b2rFlag('rg-user', 'Ravana Gateway — user', 200, 'Medium'), ravanaR: b2rFlag('rg-root', 'Ravana Gateway — root', 400, 'Hard'),
  kumbhU: b2rFlag('kn-user', 'Kumbhakarna Node — user', 200, 'Medium'), kumbhR: b2rFlag('kn-root', 'Kumbhakarna Node — root', 400, 'Hard'),
  indraU: b2rFlag('ir-user', 'Indrajit Relay — user', 250, 'Hard'), indraR: b2rFlag('ir-root', 'Indrajit Relay — root', 500, 'Insane'),
};
const ALL = [...FREE, ...CHAIN_A, ...CHAIN_B, ...Object.values(B2R_FLAGS)];
const byKey = Object.fromEntries(ALL.map(c => [c.key, c]));

const CHAIN_SERIES = [
  { id: uuid('series:ashoka'), title: 'Ashoka Vatika', category: 'web', description: 'Five linked operations through the palace garden. Each gate opens the next.', readme: '# Ashoka Vatika\n\nWork the gates **in order**. The cipher from gate two is the key for gate three.', readme_url: 'https://files.example.test/ashoka/briefing.pdf', difficulty: 'Medium', display_order: 1, challenge_count: 5, members: CHAIN_A },
  { id: uuid('series:setu'), title: 'Setu Bridge', category: 'forensic', description: 'Rebuild the bridge stone by stone from a drowned disk image.', readme: '', readme_url: null, difficulty: 'Hard', display_order: 2, challenge_count: 4, members: CHAIN_B },
];
const B2R_SERIES = [{ id: uuid('b2rseries:lanka'), title: 'Lanka Siege', category: 'b2r', description: 'Two machines guard the citadel. Root both to open the gate.', readme: '# Lanka Siege\n\nPivot from the node to the relay.', readme_url: null, difficulty: 'Hard', display_order: 1, box_count: 2 }];
const B2R_BOXES = [
  { id: uuid('box:ravana'), title: 'Ravana Gateway', category: 'b2r', description: 'A forgotten edge box with a very chatty web service.', difficulty: 'Medium', display_order: 1, readme_url: 'https://files.example.test/ravana/README.md', user: B2R_FLAGS.ravanaU, root: B2R_FLAGS.ravanaR, series_id: null, position: null },
  { id: uuid('box:kumbh'), title: 'Kumbhakarna Node', category: 'b2r', description: 'Sleeps most of the time. Wake it carefully.', difficulty: 'Hard', display_order: 2, readme_url: null, user: B2R_FLAGS.kumbhU, root: B2R_FLAGS.kumbhR, series_id: B2R_SERIES[0].id, position: 1 },
  { id: uuid('box:indra'), title: 'Indrajit Relay', category: 'b2r', description: 'Invisible on the network until it is not.', difficulty: 'Insane', display_order: 3, readme_url: null, user: B2R_FLAGS.indraU, root: B2R_FLAGS.indraR, series_id: B2R_SERIES[0].id, position: 2 },
];

// ── Teams, players, ledger ─────────────────────────────────────────────────
const TEAM_NAMES = ['Vanara Scouts', 'Lanka Watch', 'Pushpaka Flight', 'Ashoka Grove', 'Kishkindha Relay', 'Setu Builders', 'Saptarishi', 'Golden Deer', 'Panchavati', 'Dandaka Drift', 'Sanjeevani', 'Mandara Churn', 'Agni Pariksha', 'Indrajit Null'];
const STRENGTH = [0, 21, 18, 13, 12, 10, 9, 8, 7, 6, 5, 4, 3, 2]; // solves per team; index 0 is mine (explicit)
const COUNTRIES = ['India', 'India', 'Singapore', 'Germany', 'India', 'Brazil', 'Japan', 'India', 'Kenya', 'Canada', 'India', 'France', 'Australia', 'India'];
const MY_ROSTER = ['player_one', 'player_two', 'player_three', 'player_four'];
// My team's solves: [username, challenge key, minutes after start]
const MY_SOLVES = [
  ['player_one', 'sanity', 3], ['player_one', 'caesar', 41], ['player_two', 'cookie', 58], ['player_one', 'pixel', 65],
  ['player_two', 'hanuman', 77], ['player_three', 'stack', 88], ['player_one', 'strings', 98], ['player_four', 'metadata', 112], ['player_one', 'garden', 130],
  ['player_two', 'sita', 160], ['player_three', 'padding', 190], ['player_one', 'leap', 205], ['player_two', 'deleted', 230], ['player_four', 'unpack', 240],
  ['player_one', 'stone', 260], ['player_three', 'logs', 275], ['player_two', 'kn-user', 290], ['player_one', 'rg-user', 300], ['player_two', 'kn-root', 330],
];
const MY_HINT_UNLOCKS = [['player_two', 'lattice-0', 310]];
const MY_FAILS = [['player_one', 'template', 150], ['player_one', 'template', 152], ['player_one', 'template', 155], ['player_three', 'heap', 201]];

function buildWorld() {
  const teams = TEAM_NAMES.map((name, i) => ({
    id: i === 0 ? MY_TEAM_ID : uuid('team:' + name), name, country: COUNTRIES[i], website: i === 1 ? 'https://lankawatch.example.test' : null,
    affiliation: i === 0 ? 'Kishkindha Institute' : null, created_at: iso(T0 - (30 - i) * 86_400_000), is_banned: false, captain_id: null,
  }));
  const players = [];
  const member = (team, username, country) => { const p = { id: username === 'player_one' ? ME_ID : uuid('user:' + username), username, team_id: team.id, country, avatar_url: null, bio: null, website: null, affiliation: null, created_at: team.created_at }; players.push(p); return p; };
  MY_ROSTER.forEach(u => member(teams[0], u, 'India'));
  teams[0].captain_id = ME_ID;
  teams.slice(1).forEach((t, i) => {
    const short = t.name.toLowerCase().replace(/[^a-z]+/g, '_').replace(/_$/, '');
    const n = 2 + ((i * 7) % 3); // 2–4 members
    for (let k = 1; k <= n; k++) member(t, `${short}_${String(k).padStart(2, '0')}`, t.country);
    t.captain_id = players.find(p => p.team_id === t.id).id;
  });
  players.find(p => p.id === ME_ID).bio = 'Breaks things gently. Puts them back mostly.';

  // Ledger: every scoring event for every team, in time order.
  const ledger = []; // { team_id, username, challenge_id, points, at, event_key, kind }
  MY_SOLVES.forEach(([u, k, m]) => ledger.push({ team_id: MY_TEAM_ID, username: u, challenge_id: byKey[k].id, points: byKey[k].points, at: atMin(m), event_key: byKey[k].id, kind: 'solve' }));
  MY_HINT_UNLOCKS.forEach(([u, hk, m]) => { const hint = ALL.flatMap(c => c.hints.map(h => ({ ...h, challenge: c }))).find(h => h.id === uuid('hint:' + hk)); ledger.push({ team_id: MY_TEAM_ID, username: u, challenge_id: hint.challenge.id, points: -hint.cost, at: atMin(m), event_key: 'hint:' + hint.id, kind: 'hint', hint }); });
  const pool = [...FREE, ...CHAIN_A, ...CHAIN_B];
  teams.slice(1).forEach((t, i) => {
    const rand = rng(1000 + i);
    const roster = players.filter(p => p.team_id === t.id);
    const picked = new Set();
    let minute = 4 + Math.floor(rand() * 12);
    for (let s = 0; s < STRENGTH[i + 1]; s++) {
      let c; do { c = pool[Math.floor(rand() * pool.length)]; } while (picked.has(c.id));
      picked.add(c.id);
      minute += 8 + Math.floor(rand() * 42);
      if (minute > 710) break;
      ledger.push({ team_id: t.id, username: roster[s % roster.length].username, challenge_id: c.id, points: c.points, at: atMin(minute), event_key: c.id, kind: 'solve' });
    }
  });
  ledger.sort((a, b) => a.at.localeCompare(b.at));
  return { teams, players, ledger };
}
const WORLD = buildWorld();

// ── PostgREST filter evaluation ────────────────────────────────────────────
const SKIP = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns']);
const unq = (s) => s.replace(/^"(.*)"$/, '$1');
function cmp(a, b) { const na = Number(a), nb = Number(b); if (a != null && b !== '' && !Number.isNaN(na) && !Number.isNaN(nb)) return na - nb; return String(a ?? '').localeCompare(String(b)); }
function cond(row, key, expr) {
  if (!(key in row)) return true; // lenient: filters on columns the fixture lacks pass
  let neg = false; if (expr.startsWith('not.')) { neg = true; expr = expr.slice(4); }
  const dot = expr.indexOf('.'); const op = dot === -1 ? expr : expr.slice(0, dot); const val = dot === -1 ? '' : expr.slice(dot + 1);
  const v = row[key]; let r = true;
  switch (op) {
    case 'eq': r = String(v) === unq(val); break;
    case 'neq': r = String(v) !== unq(val); break;
    case 'gt': r = v != null && cmp(v, val) > 0; break;
    case 'gte': r = v != null && cmp(v, val) >= 0; break;
    case 'lt': r = v != null && cmp(v, val) < 0; break;
    case 'lte': r = v != null && cmp(v, val) <= 0; break;
    case 'in': r = val.slice(1, -1).split(',').map(unq).includes(String(v)); break;
    case 'is': r = val === 'null' ? v == null : val === 'true' ? v === true : val === 'false' ? v === false : true; break;
    case 'like': case 'ilike': r = new RegExp('^' + val.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.') + '$', op === 'ilike' ? 'i' : '').test(String(v ?? '')); break;
    default: r = true;
  }
  return neg ? !r : r;
}
function splitTop(s) { const out = []; let depth = 0, cur = ''; for (const c of s) { if (c === '(') depth++; if (c === ')') depth--; if (c === ',' && depth === 0) { out.push(cur); cur = ''; } else cur += c; } if (cur) out.push(cur); return out; }
function evalTerm(row, term) {
  const m = term.match(/^(not\.)?(and|or)\((.*)\)$/s);
  if (m) { const parts = splitTop(m[3]).map(t => evalTerm(row, t)); const r = m[2] === 'and' ? parts.every(Boolean) : parts.some(Boolean); return m[1] ? !r : r; }
  const dot = term.indexOf('.'); return cond(row, term.slice(0, dot), term.slice(dot + 1));
}
function applyQuery(rows, params) {
  let out = rows.filter(r => [...params].every(([k, v]) => SKIP.has(k) ? true : (k === 'or' || k === 'and') ? evalTerm(r, k + v) : cond(r, k, v)));
  const ord = params.get('order');
  if (ord) {
    const keys = ord.split(',').map(s => s.split('.'));
    out = [...out].sort((a, b) => { for (const [col, dir, nulls] of keys) { const av = a[col], bv = b[col]; if (av == null || bv == null) { if (av == null && bv == null) continue; const first = nulls === 'nullsfirst'; return (av == null) === first ? -1 : 1; } const c = cmp(av, bv); if (c) return dir === 'desc' ? -c : c; } return 0; });
  }
  const total = out.length;
  const off = Number(params.get('offset') || 0); const lim = params.get('limit');
  out = out.slice(off, lim != null ? off + Number(lim) : undefined);
  return { rows: out, total, from: off };
}

// ── The mock ───────────────────────────────────────────────────────────────
function createMock(opts = {}) {
  const now = opts.now ? Date.parse(opts.now) : Date.now();
  const event = { ...DEFAULT_EVENT, ...(opts.event || {}) };
  const me = { isAdmin: false, teamId: MY_TEAM_ID, username: 'player_one', ...(opts.me || {}) };
  const gaps = new Set();
  const log = opts.log || ((m) => process.stderr.write(`[mock] ${m}\n`));
  const gap = (m) => { if (!gaps.has(m)) { gaps.add(m); log('gap: ' + m); } };

  const { teams, players } = WORLD;
  const hasTeam = !!me.teamId;
  const myProfile = {
    ...players.find(p => p.id === ME_ID), username: me.username, role: me.isAdmin ? 'admin' : 'player', is_owner: !!me.isOwner,
    is_banned: false, is_hidden: false, team_id: me.teamId, email: 'player_one@example.test',
  };
  const profiles = players.map(p => p.id === ME_ID ? myProfile : { ...p, role: 'player', is_owner: false, is_banned: false, is_hidden: false });
  const started = now >= T0;
  const ended = now > T1;
  const paused = !!event.is_paused;
  // No event running means no scoring history to show; otherwise everything up to `now` counts.
  const upto = WORLD.ledger.filter(e => event.is_active && Date.parse(e.at) <= now && (hasTeam || e.team_id !== MY_TEAM_ID || e.username !== me.username));
  const solves = upto.filter(e => e.kind === 'solve');
  const teamRows = teams.map(t => {
    const ev = upto.filter(e => e.team_id === t.id); const sv = ev.filter(e => e.kind === 'solve');
    return { id: t.id, name: t.name, member_count: players.filter(p => p.team_id === t.id).length, total_points: Math.max(0, ev.reduce((s, e) => s + e.points, 0)), solved_count: sv.length, last_solve: sv.length ? sv[sv.length - 1].at : null };
  }).filter(t => t.total_points > 0 || t.solved_count > 0 || ended).sort((a, b) => b.total_points - a.total_points || String(a.last_solve ?? '9').localeCompare(String(b.last_solve ?? '9')));
  const userRows = players.map(p => {
    const mine = solves.filter(e => e.username === p.username);
    return { id: p.id, username: p.username, team_id: p.id === ME_ID ? me.teamId : p.team_id, country: p.country, avatar_url: null, total_points: mine.reduce((s, e) => s + e.points, 0), solved_count: mine.length, last_solve: mine.length ? mine[mine.length - 1].at : null };
  }).sort((a, b) => b.total_points - a.total_points);
  const solveCount = {}; const firstBlood = {};
  solves.forEach(e => { solveCount[e.challenge_id] = (solveCount[e.challenge_id] || 0) + 1; if (!firstBlood[e.challenge_id]) firstBlood[e.challenge_id] = e.username; });
  const visibleChallenges = (me.isAdmin || (started && event.is_active)) ? ALL : [];
  const scoresHidden = !!event.hide_scores;
  const mySubs = [
    ...upto.filter(e => e.kind === 'solve' && e.team_id === MY_TEAM_ID).map((e, i) => ({ id: uuid('sub:' + e.event_key + e.username), user_id: players.find(p => p.username === e.username)?.id, team_id: MY_TEAM_ID, challenge_id: e.challenge_id, is_correct: true, submitted_at: e.at, challenges: pick(ALL.find(c => c.id === e.challenge_id)) })),
    ...MY_FAILS.filter(([, , m]) => event.is_active && T0 + m * 60_000 <= now).map(([u, k, m], i) => ({ id: uuid('fail:' + i), user_id: players.find(p => p.username === u).id, team_id: MY_TEAM_ID, challenge_id: byKey[k].id, is_correct: false, submitted_at: atMin(m), challenges: pick(byKey[k]) })),
  ];
  function pick(c) { return c ? { title: c.title, category: c.category, points: c.points } : null; }
  // Hints the team already paid for are free for everyone on it, so their
  // texts come back on sign-in exactly as the real get_my_hint_texts does.
  const hintTexts = opts.hintTexts || Object.fromEntries(upto.filter(e => e.kind === 'hint' && e.team_id === me.teamId).map(e => [e.hint.id, e.hint.content]));

  const tables = {
    event_settings: [event],
    profiles,
    safe_profiles: profiles.filter(p => !p.is_hidden).map(({ id, username, team_id, country, avatar_url }) => ({ id, username, team_id, country, avatar_url })),
    public_teams: teams, teams,
    team_scores: scoresHidden ? [] : teamRows,
    user_scores: scoresHidden ? [] : userRows,
    public_challenges: visibleChallenges.map(c => ({ ...c, files: c.files, hints: c.hints.map(h => ({ id: h.id, cost: h.cost })) })),
    challenges: ALL,
    challenge_files: ALL.flatMap(c => c.files.map(f => ({ ...f, challenge_id: c.id, created_at: c.created_at }))),
    hints: ALL.flatMap(c => c.hints.map(h => ({ id: h.id, challenge_id: c.id, cost: h.cost, content: h.content }))),
    hint_unlocks: [],
    submissions: mySubs,
    notifications: [
      { id: uuid('n:3'), type: 'success', title: 'Chained operations unlocked', message: 'Ashoka Vatika and Setu Bridge are live under the Chained tab.', created_at: atMin(180) },
      { id: uuid('n:2'), type: 'warning', title: 'Pwn service restart', message: 'pwn.lab restarts at 10:30 IST for five minutes. Solves are not affected.', created_at: atMin(95) },
      { id: uuid('n:1'), type: 'info', title: 'Welcome to CyberHX Open 2026', message: 'Flags are CTF{...}. Be kind to the infrastructure and to each other.', created_at: atMin(1) },
    ].filter(n => Date.parse(n.created_at) <= now),
    public_chain_series: CHAIN_SERIES.map(({ members, ...s }) => s),
    public_chain_members: CHAIN_SERIES.flatMap(s => s.members.map((c, i) => ({ series_id: s.id, challenge_id: c.id, position: i + 1 }))),
    public_b2r_boxes: B2R_BOXES.map(({ user, root, ...b }) => ({ ...b, user_challenge_id: user.id, root_challenge_id: root.id })),
    public_b2r_series: B2R_SERIES,
    public_b2r_members: B2R_BOXES.filter(b => b.series_id).map(b => ({ series_id: b.series_id, box_id: b.id, position: b.position })),
  };

  const teamSolves = (teamId) => solves.filter(e => e.team_id === teamId).map(e => ({ challenge_id: e.challenge_id, username: e.username, submitted_at: e.at }));
  const rpc = {
    get_team_solves: ({ p_team_id }) => teamSolves(p_team_id),
    get_solve_data: () => paused && !me.isAdmin ? [] : Object.entries(solveCount).map(([challenge_id, n]) => ({ challenge_id, solve_count: n, first_blood_username: firstBlood[challenge_id] ?? null })),
    get_my_hint_texts: () => hintTexts,
    scoreboard_state: () => ({ frozen: !!event.freeze_scoreboard, masked: !!event.freeze_scoreboard, freeze_time: event.freeze_time, hidden: scoresHidden, scores_hidden: scoresHidden, ended }),
    get_score_progression: ({ p_team_ids = [] }) => upto.filter(e => p_team_ids.includes(e.team_id)).map(e => ({ team_id: e.team_id, points: e.points, occurred_at: e.at, event_key: e.event_key })),
    get_challenge_solvers: ({ p_challenge_id }) => solves.filter(e => e.challenge_id === p_challenge_id).map(e => ({ username: e.username, submitted_at: e.at })),
    registration_is_open: () => !!event.registration_open,
    get_challenges_count: () => ALL.length,
    get_my_team_invite: () => hasTeam ? 'vanara-7f3a2b' : null,
    get_team_hint_unlocks: ({ p_team_id }) => upto.filter(e => e.kind === 'hint' && e.team_id === p_team_id).map(e => ({ unlocked_at: e.at, challenge_title: e.hint.challenge.title, cost: e.hint.cost, username: e.username, hint_id: e.hint.id })),
    team_invite_preview: ({ p_code }) => /^[0-9a-z_-]{6,64}$/i.test(p_code || '') ? { name: 'Lanka Watch', members: 3, size: event.team_size, full: false, locked: false } : { error: 'Invalid invite' },
    get_challenge_hints: ({ p_challenge_id }) => (ALL.find(c => c.id === p_challenge_id)?.hints ?? []).map(h => ({ id: h.id, text: h.content, cost: h.cost })),
    unlock_hint: ({ p_hint_id }) => { const h = tables.hints.find(x => x.id === p_hint_id); return h ? { ok: true, text: h.content } : { error: 'Hint not found' }; },
    join_team: () => ({ ok: true }), create_team: () => ({ team_id: uuid('team:new') }), leave_team: () => ({ ok: true }),
    verify_current_password: () => true,
    // Admin surface: enough shape for every tab to render without errors.
    admin_list_users: () => userRows.map(u => ({ ...u, email: `${u.username}@example.test`, role: u.id === ME_ID ? myProfile.role : 'player', is_banned: false, is_owner: false, team_name: teams.find(t => t.id === u.team_id)?.name ?? null, created_at: event.created_at })),
    admin_list_submissions: ({ p_limit = 100 } = {}) => [...solves.map(e => ({ id: uuid('asub:' + e.team_id + e.event_key), username: e.username, challenge_title: ALL.find(c => c.id === e.challenge_id)?.title, submitted_flag: `CTF{${e.event_key.slice(0, 8)}}`, submitted_flag_hash: sha256(e.event_key), is_correct: true, submitted_at: e.at })),
      ...mySubs.filter(s => !s.is_correct).map(s => ({ id: s.id, username: players.find(p => p.id === s.user_id)?.username, challenge_title: s.challenges?.title, submitted_flag: 'CTF{not_quite}', submitted_flag_hash: sha256(s.id), is_correct: false, submitted_at: s.submitted_at }))]
      .sort((a, b) => b.submitted_at.localeCompare(a.submitted_at)).slice(0, p_limit),
    admin_list_chain_series: () => ({ series: CHAIN_SERIES.map(({ members, ...s }) => ({ ...s, is_published: true, members: members.map((c, i) => ({ challenge_id: c.id, position: i + 1, title: c.title })) })) }),
    admin_list_b2r_boxes: () => ({ boxes: tables.public_b2r_boxes.map(b => ({ ...b, is_published: true })) }),
    admin_list_b2r_series: () => ({ series: B2R_SERIES.map(s => ({ ...s, is_published: true, members: tables.public_b2r_members.filter(m => m.series_id === s.id) })) }),
    admin_allowlist_count: () => ({ total: 0 }),
    admin_challenges_needing_flag_reset: () => [],
    admin_team_members: ({ p_team_id }) => players.filter(p => p.team_id === p_team_id).map(p => ({ id: p.id, username: p.username })),
  };

  const user = { id: ME_ID, email: myProfile.email, aud: 'authenticated', role: 'authenticated', app_metadata: { provider: 'email' }, user_metadata: { username: me.username }, created_at: '2026-10-02T09:00:00Z' };
  const session = { access_token: 'mock.jwt.token', token_type: 'bearer', expires_in: 31_536_000, expires_at: Math.floor(now / 1000) + 31_536_000, refresh_token: 'mock-refresh', user };

  function submitFlag(body) {
    const c = ALL.find(x => x.id === body.challengeId);
    if (typeof opts.submitResult === 'function') return opts.submitResult(c, body.flag);
    if (opts.submitResult) return opts.submitResult;
    const r = { correct: true, points: c?.points ?? 0 };
    if (c && c.max_attempts > 0) Object.assign(r, { maxAttempts: c.max_attempts, attemptsLeft: c.max_attempts - 1 });
    return r;
  }

  /** Route handler. Returns true when the request was for the mock host. */
  async function handle(route) {
    const req = route.request(); const u = new URL(req.url());
    if (u.hostname !== HOST) return false;
    if (opts.down) { await route.abort('connectionfailed'); return true; }
    const cors = {
      'access-control-allow-origin': req.headers().origin || '*',
      'access-control-allow-headers': req.headers()['access-control-request-headers'] || 'authorization, apikey, content-type, prefer, accept, accept-profile, content-profile, x-client-info, x-supabase-api-version, range',
      'access-control-allow-methods': 'GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS',
      'access-control-expose-headers': 'content-range, x-supabase-api-version', 'access-control-max-age': '86400',
    };
    const json = (body, status = 200, headers = {}) => route.fulfill({ status, contentType: 'application/json', headers: { ...cors, ...headers }, body: JSON.stringify(body ?? null) });
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors, body: '' }).then(() => true);
    const p = u.pathname;
    if (p.startsWith('/auth/v1/health')) return json({ name: 'GoTrue', version: 'mock' }).then(() => true);
    if (p.startsWith('/auth/v1/user')) return json(user).then(() => true);
    if (p.startsWith('/auth/v1/token')) return json(session).then(() => true);
    if (p.startsWith('/auth/v1/logout')) return route.fulfill({ status: 204, headers: cors, body: '' }).then(() => true);
    if (p.startsWith('/auth/v1/')) return json({}).then(() => true);
    if (p.startsWith('/functions/v1/submit-flag')) { let body = {}; try { body = JSON.parse(req.postData() || '{}'); } catch {} return json(submitFlag(body)).then(() => true); }
    if (p.startsWith('/functions/v1/')) { gap('function ' + p); return json({}).then(() => true); }
    if (p.startsWith('/storage/v1/')) return json({}).then(() => true);
    const r = p.match(/^\/rest\/v1\/rpc\/([a-zA-Z0-9_]+)/);
    if (r) {
      let args = {}; try { args = JSON.parse(req.postData() || '{}'); } catch {}
      if (!(r[1] in rpc)) { gap('rpc ' + r[1]); return json(null).then(() => true); }
      const v = rpc[r[1]]; return json(typeof v === 'function' ? v(args || {}) : v).then(() => true);
    }
    const t = p.match(/^\/rest\/v1\/([a-zA-Z0-9_]+)/);
    if (!t) return json([]).then(() => true);
    if (!(t[1] in tables)) gap('table ' + t[1]);
    if (req.method() !== 'GET' && req.method() !== 'HEAD') { // writes: echo back, change nothing
      let body = null; try { body = JSON.parse(req.postData() || 'null'); } catch {}
      return json(body == null ? [] : Array.isArray(body) ? body : [body], req.method() === 'POST' ? 201 : 200).then(() => true);
    }
    const { rows, total, from } = applyQuery(tables[t[1]] || [], u.searchParams);
    const range = { 'content-range': rows.length ? `${from}-${from + rows.length - 1}/${total}` : `*/${total}` };
    if (req.method() === 'HEAD') return route.fulfill({ status: 200, headers: { ...cors, ...range }, body: '' }).then(() => true);
    if ((req.headers().accept || '').includes('vnd.pgrst.object')) {
      if (!rows.length) return json({ code: 'PGRST116', details: 'The result contains 0 rows', hint: null, message: 'JSON object requested, multiple (or no) rows returned' }, 406, range).then(() => true);
      return json(rows[0], 200, range).then(() => true);
    }
    return json(rows, 200, range).then(() => true);
  }

  return { handle, gaps, session, user, event, me, now, tables, rpc, challenges: ALL, teams, players, HOST };
}

module.exports = { createMock, HOST, ME_ID, MY_TEAM_ID, EVENT_START, EVENT_END, CHALLENGES: ALL, CHAIN_SERIES, B2R_SERIES, B2R_BOXES };
