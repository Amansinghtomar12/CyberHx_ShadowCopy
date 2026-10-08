'use strict';
/**
 * scenes.cjs — every screen of the platform, as a scene the harness can run.
 *
 * A scene is scene(name, { now, event, me, loggedOut, invite, down, only,
 * before(page, h), shots: [{ name?, before?, waitText?, waitSelector?, at, full?, clip? }] }).
 * Waits are on real text or selectors; `at` is only the settle time after
 * them (animations, count-ups, the breach showcase).
 */
const { scene, LIVE } = require('./harness.cjs');

const PRE = '2026-11-14T02:30:00Z';   // two hours before the doors open
const POST = '2026-11-14T19:30:00Z';  // three hours after the close
const EASY = 'Robots Welcome';         // Easy, web, two hints (0 / 500), file + link
const INSANE = "Ravana's Thousand Locks";

const open = (title) => async (_page, h) => { await h.openChallenge(title); };
const LEADER = 'Ashoka Grove';             // top of the synthetic standings
// The scoreboard jitters its first fetch by up to 15 s; the refresh button
// is the deterministic way in, exactly as a player would use it.
const scoreboard = async (page, h) => {
  await h.nav('Scoreboard');
  const btn = page.getByRole('button', { name: 'Refresh the scoreboard now' });
  await btn.waitFor({ state: 'visible', timeout: 5000 }).then(() => btn.click()).catch(() => {});
  await h.park();
};
const armPaidHint = async (page, h) => {
  const dialog = await h.openChallenge(EASY);
  await dialog.locator('button', { hasText: '-500 pts' }).first().click();
  await h.waitText('Confirm decryption');
};

