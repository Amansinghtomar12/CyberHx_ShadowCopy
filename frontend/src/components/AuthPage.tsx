// src/components/AuthPage.tsx
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import {
  Flag, Eye, EyeOff, ShieldCheck, ShieldAlert, AlertTriangle,
  Lock, Radio, Cpu, Zap, Globe2, Target,
  Wifi, ArrowRight, ChevronRight, Sparkles, Users,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import AmbientBackground from './AmbientBackground';
import SurfaceLight from './environment/SurfaceLight';
import CursorRing from './environment/CursorRing';
import { setMood } from './environment/mood';
import MagneticElement from './environment/MagneticElement';
import AccessSequence from './AccessSequence';
import { pendingInvite, clearInvite, type InvitePreview } from '../lib/invite';

// ── Turnstile Site Key — from environment variable ──
const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || '';

interface AuthPageProps {
  onSuccess: () => void;
}

/* ══ Decorative helpers (local, purely presentational) ═════════════════════ */

/** Viewfinder-style bracket that anchors the corners of the hero. */
function CornerBracket({ position }: {
  position: 'tl' | 'tr' | 'bl' | 'br';
}) {
  const pos = {
    tl: 'top-6 left-6 border-t border-l',
    tr: 'top-6 right-6 border-t border-r',
    bl: 'bottom-6 left-6 border-b border-l',
    br: 'bottom-6 right-6 border-b border-r',
  }[position];
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute h-6 w-6 border-cyber-neon/40 ${pos}`}
    />
  );
}

/** Concentric-circle "radar" element that rotates behind the hero content. */
function BackgroundRadar({ reduceMotion }: { reduceMotion: boolean }) {
  return (
    <motion.div
      aria-hidden="true"
      className="pointer-events-none absolute -top-24 -right-24 h-[520px] w-[520px] opacity-[0.09]"
      animate={reduceMotion ? undefined : { rotate: 360 }}
      transition={reduceMotion ? undefined : { duration: 90, ease: 'linear', repeat: Infinity }}
    >
      <svg viewBox="0 0 200 200" className="h-full w-full">
        <defs>
          <linearGradient id="scanline" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%"   stopColor="#c6ff00" stopOpacity="0"/>
            <stop offset="100%" stopColor="#c6ff00" stopOpacity="1"/>
          </linearGradient>
        </defs>
        <circle cx="100" cy="100" r="98" fill="none" stroke="#c6ff00" strokeWidth="0.5" />
        <circle cx="100" cy="100" r="80" fill="none" stroke="#c6ff00" strokeWidth="0.4" />
        <circle cx="100" cy="100" r="60" fill="none" stroke="#c6ff00" strokeWidth="0.3" />
        <circle cx="100" cy="100" r="40" fill="none" stroke="#c6ff00" strokeWidth="0.3" />
        <circle cx="100" cy="100" r="20" fill="none" stroke="#c6ff00" strokeWidth="0.3" />
        <line x1="100" y1="0"  x2="100" y2="200" stroke="#c6ff00" strokeWidth="0.3" />
        <line x1="0"   y1="100" x2="200" y2="100" stroke="#c6ff00" strokeWidth="0.3" />
        <line x1="100" y1="100" x2="200" y2="100" stroke="url(#scanline)" strokeWidth="1.5" />
      </svg>
    </motion.div>
  );
}

/** Auto-scrolling category marquee — reads as live telemetry. */
function CategoryTicker({ reduceMotion }: { reduceMotion: boolean }) {
  const items = [
    'WEB EXPLOITATION', 'CRYPTOGRAPHY', 'BINARY EXPLOITATION',
    'REVERSE ENGINEERING', 'FORENSICS', 'OSINT', 'STEGANOGRAPHY',
    'MISC',
  ];
  const line = items.map((t, i) => (
    <React.Fragment key={i}>
      <span className="text-cyber-neon">◈</span>
      <span className="mx-4 label-micro !text-text-secondary">{t}</span>
    </React.Fragment>
  ));
  return (
    <div className="relative overflow-hidden border-y border-border-subtle py-3">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-0 w-24"
        style={{ background: 'linear-gradient(to right, var(--color-cyber-bg), transparent)' }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-0 w-24"
        style={{ background: 'linear-gradient(to left, var(--color-cyber-bg), transparent)' }}
      />
      <motion.div
        className="flex whitespace-nowrap"
        animate={reduceMotion ? undefined : { x: ['0%', '-50%'] }}
        transition={reduceMotion ? undefined : { duration: 42, ease: 'linear', repeat: Infinity }}
      >
        <div className="flex shrink-0 items-center">{line}</div>
        <div className="flex shrink-0 items-center" aria-hidden="true">{line}</div>
      </motion.div>
    </div>
  );
}

function StatTile({ value, label, tone = 'default' }: {
  value: string; label: string; tone?: 'default' | 'live' | 'neon';
}) {
  const valueTone =
    tone === 'live' ? 'text-emerald-400'
    : tone === 'neon' ? 'text-cyber-neon'
    : 'text-text-primary';
  return (
    <div className="rounded-control border border-border-subtle bg-surface-inset/60 px-4 py-3">
      <div className={`font-mono text-2xl leading-none ${valueTone}`}>{value}</div>
      <div className="mt-1.5 label-micro">{label}</div>
    </div>
  );
}

/**
 * Build credit. Rendered in the hero on desktop and under the card below it,
 * so the line is present at every width rather than only where the hero is.
 * label-micro is uppercase by default; the names read better in their own
 * casing, so the transform is cleared here.
 */
function BuildCredit({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 label-micro !normal-case !tracking-[0.06em] ${className}`}>
      <Target className="h-3 w-3 shrink-0 text-cyber-neon" aria-hidden="true" />
      <span>
        Built by <span className="font-semibold text-text-secondary">Team CyberXoX</span>
        <span className="mx-1.5 text-cyber-neon" aria-hidden="true">·</span>
        Powered by <span className="font-semibold text-cyber-neon">CyberHX</span>
      </span>
    </div>
  );
}

