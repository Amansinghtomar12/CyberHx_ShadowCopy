/**
 * FinalsMode — Three-phase Grand Finale experience for CyberHX CTF.
 *
 * Phase 1: PRE-FINALE  — before Sept 25, 2026, 10:00 IST
 *   Premium countdown, anticipation hero, "Final 50" branding, locked arena.
 *
 * Phase 2: LIVE FINALE — Sept 25, 10:00–22:00 IST
 *   Championship header, gold overlays, endgame escalation, solve burst.
 *
 * Phase 3: POST-FINALE — after Sept 25, 22:00 IST
 *   "Grand Finale Complete" state, final leaderboard, gratitude.
 *
 * Feature-flag gated: window.__FORCE_FINALE_MODE__ overrides time gate.
 * Additional overrides for testing individual phases:
 *   window.__FORCE_FINALE_PHASE__ = 'pre' | 'live' | 'post'
 *
 * Presentation-only: no queries, no auth, no data writes, no scoring changes.
 *
 * To revert: delete this file, remove its import from App.tsx,
 * and remove the .finale-active / .finale-pre / .finale-post CSS from index.css.
 */
import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import {
  Trophy, Flame, Timer, Star, Shield, Crosshair,
  Radio, Zap, Skull, Crown, Target, Activity,
  AlertTriangle, ChevronUp, Lock, Clock, Award,
  CheckCircle,
} from 'lucide-react';
import { ADMIN_EMAIL } from '../lib/support';

/* ═══════════════════════════════════════════════════════════════════════════
   CONFIGURATION
   ═══════════════════════════════════════════════════════════════════════════ */

const FINALS_START = new Date('2026-09-25T04:30:00Z'); // 10:00 IST
const FINALS_END   = new Date('2026-09-25T16:30:00Z'); // 22:00 IST

const PRE_FINALE_WINDOW_DAYS = 14;
const PRE_FINALE_START = new Date(
  FINALS_START.getTime() - PRE_FINALE_WINDOW_DAYS * 24 * 60 * 60 * 1000
);

type FinalePhase = 'standard' | 'lastHour' | 'lastTen' | 'lastMinute';
export type FinaleGlobalPhase = 'off' | 'pre' | 'live' | 'post';

/* ═══════════════════════════════════════════════════════════════════════════
   HOOKS
   ═══════════════════════════════════════════════════════════════════════════ */

function getForcePhase(): FinaleGlobalPhase | null {
  if (typeof window === 'undefined') return null;
  const fp = (window as any).__FORCE_FINALE_PHASE__;
  if (fp === 'pre' || fp === 'live' || fp === 'post') return fp;
  const force = (window as any).__FORCE_FINALE_MODE__;
  if (force === true || force === 'true') return 'live';
  return null;
}

function deriveGlobalPhase(): FinaleGlobalPhase {
  const forced = getForcePhase();
  if (forced) return forced;
  const now = Date.now();
  if (now >= FINALS_END.getTime()) return 'post';
  if (now >= FINALS_START.getTime()) return 'live';
  if (now >= PRE_FINALE_START.getTime()) return 'pre';
  return 'off';
}