module.exports = [
  // ── Auth ────────────────────────────────────────────────────────────────
  scene('auth-login', { loggedOut: true, shots: [{ waitText: 'Access terminal', at: 1200 }] }),
  scene('auth-register', {
    loggedOut: true,
    before: async (page, h) => { await h.waitText('Access terminal'); await page.getByRole('button', { name: 'Register', exact: true }).click(); await h.park(); },
    shots: [{ waitText: 'Enter the arena', at: 800 }],
  }),

  // ── Board states ────────────────────────────────────────────────────────
  scene('board-live', { shots: [{ waitSelector: '#board-search', at: 2500 }, { name: 'full', at: 300, full: true }] }),
  scene('board-waiting', { now: PRE, shots: [{ waitText: 'Opens', at: 1500 }] }),
  scene('board-ended', { now: POST, shots: [{ waitText: 'Submissions are closed', at: 1500 }] }),
  scene('board-inactive', { event: { is_active: false }, shots: [{ waitText: 'Event is not active yet', at: 1200 }] }),
  scene('board-needs-team', { me: { teamId: null }, shots: [{ waitText: 'Join or Create a Team First', at: 1200 }] }),
  scene('board-paused', {
    event: { is_paused: true, paused_at: '2026-11-14T10:05:00Z', pause_message: 'Infra swap in progress — back in ten minutes.' },
    shots: [{ waitText: 'Operations suspended', at: 2800 }],
  }),
  scene('board-admin-paused', {
    me: { isAdmin: true }, event: { is_paused: true, paused_at: '2026-11-14T10:05:00Z' },
    shots: [{ waitText: 'Players see the hold screen', at: 2000 }],
  }),

  // ── Challenge modal ─────────────────────────────────────────────────────
  scene('challenge-modal', { before: open(EASY), shots: [{ at: 900 }] }),
  scene('challenge-modal-insane', { before: open(INSANE), shots: [{ at: 1200 }] }),
  scene('hint-confirm', { before: armPaidHint, shots: [{ at: 500 }] }),
  scene('hint-unlocked', {
    before: async (page, h) => {
      await armPaidHint(page, h);
      await page.getByRole('button', { name: /^Decrypt/ }).click();
      await h.waitText('The disallowed path serves a JSON index');
    },
    shots: [{ at: 600 }],
  }),
  scene('solve', {
    before: async (page, h) => {
      const dialog = await h.openChallenge(EASY); // unsolved on this team
      await dialog.getByPlaceholder('FLAG{ACCESS_KEY}').fill('CTF{synthetic_visual_qa}');
      await Promise.all([
        page.waitForResponse(r => r.url().includes('submit-flag')),
        dialog.locator('button[type="submit"]').click(),
      ]);
      await h.park();
    },
    // The showcase holds ~1.9 s after a ~0.9 s lead-in; the solved panel is
    // captured the moment it has cleared rather than at a guessed offset.
    shots: [{ name: 'breach', at: 1400 }, { name: 'solved', waitHidden: '.breach-root', at: 300 }],
  }),
  scene('solves-tab', {
    before: async (page, h) => {
      const dialog = await h.openChallenge(EASY);
      await dialog.getByRole('button', { name: /^Solves/ }).click();
      await h.waitText('Operatives Solved');
    },
    shots: [{ at: 800 }],
  }),

  // ── Chained & B2R experiences ───────────────────────────────────────────
  scene('board-chained', { before: async (_p, h) => { await h.boardTab('Chained'); }, shots: [{ waitText: 'Enter chain', at: 1200 }] }),
  scene('chain-experience', {
    before: async (page, h) => { await h.boardTab('Chained'); await page.getByRole('button', { name: 'Enter chain' }).first().click(); await h.park(); },
    shots: [{ waitText: 'Chain progress', at: 2500 }],
  }),
  scene('board-b2r', { before: async (_p, h) => { await h.boardTab('B2R'); }, shots: [{ waitText: 'USER FLAG', at: 1200 }] }),
  scene('b2r-chained', {
    before: async (_p, h) => { await h.boardTab('B2R'); await h.boardTab('Chained', 1); },
    shots: [
      { name: 'list', waitText: 'Enter chain', at: 800 },
      { before: async (page, h) => { await page.getByRole('button', { name: 'Enter chain' }).first().click(); await h.park(); }, waitText: 'Chain progress', at: 2500 },
    ],
  }),

  // ── Scoreboard ──────────────────────────────────────────────────────────
  scene('scoreboard-live', { before: scoreboard, shots: [{ waitText: LEADER, at: 3000 }, { name: 'full', at: 300, full: true }] }),
  scene('scoreboard-frozen', {
    event: { freeze_scoreboard: true, freeze_time: '2026-11-14T10:00:00Z' },
    before: scoreboard, shots: [{ waitText: LEADER, at: 2500 }],
  }),
  scene('scoreboard-hidden', { event: { hide_scores: true }, before: scoreboard, shots: [{ waitText: 'Scoreboard hidden', at: 1200 }] }),
  scene('scoreboard-waiting', { now: PRE, before: scoreboard, shots: [{ waitText: 'Standings populate', at: 1500 }] }),

  // ── Profiles, settings, directories ─────────────────────────────────────
  scene('team-profile', { before: async (_p, h) => { await h.nav('Team'); }, shots: [{ waitText: 'Team profile', at: 2500 }, { name: 'full', at: 300, full: true }] }),
  scene('user-profile', { before: async (_p, h) => { await h.nav('Profile'); }, shots: [{ waitText: 'Operator profile', at: 2500 }] }),
  scene('settings', { before: async (_p, h) => { await h.nav('Settings'); }, shots: [{ waitText: 'Operative Profile', at: 800 }] }),
  scene('settings-security', {
    before: async (page, h) => { await h.nav('Settings'); await h.waitText('Operative Profile'); await page.getByRole('button', { name: 'Security', exact: true }).click(); await h.park(); },
    shots: [{ waitText: 'Change Password', at: 800 }],
  }),
  scene('teams-list', { before: async (_p, h) => { await h.nav('Teams'); }, shots: [{ waitSelector: 'h1:has-text("Teams")', at: 1500 }] }),
  scene('users-list', { before: async (_p, h) => { await h.nav('Users'); }, shots: [{ waitSelector: 'h1:has-text("Users")', at: 1500 }] }),

  // ── Admin ───────────────────────────────────────────────────────────────
  scene('admin-dashboard', {
    me: { isAdmin: true },
    before: async (_p, h) => { await h.nav('Admin'); },
    shots: [
      { name: 'challenges', waitText: 'Challenge catalogue', at: 1500 },
      { name: 'event', before: async (page, h) => { await page.getByRole('button', { name: 'Event', exact: true }).click(); await h.park(); }, waitText: 'Event Settings', at: 1200 },
    ],
  }),

  // ── Dialogs and holds ───────────────────────────────────────────────────
  scene('invite-dialog', { me: { teamId: null }, invite: 'lanka-7f3a2b', shots: [{ waitText: 'Join team', at: 800 }] }),
  scene('uplink-down', { down: true, ignoreConsole: /ERR_CONNECTION_FAILED|Failed to load resource|net::ERR/, shots: [{ waitText: 'Uplink lost', at: 2500 }] }),

  // ── Mobile-only chrome ──────────────────────────────────────────────────
  scene('mobile-menu', {
    only: 'mobile',
    before: async (page, h) => { await h.boardReady(); await page.getByRole('button', { name: 'Open menu' }).click(); },
    shots: [{ waitText: 'Navigate', at: 600 }],
  }),
  scene('mobile-filter', {
    only: 'mobile',
    before: async (page, h) => {
      await h.boardReady();
      await page.getByRole('button', { name: /All Operations/ }).first().click();
      // Scoped to the dropdown: the display-none desktop rail also says "Insane".
      const menu = page.locator('main .surface-overlay');
      await menu.locator('button', { hasText: 'Insane' }).waitFor({ state: 'visible' });
      await menu.scrollIntoViewIfNeeded();
    },
    shots: [{ at: 500 }],
  }),
];
