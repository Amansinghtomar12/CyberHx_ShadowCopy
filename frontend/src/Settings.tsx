import React, { useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  User,
  Mail,
  Building2,
  Globe,
  MapPin,
  ShieldCheck,
  Lock,
  KeyRound,
  Check,
  X,
  Circle,
  Save,
  IdCard,
  Volume2,
} from 'lucide-react';
import { useAuth } from './hooks/useAuth';
import SoundToggle from './components/SoundToggle';
import { supabase } from './lib/supabase';

/* ── presentational helpers (no logic, same file) ─────────────────────────── */

type FieldOpts = {
  id?: string;
  icon?: React.ReactNode;
  hint?: string;
};

/** Read-only requirement row used under the password fields. */
function Requirement({ met, label }: { met: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2 text-small text-cyber-muted">
      <span
        aria-hidden="true"
        className="grid h-4 w-4 shrink-0 place-items-center rounded-full border transition-colors duration-[var(--duration-base)] ease-standard"
        style={{
          borderColor: met ? 'var(--color-border-neon)' : 'var(--color-border-base)',
          backgroundColor: met ? 'var(--color-neon-wash)' : 'transparent',
          color: met ? 'var(--color-neon)' : 'var(--color-text-faint)',
        }}
      >
        {met ? <Check className="h-2.5 w-2.5" strokeWidth={3} /> : <Circle className="h-1.5 w-1.5 fill-current" />}
      </span>
      <span style={{ color: met ? 'var(--color-text-secondary)' : undefined }}>{label}</span>
    </li>
  );
}

/** Panel header: icon medallion + title + one-line description. */
function PanelHeader({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <header className="flex items-start gap-3 border-b border-border-subtle pb-4">
      <span
        aria-hidden="true"
        className="grid h-9 w-9 shrink-0 place-items-center rounded-control border border-border-neon bg-neon-wash text-cyber-neon"
      >
        {icon}
      </span>
      <div className="min-w-0">
        <h2 className="text-h3 text-cyber-text">{title}</h2>
        <p className="mt-0.5 text-small text-cyber-muted">{description}</p>
      </div>
    </header>
  );
}

