// src/components/AuthPage.tsx
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Flag, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';

// ── Turnstile Site Key — from environment variable ──
const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || '';

interface AuthPageProps {
  onSuccess: () => void;
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

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSubmit();
  };

  return (
    <div className="min-h-screen bg-cyber-bg flex items-center justify-center px-4">
      {/* Background grid effect */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 opacity-[0.03]"
          style={{ backgroundImage: 'linear-gradient(#c6ff00 1px, transparent 1px), linear-gradient(90deg, #c6ff00 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md relative"
      >
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-cyber-neon/10 border border-cyber-neon/40 rounded-lg flex items-center justify-center">
              <Flag className="w-5 h-5 text-cyber-neon" />
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tighter">CYBERHX</h1>
          </div>
          <p className="text-cyber-muted text-xs font-bold uppercase tracking-widest">CTF Platform</p>
        </div>

        {/* Card */}
        <div className="bg-cyber-card border border-cyber-border rounded-xl p-8 shadow-2xl">
          {/* Tab toggle */}
          <div className="flex gap-1 bg-cyber-sidebar rounded-lg p-1 mb-8">
            {(['login', 'register'] as const).map(m => (
              <button key={m} onClick={() => { setMode(m); setError(''); }}
                className={`flex-1 py-2 rounded-md text-[11px] font-bold uppercase tracking-widest transition-all ${
                  mode === m ? 'bg-cyber-card text-white shadow' : 'text-cyber-muted hover:text-white'
                }`}>
                {m === 'login' ? 'Sign In' : 'Register'}
              </button>
            ))}
          </div>

          {/* Registration closed banner */}
          {mode === 'register' && !registrationOpen && (
            <div className="mb-4 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-[11px] font-bold uppercase tracking-widest text-center">
              🔒 Registration is currently closed
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <AnimatePresence mode="wait">
              {mode === 'register' && (
                <motion.div
                  key="username"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="space-y-1 pb-1">
                    <label className="text-[10px] font-bold text-cyber-muted uppercase tracking-widest block">Username</label>
                    <input
                      type="text"
                      placeholder="operative_handle"
                      value={form.username}
                      onChange={e => setForm(p => ({ ...p, username: e.target.value }))}
                      className="w-full bg-cyber-sidebar border border-cyber-border rounded-lg px-4 py-3 text-white text-sm focus:outline-none focus:border-cyber-neon transition-all font-mono placeholder:text-cyber-muted/40"
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-cyber-muted uppercase tracking-widest block">Email</label>
              <input
                type="email"
                placeholder="operative@domain.com"
                value={form.email}
                onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                className="w-full bg-cyber-sidebar border border-cyber-border rounded-lg px-4 py-3 text-white text-sm focus:outline-none focus:border-cyber-neon transition-all font-mono placeholder:text-cyber-muted/40"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-cyber-muted uppercase tracking-widest block">Password</label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={form.password}
                  onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                  className="w-full bg-cyber-sidebar border border-cyber-border rounded-lg px-4 py-3 pr-12 text-white text-sm focus:outline-none focus:border-cyber-neon transition-all font-mono placeholder:text-cyber-muted/40"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(p => !p)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-cyber-muted hover:text-white transition-colors"
                >
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-red-400 text-[11px] font-bold uppercase tracking-widest"
              >
                {error}
              </motion.p>
            )}

            {/* Cloudflare Turnstile Captcha */}
            <div className="flex justify-center my-2">
              <div ref={turnstileRef} />
            </div>

            <button
              type="submit"
              disabled={loading || !captchaToken}
              className="w-full bg-cyber-neon text-black py-3 rounded-lg text-[12px] font-bold uppercase tracking-widest hover:bg-white transition-all mt-2 disabled:opacity-50"
            >
              {loading ? 'Authenticating...' : mode === 'login' ? 'Access Terminal' : 'Create Operative'}
            </button>

            {/* Divider */}
            <div className="flex items-center gap-3 my-2">
              <div className="flex-1 h-px bg-cyber-border" />
              <span className="text-[10px] font-bold text-cyber-muted uppercase tracking-widest">or</span>
              <div className="flex-1 h-px bg-cyber-border" />
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
              className="w-full flex items-center justify-center gap-3 bg-cyber-sidebar border border-cyber-border py-3 rounded-lg text-[12px] font-bold uppercase tracking-widest text-white hover:border-cyber-neon/50 transition-all disabled:opacity-50"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continue with Google
            </button>
          </form>
        </div>

        <p className="text-center text-[10px] text-cyber-muted mt-6 uppercase tracking-widest">
          Cyberhx CTF Framework v2.0
        </p>
      </motion.div>
    </div>
  );
}