export function useFinaleGlobalPhase(): FinaleGlobalPhase {
  const [phase, setPhase] = useState<FinaleGlobalPhase>(deriveGlobalPhase);

  useEffect(() => {
    const tick = () => setPhase(deriveGlobalPhase());
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return phase;
}

export function useFinalsMode(): boolean {
  const gp = useFinaleGlobalPhase();
  return gp === 'live';
}

export function useFinalePhase(): FinalePhase {
  const [phase, setPhase] = useState<FinalePhase>('standard');

  useEffect(() => {
    const tick = () => {
      const left = FINALS_END.getTime() - Date.now();
      if (left <= 60_000) setPhase('lastMinute');
      else if (left <= 600_000) setPhase('lastTen');
      else if (left <= 3_600_000) setPhase('lastHour');
      else setPhase('standard');
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return phase;
}

export function useFinaleCountdown() {
  const [left, setLeft] = useState<number | null>(null);

  useEffect(() => {
    const target = FINALS_END.getTime();
    const tick = () => {
      const rem = target - Date.now();
      setLeft(rem > 0 ? rem : 0);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  if (left == null) return null;
  const total = Math.floor(left / 1000);
  return {
    h: String(Math.floor(total / 3600)).padStart(2, '0'),
    m: String(Math.floor((total % 3600) / 60)).padStart(2, '0'),
    s: String(total % 60).padStart(2, '0'),
    totalMs: left,
    expired: left === 0,
  };
}

function useCountdownTo(target: Date) {
  const [left, setLeft] = useState<number>(() => Math.max(0, target.getTime() - Date.now()));

  useEffect(() => {
    const t = target.getTime();
    const tick = () => setLeft(Math.max(0, t - Date.now()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [target]);

  const total = Math.floor(left / 1000);
  return {
    d: String(Math.floor(total / 86400)).padStart(2, '0'),
    h: String(Math.floor((total % 86400) / 3600)).padStart(2, '0'),
    m: String(Math.floor((total % 3600) / 60)).padStart(2, '0'),
    s: String(total % 60).padStart(2, '0'),
    totalMs: left,
    expired: left === 0,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   PRE-FINALE HERO — the "something massive is coming" section
   ═══════════════════════════════════════════════════════════════════════════ */

export function PreFinaleHero({ username }: { username?: string | null }) {
  const countdown = useCountdownTo(FINALS_START);

  return (
    <section className="lux-hero mb-8 lg:mb-10" aria-labelledby="lux-hero-title">
      <span aria-hidden="true" className="lux-beam lux-beam-left" />
      <span aria-hidden="true" className="lux-beam lux-beam-right" />
      <LuxFrame />

      <div className="relative px-5 py-11 sm:px-10 sm:py-14 lg:py-16 text-center">
        <div className="lux-eyebrow">Null0rigin presents</div>
        <LuxOrnament className="mt-4" />
        <h2 id="lux-hero-title" className="lux-title mt-3">Grand Finale</h2>
        <div className="lux-eyebrow mt-2">The Final 50</div>
        <p className="lux-lede mx-auto mt-5 max-w-xl">
          {username && <>You made it, <span className="lux-lede-name">{username}</span>. </>}
          Only the qualified teams. One arena. Twelve hours of championship-level challenges.
        </p>

        <div className="mt-9">
          <div className="lux-label mb-4">{countdown.expired ? 'The gate is opening' : 'The gate opens in'}</div>
          {!countdown.expired && (
            <div role="timer" aria-live="off" className="flex items-stretch justify-center gap-2 sm:gap-3">
              <LuxUnit value={countdown.d} label="Days" />
              <span aria-hidden="true" className="lux-sep" />
              <LuxUnit value={countdown.h} label="Hours" />
              <span aria-hidden="true" className="lux-sep" />
              <LuxUnit value={countdown.m} label="Minutes" />
              <span aria-hidden="true" className="lux-sep" />
              <LuxUnit value={countdown.s} label="Seconds" />
            </div>
          )}
        </div>

        <div className="lux-dateline mt-8">
          <span>Friday · 25 September 2026</span>
          <span aria-hidden="true" className="lux-diamond" />
          <span className="tabular-nums">10:00 – 22:00 IST</span>
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-2 sm:gap-3">
          <span className="lux-chip">Arena <b>Sealed</b></span>
          <span className="lux-chip">Challenges <b>Locked</b></span>
          <span className="lux-chip">Status <b>Standby</b></span>
        </div>
      </div>
    </section>
  );
}

/** Digits in fixed cells, so the tile never jitters as the seconds change. */
function LuxUnit({ value, label }: { value: string; label: string }) {
  return (
    <div className="lux-unit">
      <span className="lux-digits">
        {value.split('').map((d, i) => <span key={i} className="lux-digit">{d}</span>)}
      </span>
      <span className="lux-unit-label">{label}</span>
    </div>
  );
}

/** Inset hairline with engraved corner brackets. */
function LuxFrame() {
  return (
    <span aria-hidden="true" className="lux-frame">
      <span className="lux-corner lux-corner-tl" />
      <span className="lux-corner lux-corner-tr" />
      <span className="lux-corner lux-corner-bl" />
      <span className="lux-corner lux-corner-br" />
    </span>
  );
}

function LuxOrnament({ className = '' }: { className?: string }) {
  return (
    <div aria-hidden="true" className={`lux-ornament ${className}`}>
      <span className="lux-rule" />
      <span className="lux-diamond" />
      <Crown className="h-5 w-5" strokeWidth={1.5} />
      <span className="lux-diamond" />
      <span className="lux-rule lux-rule-r" />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   PRE-FINALE NAV BADGE — "FINALE" badge that shows before event starts
   ═══════════════════════════════════════════════════════════════════════════ */

export function PreFinaleNavBadge() {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-micro uppercase tracking-widest ml-2"
      style={{
        border: '1px solid rgba(255,170,0,0.3)',
        backgroundColor: 'rgba(255,170,0,0.06)',
        color: '#ff9800',
      }}
    >
      <Star className="h-2 w-2" style={{ color: '#ffcc00' }} />
      FINALE
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   VIP LAYER — pre-finale, for the finalists themselves
   Only for the announced finalist teams (lib/finalists.ts) and admins:
   a one-time welcome, a personal pass, and a ticker under the nav.
   ═══════════════════════════════════════════════════════════════════════════ */

const VIP_WELCOME_KEY = 'cyberhx_vip_welcome_v3';

function welcomeSeen(): boolean {
  try { return !!localStorage.getItem(VIP_WELCOME_KEY); } catch { return false; }
}

/** Once per device: credentials check, access granted, then the finalist by name. */
export function FinalistWelcome({ username, teamName, place }: { username: string; teamName: string | null; place: number | null }) {
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(() => !welcomeSeen());
  const [stage, setStage] = useState<0 | 1 | 2>(reduce ? 2 : 0);
  const enterRef = useRef<HTMLButtonElement>(null);
  const ease = [0.22, 1, 0.36, 1] as const;

  const close = useCallback(() => {
    try { localStorage.setItem(VIP_WELCOME_KEY, '1'); } catch { /* private mode */ }
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    const timers = reduce
      ? []
      : [setTimeout(() => setStage(1), 1600), setTimeout(() => setStage(2), 2800)];
    timers.push(setTimeout(close, 11000));
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => { timers.forEach(clearTimeout); window.removeEventListener('keydown', onKey); };
  }, [open, reduce, close]);

  useEffect(() => { if (stage === 2) enterRef.current?.focus(); }, [stage]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label={`Welcome to the Grand Finale, ${username}`}
          className="lux-welcome fixed inset-0 z-[200] flex items-center justify-center overflow-hidden px-5"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.7, ease }}
          onClick={close}
        >
          <span aria-hidden="true" className="lux-beam lux-beam-left" />
          <span aria-hidden="true" className="lux-beam lux-beam-right" />
          <Guilloche />

          <AnimatePresence mode="wait">
            {stage < 2 ? (
              <motion.div key="seal" className="relative flex flex-col items-center text-center"
                initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.08, filter: 'blur(4px)' }} transition={{ duration: 0.5, ease }}
                onClick={e => e.stopPropagation()}>
                <div className="lux-seal">
                  <svg viewBox="0 0 120 120" aria-hidden="true">
                    <defs>
                      <linearGradient id="lux-welcome-g" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0" stopColor="#fff3c4" />
                        <stop offset="0.45" stopColor="#e3b54f" />
                        <stop offset="0.75" stopColor="#9c6a18" />
                        <stop offset="1" stopColor="#e3b54f" />
                      </linearGradient>
                    </defs>
                    <circle cx="60" cy="60" r="56" fill="none" stroke="rgba(227,181,79,0.14)" strokeWidth="1" />
                    <motion.circle cx="60" cy="60" r="56" fill="none" stroke="url(#lux-welcome-g)" strokeWidth="1.6"
                      strokeLinecap="round" transform="rotate(-90 60 60)"
                      initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.5, ease: 'easeInOut' }} />
                    <circle cx="60" cy="60" r="47" fill="none" stroke="url(#lux-welcome-g)" strokeWidth="0.5" opacity="0.5" />
                  </svg>
                  <AnimatePresence mode="wait">
                    {stage === 0 ? (
                      <motion.span key="crown" className="lux-seal-icon" exit={{ opacity: 0, scale: 0.8 }} transition={{ duration: 0.2 }}>
                        <Crown className="h-10 w-10" strokeWidth={1.3} />
                      </motion.span>
                    ) : (
                      <motion.span key="check" className="lux-seal-icon" initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.35, ease }}>
                        <CheckCircle className="h-10 w-10" strokeWidth={1.3} />
                      </motion.span>
                    )}
                  </AnimatePresence>
                </div>
                <AnimatePresence mode="wait">
                  {stage === 0 ? (
                    <motion.div key="verify" className="mt-7" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
                      <div className="lux-eyebrow">Verifying finalist credentials</div>
                      <div className="vip-scan mx-auto mt-4 h-px w-48 overflow-hidden" style={{ backgroundColor: 'rgba(227,181,79,0.14)' }}>
                        <span className="block h-full w-1/3" style={{ background: 'linear-gradient(90deg, transparent, #f3cf6b, transparent)' }} />
                      </div>
                      <div className="lux-serial mt-3 opacity-60">ID · {username.toUpperCase()}</div>
                    </motion.div>
                  ) : (
                    <motion.div key="granted" className="mt-7" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease }}>
                      <div className="lux-granted">Access granted</div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ) : (
              <motion.div key="invite" className="lux-invite relative w-full max-w-xl text-center"
                initial={reduce ? false : { opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.8, ease, delay: reduce ? 0 : 0.35 }}
                onClick={e => e.stopPropagation()}>
                <LuxFrame />
                <div className="relative px-6 py-10 sm:px-10 sm:py-12">
                  <LuxOrnament />
                  <div className="lux-eyebrow mt-5">Welcome to the Grand Finale</div>
                  <div className="lux-welcome-name mt-4">{username}</div>
                  {teamName && (
                    <div className="lux-tier mt-4 justify-center">
                      <span className="break-words">{teamName}</span>
                      {place && <><span aria-hidden="true" className="lux-diamond" /><span>Seat No. {String(place).padStart(2, '0')}</span></>}
                    </div>
                  )}
                  <p className="lux-lede mx-auto mt-5 max-w-sm">
                    Your team fought its way into the final. Your seat in the arena is reserved.
                  </p>
                  <div className="lux-dateline mt-6">
                    <span>Friday · 25 September 2026</span>
                    <span aria-hidden="true" className="lux-diamond" />
                    <span className="tabular-nums">Gate opens 10:00 IST</span>
                  </div>
                  <button ref={enterRef} type="button" onClick={close}
                    className="vip-enter mt-9 inline-flex items-center gap-2.5 rounded-pill px-7 py-3 text-small font-bold uppercase tracking-[0.24em] focus-ring">
                    <Crown className="h-4 w-4" strokeWidth={1.8} /> Enter the lobby
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {stage === 2 && !reduce && (
            <>
              <motion.span aria-hidden="true" className="lux-curtain lux-curtain-left"
                initial={{ x: 0 }} animate={{ x: '-102%' }} transition={{ duration: 1.3, ease: [0.65, 0, 0.35, 1] }} />
              <motion.span aria-hidden="true" className="lux-curtain lux-curtain-right"
                initial={{ x: 0 }} animate={{ x: '102%' }} transition={{ duration: 1.3, ease: [0.65, 0, 0.35, 1] }} />
            </>
          )}

          {stage < 2 && (
            <button type="button" onClick={close}
              className="lux-label absolute bottom-6 right-6 focus-ring rounded-inset px-2 py-1">
              Skip
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

interface FinalistPassProps {
  userId: string;
  username: string;
  /** Null while it loads; hasTeam says whether there is one to load. */
  teamName: string | null;
  hasTeam: boolean;
  teamMode: boolean;
  /** Qualifying place, null for admins previewing the pass. */
  place: number | null;
  squadSize: number;
  country: string | null;
  onOpenTeam: () => void;
}

type Metal = { hi: string; mid: string; lo: string };
const GOLD: Metal = { hi: '#fff3c4', mid: '#e3b54f', lo: '#9c6a18' };
const SILVER: Metal = { hi: '#ffffff', mid: '#c9d3dd', lo: '#6f7c89' };
const BRONZE: Metal = { hi: '#ffe2c4', mid: '#d08a4f', lo: '#7a4318' };
const metalFor = (place: number | null) => (place === 2 ? SILVER : place === 3 ? BRONZE : GOLD);

/** Banknote-style wave lines, drawn once. */
function Guilloche() {
  const d = useMemo(() => {
    const lines: string[] = [];
    for (let k = 0; k < 22; k++) {
      const base = 20 + k * 12;
      const pts: string[] = [];
      for (let x = 0; x <= 800; x += 10) {
        const y = base + 9 * Math.sin(x / 38 + k * 0.55) + 5 * Math.sin(x / 13 - k * 0.3);
        pts.push(`${x},${y.toFixed(1)}`);
      }
      lines.push('M' + pts.join('L'));
    }
    return lines.join('');
  }, []);
  return (
    <svg aria-hidden="true" className="lux-guilloche" viewBox="0 0 800 300" preserveAspectRatio="none">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="0.6" />
    </svg>
  );
}

/** The seat seal: rotating engraved ring around the qualifying place. */
function Medallion({ place, metal }: { place: number | null; metal: Metal }) {
  const uid = useMemo(() => Math.random().toString(36).slice(2, 8), []);
  const g = `lux-m-${uid}`;
  const ring = `lux-r-${uid}`;
  return (
    <div className="lux-medallion" role="img" aria-label={place ? `Seat ${place}` : 'Host'}>
      <svg viewBox="0 0 120 120">
        <defs>
          <linearGradient id={g} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={metal.hi} />
            <stop offset="0.45" stopColor={metal.mid} />
            <stop offset="0.7" stopColor={metal.lo} />
            <stop offset="1" stopColor={metal.mid} />
          </linearGradient>
          <path id={ring} d="M60,60 m-47,0 a47,47 0 1,1 94,0 a47,47 0 1,1 -94,0" />
        </defs>
        <circle cx="60" cy="60" r="58" fill="none" stroke={`url(#${g})`} strokeWidth="1.4" />
        <circle cx="60" cy="60" r="54" fill="none" stroke={`url(#${g})`} strokeWidth="0.5" opacity="0.6" />
        <g className="lux-medallion-ring">
          <text fill={`url(#${g})`} fontSize="6.4" fontFamily="Cinzel, Georgia, serif" fontWeight="600">
            <textPath href={`#${ring}`} textLength="288" lengthAdjust="spacing">GRAND FINALIST ◆ NULL0RIGIN ◆ MMXXVI ◆</textPath>
          </text>
        </g>
        <circle cx="60" cy="60" r="39" fill="#0c0a07" stroke={`url(#${g})`} strokeWidth="1.2" />
        <circle cx="60" cy="60" r="35" fill="none" stroke={`url(#${g})`} strokeWidth="0.4" opacity="0.5" />
        <text x="60" y="49" textAnchor="middle" fontSize="6.5" letterSpacing="2.4" fill={metal.mid} fontFamily="Inter, sans-serif" fontWeight="700">
          {place ? 'SEAT' : 'HOST'}
        </text>
        <text x="60" y="78" textAnchor="middle" fontSize={place ? 30 : 20} fill={`url(#${g})`} fontFamily="Cinzel, Georgia, serif" fontWeight="700">
          {place ? String(place).padStart(2, '0') : '★'}
        </text>
      </svg>
    </div>
  );
}

/** Bars from the pass id: decoration, but the same finalist always gets the same code. */
function PassBarcode({ seed }: { seed: string }) {
  const bars = useMemo(() => {
    const out: { x: number; w: number }[] = [];
    let x = 0;
    for (const ch of seed.replace(/[^0-9a-f]/gi, '').toLowerCase()) {
      const v = parseInt(ch, 16);
      const w = 1 + (v % 3);
      out.push({ x, w });
      x += w + 1 + ((v >> 2) % 2);
    }
    return { out, width: x };
  }, [seed]);
  return (
    <svg viewBox={`0 0 ${bars.width} 24`} preserveAspectRatio="none" className="h-9 w-full" aria-hidden="true">
      {bars.out.map((b, i) => <rect key={i} x={b.x} y="0" width={b.w} height="24" fill="#e3b54f" opacity={0.9} />)}
    </svg>
  );
}

/** The finalist's own credential: black card, foil, a seat seal. */
export function FinalistPass({ userId, username, teamName, hasTeam, teamMode, place, squadSize, country, onOpenTeam }: FinalistPassProps) {
  const reduce = useReducedMotion();
  const cardRef = useRef<HTMLDivElement>(null);
  const hex = userId.replace(/-/g, '').toUpperCase();
  const passId = `FNL-${hex.slice(0, 4)}-${hex.slice(4, 8)}`;
  const metal = metalFor(place);

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (reduce || e.pointerType !== 'mouse') return;
    const el = cardRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const mx = (e.clientX - r.left) / r.width;
    const my = (e.clientY - r.top) / r.height;
    el.style.setProperty('--mx', `${Math.round(mx * 100)}%`);
    el.style.setProperty('--my', `${Math.round(my * 100)}%`);
    el.style.setProperty('--rx', `${((0.5 - my) * 5).toFixed(2)}deg`);
    el.style.setProperty('--ry', `${((mx - 0.5) * 7).toFixed(2)}deg`);
  };
  const onLeave = () => {
    const el = cardRef.current;
    if (!el) return;
    el.style.setProperty('--rx', '0deg');
    el.style.setProperty('--ry', '0deg');
  };

  return (
    <section aria-label="Your finalist pass" className="mb-8 lg:mb-10 [perspective:1400px]">
      <div ref={cardRef} className="lux-pass" onPointerMove={onMove} onPointerLeave={onLeave}>
        <span aria-hidden="true" className="lux-pass-gloss" />

        <div className="lux-pass-main">
          <Guilloche />
          <span aria-hidden="true" className="lux-pass-sheen" />
          <LuxFrame />

          <div className="relative flex items-center justify-between gap-3">
            <span className="lux-mark"><Crown className="h-4 w-4" strokeWidth={1.6} /> Null0rigin</span>
            <span className="lux-label hidden sm:inline">Grand Finale · MMXXVI</span>
          </div>

          <div className="relative mt-6 flex items-center justify-between gap-5">
            <div className="min-w-0">
              <div className="lux-label">Issued to</div>
              <div className="lux-name mt-1.5">{username}</div>
              <div className="lux-tier mt-2">Grand Finalist <span aria-hidden="true" className="lux-diamond" /> All-access</div>
            </div>
            <Medallion place={place} metal={metal} />
          </div>

          <dl className="lux-fields relative mt-7">
            <LuxField label="Team">
              {hasTeam
                ? <span className="break-words">{teamName ?? '…'}</span>
                : <span style={{ color: teamMode ? '#ffb24d' : undefined }}>{teamMode ? 'Not set' : 'Solo'}</span>}
            </LuxField>
            <LuxField label="Squad">{hasTeam && squadSize > 0 ? `${squadSize} ${squadSize === 1 ? 'member' : 'members'}` : '—'}</LuxField>
            <LuxField label="Representing">{country || '—'}</LuxField>
            <LuxField label="Gate opens"><span className="tabular-nums">25 Sep · 10:00 IST</span></LuxField>
          </dl>

          {teamMode && !hasTeam && (
            <div className="relative mt-5 flex flex-wrap items-center gap-3 rounded-inset px-3 py-2.5 text-small"
              style={{ border: '1px solid rgba(255,178,77,0.35)', backgroundColor: 'rgba(255,178,77,0.06)', color: 'rgba(255,230,190,0.85)' }}>
              <AlertTriangle className="h-4 w-4 shrink-0" style={{ color: '#ffb24d' }} />
              <span className="min-w-0 flex-1">The finale is played in teams. Create or join yours before the gate opens.</span>
              <button type="button" onClick={onOpenTeam} className="btn btn-secondary btn-sm">Set up team</button>
            </div>
          )}

          <div aria-hidden="true" className="lux-microtext relative mt-6">
            {'NULL0RIGIN GRAND FINALE ◆ 25.09.2026 ◆ ADMIT ONE FINALIST ◆ '.repeat(6)}
          </div>
        </div>

        <span aria-hidden="true" className="lux-holo" />

        <div className="lux-pass-stub">
          <span aria-hidden="true" className="lux-perf" />
          <div className="lux-admit">Admit one</div>
          <div className="lux-label mt-1">Seat reserved</div>
          <div className="lux-stub-seat mt-4">{place ? `No. ${String(place).padStart(2, '0')}` : 'Host'}</div>
          <div className="mt-4 w-full"><PassBarcode seed={hex} /></div>
          <div className="lux-serial mt-2">{passId}</div>
        </div>
      </div>
    </section>
  );
}

function LuxField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="lux-label">{label}</dt>
      <dd className="lux-value mt-1.5">{children}</dd>
    </div>
  );
}

const TICKER_ITEMS = [
  'Finalist access confirmed',
  'Qualified teams only',
  '25.09.2026 · 10:00 – 22:00 IST',
  'One arena · twelve hours',
  'Challenges sealed until the gate opens',
  'Only the best remain',
];

/** Gold ticker under the nav. Decorative: everything in it is said elsewhere. */
export function VipTicker() {
  const run = TICKER_ITEMS.map(t => (
    <span key={t} className="inline-flex items-center gap-4 pr-4">
      <span aria-hidden="true" className="lux-diamond" />
      <span>{t}</span>
    </span>
  ));
  return (
    <div className="vip-ticker" aria-hidden="true">
      <div className="vip-ticker-track">
        <div className="vip-ticker-run">{run}</div>
        <div className="vip-ticker-run">{run}</div>
      </div>
    </div>
  );
}

const THANKS_KEY = 'cyberhx_finale_thanks_v2';
const DISCORD_URL = 'https://discord.gg/T3jDBWvFxE';

/**
 * For players whose team did not make the final: a thank-you, not a verdict.
 * Once per device. It ends by pointing at support, because a finalist whose
 * team name differs from the announced list would land here too.
 */
export function QualifierThanks() {
  const [open, setOpen] = useState(() => {
    try { return !localStorage.getItem(THANKS_KEY); } catch { return true; }
  });
  if (!open) return null;
  const dismiss = () => {
    try { localStorage.setItem(THANKS_KEY, '1'); } catch { /* private mode */ }
    setOpen(false);
  };
  return (
    <div className="max-w-screen-2xl mx-auto w-full px-4 sm:px-6 lg:px-8 pt-4">
      <div role="status" className="relative flex items-start gap-3 rounded-control px-4 py-3 text-small"
        style={{ border: '1px solid rgba(255,190,60,0.22)', backgroundColor: 'rgba(255,170,0,0.04)' }}>
        <Award className="mt-0.5 h-4 w-4 shrink-0" style={{ color: '#ffb74d' }} />
        <div className="min-w-0 flex-1 text-text-secondary leading-relaxed">
          <span className="font-semibold text-cyber-text">Thank you for competing in NullOrigin.</span>{' '}
          The Grand Finale on 25 Sep is for the qualified teams. You can follow it live on the scoreboard, and certificates for every team that scored will be issued on 27 September.{' '}
          <span className="text-text-muted">
            Qualified but seeing this? Email{' '}
            <a href={`mailto:${ADMIN_EMAIL}`} className="underline text-cyber-text">{ADMIN_EMAIL}</a>{' '}
            or message us on{' '}
            <a href={DISCORD_URL} target="_blank" rel="noopener noreferrer" className="underline text-cyber-text">Discord</a>.
          </span>
        </div>
        <button type="button" onClick={dismiss} aria-label="Dismiss"
          className="btn btn-ghost btn-sm btn-icon -mr-1 -mt-1 shrink-0">
          <span aria-hidden="true" className="text-body leading-none">×</span>
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   POST-FINALE HERO — the "championship complete" state
   ═══════════════════════════════════════════════════════════════════════════ */

export function PostFinaleHero({ eventName }: { eventName?: string | null }) {
  const reduce = useReducedMotion();

  return (
    <section className="post-finale-hero relative overflow-hidden rounded-card mb-8 lg:mb-10">
      {/* Background */}
      <div aria-hidden="true" className="absolute inset-0 pointer-events-none">
        <div
          className="absolute inset-0"
          style={{
            background: `radial-gradient(ellipse at 50% 30%, rgba(255,170,0,0.05) 0%, transparent 60%)`,
          }}
        />
      </div>

      {/* Top edge */}
      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-[2px]"
        style={{
          background: 'linear-gradient(90deg, transparent, rgba(255,170,0,0.4), transparent)',
        }}
      />

      <div className="relative px-5 py-10 sm:px-8 sm:py-14 text-center">
        {/* Trophy */}
        <motion.div
          className="mx-auto mb-4"
          initial={reduce ? false : { scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        >
          <div
            className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 rounded-full"
            style={{
              border: '2px solid rgba(255,170,0,0.3)',
              backgroundColor: 'rgba(255,170,0,0.06)',
              boxShadow: '0 0 40px rgba(255,170,0,0.1)',
            }}
          >
            <Trophy className="w-8 h-8 sm:w-10 sm:h-10" style={{ color: '#ffcc00' }} />
          </div>
        </motion.div>

        {/* Status badge */}
        <div className="flex items-center justify-center gap-2 mb-3">
          <span
            className="inline-flex items-center gap-1.5 rounded-pill px-3 py-1 text-micro uppercase tracking-[0.2em] font-bold"
            style={{
              border: '1px solid rgba(255,170,0,0.25)',
              backgroundColor: 'rgba(255,170,0,0.04)',
              color: 'rgba(255,200,100,0.7)',
            }}
          >
            <CheckCircle className="h-3 w-3" />
            COMPLETE
          </span>
        </div>

        {/* Title */}
        <h2
          className="text-[2rem] sm:text-[2.5rem] font-extrabold tracking-tighter leading-none"
          style={{
            background: 'linear-gradient(135deg, #ffcc00 0%, #ff9800 50%, rgba(255,170,0,0.6) 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          GRAND FINALE
        </h2>

        <p
          className="mt-3 text-body sm:text-h3 font-medium"
          style={{ color: 'rgba(255,200,100,0.6)' }}
        >
          The championship has concluded
        </p>

        <p
          className="mt-2 text-small max-w-sm mx-auto"
          style={{ color: 'rgba(255,200,100,0.35)' }}
        >
          Thank you to all finalists for competing in the NULL0RIGIN Grand Finale.
          Final standings are on the scoreboard.
        </p>

        {/* Event date reminder */}
        <div
          className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-inset text-micro font-mono uppercase tracking-widest"
          style={{
            border: '1px solid rgba(255,170,0,0.1)',
            backgroundColor: 'rgba(255,170,0,0.02)',
            color: 'rgba(255,200,100,0.35)',
          }}
        >
          <Clock className="h-3 w-3" />
          25 SEPTEMBER 2026 — CONCLUDED
        </div>
      </div>

      {/* Bottom edge */}
      <span
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 h-px"
        style={{
          background: 'linear-gradient(90deg, transparent, rgba(255,170,0,0.2), transparent)',
        }}
      />
    </section>
  );
}

export function PostFinaleNavBadge() {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-micro uppercase tracking-widest ml-2"
      style={{
        border: '1px solid rgba(255,170,0,0.2)',
        backgroundColor: 'rgba(255,170,0,0.04)',
        color: 'rgba(255,200,100,0.5)',
      }}
    >
      <CheckCircle className="h-2 w-2" />
      ENDED
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   ENTRY SEQUENCE — cinematic 2.8s intro, once per session (live phase only)
   ═══════════════════════════════════════════════════════════════════════════ */

const ENTRY_KEY = 'cyberhx_finale_entry_seen';

export function FinaleEntrySequence({ onComplete }: { onComplete: () => void }) {
  const reduce = useReducedMotion();
  const [stage, setStage] = useState<'logo' | 'text' | 'done'>('logo');

  useEffect(() => {
    try {
      if (sessionStorage.getItem(ENTRY_KEY)) { onComplete(); return; }
    } catch { /* private mode */ }

    if (reduce) {
      try { sessionStorage.setItem(ENTRY_KEY, '1'); } catch {}
      onComplete();
      return;
    }

    const t1 = setTimeout(() => setStage('text'), 800);
    const t2 = setTimeout(() => {
      setStage('done');
      try { sessionStorage.setItem(ENTRY_KEY, '1'); } catch {}
      onComplete();
    }, 2800);

    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [onComplete, reduce]);

  if (reduce) return null;

  return (
    <AnimatePresence>
      {stage !== 'done' && (
        <motion.div
          className="fixed inset-0 z-[200] flex flex-col items-center justify-center"
          style={{ backgroundColor: '#030608' }}
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        >
          <motion.div
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6 }}
            style={{
              background: 'radial-gradient(ellipse at center, rgba(255,170,0,0.08) 0%, rgba(255,100,0,0.04) 40%, transparent 70%)',
            }}
          />

          <div className="absolute inset-0 pointer-events-none finale-scanlines" aria-hidden="true" />

          <motion.div
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="relative">
              <Shield className="w-16 h-16 sm:w-20 sm:h-20" style={{ color: '#ff9800' }} />
              <motion.div
                className="absolute inset-0 flex items-center justify-center"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3, duration: 0.4 }}
              >
                <Crosshair className="w-7 h-7 sm:w-9 sm:h-9" style={{ color: '#ffcc00' }} />
              </motion.div>
            </div>
          </motion.div>

          <AnimatePresence>
            {stage === 'text' && (
              <motion.div
                className="mt-6 text-center"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              >
                <div className="finale-entry-label text-label uppercase tracking-[0.3em]"
                  style={{ color: '#ff9800' }}>
                  CyberHX Championship
                </div>
                <h1
                  className="mt-3 text-display sm:text-[4rem] font-extrabold tracking-tighter"
                  style={{
                    background: 'linear-gradient(135deg, #ffcc00 0%, #ff9800 40%, #ff6d00 70%, #ffcc00 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundSize: '200% 200%',
                  }}
                >
                  GRAND FINALE
                </h1>
                <div
                  className="mt-2 text-small tracking-widest uppercase"
                  style={{ color: 'rgba(255,200,100,0.6)' }}
                >
                  Only the best remain
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <motion.div
            className="absolute left-0 right-0 h-px"
            style={{
              top: '50%',
              background: 'linear-gradient(90deg, transparent 0%, rgba(255,170,0,0.4) 30%, rgba(255,170,0,0.4) 70%, transparent 100%)',
            }}
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 1.2, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   CHAMPIONSHIP HEADER — the live finale header
   ═══════════════════════════════════════════════════════════════════════════ */

interface FinaleHeaderProps {
  eventName?: string | null;
  score: number;
  solved: number;
  total: number;
}

export function FinaleHeader({ eventName, score, solved, total }: FinaleHeaderProps) {
  const countdown = useFinaleCountdown();
  const phase = useFinalePhase();
  const reduce = useReducedMotion();

  const pct = total > 0 ? Math.round((solved / total) * 100) : 0;

  const clockColor =
    phase === 'lastMinute' ? '#ff3d3d'
      : phase === 'lastTen' ? '#ff6a3d'
      : phase === 'lastHour' ? '#ffa726'
      : '#ffcc00';

  const phaseLabel =
    phase === 'lastMinute' ? 'FINAL SECONDS'
      : phase === 'lastTen' ? 'ENDGAME'
      : phase === 'lastHour' ? 'CLOSING HOUR'
      : 'CHAMPIONSHIP';

  return (
    <header className="finale-header surface relative mb-8 overflow-hidden rounded-card lg:mb-10">
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse at 30% 0%, rgba(255,170,0,0.06) 0%, transparent 60%),
                       radial-gradient(ellipse at 70% 100%, rgba(255,100,0,0.04) 0%, transparent 50%)`,
        }}
      />

      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-[2px]"
        style={{
          background: 'linear-gradient(90deg, transparent, #ff9800, #ffcc00, #ff9800, transparent)',
        }}
      />

      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 w-[2px]"
        style={{ backgroundColor: clockColor }}
      />

      <div className="relative p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <FinalesLiveBadge phase={phase} />
              <span className="badge finale-badge-phase" style={{ borderColor: `${clockColor}44`, color: clockColor }}>
                {phaseLabel}
              </span>
            </div>

            <h2 className="mt-3 text-h1 sm:text-display font-extrabold tracking-tighter finale-title-gradient">
              {eventName ? `${eventName} — FINALE` : 'GRAND FINALE'}
            </h2>

            <p className="mt-2 text-small flex items-center gap-2" style={{ color: 'rgba(255,200,100,0.7)' }}>
              <Star className="h-3 w-3 shrink-0" style={{ color: '#ff9800' }} />
              Only the best remain. Make every flag count.
            </p>
          </div>

          {countdown && !countdown.expired && (
            <div className="text-right shrink-0">
              <div className="label-micro flex items-center justify-end gap-1.5" style={{ color: 'rgba(255,200,100,0.6)' }}>
                <Timer className="h-3 w-3" aria-hidden="true" />
                Remaining
              </div>
              <div
                className={`readout mt-1.5 font-mono leading-none tabular-nums ${
                  phase === 'lastMinute' ? 'finale-clock-critical' : ''
                }`}
                style={{
                  color: clockColor,
                  fontSize: phase === 'lastMinute' ? '3rem' : '2.125rem',
                  textShadow: `0 0 20px ${clockColor}44`,
                }}
                aria-label={`${countdown.h} hours ${countdown.m} minutes remaining`}
              >
                {countdown.h}<span style={{ color: 'rgba(255,200,100,0.4)' }}>:</span>
                {countdown.m}<span style={{ color: 'rgba(255,200,100,0.4)' }}>:</span>
                {countdown.s}
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 grid grid-cols-3 gap-5 border-t pt-5" style={{ borderColor: 'rgba(255,170,0,0.15)' }}>
          <div>
            <div className="label-micro flex items-center gap-1.5" style={{ color: 'rgba(255,200,100,0.5)' }}>
              <Zap className="h-3 w-3 shrink-0" aria-hidden="true" />
              Score
            </div>
            <div className="readout mt-1.5 text-h2 leading-none tabular-nums font-mono" style={{ color: '#ffcc00' }}>
              {score.toLocaleString()}
            </div>
          </div>

          <div>
            <div className="label-micro flex items-center gap-1.5" style={{ color: 'rgba(255,200,100,0.5)' }}>
              <Target className="h-3 w-3 shrink-0" aria-hidden="true" />
              Solved
            </div>
            <div className="readout mt-1.5 text-h2 leading-none tabular-nums font-mono" style={{ color: '#ffcc00' }}>
              {solved}<span style={{ color: 'rgba(255,200,100,0.4)' }}> / {total}</span>
            </div>
          </div>

          <div>
            <div className="label-micro flex items-center gap-1.5" style={{ color: 'rgba(255,200,100,0.5)' }}>
              <Activity className="h-3 w-3 shrink-0" aria-hidden="true" />
              Progress
            </div>
            <div className="readout mt-1.5 text-h2 leading-none tabular-nums font-mono" style={{ color: '#ffcc00' }}>
              {pct}<span style={{ color: 'rgba(255,200,100,0.4)' }}>%</span>
            </div>
          </div>
        </div>

        <div className="mt-4 h-1.5 w-full overflow-hidden rounded-pill" style={{ backgroundColor: 'rgba(255,170,0,0.1)' }} aria-hidden="true">
          <div
            className="h-full origin-left rounded-pill"
            style={{
              background: 'linear-gradient(90deg, #ff9800, #ffcc00)',
              transform: `scaleX(${Math.max(0, Math.min(1, total > 0 ? solved / total : 0))})`,
              transition: 'transform 360ms cubic-bezier(0.22, 1, 0.36, 1)',
            }}
          />
        </div>
      </div>

      <span
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 h-px"
        style={{
          background: 'linear-gradient(90deg, transparent, rgba(255,170,0,0.3), transparent)',
        }}
      />
    </header>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   LIVE BADGE
   ═══════════════════════════════════════════════════════════════════════════ */

function FinalesLiveBadge({ phase }: { phase: FinalePhase }) {
  const color = phase === 'lastMinute' ? '#ff3d3d'
    : phase === 'lastTen' ? '#ff6a3d'
    : '#ff9800';

  return (
    <span
      className="finale-live-badge inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-micro uppercase tracking-widest font-bold"
      style={{
        borderColor: `${color}55`,
        color,
        backgroundColor: `${color}12`,
        border: `1px solid ${color}44`,
      }}
    >
      <span className="finale-live-dot" style={{ backgroundColor: color }} />
      LIVE
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   NAV BADGE — small indicator in the top nav (live phase)
   ═══════════════════════════════════════════════════════════════════════════ */

export function FinalsNavBadge() {
  const phase = useFinalePhase();
  const color = phase === 'lastMinute' ? '#ff3d3d'
    : phase === 'lastTen' ? '#ff6a3d'
    : '#ff9800';

  return (
    <span
      className="finale-nav-badge inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-micro uppercase tracking-widest ml-2"
      style={{
        border: `1px solid ${color}44`,
        backgroundColor: `${color}10`,
        color,
      }}
    >
      <span className="finale-live-dot" style={{ backgroundColor: color }} />
      FINALE
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   GOLD PARTICLE RAIN — canvas overlay (live + pre phases)
   ═══════════════════════════════════════════════════════════════════════════ */

export function GoldParticles({ intensity = 1 }: { intensity?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduce = useRef(
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || reduce.current) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    const particles: { x: number; y: number; vx: number; vy: number; size: number; opacity: number; hue: number }[] = [];
    const COUNT = Math.round(45 * intensity);

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    for (let i = 0; i < COUNT; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.25,
        vy: 0.15 + Math.random() * 0.4,
        size: 0.8 + Math.random() * 2,
        opacity: (0.15 + Math.random() * 0.35) * intensity,
        hue: 30 + Math.random() * 30,
      });
    }

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.y > canvas.height) { p.y = -4; p.x = Math.random() * canvas.width; }
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${p.hue}, 80%, 55%, ${p.opacity})`;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 2, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${p.hue}, 80%, 55%, ${p.opacity * 0.1})`;
        ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [intensity]);

  if (reduce.current) return null;

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[1]"
      style={{ opacity: 0.5 }}
    />
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   SCAN LINES + DATA RAIN — CSS-only atmospheric overlays
   ═══════════════════════════════════════════════════════════════════════════ */

export function FinaleAtmosphere() {
  const reduce = useReducedMotion();
  if (reduce) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[2]" aria-hidden="true">
      <div
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse at center, transparent 50%, rgba(3,6,8,0.4) 100%)',
        }}
      />
      <div className="absolute inset-0 finale-scanlines" />
      <div
        className="absolute inset-x-0 top-0 h-px"
        style={{ background: 'linear-gradient(90deg, transparent 10%, rgba(255,170,0,0.12) 50%, transparent 90%)' }}
      />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   ENDGAME ESCALATION — overlay effects for the final minutes
   ═══════════════════════════════════════════════════════════════════════════ */

export function EndgameOverlay() {
  const phase = useFinalePhase();
  const reduce = useReducedMotion();

  if (reduce || phase === 'standard') return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[3]" aria-hidden="true">
      {phase === 'lastHour' && (
        <div className="absolute inset-0 finale-border-pulse" style={{ borderColor: 'rgba(255,170,0,0.08)' }} />
      )}

      {(phase === 'lastTen' || phase === 'lastMinute') && (
        <>
          <div className="absolute top-0 left-0 w-24 h-24" style={{
            background: 'linear-gradient(135deg, rgba(255,100,0,0.08) 0%, transparent 60%)',
          }} />
          <div className="absolute top-0 right-0 w-24 h-24" style={{
            background: 'linear-gradient(225deg, rgba(255,100,0,0.08) 0%, transparent 60%)',
          }} />
        </>
      )}

      {phase === 'lastMinute' && (
        <div
          className="absolute inset-0 finale-critical-pulse"
          style={{
            background: 'radial-gradient(ellipse at center, transparent 40%, rgba(255,60,60,0.06) 100%)',
          }}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   HEX RAIN — decorative microtext in the background
   ═══════════════════════════════════════════════════════════════════════════ */

export function HexRain() {
  const reduce = useReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);

  const columns = useMemo(() => {
    const count = typeof window !== 'undefined' ? Math.floor(window.innerWidth / 100) : 12;
    return Array.from({ length: Math.min(count, 20) }, (_, i) => ({
      left: `${(i / count) * 100}%`,
      delay: `${(i * 1.3) % 8}s`,
      duration: `${12 + (i % 5) * 3}s`,
      opacity: 0.015 + (i % 3) * 0.008,
    }));
  }, []);

  if (reduce) return null;

  return (
    <div ref={containerRef} className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
      {columns.map((col, i) => (
        <div
          key={i}
          className="absolute top-0 finale-hex-column font-mono text-micro leading-relaxed"
          style={{
            left: col.left,
            animationDelay: col.delay,
            animationDuration: col.duration,
            opacity: col.opacity,
            color: '#ff9800',
          }}
        >
          {'0xDEADBEEF\n0xCAFEBABE\n0x8BADF00D\n0xFF1CE\n0xC0FFEE\n0xD15EA5E\n0xBAAAAAAD\n0xFACEFEED\n0xB16B00B5\n0x1BADB002'}
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   FINALIST BADGE — shown near player identity in nav area
   ═══════════════════════════════════════════════════════════════════════════ */

export function FinalistBadge({ username }: { username?: string }) {
  return (
    <span
      className="finale-finalist-badge inline-flex items-center gap-1.5 rounded-pill px-2.5 py-0.5 text-micro uppercase tracking-widest"
      style={{
        border: '1px solid rgba(255,170,0,0.3)',
        backgroundColor: 'rgba(255,170,0,0.06)',
        color: '#ffcc00',
      }}
    >
      <Crown className="h-2.5 w-2.5" />
      Finalist
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   FINALE SOLVE CELEBRATION
   ═══════════════════════════════════════════════════════════════════════════ */

export function FinaleSolveBurst({ points }: { points: number }) {
  const reduce = useReducedMotion();

  return (
    <motion.div
      className="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center overflow-hidden rounded-[inherit]"
      initial={reduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      <motion.div
        className="absolute inset-0"
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: [0, 1, 0.6], scale: [0.5, 1.2, 1] }}
        transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
        style={{
          background: 'radial-gradient(circle, rgba(255,200,50,0.15) 0%, rgba(255,150,0,0.05) 50%, transparent 70%)',
        }}
      />

      <motion.div
        className="relative text-center"
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.2, duration: 0.5, ease: [0.34, 1.4, 0.64, 1] }}
      >
        <Crown className="mx-auto h-8 w-8" style={{ color: '#ffcc00' }} />
        <div
          className="mt-2 text-h2 font-extrabold tabular-nums font-mono"
          style={{ color: '#ffcc00', textShadow: '0 0 20px rgba(255,200,50,0.4)' }}
        >
          +{points}
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   LEADERBOARD PODIUM CROWN — gold treatment for top-3 in finals
   ═══════════════════════════════════════════════════════════════════════════ */

export function FinalePodiumMark({ rank }: { rank: number }) {
  if (rank > 3) return null;
  const tones = [
    { color: '#ffcc00', glow: 'rgba(255,200,50,0.3)' },
    { color: '#c0c0c0', glow: 'rgba(192,192,192,0.2)' },
    { color: '#cd7f32', glow: 'rgba(205,127,50,0.2)' },
  ];
  const t = tones[rank - 1];

  return (
    <span
      className="inline-flex items-center justify-center w-8 h-8 rounded-inset finale-podium-glow"
      style={{
        color: t.color,
        borderColor: `${t.color}44`,
        border: `1px solid ${t.color}44`,
        backgroundColor: `${t.color}10`,
        boxShadow: `0 0 12px ${t.glow}`,
      }}
    >
      {rank === 1 ? <Crown className="w-4 h-4" /> : <Trophy className="w-3.5 h-3.5" />}
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   FINAL WARNING BANNER — appears during last 10 minutes
   ═══════════════════════════════════════════════════════════════════════════ */

export function FinalWarningBanner() {
  const phase = useFinalePhase();
  const countdown = useFinaleCountdown();

  if (phase === 'standard' || phase === 'lastHour') return null;
  if (!countdown || countdown.expired) return null;

  const isLast60 = phase === 'lastMinute';
  const color = isLast60 ? '#ff3d3d' : '#ff6a3d';

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      className="w-full overflow-hidden"
    >
      <div
        className="flex items-center justify-center gap-3 py-2 px-4 text-small font-semibold"
        style={{
          backgroundColor: `${color}10`,
          borderBottom: `1px solid ${color}22`,
          color,
        }}
      >
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        {isLast60 ? (
          <span>FINAL MINUTE — {countdown.s} seconds remaining!</span>
        ) : (
          <span>ENDGAME — {countdown.m}:{countdown.s} remaining</span>
        )}
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
      </div>
    </motion.div>
  );
}
