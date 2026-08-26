// src/components/AuthPage.tsx
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import {
  Flag, Eye, EyeOff, ShieldCheck, ShieldAlert, AlertTriangle,
  Lock, Terminal, Trophy, Radio, Cpu, Zap, Globe2,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import AmbientBackground from './AmbientBackground';

// ── Turnstile Site Key — from environment variable ──
const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || '';

interface AuthPageProps {
  onSuccess: () => void;
}

/* ── presentational helpers (local, no behaviour) ─────────────────────────── */

function BrandLockup({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-3">
      <span
        aria-hidden="true"
        className={`${compact ? 'w-10 h-10' : 'w-11 h-11'} relative inline-flex items-center justify-center rounded-control border border-border-neon bg-neon-wash shadow-neon`}
      >
        <Flag className={compact ? 'w-5 h-5 text-cyber-neon' : 'w-5 h-5 text-cyber-neon'} />
      </span>
      <span className="leading-none">
        <span className={`block ${compact ? 'text-h2' : 'text-h1'} text-text-primary tracking-tight`}>
          CYBER<span className="text-cyber-neon">HX</span>
        </span>
        <span className="mt-1 block label-micro">CTF · Capture the flag</span>
      </span>
    </span>
  );
}

function FeatureLine({
  icon: Icon,
  title,
  body,
}: { icon: typeof Trophy; title: string; body: string }) {
  return (
    <li className="flex gap-3">
      <span
        aria-hidden="true"
        className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-control border border-border-subtle bg-surface-inset"
      >
        <Icon className="h-3.5 w-3.5 text-cyber-neon" />
      </span>
      <span className="min-w-0">
        <span className="block text-body font-semibold text-text-primary leading-tight">{title}</span>
        <span className="mt-0.5 block text-small text-text-muted">{body}</span>
      </span>
    </li>
  );
}

function TelemetryRow({ label, value, tone = 'muted' }: {
  label: string; value: string; tone?: 'muted' | 'live' | 'neon';
}) {
  const colour =
    tone === 'live' ? 'text-emerald-400'
    : tone === 'neon' ? 'text-cyber-neon'
    : 'text-text-secondary';
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 border-b border-border-subtle/60 last:border-0">
      <span className="label-micro">{label}</span>
      <span className={`font-mono text-small ${colour}`}>{value}</span>
    </div>
  );
}

