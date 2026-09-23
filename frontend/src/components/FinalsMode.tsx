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
  const reduce = useReducedMotion();

  return (
    <section className="pre-finale-hero relative overflow-hidden rounded-card mb-8 lg:mb-10">
      {/* Background layers */}
      <div aria-hidden="true" className="absolute inset-0 pointer-events-none">
        <div
          className="absolute inset-0"
          style={{
            background: `radial-gradient(ellipse at 20% 20%, rgba(255,170,0,0.06) 0%, transparent 50%),
                         radial-gradient(ellipse at 80% 80%, rgba(255,100,0,0.04) 0%, transparent 50%)`,
          }}
        />
        <div className="absolute inset-0 finale-scanlines" />
      </div>

      {/* Top gold edge */}
      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-[2px]"
        style={{
          background: 'linear-gradient(90deg, transparent, #ff9800, #ffcc00, #ff9800, transparent)',
        }}
      />

      {/* Left accent */}
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 w-[2px]"
        style={{ backgroundColor: '#ff9800' }}
      />

      <div className="relative px-5 py-10 sm:px-8 sm:py-14 lg:py-16 text-center">
        {/* Eyebrow */}
        <div className="flex items-center justify-center gap-2 mb-4">
          <span
            className="inline-flex items-center gap-1.5 rounded-pill px-3 py-1 text-micro uppercase tracking-[0.2em] font-bold"
            style={{
              border: '1px solid rgba(255,170,0,0.3)',
              backgroundColor: 'rgba(255,170,0,0.06)',
              color: '#ff9800',
            }}
          >
            <Shield className="h-3 w-3" />
            NULL0RIGIN
          </span>
        </div>

        {/* Title */}
        <div
          className="label-micro tracking-[0.3em] uppercase mb-2"
          style={{ color: 'rgba(255,200,100,0.6)' }}
        >
          The Final 50
        </div>
        <h2
          className="text-[2rem] sm:text-[3rem] lg:text-[3.5rem] font-extrabold tracking-tighter leading-none finale-title-gradient"
        >
          GRAND FINALE
        </h2>
        <p
          className="mt-3 text-small sm:text-body max-w-lg mx-auto"
          style={{ color: 'rgba(255,200,100,0.55)' }}
        >
          {username
            ? <>You made it, <span style={{ color: '#ffcc00' }}>{username}</span>. Only the qualified teams. One arena. 12 hours of championship-level challenges.</>
            : 'Only the qualified teams. One arena. 12 hours of championship-level challenges.'}
        </p>

        {/* Countdown */}
        <div className="mt-8 sm:mt-10">
          <div
            className="label-micro tracking-[0.2em] uppercase mb-4 flex items-center justify-center gap-2"
            style={{ color: 'rgba(255,200,100,0.5)' }}
          >
            <Clock className="h-3 w-3" />
            {countdown.expired ? 'Starting Now' : 'Starts In'}
          </div>

          {!countdown.expired && (
            <div className="flex items-center justify-center gap-2 sm:gap-4">
              <CountdownUnit value={countdown.d} label="Days" />
              <span className="text-h1 sm:text-display font-mono tabular-nums" style={{ color: 'rgba(255,200,100,0.25)' }}>:</span>
              <CountdownUnit value={countdown.h} label="Hours" />
              <span className="text-h1 sm:text-display font-mono tabular-nums" style={{ color: 'rgba(255,200,100,0.25)' }}>:</span>
              <CountdownUnit value={countdown.m} label="Minutes" />
              <span className="text-h1 sm:text-display font-mono tabular-nums" style={{ color: 'rgba(255,200,100,0.25)' }}>:</span>
              <CountdownUnit value={countdown.s} label="Seconds" />
            </div>
          )}
        </div>

        {/* Event date line */}
        <div
          className="mt-6 flex items-center justify-center gap-3 text-small font-mono tabular-nums"
          style={{ color: 'rgba(255,200,100,0.45)' }}
        >
          <span>25 SEPTEMBER 2026</span>
          <span style={{ color: 'rgba(255,200,100,0.2)' }}>|</span>
          <span>10:00 AM — 10:00 PM IST</span>
        </div>

        {/* Status cards */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3 sm:gap-4">
          <PreFinaleStatusChip icon={<Target className="h-3 w-3" />} label="Arena" value="LOCKED" />
          <PreFinaleStatusChip icon={<Lock className="h-3 w-3" />} label="Challenges" value="SEALED" />
          <PreFinaleStatusChip icon={<Radio className="h-3 w-3" />} label="Status" value="STANDBY" />
        </div>
      </div>

      {/* Bottom edge */}
      <span
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 h-px"
        style={{
          background: 'linear-gradient(90deg, transparent, rgba(255,170,0,0.3), transparent)',
        }}
      />
    </section>
  );
}