export default function Settings() {
  const { user, profile, updateProfile } = useAuth();
  const [tab, setTab] = useState<'profile' | 'tokens'>('profile');
  const [form, setForm] = useState({
    username: profile?.username ?? '',
    affiliation: (profile as any)?.affiliation ?? '',
    website: (profile as any)?.website ?? '',
    country: profile?.country ?? '',
  });
  const [passwords, setPasswords] = useState({ current: '', newPass: '', confirm: '' });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const reduceMotion = useReducedMotion();

  const inp = (
    label: string,
    value: string,
    onChange: (v: string) => void,
    type = 'text',
    placeholder = '',
    opts: FieldOpts = {}
  ) => {
    const id = opts.id ?? `field-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    return (
      <div className="min-w-0">
        <label className="field-label" htmlFor={id}>
          {label}
        </label>
        <div className="relative">
          {opts.icon && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-cyber-muted"
            >
              {opts.icon}
            </span>
          )}
          <input
            id={id}
            type={type}
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
            className={`input ${opts.icon ? 'pl-9' : ''}`}
            aria-describedby={opts.hint ? `${id}-hint` : undefined}
          />
        </div>
        {opts.hint && (
          <p id={`${id}-hint`} className="mt-1.5 text-small text-cyber-muted">
            {opts.hint}
          </p>
        )}
      </div>
    );
  };

  const handleProfileSave = async () => {
    if (!form.username.trim()) { setMsg({ text: 'Username cannot be empty.', ok: false }); return; }
    setSaving(true);
    setMsg(null);
    const result = await updateProfile({
      username: form.username.trim(),
      affiliation: form.affiliation,
      website: form.website,
      country: form.country,
    });
    setSaving(false);
    if ((result as any)?.error) setMsg({ text: (result as any).error, ok: false });
    else setMsg({ text: 'Profile updated successfully.', ok: true });
  };

  const handlePasswordChange = async () => {
    if (!passwords.newPass) { setMsg({ text: 'New password cannot be empty.', ok: false }); return; }
    if (passwords.newPass !== passwords.confirm) { setMsg({ text: 'Passwords do not match.', ok: false }); return; }
    if (passwords.newPass.length < 6) { setMsg({ text: 'Password must be at least 6 characters.', ok: false }); return; }
    setSaving(true);
    setMsg(null);
    const { error } = await supabase.auth.updateUser({ password: passwords.newPass });
    setSaving(false);
    if (error) setMsg({ text: error.message, ok: false });
    else { setMsg({ text: 'Password updated successfully.', ok: true }); setPasswords({ current: '', newPass: '', confirm: '' }); }
  };

  /* purely presentational: feedback banner shared by both panels */
  const feedback = msg && (
    <motion.div
      key={`${msg.ok ? 'ok' : 'err'}-${msg.text}`}
      initial={reduceMotion ? false : { opacity: 0, transform: 'translateY(-4px)' }}
      animate={{ opacity: 1, transform: 'translateY(0px)' }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      role="status"
      aria-live="polite"
      className="flex items-start gap-2.5 rounded-control border p-3"
      style={{
        borderColor: msg.ok ? 'var(--color-border-neon)' : 'var(--color-border-danger)',
        backgroundColor: msg.ok ? 'var(--color-neon-wash)' : 'var(--color-diff-hard-wash)',
      }}
    >
      <span
        aria-hidden="true"
        className="mt-px shrink-0"
        style={{ color: msg.ok ? 'var(--color-neon)' : 'var(--color-diff-hard)' }}
      >
        {msg.ok ? <Check className="h-4 w-4" strokeWidth={3} /> : <X className="h-4 w-4" strokeWidth={3} />}
      </span>
      <p
        className="text-small break-words"
        style={{ color: msg.ok ? 'var(--color-text-primary)' : 'var(--color-diff-hard)' }}
      >
        {msg.text}
      </p>
    </motion.div>
  );

  const tabMeta = {
    profile: { label: 'Profile', icon: <User className="h-3.5 w-3.5" /> },
    tokens: { label: 'Security', icon: <ShieldCheck className="h-3.5 w-3.5" /> },
  } as const;

  return (
    <div className="flex-1 w-full max-w-4xl mx-auto px-4 sm:px-6 py-10 sm:py-12">
      <div className="mb-8 sm:mb-section">
        <p className="label-micro mb-2">Account</p>
        <h1 className="text-h1 text-cyber-text">Settings</h1>
        <p className="mt-2 text-body text-cyber-muted max-w-prose">
          Manage your operative profile and credentials.
        </p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 lg:gap-8">
        {/* Sidebar */}
        <aside className="w-full lg:w-48 shrink-0">
          <nav
            aria-label="Settings sections"
            className="flex lg:flex-col gap-1 overflow-x-auto custom-scrollbar rounded-card border border-border-subtle bg-surface-rail p-1.5 lg:sticky lg:top-6"
          >
            {(['profile', 'tokens'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                aria-current={tab === t ? 'page' : undefined}
                className={`tab shrink-0 lg:w-full lg:justify-start ${tab === t ? 'is-active' : ''}`}
              >
                <span aria-hidden="true" className={tab === t ? 'text-cyber-neon' : ''}>
                  {tabMeta[t].icon}
                </span>
                {t === 'profile' ? 'Profile' : 'Security'}
              </button>
            ))}
          </nav>
        </aside>

        {/* Content */}
        <div className="flex-1 min-w-0 space-y-6">
          {tab === 'profile' && (
            <div className="surface p-5 sm:p-gutter space-y-6">
              <PanelHeader
                icon={<IdCard className="h-4 w-4" />}
                title="Operative Profile"
                description="How you appear on the scoreboard and across CyberHX."
              />

              <div className="space-y-5">
                {inp('Username', form.username, v => setForm(p => ({ ...p, username: v })), 'text', '', {
                  icon: <User className="h-3.5 w-3.5" />,
                  hint: 'Your public handle. Shown on the scoreboard and solve feed.',
                })}

                <div className="min-w-0">
                  <label className="field-label" htmlFor="settings-email">
                    Email
                  </label>
                  <div className="relative group">
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-cyber-muted"
                    >
                      <Mail className="h-3.5 w-3.5" />
                    </span>
                    <input
                      id="settings-email"
                      type="text"
                      value={user?.email ?? ''}
                      disabled
                      className="input pl-9 pr-10 cursor-not-allowed"
                      aria-describedby="settings-email-hint"
                    />
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-cyber-muted"
                    >
                      <Lock className="h-3.5 w-3.5" />
                    </span>
                    <span
                      role="tooltip"
                      className="tooltip absolute right-0 -top-2 hidden -translate-y-full opacity-0 transition-opacity duration-[var(--duration-fast)] ease-standard group-hover:opacity-100 sm:block"
                    >
                      Locked — contact an organiser to change it
                    </span>
                  </div>
                  <p id="settings-email-hint" className="mt-1.5 text-small text-cyber-muted">
                    Email cannot be changed.
                  </p>
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                  {inp('Affiliation', form.affiliation, v => setForm(p => ({ ...p, affiliation: v })), 'text', 'Your organization or university', {
                    icon: <Building2 className="h-3.5 w-3.5" />,
                    hint: 'Optional. Team, university or company.',
                  })}
                  {inp('Country', form.country, v => setForm(p => ({ ...p, country: v })), 'text', 'e.g. India', {
                    icon: <MapPin className="h-3.5 w-3.5" />,
                    hint: 'Optional. Used for regional standings.',
                  })}
                  <div className="sm:col-span-2">
                    {inp('Website', form.website, v => setForm(p => ({ ...p, website: v })), 'url', 'https://', {
                      icon: <Globe className="h-3.5 w-3.5" />,
                      hint: 'Optional. Blog, portfolio or writeup archive.',
                    })}
                  </div>
                </div>
              </div>

              {feedback}

              <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 border-t border-border-subtle pt-5">
                <p className="text-small text-cyber-muted">Changes apply immediately across the platform.</p>
                <button
                  onClick={handleProfileSave}
                  disabled={saving}
                  className={`btn btn-primary btn-md btn-block sm:w-auto ${saving ? 'is-loading' : ''}`}
                >
                  <Save className="h-3.5 w-3.5" aria-hidden="true" />
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          )}

          {/* Sound lives here with a label for players who are configuring, and
              in the header as a bare icon for players who are reacting. Both
              write the same preference, so they cannot disagree. */}
          {tab === 'profile' && (
            <div className="surface p-5 sm:p-gutter space-y-5">
              <PanelHeader
                icon={<Volume2 className="h-4 w-4" />}
                title="Experience"
                description="How the platform sounds while you work."
              />
              <SoundToggle variant="row" />
            </div>
          )}

          {tab === 'tokens' && (
            <div className="surface p-5 sm:p-gutter space-y-6">
              <PanelHeader
                icon={<KeyRound className="h-4 w-4" />}
                title="Change Password"
                description="Pick something long and unique — you will stay signed in."
              />

              <div className="space-y-5">
                {inp('New Password', passwords.newPass, v => setPasswords(p => ({ ...p, newPass: v })), 'password', '••••••••', {
                  icon: <Lock className="h-3.5 w-3.5" />,
                })}
                {inp('Confirm New Password', passwords.confirm, v => setPasswords(p => ({ ...p, confirm: v })), 'password', '••••••••', {
                  icon: <ShieldCheck className="h-3.5 w-3.5" />,
                })}
              </div>

              <div className="surface-inset rounded-control p-4">
                <p className="label-micro mb-2.5">Requirements</p>
                <ul className="space-y-1.5">
                  <Requirement met={passwords.newPass.length >= 6} label="At least 6 characters" />
                  <Requirement
                    met={passwords.newPass.length > 0 && passwords.newPass === passwords.confirm}
                    label="Both entries match"
                  />
                </ul>
              </div>

              {feedback}

              <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 border-t border-border-subtle pt-5">
                <p className="text-small text-cyber-muted">Your session stays active after the change.</p>
                <button
                  onClick={handlePasswordChange}
                  disabled={saving}
                  className={`btn btn-primary btn-md btn-block sm:w-auto ${saving ? 'is-loading' : ''}`}
                >
                  <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
                  {saving ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