export default function AuthPage({ onSuccess }: AuthPageProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [form, setForm] = useState({ email: '', password: '', username: '' });
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [registrationOpen, setRegistrationOpen] = useState(true);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const turnstileRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const { login, register, loginWithGoogle } = useAuth();
  const reduceMotion = useReducedMotion();

  // Load Turnstile script
  useEffect(() => {
    if (document.getElementById('cf-turnstile-script')) return;
    const script = document.createElement('script');
    script.id = 'cf-turnstile-script';
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
  }, []);

  // Render Turnstile widget
  useEffect(() => {
    const render = () => {
      if (!TURNSTILE_SITE_KEY || !turnstileRef.current || !(window as any).turnstile) return;
      if (widgetIdRef.current) {
        (window as any).turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
      widgetIdRef.current = (window as any).turnstile.render(turnstileRef.current, {
        sitekey: TURNSTILE_SITE_KEY,
        theme: 'dark',
        callback: (token: string) => setCaptchaToken(token),
        'expired-callback': () => setCaptchaToken(null),
        'error-callback': () => setCaptchaToken(null),
      });
    };

    // Wait for script to load
    const interval = setInterval(() => {
      if ((window as any).turnstile) {
        clearInterval(interval);
        render();
      }
    }, 200);

    return () => clearInterval(interval);
  }, []);

  // Reset captcha when mode changes
  useEffect(() => {
    setCaptchaToken(null);
    if (widgetIdRef.current && (window as any).turnstile) {
      (window as any).turnstile.reset(widgetIdRef.current);
    }
  }, [mode]);

  React.useEffect(() => {
    supabase.from('event_settings').select('registration_open').order('id', { ascending: false }).limit(1).single()
      .then(({ data }) => {
        if (data && data.registration_open === false) setRegistrationOpen(false);
      });
  }, []);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError('');

    if (!captchaToken) {
      setError('Please complete the captcha verification.');
      return;
    }
    setLoading(true);

    let result;
    if (mode === 'login') {
      result = await login(form.email, form.password, captchaToken);
    } else {
      if (!registrationOpen) { setError('Registration is currently closed.'); setLoading(false); return; }
      if (!form.username.trim()) { setError('Username required'); setLoading(false); return; }
      if (form.username.length < 3) { setError('Username must be at least 3 characters'); setLoading(false); return; }
      result = await register({ email: form.email, password: form.password, username: form.username, captchaToken });
    }

    setLoading(false);
    if (result?.error) {
      setError(result.error as string);
      if (widgetIdRef.current && (window as any).turnstile) {
        (window as any).turnstile.reset(widgetIdRef.current);
        setCaptchaToken(null);
      }
    } else {
      onSuccess();
    }
  };

  const ease = [0.22, 1, 0.36, 1] as const;

  return (
    <div className="min-h-screen bg-cyber-bg flex items-center justify-center px-4 py-6 sm:py-10 overflow-x-hidden">
      <AmbientBackground intensity="normal" />

      <div className="page-shell w-full max-w-md lg:max-w-[62rem]">
        <div className="grid items-stretch gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:gap-8">

          {/* ── Brand / telemetry column (lg+) ─────────────────────────── */}
          <motion.section
            initial={reduceMotion ? false : { opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, ease }}
            className="hidden lg:flex lg:flex-col"
          >
            <div className="surface relative overflow-hidden p-7 flex-1 flex flex-col">
              {/* Corner accent */}
              <span
                aria-hidden="true"
                className="pointer-events-none absolute right-0 top-0 h-24 w-24"
                style={{
                  background:
                    'radial-gradient(circle at top right, var(--color-neon-glow), transparent 70%)',
                }}
              />

              {/* Status pill */}
              <div className="inline-flex w-fit items-center gap-2 rounded-pill border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                </span>
                <span className="label-micro text-emerald-300">Systems online</span>
              </div>

              <div className="mt-6">
                <BrandLockup />
              </div>

              <p className="mt-5 max-w-sm text-body text-text-secondary leading-relaxed">
                A live competition environment for offensive security. Solve, submit,
                climb the board — every second on the clock counts.
              </p>

              {/* Feature list — denser */}
              <ul className="mt-6 space-y-3.5">
                <FeatureLine
                  icon={Terminal}
                  title="Curated challenge tracks"
                  body="Web · Crypto · Reversing · Pwn · Forensics · OSINT"
                />
                <FeatureLine
                  icon={Trophy}
                  title="Live scoreboard"
                  body="Dynamic scoring and first-blood tracking, updated on solve."
                />
                <FeatureLine
                  icon={Lock}
                  title="Hardened access"
                  body="Captcha-gated auth · RLS-isolated data · rate-limited flag submit"
                />
              </ul>

              {/* Live telemetry panel — fills space with purposeful density */}
              <div className="mt-auto pt-6">
                <div className="rounded-control border border-border-subtle bg-surface-inset p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <Radio className="h-3 w-3 text-cyber-neon" aria-hidden="true" />
                    <span className="label-micro text-text-secondary">System telemetry</span>
                  </div>
                  <TelemetryRow label="Framework"  value="CyberHX v2.0" tone="neon" />
                  <TelemetryRow label="Auth layer" value="OAuth · Password" />
                  <TelemetryRow label="Protection" value="Turnstile" tone="live" />
                  <TelemetryRow label="Status"     value="Ready" tone="live" />
                </div>
              </div>
            </div>
          </motion.section>

          {/* ── Auth column ─────────────────────────────────────────────── */}
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease }}
            className="w-full lg:min-w-0"
          >
            {/* Compact logo — below lg only */}
            <div className="mb-5 text-center lg:hidden">
              <div className="inline-flex flex-col items-center gap-2">
                <BrandLockup compact />
              </div>
            </div>

            {/* Card */}
            <div className="surface shadow-e5 relative overflow-hidden">
              {/* lime hairline along the top edge */}
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 top-0 h-px"
                style={{ background: 'linear-gradient(90deg, transparent, var(--color-neon), transparent)', opacity: 0.6 }}
              />

              {/* Tab toggle — anchored at top, doubles as header */}
              <div
                role="group"
                aria-label="Authentication mode"
                className="grid grid-cols-2 border-b border-border-subtle"
              >
                {(['login', 'register'] as const).map(m => {
                  const active = mode === m;
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => { setMode(m); setError(''); }}
                      aria-pressed={active}
                      className={`focus-ring relative py-3.5 text-small font-semibold uppercase tracking-widest transition-colors duration-[var(--duration-fast)] ${
                        active
                          ? 'text-cyber-neon bg-neon-wash/40'
                          : 'text-text-muted hover:text-text-primary hover:bg-surface-raised'
                      }`}
                    >
                      {m === 'login' ? 'Sign In' : 'Register'}
                      {active && (
                        <span
                          aria-hidden="true"
                          className="absolute inset-x-6 bottom-0 h-0.5 bg-cyber-neon shadow-neon"
                        />
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="p-5 sm:p-6">
                <header className="mb-5">
                  <h2 className="text-h3 text-text-primary">
                    {mode === 'login' ? 'Access terminal' : 'Create operative'}
                  </h2>
                  <p className="mt-1 text-small text-text-muted">
                    {mode === 'login'
                      ? 'Authenticate to resume your run.'
                      : 'Register a handle to enter the competition.'}
                  </p>
                </header>

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

                <form onSubmit={handleSubmit} className="space-y-3.5">
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
                        className="focus-ring absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex h-8 w-8 items-center justify-center rounded-inset text-text-muted transition-colors duration-[var(--duration-fast)] hover:bg-surface-raised hover:text-text-primary"
                      >
                        {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Cloudflare Turnstile Captcha — compact */}
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
                        {captchaToken ? 'Verified' : 'Pending'}
                      </span>
                    </div>
                    <div className="custom-scrollbar w-full overflow-x-auto">
                      <div className="flex min-w-fit justify-center">
                        <div ref={turnstileRef} />
                      </div>
                    </div>
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

                  <button
                    type="submit"
                    disabled={loading || !captchaToken}
                    className={`btn btn-primary btn-lg btn-block ${loading ? 'is-loading' : ''}`}
                  >
                    {loading
                      ? 'Authenticating...'
                      : mode === 'login'
                        ? <><Zap className="h-4 w-4" aria-hidden="true" /> Access Terminal</>
                        : <><Flag className="h-4 w-4" aria-hidden="true" /> Create Operative</>}
                  </button>

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

              {/* Card footer with meta info */}
              <div className="border-t border-border-subtle bg-surface-inset/50 px-5 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-1.5 label-micro">
                    <Globe2 className="h-3 w-3" aria-hidden="true" />
                    <span>ctf.cyberhx.com</span>
                  </span>
                  <span className="label-micro font-mono">v2.0</span>
                </div>
              </div>
            </div>

            <p className="mt-4 text-center label-micro">
              By continuing you agree to fair-play rules · No solutions may be shared
            </p>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