/* ══ Main component ═══════════════════════════════════════════════════════ */

export default function AuthPage({ onSuccess }: AuthPageProps) {
  const [mode, setMode] = useState<'login' | 'register'>(() => (pendingInvite() ? 'register' : 'login'));
  const [form, setForm] = useState({ email: '', password: '', username: '' });
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [registrationOpen, setRegistrationOpen] = useState(true);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);

  /**
   * Arrived on a team invite link. The card says whose team before asking for
   * anything, and the invite itself waits in storage until the player is in.
   * An invalid code is cleared here so it cannot nag on every later visit.
   */
  const [invite, setInvite] = useState<InvitePreview | null>(null);
  useEffect(() => {
    const code = pendingInvite();
    if (!code) return;
    let alive = true;
    supabase.rpc('team_invite_preview', { p_code: code }).then(({ data, error }) => {
      if (!alive) return;
      const preview: InvitePreview = error ? { error: 'unavailable' } : (data ?? { error: 'Invalid invite' });
      if (preview.error === 'Invalid invite') clearInvite();
      setInvite(preview);
    });
    return () => { alive = false; };
  }, []);
  // Why this is a state machine and not just a token:
  //
  // The captcha is a hard gate -- submit stays disabled until a token exists.
  // So every way the widget can fail to produce one is a way a visitor gets
  // locked out of the platform entirely, and the old code had no name for any
  // of them. The script tag had no onerror, and the poll waiting for
  // window.turnstile had no timeout, so a blocked challenges.cloudflare.com
  // (ad blocker, VPN, corporate proxy, a network that simply does not route
  // there) left the badge on "Pending" forever with nothing on screen to read
  // and a submit button that would never enable. error-callback discarded its
  // argument, so a widget that rendered and then failed -- a hostname missing
  // from the Turnstile widget's allow-list gives 110200 -- said nothing about
  // why either.
  //
  // With 5k registrations landing in one window, some fraction of them will
  // hit one of these. Naming the state lets us tell each of them what is
  // wrong and give them a retry that does not cost a page reload.
  type CaptchaState = 'loading' | 'ready' | 'error' | 'blocked' | 'unconfigured';
  const [captchaState, setCaptchaState] = useState<CaptchaState>(
    TURNSTILE_SITE_KEY ? 'loading' : 'unconfigured',
  );
  const [captchaCode, setCaptchaCode] = useState<string | null>(null);
  const [captchaAttempt, setCaptchaAttempt] = useState(0);
  // 'verifying' runs alongside the network request rather than after it, so
  // the sequence costs no time the user was not already spending.
  const [phase, setPhase] = useState<'idle' | 'verifying' | 'granted'>('idle');
  const turnstileRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const { login, register, loginWithGoogle } = useAuth();
  const reduceMotion = useReducedMotion() ?? false;

  // Arrival: the environment is at its most present here because there is no
  // application chrome competing with it yet.
  useEffect(() => { setMood('auth'); }, []);

  // Load Turnstile script. Keyed on captchaAttempt so "Try again" can re-fetch
  // a script that failed the first time -- a stale tag is removed first,
  // because the browser will not re-request a src it has already given up on.
  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return;
    if ((window as any).turnstile) return;

    document.getElementById('cf-turnstile-script')?.remove();

    const script = document.createElement('script');
    script.id = 'cf-turnstile-script';
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
    script.async = true;
    script.defer = true;
    script.onerror = () => setCaptchaState('blocked');
    document.head.appendChild(script);
  }, [captchaAttempt]);

  // Render Turnstile widget
  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return;
    let cancelled = false;

    const render = () => {
      if (cancelled || !turnstileRef.current || !(window as any).turnstile) return;
      if (widgetIdRef.current) {
        // remove() throws if the widget is already gone; that is fine here.
        try { (window as any).turnstile.remove(widgetIdRef.current); } catch { /* already removed */ }
        widgetIdRef.current = null;
      }
      widgetIdRef.current = (window as any).turnstile.render(turnstileRef.current, {
        sitekey: TURNSTILE_SITE_KEY,
        theme: 'dark',
        callback: (token: string) => {
          setCaptchaToken(token);
          setCaptchaCode(null);
          setCaptchaState('ready');
        },
        'expired-callback': () => {
          setCaptchaToken(null);
          setCaptchaState('loading');
        },
        // Cloudflare hands us a numeric code. We deliberately do NOT return
        // true here: that would suppress Turnstile's own error box, and our
        // message is meant to sit under it, not replace it.
        'error-callback': (code?: string) => {
          setCaptchaToken(null);
          setCaptchaCode(typeof code === 'string' ? code : null);
          setCaptchaState('error');
        },
      });
    };

    // Wait for the script, but not forever.
    const started = Date.now();
    const interval = setInterval(() => {
      if ((window as any).turnstile) {
        clearInterval(interval);
        render();
        return;
      }
      // Twenty seconds is far longer than a cold CDN fetch on a bad phone
      // connection. Past that the script is not arriving.
      if (Date.now() - started > 20_000) {
        clearInterval(interval);
        if (!cancelled) setCaptchaState(s => (s === 'loading' ? 'blocked' : s));
      }
    }, 200);

    return () => { cancelled = true; clearInterval(interval); };
  }, [captchaAttempt]);

  const retryCaptcha = () => {
    setCaptchaToken(null);
    setCaptchaCode(null);
    setCaptchaState('loading');
    setCaptchaAttempt(n => n + 1);
  };

  // Reset captcha when mode changes
  useEffect(() => {
    setCaptchaToken(null);
    if (widgetIdRef.current && (window as any).turnstile) {
      try { (window as any).turnstile.reset(widgetIdRef.current); } catch { /* not rendered */ }
    }
  }, [mode]);

  // Via RPC, not a table read. anon has no SELECT on event_settings (revoked
  // in 20260826030000), so the old .from('event_settings') query returned a
  // 42501 for every logged-out visitor -- which is everyone who sees this
  // page. The error was discarded and registrationOpen stayed true, so the
  // closed-registration banner could never appear.
  React.useEffect(() => {
    supabase.rpc('registration_is_open').then(({ data, error }) => {
      if (!error && data === false) setRegistrationOpen(false);
    });
  }, []);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError('');

    if (!captchaToken) {
      // "Complete the captcha" is a lie when there is no captcha on screen to
      // complete. Say what actually happened instead.
      setError(
        captchaState === 'blocked'
          ? 'The verification widget could not load, so sign-in is blocked. See the note above it.'
          : captchaState === 'error'
          ? 'Verification failed to load. Use "Try again" above the sign-in button.'
          : captchaState === 'unconfigured'
          ? 'Human verification is not configured for this site. Please contact the organisers.'
          : 'Please complete the captcha verification.',
      );
      return;
    }
    setLoading(true);
    setPhase('verifying');
    // The network answering is the environment waking up. App sets its own
    // mood on arrival, so this only has to cover the handover.
    setMood('compete');

    let result;
    if (mode === 'login') {
      result = await login(form.email, form.password, captchaToken);
    } else {
      // Re-ask at submit rather than trusting the value fetched on mount: a
      // tab left open across the moment registration closed would otherwise
      // sail past this and get the server's opaque rejection instead.
      const { data: stillOpen, error: openErr } = await supabase.rpc('registration_is_open');
      if (!openErr && stillOpen === false) {
        setRegistrationOpen(false);
        setError('Registration is currently closed.');
        setLoading(false); setPhase('idle'); setMood('auth');
        return;
      }
      const abort = (msg: string) => { setError(msg); setLoading(false); setPhase('idle'); setMood('auth'); };
      if (!registrationOpen) { abort('Registration is currently closed.'); return; }
      if (!form.username.trim()) { abort('Username required'); return; }
      if (form.username.length < 3) { abort('Username must be at least 3 characters'); return; }
      result = await register({ email: form.email, password: form.password, username: form.username, captchaToken });
    }

    setLoading(false);
    if (result?.error) {
      // A wrong password is not a moment. Stand the sequence down and let the
      // form say what happened.
      setPhase('idle');
      setMood('auth');
      setError(result.error as string);
      if (widgetIdRef.current && (window as any).turnstile) {
        (window as any).turnstile.reset(widgetIdRef.current);
        setCaptchaToken(null);
      }
    } else {
      // Hand over only once the acknowledgement beat has played;
      // AccessSequence calls onSuccess itself.
      setPhase('granted');
    }
  };

  const ease = [0.22, 1, 0.36, 1] as const;

  return (
    <div className="min-h-screen bg-cyber-bg overflow-x-hidden relative">
      <AmbientBackground intensity="normal" />
      <SurfaceLight />
      <CursorRing />

      {/* Full-viewport viewfinder brackets — signal that this is a serious environment */}
      <div className="hidden lg:block">
        <CornerBracket position="tl" />
        <CornerBracket position="tr" />
        <CornerBracket position="bl" />
        <CornerBracket position="br" />
      </div>

      <div className="page-shell min-h-screen flex items-center justify-center px-4 py-8 sm:py-10">
        <div className="w-full max-w-lg lg:max-w-[82rem]">

          <div className="grid items-stretch gap-6 lg:grid-cols-[minmax(0,1fr)_31rem] lg:gap-10 xl:gap-12">

            {/* ══ HERO COLUMN ══════════════════════════════════════════════ */}
            <motion.section
              initial={reduceMotion ? false : { opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, ease }}
              className="hidden lg:flex lg:flex-col min-w-0 relative"
            >
              <BackgroundRadar reduceMotion={reduceMotion} />

              <div className="relative flex-1 flex flex-col">
                {/* Top status row */}
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="inline-flex items-center gap-2 rounded-pill border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    </span>
                    <span className="label-micro text-emerald-300">Operations live</span>
                  </div>
                  <div className="inline-flex items-center gap-2 rounded-pill border border-border-subtle bg-surface-inset px-3 py-1.5">
                    <Wifi className="h-3 w-3 text-cyber-neon" aria-hidden="true" />
                    <span className="label-micro">Secure channel · TLS 1.3</span>
                  </div>
                  <div className="inline-flex items-center gap-2 rounded-pill border border-border-subtle bg-surface-inset px-3 py-1.5">
                    <Radio className="h-3 w-3 text-cyber-neon" aria-hidden="true" />
                    <span className="label-micro">v2.0</span>
                  </div>
                </div>

                {/* Massive brand wordmark */}
                <div className="mt-8 xl:mt-10">
                  <div className="inline-flex items-center gap-2 mb-3">
                    <span className="h-px w-8 bg-cyber-neon" aria-hidden="true" />
                    <span className="label-micro !text-cyber-neon">CTF Platform</span>
                  </div>
                  <h1
                    className="font-bold text-text-primary tracking-tight leading-[0.9]"
                    style={{ fontSize: 'clamp(3.25rem, 6.6vw, 6rem)' }}
                  >
                    CYBER<span className="text-cyber-neon text-glow">HX</span>
                  </h1>
                  <p className="mt-4 max-w-md text-h3 text-text-secondary leading-snug">
                    <span className="text-cyber-neon">Solve.</span>{' '}
                    <span className="text-cyber-neon">Submit.</span>{' '}
                    <span className="text-cyber-neon">Climb the board.</span>
                  </p>
                </div>

                {/* Stat tile row */}
                <div className="mt-8 grid grid-cols-4 gap-3 max-w-2xl">
                  <StatTile value="8"    label="Categories"  tone="neon" />
                  <StatTile value="4"    label="Difficulties" />
                  <StatTile value="LIVE" label="Event"       tone="live" />
                  <StatTile value="24/7" label="Uptime"      tone="live" />
                </div>

                {/* Category ticker */}
                <div className="mt-8">
                  <CategoryTicker reduceMotion={reduceMotion} />
                </div>

                {/* Bottom operator credit line */}
                <div className="mt-auto pt-10">
                  <BuildCredit />
                </div>
              </div>
            </motion.section>

            {/* ══ AUTH CARD COLUMN ═════════════════════════════════════════ */}
            <motion.div
              initial={reduceMotion ? false : { opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.5, ease, delay: 0.1 }}
              className="w-full min-w-0"
            >
              {/* Compact logo — below lg only */}
              <div className="mb-6 text-center lg:hidden">
                <div className="inline-flex flex-col items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="relative inline-flex h-14 w-14 items-center justify-center rounded-card border border-border-neon bg-neon-wash shadow-neon"
                  >
                    <Flag className="h-7 w-7 text-cyber-neon" />
                  </span>
                  <span className="text-h1 text-text-primary tracking-tight leading-none">
                    CYBER<span className="text-cyber-neon">HX</span>
                  </span>
                  <span className="label-micro">CTF Platform · v2.0</span>
                </div>
              </div>

              {/* Card wrapper with layered depth */}
              <div className="relative">
                {/* Soft glow behind the card */}
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute -inset-4 rounded-card opacity-60 blur-2xl"
                  style={{ background: 'radial-gradient(circle at 50% 30%, var(--color-neon-glow), transparent 65%)' }}
                />

                {/* Card */}
                <div className="auth-scale surface shadow-e5 relative overflow-hidden">
                  {/* Covers the whole card, inside its rounding, and takes
                      pointer events — which is what locks the form while a
                      request is in flight. */}
                  <AnimatePresence>
                    {phase !== 'idle' && (
                      <AccessSequence
                        mode={mode === 'login' ? 'login' : 'register'}
                        granted={phase === 'granted'}
                        onDone={onSuccess}
                      />
                    )}
                  </AnimatePresence>
                  {/* Top hairline */}
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-0 top-0 h-px"
                    style={{ background: 'linear-gradient(90deg, transparent, var(--color-neon), transparent)', opacity: 0.7 }}
                  />

                  {/* Tab toggle bar */}
                  <div
                    role="group"
                    aria-label="Authentication mode"
                    className="grid grid-cols-2 border-b border-border-subtle bg-surface-inset/30"
                  >
                    {(['login', 'register'] as const).map(m => {
                      const active = mode === m;
                      return (
                        <button
                          key={m}
                          type="button"
                          onClick={() => { setMode(m); setError(''); }}
                          aria-pressed={active}
                          className={`focus-ring relative py-4 text-body font-bold uppercase tracking-[0.2em] transition-all duration-[var(--duration-fast)] ${
                            active
                              ? 'text-cyber-neon bg-neon-wash/40'
                              : 'text-text-muted hover:text-text-primary hover:bg-surface-raised'
                          }`}
                        >
                          {m === 'login' ? 'Sign In' : 'Register'}
                          {active && (
                            <motion.span
                              layoutId="auth-tab-underline"
                              aria-hidden="true"
                              className="absolute inset-x-6 bottom-0 h-0.5 bg-cyber-neon shadow-neon"
                              transition={{ duration: 0.25, ease }}
                            />
                          )}
                        </button>
                      );
                    })}
                  </div>

                  <div className="p-6 sm:p-7">
                    {/* Big, confident header */}
                    <header className="mb-6">
                      <div className="inline-flex items-center gap-2 mb-2">
                        <Sparkles className="h-3.5 w-3.5 text-cyber-neon" aria-hidden="true" />
                        <span className="label-micro !text-cyber-neon">
                          {mode === 'login' ? 'Auth Gateway' : 'New Operative'}
                        </span>
                      </div>
                      <h2 className="text-h1 text-text-primary tracking-tight leading-tight">
                        {mode === 'login' ? 'Access terminal' : 'Enter the arena'}
                      </h2>
                      <p className="mt-2 text-small text-text-muted">
                        {mode === 'login'
                          ? 'Authenticate to resume your run.'
                          : 'Register a handle to enter the competition.'}
                      </p>
                    </header>

                    {invite && (
                      <div
                        role="status"
                        className="mb-6 flex items-start gap-3 rounded-card border p-4"
                        style={invite.error
                          ? { borderColor: 'var(--color-border-strong)', backgroundColor: 'var(--color-surface-inset)' }
                          : { borderColor: 'var(--color-border-neon)', backgroundColor: 'var(--color-neon-wash)' }}
                      >
                        <span
                          aria-hidden="true"
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-inset border border-border-neon bg-surface-inset"
                        >
                          <Users className="h-4 w-4 text-cyber-neon" />
                        </span>
                        <div className="min-w-0">
                          <p className="label-micro !text-cyber-neon">Team invite</p>
                          {invite.error ? (
                            <>
                              <p className="mt-0.5 text-body text-text-primary">
                                {invite.error === 'unavailable' ? 'Could not check this invite right now.' : 'This invite link is no longer valid.'}
                              </p>
                              <p className="mt-0.5 text-small text-text-muted">
                                {invite.error === 'unavailable' ? 'Carry on — it will be offered again once you are in.' : 'Ask your captain for a fresh link, or join by code from the Team page.'}
                              </p>
                            </>
                          ) : (
                            <>
                              <p className="mt-0.5 text-body text-text-primary">
                                You&rsquo;re invited to join <strong className="text-cyber-neon">{invite.name}</strong>
                                <span className="ml-2 font-mono text-small text-text-muted">{invite.members}/{invite.size}</span>
                                {invite.full && <span className="ml-2 badge badge-locked align-middle">Full</span>}
                              </p>
                              <p className="mt-0.5 text-small text-text-muted">
                                {invite.full
                                  ? 'The team is at its size limit. Register anyway — you will be placed the moment a seat opens, or you can join another team by code.'
                                  : mode === 'login'
                                    ? 'Sign in to accept. New here? Register and you land on the team automatically.'
                                    : 'Register and you land on the team automatically — no code to type.'}
                              </p>
                            </>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Registration closed banner */}
                    {mode === 'register' && !registrationOpen && (
                      <div
                        role="status"
                        className="mb-4 flex items-start gap-3 rounded-control border p-3"
                        style={{
                          borderColor: 'var(--color-border-danger)',
                          backgroundColor: 'var(--color-diff-hard-wash)',
                        }}
                      >
                        <Lock className="mt-px h-4 w-4 shrink-0" style={{ color: 'var(--color-diff-hard)' }} aria-hidden="true" />
                        <span className="text-small" style={{ color: 'var(--color-diff-hard)' }}>
                          Registration is currently closed.
                        </span>
                      </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">
                      <AnimatePresence mode="wait">
                        {mode === 'register' && (
                          <motion.div
                            key="username"
                            initial={reduceMotion ? false : { opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
                            transition={{ duration: 0.22, ease }}
                            className="overflow-hidden"
                          >
                            <div>
                              <label className="field-label" htmlFor="auth-username">Username</label>
                              <input
                                id="auth-username"
                                type="text"
                                autoComplete="username"
                                placeholder="operative_handle"
                                value={form.username}
                                onChange={e => setForm(p => ({ ...p, username: e.target.value }))}
                                className="input"
                              />
                              <p className="mt-1 text-micro text-text-faint">3–30 characters · letters, numbers, _ or -</p>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      <div>
                        <label className="field-label" htmlFor="auth-email">Email</label>
                        <input
                          id="auth-email"
                          type="email"
                          autoComplete="email"
                          placeholder="operative@domain.com"
                          value={form.email}
                          onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                          className="input"
                        />
                      </div>

                      <div>
                        <label className="field-label" htmlFor="auth-password">Password</label>
                        <div className="relative">
                          <input
                            id="auth-password"
                            type={showPass ? 'text' : 'password'}
                            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                            placeholder="••••••••"
                            value={form.password}
                            onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                            className="input pr-11"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPass(p => !p)}
                            aria-label={showPass ? 'Hide password' : 'Show password'}
                            aria-pressed={showPass}
                            className="focus-ring tap-target absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex h-8 w-8 items-center justify-center rounded-inset text-text-muted transition-colors duration-[var(--duration-fast)] hover:bg-surface-raised hover:text-text-primary"
                          >
                            {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      {/* Cloudflare Turnstile Captcha */}
                      <div className="rounded-control border border-border-subtle bg-surface-inset px-3 py-2.5">
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <span className="inline-flex items-center gap-1.5 label-micro">
                            <Cpu className="h-3 w-3 text-text-muted" aria-hidden="true" />
                            Human verification
                          </span>
                          <span
                            className={`badge ${captchaToken ? 'badge-solved' : 'badge-locked'}`}
                            aria-live="polite"
                          >
                            {captchaToken
                              ? <ShieldCheck className="h-3 w-3" aria-hidden="true" />
                              : <ShieldAlert className="h-3 w-3" aria-hidden="true" />}
                            {captchaToken
                              ? 'Verified'
                              : captchaState === 'blocked' || captchaState === 'unconfigured'
                              ? 'Unavailable'
                              : captchaState === 'error'
                              ? 'Failed'
                              : 'Pending'}
                          </span>
                        </div>
                        <div className="custom-scrollbar w-full overflow-x-auto">
                          <div className="flex min-w-fit justify-center">
                            <div ref={turnstileRef} />
                          </div>
                        </div>

                        {/* Turnstile draws its own error box, but it says only
                            that something went wrong. This is the part that
                            tells the visitor what to do about it. */}
                        {!captchaToken && captchaState !== 'loading' && (
                          <div className="mt-2 rounded-inset border border-border-subtle bg-surface-raised px-3 py-2">
                            <p className="text-small text-text-secondary">
                              {captchaState === 'blocked' && (
                                <>
                                  The verification widget could not be reached. An ad
                                  blocker, privacy extension, VPN or restricted network
                                  can block{' '}
                                  <span className="text-cyber-text">challenges.cloudflare.com</span>.
                                  Allow it for this site, or switch network, then try again.
                                </>
                              )}
                              {captchaState === 'error' && (
                                <>
                                  Verification could not start
                                  {captchaCode ? <> (code <span className="text-cyber-text">{captchaCode}</span>)</> : null}.
                                  This is usually temporary — try again. If it keeps
                                  happening, tell the organisers the code above.
                                </>
                              )}
                              {captchaState === 'unconfigured' && (
                                <>
                                  Human verification is not configured for this
                                  deployment. Sign-in cannot proceed until the
                                  organisers set it up.
                                </>
                              )}
                            </p>
                            {captchaState !== 'unconfigured' && (
                              <button
                                type="button"
                                onClick={retryCaptcha}
                                className="focus-ring mt-2 inline-flex items-center gap-1.5 rounded-inset border border-border-subtle px-2.5 py-1 text-small text-text-primary transition-colors duration-[var(--duration-fast)] hover:bg-surface-inset"
                              >
                                <Wifi className="h-3 w-3" aria-hidden="true" />
                                Try again
                              </button>
                            )}
                          </div>
                        )}
                      </div>

                      {error && (
                        <motion.p
                          initial={reduceMotion ? false : { opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.2, ease }}
                          role="alert"
                          className="flex items-start gap-2.5 rounded-control border p-2.5 text-small"
                          style={{
                            borderColor: 'var(--color-border-danger)',
                            backgroundColor: 'var(--color-diff-hard-wash)',
                            color: 'var(--color-diff-hard)',
                          }}
                        >
                          <AlertTriangle className="mt-px h-4 w-4 shrink-0" aria-hidden="true" />
                          <span className="min-w-0 break-words">{error}</span>
                        </motion.p>
                      )}

                      {/* Bigger, more confident primary CTA. The one control
                          on this page that acknowledges the cursor before it
                          arrives — magnetism means "this one matters", so it
                          is used once and nowhere else here. */}
                      <MagneticElement className="w-full" radius={140} strength={5}>
                      <button
                        type="submit"
                        disabled={loading || !captchaToken}
                        className={`btn btn-primary btn-lg btn-block group !py-4 !text-body !tracking-[0.2em] ${loading ? 'is-loading' : ''}`}
                      >
                        {loading ? (
                          'Authenticating...'
                        ) : mode === 'login' ? (
                          <>
                            <Zap className="h-4 w-4" aria-hidden="true" />
                            Access Terminal
                            <ArrowRight className="h-4 w-4 transition-transform duration-[var(--duration-fast)] group-hover:translate-x-1" aria-hidden="true" />
                          </>
                        ) : (
                          <>
                            <Flag className="h-4 w-4" aria-hidden="true" />
                            Enlist Operative
                            <ArrowRight className="h-4 w-4 transition-transform duration-[var(--duration-fast)] group-hover:translate-x-1" aria-hidden="true" />
                          </>
                        )}
                      </button>
                      </MagneticElement>

                      {/* Divider */}
                      <div className="flex items-center gap-3 pt-1">
                        <span className="divider block flex-1" aria-hidden="true" />
                        <span className="label-micro">or continue with</span>
                        <span className="divider block flex-1" aria-hidden="true" />
                      </div>

                      {/* Google OAuth */}
                      <button
                        type="button"
                        onClick={async () => {
                          setError('');
                          setLoading(true);
                          const result = await loginWithGoogle();
                          if (result?.error) {
                            setError(result.error);
                            setLoading(false);
                          }
                        }}
                        disabled={loading}
                        className="btn btn-secondary btn-block"
                      >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                        </svg>
                        Continue with Google
                      </button>
                    </form>
                  </div>

                  {/* Card footer */}
                  <div className="border-t border-border-subtle bg-surface-inset/50 px-6 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="inline-flex items-center gap-1.5 label-micro">
                        <Globe2 className="h-3 w-3" aria-hidden="true" />
                        <span>ctf.cyberhx.com</span>
                      </span>
                      <span className="inline-flex items-center gap-1.5 label-micro">
                        <ChevronRight className="h-3 w-3 text-cyber-neon" aria-hidden="true" />
                        <span className="font-mono">v2.0 · CTF-EDITION</span>
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <p className="mt-5 text-center label-micro leading-relaxed">
                By continuing you agree to the{' '}
                <a href="/terms.html" target="_blank" rel="noopener noreferrer" className="text-text-secondary underline decoration-border-strong underline-offset-4 hover:text-cyber-neon">fair-play rules</a>
                <br className="sm:hidden" />
                <span className="hidden sm:inline"> · </span>
                No solutions may be shared
              </p>

              {/* The hero carries this on desktop; repeat it here for the
                  widths where the hero is hidden. */}
              <BuildCredit className="mt-4 justify-center lg:hidden" />
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}
