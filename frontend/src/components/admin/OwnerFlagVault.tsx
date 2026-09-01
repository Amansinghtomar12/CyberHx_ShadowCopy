/**
 * OwnerFlagVault — the one thing on this platform that admin does not unlock.
 *
 * WHY THIS EXISTS
 *   Flags have only ever been stored as an unsalted SHA-256. That is why
 *   the edit form shows "[HASHED — re-enter flag to change]" instead of a
 *   flag: there was no plaintext in the database to show. So the person who
 *   wrote the operations could not read back what they set — no checking a
 *   flag against a player's dispute, no handing one to a co-organiser, no
 *   confirming that an edit did what was meant.
 *
 * WHAT IT CAN AND CANNOT DO
 *   It cannot recover a flag set before the vault existed. SHA-256 is one
 *   way and no amount of UI changes that. What it can do is show flags saved
 *   from now on, and let the owner capture an older one by typing it: the
 *   guess is hashed and compared against the hash already stored, so only a
 *   flag that was already correct is ever recorded. A wrong guess is refused
 *   and changes nothing, which means this can confirm a flag but never
 *   silently replace a live one.
 *
 * WHO CAN SEE IT
 *   The button is drawn for the owner only, but that is cosmetic. Both RPCs
 *   check is_owner() in the database, the vault table has RLS with no
 *   policies and every privilege revoked, and each read is logged. An admin —
 *   including one an attacker promotes — gets "Owner only" and a row in the
 *   audit trail.
 *
 * SHOULDER SURFING
 *   A CTF is run from a laptop in a room full of people who want these
 *   strings. The panel closes itself after 45 seconds, and shows the count
 *   so nobody is surprised by it.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Shield, X, Copy, Check, KeyRound, TriangleAlert } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { supabase } from '../../lib/supabase';

const AUTO_CLOSE_MS = 45_000;

interface OwnerFlagVaultProps {
  challengeId: string;
  challengeTitle: string;
  onClose: () => void;
}

type View =
  | { kind: 'loading' }
  | { kind: 'flag'; flag: string; captured?: boolean }
  | { kind: 'missing' }
  | { kind: 'error'; message: string };

export default function OwnerFlagVault({ challengeId, challengeTitle, onClose }: OwnerFlagVaultProps) {
  const reduce = useReducedMotion() ?? false;
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [candidate, setCandidate] = useState('');
  const [capturing, setCapturing] = useState(false);
  const [captureError, setCaptureError] = useState('');
  const [copied, setCopied] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(Math.round(AUTO_CLOSE_MS / 1000));
  const alive = useRef(true);

  useEffect(() => () => { alive.current = false; }, []);

  // Escape closes, like every other dialog here.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    supabase.rpc('owner_reveal_flag', { p_challenge_id: challengeId }).then(({ data, error }) => {
      if (cancelled || !alive.current) return;
      if (error) { setView({ kind: 'error', message: error.message }); return; }
      const r = (data ?? {}) as { flag?: string; missing?: boolean; error?: string };
      if (r.error) setView({ kind: 'error', message: r.error });
      else if (r.missing) setView({ kind: 'missing' });
      else if (r.flag) setView({ kind: 'flag', flag: r.flag });
      else setView({ kind: 'error', message: 'The vault returned nothing.' });
    });
    return () => { cancelled = true; };
  }, [challengeId]);

  // The countdown only runs while a flag is actually on screen. A panel that
  // is asking you to type something must not close under your hands.
  useEffect(() => {
    if (view.kind !== 'flag') return;
    setSecondsLeft(Math.round(AUTO_CLOSE_MS / 1000));
    const tick = setInterval(() => setSecondsLeft(s => Math.max(0, s - 1)), 1000);
    const shut = setTimeout(onClose, AUTO_CLOSE_MS);
    return () => { clearInterval(tick); clearTimeout(shut); };
  }, [view.kind, onClose]);

  const copy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => { if (alive.current) setCopied(false); }, 1600);
    } catch {
      // Insecure context or a browser that refuses. Select it instead so the
      // owner can still copy by hand rather than being told nothing happened.
      const el = document.getElementById('vault-flag-value');
      if (el) {
        const range = document.createRange();
        range.selectNodeContents(el);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
    }
  }, []);

  const capture = useCallback(async () => {
    const guess = candidate.trim();
    if (!guess || capturing) return;
    setCapturing(true);
    setCaptureError('');
    const { data, error } = await supabase.rpc('owner_capture_flag', {
      p_challenge_id: challengeId,
      p_flag: guess,
    });
    if (!alive.current) return;
    setCapturing(false);
    if (error) { setCaptureError(error.message); return; }
    const r = (data ?? {}) as { flag?: string; error?: string };
    if (r.error) { setCaptureError(r.error); return; }
    if (r.flag) { setCandidate(''); setView({ kind: 'flag', flag: r.flag, captured: true }); }
  }, [candidate, capturing, challengeId]);

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <motion.div
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={reduce ? undefined : { opacity: 0 }}
        transition={{ duration: 0.16 }}
        onClick={onClose}
        className="scrim"
      />
      <motion.div
        initial={reduce ? false : { opacity: 0, scale: 0.97, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={reduce ? undefined : { opacity: 0, scale: 0.98 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        role="dialog"
        aria-modal="true"
        aria-label={`Owner vault — ${challengeTitle}`}
        className="surface-overlay relative w-full max-w-lg overflow-hidden"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border-base bg-surface-rail px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <span
              aria-hidden="true"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-inset border border-border-neon bg-neon-wash text-cyber-neon"
            >
              <Shield className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="label-micro">Owner vault</p>
              <p className="truncate text-body font-semibold text-cyber-text">{challengeTitle}</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close vault" className="btn btn-ghost btn-sm btn-icon shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5">
          {view.kind === 'loading' && (
            <div className="space-y-3" role="status">
              <span className="sr-only">Opening the vault…</span>
              <div className="skeleton skeleton-text w-40" />
              <div className="skeleton h-12 w-full rounded-inset" />
            </div>
          )}

          {view.kind === 'flag' && (
            <>
              {view.captured && (
                <p className="mb-3 flex items-center gap-2 text-small text-status-solved">
                  <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  Verified against the stored hash and saved to the vault.
                </p>
              )}
              <p className="label-micro mb-2">Flag</p>
              <div className="surface-inset flex items-center gap-3 rounded-inset p-4">
                <code
                  id="vault-flag-value"
                  className="min-w-0 flex-1 select-all break-all font-mono text-body text-cyber-neon"
                >
                  {view.flag}
                </code>
                <button
                  onClick={() => copy(view.flag)}
                  aria-label="Copy flag to clipboard"
                  className="btn btn-secondary btn-sm shrink-0"
                >
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <p className="mt-3 text-small text-text-muted">
                Closing in <span className="font-mono text-text-secondary">{secondsLeft}s</span>. This read was
                recorded in the audit log.
              </p>
            </>
          )}

          {view.kind === 'missing' && (
            <>
              <div className="flex items-start gap-3 rounded-inset border border-border-base bg-surface-inset p-4">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-diff-medium" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-small font-semibold text-cyber-text">Not in the vault</p>
                  <p className="mt-1 text-small text-text-muted">
                    This operation was saved before the vault existed, and only its hash was ever
                    stored — the flag itself cannot be recovered from it. Type the flag below and it will
                    be checked against that hash. A wrong answer is refused and changes nothing.
                  </p>
                </div>
              </div>

              <label htmlFor="vault-capture" className="field-label mt-5">Flag</label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  id="vault-capture"
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="FLAG{...}"
                  value={candidate}
                  disabled={capturing}
                  onChange={e => { setCandidate(e.target.value); setCaptureError(''); }}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void capture(); } }}
                  aria-invalid={captureError ? true : undefined}
                  className={`input h-[2.875rem] flex-1 ${captureError ? 'is-invalid' : ''}`}
                />
                <button
                  onClick={() => void capture()}
                  disabled={capturing || !candidate.trim()}
                  className={`btn btn-primary btn-lg shrink-0 ${capturing ? 'is-loading' : ''}`}
                >
                  <KeyRound className="h-3.5 w-3.5" />
                  {capturing ? 'Checking…' : 'Verify & store'}
                </button>
              </div>
              {captureError && (
                <p role="alert" className="mt-3 text-label uppercase text-diff-hard">{captureError}</p>
              )}
            </>
          )}

          {view.kind === 'error' && (
            <div className="flex items-start gap-3 rounded-inset border p-4"
                 style={{ borderColor: 'var(--color-border-danger)', backgroundColor: 'var(--color-diff-hard-wash)' }}>
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-diff-hard" aria-hidden="true" />
              <p className="text-small text-cyber-text">{view.message}</p>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
