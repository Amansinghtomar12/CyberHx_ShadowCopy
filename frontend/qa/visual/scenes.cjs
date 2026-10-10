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

// ── The header has to fit ───────────────────────────────────────────────
// Not a picture: a measurement that fails the run. The row is one flex
// line with a shrink-0 right group, so anything the left group cannot fit
// is painted over the clock rather than clipped — which is exactly what
// happened to an admin at every desktop width until the wordmark, the
// event badge and the switch learned to give way. Both skins, both roles,
// every width where the desktop row is on.
const navFits = (opts) => ({
  ...opts,
  before: async (page, h) => {
    await h.boardReady();
    const bad = [];
    for (const w of [1024, 1080, 1180, 1280, 1366, 1440, 1536, 1600, 1920]) {
      await page.setViewportSize({ width: w, height: 900 });
      await page.waitForTimeout(160);
      const r = await page.evaluate(() => {
        const row = document.querySelector('nav.sticky > div');
        const [left, right] = Array.from(row.children);
        // The painted edge, not the box: a child that overflows its group
        // is the whole failure mode being guarded against.
        const edge = (el) => Math.max(
          el.getBoundingClientRect().right,
          ...Array.from(el.querySelectorAll('*'))
            .filter(e => e.getClientRects().length)
            .map(e => e.getBoundingClientRect().right),
        );
        const strip = left.querySelector('.nav-strip');
        return {
          gap: Math.round(right.getBoundingClientRect().left - edge(left)),
          // The strip scrolls rather than overlaps now, so a clear gap is
          // only half the answer: a scrollable strip means a tab is cut off.
          cut: strip ? strip.scrollWidth - strip.clientWidth : 0,
        };
      });
      if (r.gap < 0) bad.push('overlaps the controls at ' + w + 'px by ' + -r.gap + 'px');
      if (r.cut > 0) bad.push('cuts the tab strip at ' + w + 'px by ' + r.cut + 'px');
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(200);
    if (bad.length) throw new Error('header ' + bad.join('; '));
  },
  shots: [{ at: 200 }],
});

module.exports = [
  // ── Auth ────────────────────────────────────────────────────────────────
  scene('auth-login', { loggedOut: true, shots: [{ waitSelector: '#auth-email', at: 1200 }] }),
  // The first-visit introduction: a skin-only overlay, replayed with ?intro=1.
  scene('intro', {
    query: 'intro=1',
    skip: (run) => (run.theme === 'pinaka' ? false : 'skin-only scene'),
    shots: [
      { name: 'bow', waitSelector: '.pk-intro', at: 2600 },
      { name: 'title', waitText: 'Enter the Arena', at: 700 },
    ],
  }),
  scene('auth-register', {
    loggedOut: true,
    before: async (page, h) => { await page.locator('#auth-email').waitFor({ timeout: 25000 }); await page.getByRole('button', { name: 'Register', exact: true }).click(); await h.park(); },
    shots: [{ waitSelector: '#auth-username', at: 800 }],
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
  // Pinaka event: opening an arena hands the scene to the whole page.
  // Assert on the plate the environment is actually painting, not on how
  // the page looks through the dialog's scrim.
  // Pinaka event: dismissing the brief must NOT leave the arena. Only
  // "Take rest" folds the card and gives the chapter's sky back.
  // What the player is left looking at once the brief is dismissed.
  // The three beats: closed (scene only) -> entered (real name, no brief)
  // -> brief open. And a separate way back at every point.
  scene('arena-three-beats', {
    // The arena card only exists under the event skin; on the classic
    // look there is no card to press, so this is nothing to measure.
    skip: (run) => run.theme !== 'pinaka' && 'pinaka-only scene',
    before: async (page, h) => {
      const look = async (label) => {
        const r = await page.evaluate(() => {
          const c = document.querySelector('.pk-scenecard');
          const open = document.querySelector('.pk-scenecard[data-open="1"]');
          const face = open ? open.querySelector('.pk-scenecard__back') : (c && c.querySelector('.pk-scenecard__front'));
          return {
            flipped: !!open,
            brief: !!document.querySelector('[role="dialog"]'),
            reveal: open ? (open.querySelector('.pk-scenecard__reveal')||{}).textContent || null : null,
            frontText: c ? (c.querySelector('.pk-scenecard__front')||{}).innerText.replace(/\n+/g,' / ') : null,
          };
        });
        console.log(`        ${label.padEnd(16)} flipped=${r.flipped} brief=${r.brief} reveal=${JSON.stringify(r.reveal)}`);
        if (label === 'closed') console.log(`        closed face reads: ${JSON.stringify(r.frontText)}`);
        return r;
      };
      await h.boardReady();
      await look('closed');
      await page.locator('.pk-scenecard__enter').first().click();
      await page.waitForTimeout(1300);
      await look('entered');
      await page.locator('.pk-scenecard[data-open="1"] .pk-scenecard__open').first().click();
      await page.waitForTimeout(1200);
      await look('brief open');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(1400);
      await look('brief closed');
      await page.locator('.pk-scenecard[data-open="1"] .pk-scenecard__leave').first().click();
      await page.waitForTimeout(3400);
      await look('took rest');
    },
    shots: [{ at: 400 }],
  }),

  // Measure the glass as the browser resolves it, rather than trusting a
  // grep against minified CSS.
  // The gateway's partner line: institutions on top, everyone else running.
  scene('gateway-partners', {
    loggedOut: true,
    before: async (page) => {
      await page.waitForTimeout(2500);
      const run = page.locator('.pk-sponsor-run').first();
      await run.scrollIntoViewIfNeeded().catch(() => {});
      await page.waitForTimeout(900);
      const info = await page.evaluate(() => {
        const lane = document.querySelector('.pk-sponsor-run');
        const tracks = document.querySelectorAll('.pk-sponsor-run-track');
        const items = document.querySelectorAll('.pk-sponsor-run-item');
        const honours = document.querySelectorAll('.pk-partners-honours > *');
        return {
          lane: !!lane,
          tracks: tracks.length,
          itemsPerTrack: items.length / (tracks.length || 1),
          anim: lane ? getComputedStyle(tracks[0]).animationName : '-',
          onTop: [...honours].map(e => e.className).join(' | '),
        };
      });
      console.log('        lane=' + info.lane + ' tracks=' + info.tracks +
                  ' tiles/track=' + info.itemsPerTrack + ' anim=' + info.anim);
      console.log('        on top: ' + info.onTop);
    },
    shots: [{ at: 500 }],
  }),

  scene('tier-matrix', {
    before: async (page, h) => {
      await h.boardReady();
      for (const tier of ['high', 'medium', 'low', 'still']) {
        const r = await page.evaluate((t) => {
          const root = document.querySelector('[data-tier]');
          const was = root.getAttribute('data-tier');
          root.setAttribute('data-tier', t);
          const p = document.querySelector('.surface');
          const c = getComputedStyle(p);
          const out = { bg: c.backgroundColor, filt: c.backdropFilter };
          root.setAttribute('data-tier', was);
          return out;
        }, tier);
        console.log('            ' + tier.padEnd(7) + ' panel bg=' + String(r.bg).padEnd(24) + ' filter=' + r.filt);
      }
      const real = await page.evaluate(() => document.querySelector('[data-tier]').getAttribute('data-tier'));
      console.log('            (headless chromium reports: ' + real + ')');
    },
    shots: [{ at: 200 }],
  }),

  // What the board actually looks like on the tier most visitors get.
  // Headless Chromium reports 'high', and for a long time that was the only
  // tier anything here was ever rendered at — which is how glass that was
  // gated to 'high' shipped looking solid to everyone else. This stamps
  // 'medium' and keeps a text-free frame beside the real one, so a panel's
  // composited ground can be measured without the glyphs in the way.
  scene('glass-medium', {
    before: async (page, h) => {
      await h.boardReady();
      await page.evaluate(() => document.querySelector('[data-tier]').setAttribute('data-tier', 'medium'));
      await page.waitForTimeout(400);
      const out = await page.evaluate(() => {
        const pick = (sel, label) => {
          const e = document.querySelector(sel);
          if (!e) return label.padEnd(24) + ' not on this page';
          const c = getComputedStyle(e);
          return label.padEnd(24)
            + ' bg=' + String(c.backgroundColor).padEnd(22)
            + ' img=' + String(c.backgroundImage).replace(/\s+/g, ' ').slice(0, 60).padEnd(62)
            + ' filt=' + c.backdropFilter;
        };
        return [
          pick('.pk-scenecard__face', 'battle card'),
          pick('.page-shell header.surface', 'command header'),
          pick('.pk-journey', 'journey card'),
          pick('.page-shell aside.border-r', 'sidebar rail'),
          pick('.page-shell aside .surface', 'sidebar panel'),
        ].join('\n            ');
      });
      console.log('            ' + out);
      const text = await page.evaluate(() => {
        const row = (sel, label) => {
          const e = document.querySelector(sel);
          if (!e) return label.padEnd(26) + ' not on this page';
          const r = e.getBoundingClientRect();
          return label.padEnd(26) + ' color=' + getComputedStyle(e).color.padEnd(22)
            + ' box=' + [r.left, r.top, r.right, r.bottom].map(Math.round).join(',');
        };
        return [
          row('.page-shell header.surface h2', 'header title'),
          row('.page-shell header.surface p', 'header muted line'),
          row('.pk-journey', 'journey card box'),
          row('.page-shell aside .surface', 'sidebar panel box'),
        ].join('\n            ');
      });
      console.log('            ' + text);
    },
    shots: [
      { name: 'board', at: 500, full: true },
      // The same frame with the type taken out, so the panel's composited
      // ground can be measured without the glyphs skewing the brightest end.
      { name: 'blank', at: 300, full: true,
        css: '.page-shell *, .page-shell *::before, .page-shell *::after { color: transparent !important; text-shadow: none !important; }' },
    ],
  }),

  scene('nav-fits-admin', navFits({ me: { isAdmin: true }, event: { theme: 'pinaka' } })),
  scene('nav-fits-player', navFits({ event: { theme: 'pinaka' } })),

  scene('glass-measure2', {
    before: async (page, h) => {
      await h.boardReady();
      const out = await page.evaluate(() => {
        const pick = (sel, label) => {
          const e = document.querySelector(sel);
          if (!e) return label.padEnd(26) + ' not on this page';
          const c = getComputedStyle(e);
          return label.padEnd(26) + ' bg=' + String(c.backgroundColor).padEnd(24)
               + ' img=' + String(c.backgroundImage).slice(0, 34).padEnd(36)
               + ' filt=' + c.backdropFilter;
        };
        return [
          pick('.pk-journey', 'journey card'),
          pick('.pk-journey-stations', 'station list'),
          pick('.pk-journey-plate', 'map plate'),
          pick('.pk-scenecard__face', 'battle card (reference)'),
        ].join('\n            ');
      });
      console.log('            ' + out);
    },
    shots: [{ at: 300 }],
  }),

  scene('glass-measure', {
    before: async (page, h) => {
      await h.boardReady();
      const out = await page.evaluate(() => {
        const pick = (sel) => {
          const e = document.querySelector(sel);
          if (!e) return `${sel}  -> not on this page`;
          const c = getComputedStyle(e);
          const bg = (c.backgroundImage || '').replace(/\s+/g, ' ');
          return `${sel}\n              backdrop : ${c.backdropFilter}\n              bg       : ${bg.slice(0, 110)}`;
        };
        return [pick('.pk-scenecard__face'), pick('.pk-partners-footer'), pick('.pk-partners-featured')].join('\n            ');
      });
      console.log('            ' + out);
    },
    shots: [{ at: 300 }],
  }),

  scene('arena-standing', {
    // The arena card only exists under the event skin; on the classic
    // look there is no card to press, so this is nothing to measure.
    skip: (run) => run.theme !== 'pinaka' && 'pinaka-only scene',
    before: async (page, h) => {
      await h.boardReady();
      await page.locator('.pk-scenecard__enter').first().click();
      await page.waitForTimeout(1600);
      await page.locator('.pk-scenecard[data-open="1"]').scrollIntoViewIfNeeded().catch(() => {});
      await page.waitForTimeout(700);
    },
    shots: [{ at: 600 }],
  }),

  scene('arena-stays-open', {
    // The arena card only exists under the event skin; on the classic
    // look there is no card to press, so this is nothing to measure.
    skip: (run) => run.theme !== 'pinaka' && 'pinaka-only scene',
    before: async (page, h) => {
      const state = async (label) => {
        const r = await page.evaluate(() => ({
          plate: [...document.querySelectorAll('.pk-env-plate')]
            .filter(e => getComputedStyle(e).opacity === '1')
            .map(e => { const i = e.querySelector('img'); return i ? (i.currentSrc||i.src).split('/').pop() : '?'; }),
          flipped: !!document.querySelector('.pk-scenecard[data-open="1"]'),
          brief: !!document.querySelector('[role="dialog"]'),
        }));
        console.log(`        ${label.padEnd(22)} plate=${JSON.stringify(r.plate)} flipped=${r.flipped} brief=${r.brief}`);
        return r;
      };
      await h.boardReady();
      await state('start');
      await h.openChallenge(EASY);
      await page.waitForTimeout(1200);
      await state('entered arena');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(1600);
      await state('brief dismissed');
      // now leave properly, from the card's own back face
      const leave = page.locator('.pk-scenecard[data-open="1"] .pk-scenecard__leave');
      console.log('        take-rest button visible: ' + (await leave.count() > 0));
      await leave.first().click();
      await page.waitForTimeout(3600);
      await state('after take rest');
    },
    shots: [{ at: 400 }],
  }),

  scene('arena-plate-check', {
    before: async (page, h) => {
      const plate = async () => page.evaluate(() => {
        const imgs = [...document.querySelectorAll('img')]
          .map(i => i.currentSrc || i.src).filter(Boolean);
        // Which plate is actually being shown: the environment keeps two
        // slots and crossfades, so both files stay in the DOM. Report the
        // file in whichever slot is opaque.
        // .pk-env-plate is the slot; .pk-env-plate-art is the picture in it.
        return [...document.querySelectorAll('.pk-env-plate')].map(slot => {
          const img = slot.querySelector('img');
          const file = img ? (img.currentSrc || img.src).split('/').pop() : '<none>';
          return file + ' @opacity ' + getComputedStyle(slot).opacity;
        });
      });
      await h.boardReady();
      console.log('        before open : ' + JSON.stringify(await plate()));
      await h.openChallenge(EASY);
      await page.waitForTimeout(1400);
      console.log('        while open  : ' + JSON.stringify(await plate()));
      const flip = await page.evaluate(() => {
        const c = document.querySelector('.pk-scenecard[data-open="1"]');
        if (!c) return 'no card marked open';
        const t = getComputedStyle(c.querySelector('.pk-scenecard__inner')).transform;
        return 'data-open=1  transform=' + t;
      });
      console.log('        card flip   : ' + flip);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(1400);
      console.log('        close +1.4s : ' + JSON.stringify(await plate()));
      await page.waitForTimeout(3000);
      console.log('        close +4.4s : ' + JSON.stringify(await plate()));
    },
    shots: [{ at: 400 }],
  }),
  // Pinaka event: the foot of a scene-dressed dialog, where the story's own
  // submit wording replaces "Execute". Scrolled, because it sits below the
  // fold on a 900px viewport.
  scene('challenge-modal-scene-foot', {
    before: async (page, h) => {
      await h.openChallenge(EASY);
      // The dialog itself does not scroll; find whichever descendant does.
      await page.locator('[role="dialog"]').first().evaluate(root => {
        const all = [root, ...root.querySelectorAll('*')];
        const box = all.find(e => e.scrollHeight > e.clientHeight + 40);
        if (box) box.scrollTop = box.scrollHeight;
      }).catch(() => {});
      await page.waitForTimeout(500);
      const label = await page.locator('[role="dialog"] button[type="submit"]')
        .first().innerText().catch(() => '<not found>');
      console.log('        submit button reads: ' + JSON.stringify(label.trim()));
    },
    shots: [{ at: 900 }],
  }),
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
    shots: [{ waitSelector: 'button[aria-label="Back to chains"]', at: 2500 }],
  }),
  scene('board-b2r', { before: async (_p, h) => { await h.boardTab('B2R'); }, shots: [{ waitText: 'USER FLAG', at: 1200 }] }),
  scene('b2r-chained', {
    before: async (_p, h) => { await h.boardTab('B2R'); await h.boardTab('Chained', 1); },
    shots: [
      { name: 'list', waitText: 'Enter chain', at: 800 },
      { before: async (page, h) => { await page.getByRole('button', { name: 'Enter chain' }).first().click(); await h.park(); }, waitSelector: 'button[aria-label="Back to chains"]', at: 2500 },
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