function CountdownUnit({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <div
        className="text-[1.75rem] sm:text-[2.5rem] lg:text-[3rem] font-extrabold font-mono tabular-nums leading-none"
        style={{
          color: '#ffcc00',
          textShadow: '0 0 30px rgba(255,200,50,0.25)',
        }}
      >
        {value}
      </div>
      <div
        className="mt-1 text-micro font-mono uppercase tracking-[0.15em]"
        style={{ color: 'rgba(255,200,100,0.4)' }}
      >
        {label}
      </div>
    </div>
  );
}

function PreFinaleStatusChip({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5 rounded-inset text-micro font-mono uppercase tracking-widest"
      style={{
        border: '1px solid rgba(255,170,0,0.15)',
        backgroundColor: 'rgba(255,170,0,0.03)',
        color: 'rgba(255,200,100,0.5)',
      }}
    >
      {icon}
      <span>{label}</span>
      <span style={{ color: '#ff9800' }}>{value}</span>
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

const VIP_WELCOME_KEY = 'cyberhx_vip_welcome_v2';
const GOLD_TEXT: React.CSSProperties = {
  background: 'linear-gradient(135deg, #ffe08a 0%, #ffcc00 30%, #ff9800 65%, #ffcc00 100%)',
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  backgroundClip: 'text',
};

function welcomeSeen(): boolean {
  try { return !!localStorage.getItem(VIP_WELCOME_KEY); } catch { return false; }
}

/** Once per device: credentials check, access granted, then the finalist by name. */
export function FinalistWelcome({ username, teamName, place }: { username: string; teamName: string | null; place: number | null }) {
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(() => !welcomeSeen());
  const [stage, setStage] = useState<0 | 1 | 2>(reduce ? 2 : 0);
  const enterRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => {
    try { localStorage.setItem(VIP_WELCOME_KEY, '1'); } catch { /* private mode */ }
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    const timers = reduce
      ? []
      : [setTimeout(() => setStage(1), 1300), setTimeout(() => setStage(2), 2400)];
    timers.push(setTimeout(close, reduce ? 9000 : 8000));
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
          className="fixed inset-0 z-[200] flex items-center justify-center px-6"
          style={{ backgroundColor: '#030608' }}
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          onClick={close}
        >
          <div aria-hidden="true" className="absolute inset-0 pointer-events-none" style={{
            background: 'radial-gradient(ellipse at 50% 45%, rgba(255,180,40,0.10) 0%, rgba(255,110,0,0.04) 38%, transparent 70%)',
          }} />
          <div aria-hidden="true" className="absolute inset-0 pointer-events-none finale-scanlines" />
          <span aria-hidden="true" className="vip-curtain vip-curtain-left" />
          <span aria-hidden="true" className="vip-curtain vip-curtain-right" />

          <div className="relative w-full max-w-xl text-center" onClick={e => e.stopPropagation()}>
            <AnimatePresence mode="wait">
              {stage === 0 && (
                <motion.div key="verify" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
                  <Shield className="mx-auto h-12 w-12" style={{ color: '#ff9800' }} />
                  <div className="mt-5 font-mono text-micro uppercase tracking-[0.3em]" style={{ color: 'rgba(255,200,100,0.7)' }}>
                    Verifying finalist credentials
                  </div>
                  <div className="vip-scan mx-auto mt-4 h-[2px] w-56 overflow-hidden rounded-pill" style={{ backgroundColor: 'rgba(255,170,0,0.12)' }}>
                    <span className="block h-full w-1/3" style={{ background: 'linear-gradient(90deg, transparent, #ffcc00, transparent)' }} />
                  </div>
                  <div className="mt-3 font-mono text-micro tracking-widest" style={{ color: 'rgba(255,200,100,0.35)' }}>
                    ID · {username.toUpperCase()}
                  </div>
                </motion.div>
              )}
              {stage === 1 && (
                <motion.div key="granted" initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}>
                  <CheckCircle className="mx-auto h-12 w-12" style={{ color: '#ffcc00' }} />
                  <div className="mt-5 text-h2 sm:text-h1 font-extrabold uppercase tracking-[0.2em]" style={GOLD_TEXT}>
                    Access granted
                  </div>
                </motion.div>
              )}
              {stage === 2 && (
                <motion.div key="welcome"
                  initial={reduce ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}>
                  <Crown className="mx-auto h-10 w-10" style={{ color: '#ffcc00', filter: 'drop-shadow(0 0 14px rgba(255,200,0,0.45))' }} />
                  <div className="mt-5 text-micro uppercase tracking-[0.35em]" style={{ color: 'rgba(255,200,100,0.7)' }}>
                    Welcome to the Grand Finale
                  </div>
                  <div className="mt-3 break-words text-[2.5rem] sm:text-[3.75rem] font-extrabold leading-none tracking-tighter" style={GOLD_TEXT}>
                    {username}
                  </div>
                  {teamName && (
                    <div className="mt-3 text-small sm:text-body font-semibold" style={{ color: 'rgba(255,236,200,0.9)' }}>
                      {teamName}{place && <span style={{ color: '#ffcc00' }}> · Qualified #{place}</span>}
                    </div>
                  )}
                  <p className="mx-auto mt-4 max-w-sm text-small sm:text-body" style={{ color: 'rgba(255,220,160,0.7)' }}>
                    Your team fought its way into the final. Your seat in the arena is reserved.
                  </p>
                  <div className="mt-4 font-mono text-micro uppercase tracking-[0.2em] tabular-nums" style={{ color: 'rgba(255,200,100,0.45)' }}>
                    25 Sep 2026 · Gate opens 10:00 IST
                  </div>
                  <button
                    ref={enterRef}
                    type="button"
                    onClick={close}
                    className="vip-enter mt-8 inline-flex items-center gap-2 rounded-pill px-6 py-2.5 text-small font-bold uppercase tracking-[0.18em] focus-ring"
                  >
                    <Star className="h-3.5 w-3.5" /> Enter the lobby
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {stage < 2 && (
            <button type="button" onClick={close}
              className="absolute bottom-6 right-6 font-mono text-micro uppercase tracking-widest focus-ring rounded-inset px-2 py-1"
              style={{ color: 'rgba(255,200,100,0.45)' }}>
              Skip
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
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
    <svg viewBox={`0 0 ${bars.width} 24`} preserveAspectRatio="none" className="h-8 w-full" aria-hidden="true">
      {bars.out.map((b, i) => <rect key={i} x={b.x} y="0" width={b.w} height="24" fill="#ffcc00" opacity={0.85} />)}
    </svg>
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

/** The finalist's own credential. Follows the pointer like foil does. */
export function FinalistPass({ userId, username, teamName, hasTeam, teamMode, place, squadSize, country, onOpenTeam }: FinalistPassProps) {
  const reduce = useReducedMotion();
  const cardRef = useRef<HTMLDivElement>(null);
  const hex = userId.replace(/-/g, '').toUpperCase();
  const passId = `FNL-${hex.slice(0, 4)}-${hex.slice(4, 8)}`;

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (reduce || e.pointerType !== 'mouse') return;
    const el = cardRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const mx = (e.clientX - r.left) / r.width;
    const my = (e.clientY - r.top) / r.height;
    el.style.setProperty('--mx', `${Math.round(mx * 100)}%`);
    el.style.setProperty('--rx', `${((0.5 - my) * 4).toFixed(2)}deg`);
    el.style.setProperty('--ry', `${((mx - 0.5) * 6).toFixed(2)}deg`);
  };
  const onLeave = () => {
    const el = cardRef.current;
    if (!el) return;
    el.style.setProperty('--rx', '0deg');
    el.style.setProperty('--ry', '0deg');
  };

  return (
    <section aria-label="Your finalist pass" className="mb-8 lg:mb-10 [perspective:1200px]">
      <div ref={cardRef} className="vip-pass" onPointerMove={onMove} onPointerLeave={onLeave}>
        <span aria-hidden="true" className="vip-pass-foil" />

        <div className="vip-pass-main">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-micro font-bold uppercase tracking-[0.25em]" style={{ color: '#ffcc00' }}>
              <Crown className="h-3.5 w-3.5" /> Finalist pass
            </span>
            <span className="font-mono text-micro uppercase tracking-[0.2em]" style={{ color: 'rgba(255,200,100,0.45)' }}>
              Null0rigin · Grand Finale
            </span>
          </div>

          <div className="mt-5">
            <div className="text-micro uppercase tracking-[0.25em]" style={{ color: 'rgba(255,200,100,0.5)' }}>Issued to</div>
            <div className="mt-1 break-words text-[1.75rem] sm:text-[2.25rem] font-extrabold leading-tight tracking-tight" style={GOLD_TEXT}>
              {username}
            </div>
          </div>

          <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
            <PassField label="Team">
              {hasTeam
                ? <span className="break-words">{teamName ?? '…'}</span>
                : <span style={{ color: teamMode ? '#ffa726' : undefined }}>{teamMode ? 'Not set' : 'Solo'}</span>}
            </PassField>
            <PassField label="Squad">{hasTeam && squadSize > 0 ? `${squadSize} ${squadSize === 1 ? 'member' : 'members'}` : '—'}</PassField>
            <PassField label="Qualified">
              {place
                ? <span className="tabular-nums" style={{ color: PODIUM[place - 1] ?? '#ffcc00' }}>#{place}</span>
                : <span style={{ color: '#ffcc00' }}>Host</span>}
            </PassField>
            <PassField label="Gate opens"><span className="tabular-nums">25 Sep · 10:00 IST</span></PassField>
          </dl>

          {country && (
            <div className="mt-4 text-small" style={{ color: 'rgba(255,220,160,0.6)' }}>
              Representing <span style={{ color: 'rgba(255,230,180,0.9)' }}>{country}</span>
            </div>
          )}

          {teamMode && !hasTeam && (
            <div className="mt-5 flex flex-wrap items-center gap-3 rounded-inset px-3 py-2.5 text-small"
              style={{ border: '1px solid rgba(255,167,38,0.35)', backgroundColor: 'rgba(255,167,38,0.06)', color: 'rgba(255,220,160,0.85)' }}>
              <AlertTriangle className="h-4 w-4 shrink-0" style={{ color: '#ffa726' }} />
              <span className="min-w-0 flex-1">The finale is played in teams. Create or join yours before the gate opens.</span>
              <button type="button" onClick={onOpenTeam} className="btn btn-secondary btn-sm">Set up team</button>
            </div>
          )}
        </div>

        <div className="vip-pass-stub">
          <div className="text-micro font-bold uppercase tracking-[0.3em]" style={{ color: '#ffcc00' }}>Admit one</div>
          <div className="mt-1 text-micro uppercase tracking-[0.2em]" style={{ color: 'rgba(255,200,100,0.5)' }}>All-access · Seat reserved</div>
          <div className="mt-4 w-full"><PassBarcode seed={hex} /></div>
          <div className="mt-2 font-mono text-micro tracking-[0.18em] tabular-nums" style={{ color: 'rgba(255,220,160,0.75)' }}>{passId}</div>
          <div className="mt-3 inline-flex items-center gap-1.5 text-micro uppercase tracking-widest" style={{ color: 'rgba(255,200,100,0.5)' }}>
            <Award className="h-3 w-3" /> Grand Finalist
          </div>
        </div>
      </div>
    </section>
  );
}

const PODIUM = ['#ffd54a', '#d9e2ec', '#e59a5b'];

function PassField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-micro uppercase tracking-[0.2em]" style={{ color: 'rgba(255,200,100,0.45)' }}>{label}</dt>
      <dd className="mt-1 text-small font-semibold" style={{ color: 'rgba(255,236,200,0.92)' }}>{children}</dd>
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
      <Star className="h-2.5 w-2.5" style={{ color: '#ffcc00' }} />
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

const THANKS_KEY = 'cyberhx_finale_thanks_v1';
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
          The Grand Finale on 25 Sep is for the qualified teams. You can follow it live on the scoreboard, and certificates for every team that scored are on their way.{' '}
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
