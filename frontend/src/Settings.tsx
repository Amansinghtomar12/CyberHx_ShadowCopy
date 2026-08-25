import React, { useState } from 'react';
import { useAuth } from './hooks/useAuth';
import { supabase } from './lib/supabase';

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

  const inp = (label: string, value: string, onChange: (v: string) => void, type = 'text', placeholder = '') => (
    <div className="space-y-1">
      <label className="text-[10px] font-bold text-cyber-muted uppercase tracking-widest block">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-cyber-card border border-cyber-border rounded px-4 py-3 text-white text-xs focus:outline-none focus:border-cyber-neon transition-all font-mono"
      />
    </div>
  );

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

  return (
    <div className="flex-1 max-w-4xl mx-auto w-full px-6 py-12">
      <div className="mb-10">
        <h1 className="text-[11px] font-bold text-cyber-neon uppercase tracking-widest mb-1">Settings</h1>
        <p className="text-cyber-muted text-xs">Manage your operative profile and credentials</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Sidebar */}
        <aside className="w-full lg:w-44 shrink-0">
          <nav className="flex lg:flex-col gap-2">
            {(['profile', 'tokens'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-2 rounded text-[10px] font-bold uppercase tracking-widest transition-all text-left ${
                  tab === t
                    ? 'bg-cyber-neon text-black'
                    : 'text-cyber-muted hover:text-white border border-cyber-border'
                }`}
              >
                {t === 'profile' ? 'Profile' : 'Security'}
              </button>
            ))}
          </nav>
        </aside>

        {/* Content */}
        <div className="flex-1 space-y-6">
          {tab === 'profile' && (
            <div className="bg-cyber-card border border-cyber-border rounded-lg p-6 space-y-5">
              <h2 className="text-[10px] font-bold text-cyber-muted uppercase tracking-widest border-b border-cyber-border pb-3">
                Operative Profile
              </h2>

              {inp('Username', form.username, v => setForm(p => ({ ...p, username: v })))}

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-cyber-muted uppercase tracking-widest block">Email</label>
                <input
                  type="text"
                  value={user?.email ?? ''}
                  disabled
                  className="w-full bg-cyber-bg border border-cyber-border/50 rounded px-4 py-3 text-cyber-muted text-xs font-mono cursor-not-allowed"
                />
                <p className="text-[9px] text-cyber-muted/60">Email cannot be changed</p>
              </div>

              {inp('Affiliation', form.affiliation, v => setForm(p => ({ ...p, affiliation: v })), 'text', 'Your organization or university')}
              {inp('Website', form.website, v => setForm(p => ({ ...p, website: v })), 'url', 'https://')}
              {inp('Country', form.country, v => setForm(p => ({ ...p, country: v })), 'text', 'e.g. India')}

              {msg && (
                <p className={`text-[10px] font-bold uppercase tracking-widest ${msg.ok ? 'text-cyber-neon' : 'text-red-400'}`}>
                  {msg.ok ? '✓' : '✗'} {msg.text}
                </p>
              )}

              <button
                onClick={handleProfileSave}
                disabled={saving}
                className="bg-cyber-neon text-black px-6 py-2 rounded text-[10px] font-bold uppercase tracking-widest hover:bg-cyber-neon/90 transition-all disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          )}

          {tab === 'tokens' && (
            <div className="bg-cyber-card border border-cyber-border rounded-lg p-6 space-y-5">
              <h2 className="text-[10px] font-bold text-cyber-muted uppercase tracking-widest border-b border-cyber-border pb-3">
                Change Password
              </h2>

              {inp('New Password', passwords.newPass, v => setPasswords(p => ({ ...p, newPass: v })), 'password', '••••••••')}
              {inp('Confirm New Password', passwords.confirm, v => setPasswords(p => ({ ...p, confirm: v })), 'password', '••••••••')}

              {msg && (
                <p className={`text-[10px] font-bold uppercase tracking-widest ${msg.ok ? 'text-cyber-neon' : 'text-red-400'}`}>
                  {msg.ok ? '✓' : '✗'} {msg.text}
                </p>
              )}

              <button
                onClick={handlePasswordChange}
                disabled={saving}
                className="bg-cyber-neon text-black px-6 py-2 rounded text-[10px] font-bold uppercase tracking-widest hover:bg-cyber-neon/90 transition-all disabled:opacity-50"
              >
                {saving ? 'Updating...' : 'Update Password'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
