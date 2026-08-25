// src/components/admin/AdminDashboard.tsx
import React, { useState, useEffect } from 'react';
import { supabase, DBChallenge } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { Plus, Eye, EyeOff, Trash2, Edit3, Shield, Users, Flag, Activity, RotateCcw } from 'lucide-react';
import { resetEventScores } from '../../api/submitFlag';
// HARDENED: Challenge CRUD via admin_upsert_challenge RPC
// HARDENED: Reset via admin_reset_event RPC (no client-side DELETE)

// ─────────────────────────────────────────
// STATS BAR
// ─────────────────────────────────────────
function StatsBar() {
  const [stats, setStats] = useState({ users: 0, teams: 0, challenges: 0, submissions: 0 });

  useEffect(() => {
    Promise.all([
      supabase.from('profiles').select('id', { count: 'exact', head: true }),
      supabase.from('teams').select('id', { count: 'exact', head: true }),
      supabase.rpc('get_challenges_count'),
      supabase.from('submissions').select('id', { count: 'exact', head: true }),
    ]).then(([u, t, c, s]) => {
      setStats({ users: u.count ?? 0, teams: t.count ?? 0, challenges: Number(c.data ?? 0), submissions: s.count ?? 0 });
    });
  }, []);

  const items = [
    { label: 'Total Users', value: stats.users, icon: <Users className="w-4 h-4" /> },
    { label: 'Teams', value: stats.teams, icon: <Shield className="w-4 h-4" /> },
    { label: 'Challenges', value: stats.challenges, icon: <Flag className="w-4 h-4" /> },
    { label: 'Submissions', value: stats.submissions, icon: <Activity className="w-4 h-4" /> },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
      {items.map(item => (
        <div key={item.label} className="bg-cyber-card border border-cyber-border rounded-lg p-5">
          <div className="flex items-center gap-2 text-cyber-muted mb-2">
            {item.icon}
            <span className="text-[10px] font-bold uppercase tracking-widest">{item.label}</span>
          </div>
          <div className="text-3xl font-bold text-white">{item.value}</div>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────
// CHALLENGE FORM — with max_attempts field
// ─────────────────────────────────────────
interface ChallengeFormProps {
  initial?: Partial<DBChallenge & { flag: string; max_attempts: number }>;
  onSave: () => void;
  onCancel: () => void;
}

function ChallengeForm({ initial, onSave, onCancel }: ChallengeFormProps) {
  const [form, setForm] = useState({
    title: initial?.title ?? '',
    category: initial?.category ?? 'web',
    difficulty: initial?.difficulty ?? 'Easy',
    points: initial?.points ?? 100,
    max_attempts: (initial as any)?.max_attempts ?? 15,
    description: initial?.description ?? '',
    flag: (initial as any)?.flag ?? '',
    author: initial?.author ?? '',
    tags: initial?.tags?.join(', ') ?? '',
    is_visible: initial?.is_visible ?? false,
  });

  // Fetch flag securely via RPC if editing
  useEffect(() => {
    if (!initial?.id) return;
    supabase.rpc('get_challenge_flag', { challenge_id: initial.id })
      .then(({ data }) => {
        if (data) setForm(p => ({ ...p, flag: data }));
      });
  }, [initial?.id]);
  const [hints, setHints] = useState<{ id?: string; text: string; cost: number }[]>([]);
  const [links, setLinks] = useState<{ label: string; url: string }[]>(
    (initial as any)?.connection_info
      ? JSON.parse((initial as any).connection_info)
      : []
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Load existing hints if editing
  useEffect(() => {
    if (!initial?.id) return;
    supabase.rpc('get_challenge_hints', { p_challenge_id: initial.id })
      .then(({ data }) => setHints(data ?? []));
  }, [initial?.id]);

  const addHint = () => setHints(prev => [...prev, { text: '', cost: 10 }]);
  const removeHint = (i: number) => setHints(prev => prev.filter((_, idx) => idx !== i));
  const updateHint = (i: number, key: 'text' | 'cost', val: string | number) =>
    setHints(prev => prev.map((h, idx) => idx === i ? { ...h, [key]: val } : h));

  const addLink = () => setLinks(prev => [...prev, { label: '', url: '' }]);
  const removeLink = (i: number) => setLinks(prev => prev.filter((_, idx) => idx !== i));
  const updateLink = (i: number, key: 'label' | 'url', val: string) =>
    setLinks(prev => prev.map((l, idx) => idx === i ? { ...l, [key]: val } : l));

  const handleSave = async () => {
    if (!form.title || !form.flag || !form.description) {
      setError('Title, description, and flag are required.');
      return;
    }
    setSaving(true);
    const payload = {
      title: form.title,
      category: form.category,
      difficulty: form.difficulty,
      points: Number(form.points),
      max_attempts: Number(form.max_attempts),
      description: form.description,
      flag: form.flag,
      author: form.author || 'Cyberhx Team',
      tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
      is_visible: form.is_visible,
      connection_info: links.filter(l => l.url.trim()).length > 0
        ? JSON.stringify(links.filter(l => l.url.trim()))
        : null,
    };

    let challengeId = initial?.id;

    // HARDENED: Use admin_upsert_challenge RPC — handles flag hashing server-side
    const { data: rpcResult, error: rpcError } = await supabase.rpc('admin_upsert_challenge', {
      p_id: initial?.id ?? null,
      p_title: payload.title,
      p_category: payload.category,
      p_difficulty: payload.difficulty,
      p_description: payload.description,
      p_flag: payload.flag || null,
      p_points: payload.points,
      p_max_attempts: payload.max_attempts,
      p_author: payload.author,
      p_tags: payload.tags,
      p_is_visible: payload.is_visible,
      p_connection_info: payload.connection_info,
    });

    if (rpcError) { setError(rpcError.message); setSaving(false); return; }
    if (rpcResult?.error) { setError(rpcResult.error); setSaving(false); return; }
    challengeId = rpcResult?.challenge_id ?? challengeId;

    // Save hints — delete old ones, insert new
    if (challengeId) {
      await supabase.from('hints').delete().eq('challenge_id', challengeId);
      const validHints = hints.filter(h => h.text.trim());
      if (validHints.length > 0) {
        await supabase.from('hints').insert(
          validHints.map(h => ({ challenge_id: challengeId, text: h.text.trim(), cost: Number(h.cost) }))
        );
      }
    }

    setSaving(false);
    onSave();
  };

  const field = (label: string, key: keyof typeof form, type = 'text') => (
    <div className="space-y-1">
      <label className="text-[10px] font-bold text-cyber-muted uppercase tracking-widest block">{label}</label>
      <input
        type={type}
        value={String(form[key])}
        onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
        className="w-full bg-cyber-sidebar border border-cyber-border rounded px-4 py-3 text-white text-xs focus:outline-none focus:border-cyber-neon transition-all font-mono"
      />
    </div>
  );

  return (
    <div className="bg-cyber-card border border-cyber-border rounded-lg p-8 mb-8">
      <h3 className="text-sm font-bold uppercase tracking-widest text-cyber-neon mb-6">
        {initial?.id ? 'Edit Challenge' : 'New Challenge'}
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {field('Title', 'title')}
        {field('Author', 'author')}
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-cyber-muted uppercase tracking-widest block">Category</label>
          <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value as any }))}
            className="w-full bg-cyber-sidebar border border-cyber-border rounded px-4 py-3 text-white text-xs focus:outline-none focus:border-cyber-neon">
            {['web','crypto','steg','rev','pwn','forensic','osint','misc'].map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-cyber-muted uppercase tracking-widest block">Difficulty</label>
          <select value={form.difficulty} onChange={e => setForm(p => ({ ...p, difficulty: e.target.value as any }))}
            className="w-full bg-cyber-sidebar border border-cyber-border rounded px-4 py-3 text-white text-xs focus:outline-none focus:border-cyber-neon">
            {['Easy','Medium','Hard'].map(d => <option key={d}>{d}</option>)}
          </select>
        </div>
        {field('Points', 'points', 'number')}
        {field('Max Attempts', 'max_attempts', 'number')}
        {field('Tags (comma separated)', 'tags')}
      </div>
      <div className="mt-4 space-y-1">
        <label className="text-[10px] font-bold text-cyber-muted uppercase tracking-widest block">Description (Markdown)</label>
        <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
          rows={6} className="w-full bg-cyber-sidebar border border-cyber-border rounded px-4 py-3 text-white text-xs focus:outline-none focus:border-cyber-neon font-mono resize-none" />
      </div>
      <div className="mt-4 space-y-1">
        <label className="text-[10px] font-bold text-red-400 uppercase tracking-widest block">⚠ Flag (stored securely, never sent to browser)</label>
        <input type="text" value={form.flag} onChange={e => setForm(p => ({ ...p, flag: e.target.value }))}
          placeholder="FLAG{...}"
          className="w-full bg-cyber-sidebar border border-red-500/40 rounded px-4 py-3 text-white text-xs focus:outline-none focus:border-red-400 font-mono" />
      </div>
      <div className="mt-4 flex items-center gap-3">
        <input type="checkbox" id="visible" checked={form.is_visible} onChange={e => setForm(p => ({ ...p, is_visible: e.target.checked }))}
          className="w-4 h-4 accent-cyber-neon" />
        <label htmlFor="visible" className="text-[11px] font-bold text-cyber-muted uppercase tracking-widest cursor-pointer">
          Visible to participants
        </label>
      </div>

      {/* HINTS SECTION */}
      <div className="mt-6 border-t border-cyber-border pt-6">
        <div className="flex items-center justify-between mb-4">
          <label className="text-[10px] font-bold text-cyber-muted uppercase tracking-widest">Hints</label>
          <button onClick={addHint} type="button"
            className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest text-cyber-neon border border-cyber-neon/30 px-3 py-1.5 rounded hover:bg-cyber-neon/10 transition-all">
            + Add Hint
          </button>
        </div>
        {hints.length === 0 ? (
          <p className="text-cyber-muted text-xs">No hints added. Click "Add Hint" to add one.</p>
        ) : (
          <div className="space-y-3">
            {hints.map((hint, i) => (
              <div key={i} className="flex gap-3 items-start bg-cyber-sidebar border border-cyber-border rounded-lg p-3">
                <div className="flex-1">
                  <label className="text-[9px] font-bold text-cyber-muted uppercase tracking-widest block mb-1">Hint Text</label>
                  <textarea value={hint.text} onChange={e => updateHint(i, 'text', e.target.value)}
                    placeholder="Give a helpful clue..."
                    rows={2}
                    className="w-full bg-cyber-card border border-cyber-border rounded px-3 py-2 text-white text-xs focus:outline-none focus:border-cyber-neon resize-none" />
                </div>
                <div className="w-24">
                  <label className="text-[9px] font-bold text-cyber-muted uppercase tracking-widest block mb-1">Cost (pts)</label>
                  <input type="number" value={hint.cost} onChange={e => updateHint(i, 'cost', Number(e.target.value))}
                    min={0}
                    className="w-full bg-cyber-card border border-cyber-border rounded px-3 py-2 text-white text-xs focus:outline-none focus:border-cyber-neon" />
                </div>
                <button onClick={() => removeHint(i)} type="button"
                  className="mt-5 text-red-400 hover:text-red-300 transition-colors text-lg leading-none">×</button>
              </div>
            ))}
          </div>
        )}
      </div>
      {/* RESOURCE LINKS SECTION */}
      <div className="mt-6 border-t border-cyber-border pt-6">
        <div className="flex items-center justify-between mb-4">
          <label className="text-[10px] font-bold text-cyber-muted uppercase tracking-widest">Resource Links</label>
          <button onClick={addLink} type="button"
            className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest text-cyber-neon border border-cyber-neon/30 px-3 py-1.5 rounded hover:bg-cyber-neon/10 transition-all">
            + Add Link
          </button>
        </div>
        {links.length === 0 ? (
          <p className="text-cyber-muted text-xs">No links added. Add Google Drive, ZIP, or any URL.</p>
        ) : (
          <div className="space-y-3">
            {links.map((link, i) => (
              <div key={i} className="flex gap-3 items-start bg-cyber-sidebar border border-cyber-border rounded-lg p-3">
                <div className="w-40">
                  <label className="text-[9px] font-bold text-cyber-muted uppercase tracking-widest block mb-1">Label</label>
                  <input type="text" value={link.label} onChange={e => updateLink(i, 'label', e.target.value)}
                    placeholder="e.g. chall.zip"
                    className="w-full bg-cyber-card border border-cyber-border rounded px-3 py-2 text-white text-xs focus:outline-none focus:border-cyber-neon" />
                </div>
                <div className="flex-1">
                  <label className="text-[9px] font-bold text-cyber-muted uppercase tracking-widest block mb-1">URL</label>
                  <input type="url" value={link.url} onChange={e => updateLink(i, 'url', e.target.value)}
                    placeholder="https://drive.google.com/..."
                    className="w-full bg-cyber-card border border-cyber-border rounded px-3 py-2 text-white text-xs focus:outline-none focus:border-cyber-neon font-mono" />
                </div>
                <button onClick={() => removeLink(i)} type="button"
                  className="mt-5 text-red-400 hover:text-red-300 transition-colors text-lg leading-none">×</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {error && <p className="mt-3 text-red-400 text-xs font-bold">{error}</p>}
      <div className="mt-6 flex gap-3">
        <button onClick={handleSave} disabled={saving}
          className="bg-cyber-neon text-black px-6 py-2 rounded text-[11px] font-bold uppercase tracking-widest hover:bg-white transition-all disabled:opacity-50">
          {saving ? 'Saving...' : 'Save Challenge'}
        </button>
        <button onClick={onCancel}
          className="border border-cyber-border text-cyber-muted px-6 py-2 rounded text-[11px] font-bold uppercase tracking-widest hover:text-white transition-all">
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────
// MAIN ADMIN DASHBOARD
// ─────────────────────────────────────────
export default function AdminDashboard() {
  // HARDENED: Auth guard — server-confirmed role check
  const { profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-cyber-muted text-xs uppercase tracking-widest">Verifying access...</div>
      </div>
    );
  }

  if (!profile || profile.role !== 'admin') {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-3">
          <Shield className="w-10 h-10 text-red-500/50 mx-auto" />
          <p className="text-red-400 text-sm font-bold uppercase tracking-widest">Access Denied</p>
          <p className="text-cyber-muted text-xs">Admin privileges required.</p>
        </div>
      </div>
    );
  }

  return <AdminDashboardInner />;
}

// Inner component — only renders after auth confirmed
function AdminDashboardInner() {
  const [challenges, setChallenges] = useState<DBChallenge[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editChallenge, setEditChallenge] = useState<DBChallenge | null>(null);
  const [activeTab, setActiveTab] = useState<'challenges' | 'users' | 'teams' | 'submissions' | 'notifications' | 'event'>('challenges');
  const [resetting, setResetting] = useState(false);

  const loadChallenges = async () => {
    const { data } = await supabase
      .from('challenges')
      .select('id, title, category, difficulty, points, max_attempts, is_visible, author, description, tags, connection_info, created_at')
      .order('created_at', { ascending: false });
    setChallenges((data ?? []) as DBChallenge[]);
  };

  useEffect(() => { loadChallenges(); }, []);

  // HARDENED: toggleVisibility via RPC — admin check enforced server-side
  const toggleVisibility = async (id: string, current: boolean) => {
    await supabase.rpc('admin_upsert_challenge', {
      p_id: id,
      p_is_visible: !current,
    });
    loadChallenges();
  };

  // HARDENED: deleteChallenge via RPC — admin check enforced server-side
  const deleteChallenge = async (id: string) => {
    if (!confirm('Delete this challenge? This cannot be undone.')) return;
    const { data, error } = await supabase.rpc('admin_delete_challenge', { p_id: id });
    if (error || data?.error) {
      alert('Delete failed: ' + (error?.message ?? data.error));
      return;
    }
    loadChallenges();
  };

  const handleResetEvent = async () => {
    if (!confirm('⚠️ Are you sure? This will DELETE all submissions and reset scores to ZERO!')) return;

    setResetting(true);
    // HARDENED: Uses admin_reset_event RPC — server-side admin check
    const result = await resetEventScores();
    setResetting(false);

    if (result.success) {
      alert('✅ Event scores reset! Scoreboard is now zero.');
    } else {
      alert('❌ Error: ' + result.error);
    }
  };

  const tabs = [
    { id: 'challenges', label: 'Challenges' },
    { id: 'users', label: 'Users' },
    { id: 'teams', label: 'Teams' },
    { id: 'submissions', label: 'Submissions' },
    { id: 'notifications', label: '📢 Notifications' },
    { id: 'event', label: '⚡ Event' },
  ] as const;

  return (
    <div className="flex-1 px-6 py-10 max-w-7xl mx-auto w-full">
      {/* Admin Header */}
      <div className="flex items-center justify-between mb-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-red-500/20 border border-red-500/40 rounded flex items-center justify-center">
            <Shield className="w-4 h-4 text-red-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Admin Panel</h1>
            <p className="text-[10px] font-bold text-cyber-muted uppercase tracking-widest">CyberHX Control Center</p>
          </div>
        </div>
        {/* Reset Event Button */}
        <button
          onClick={handleResetEvent}
          disabled={resetting}
          className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white text-[11px] font-bold uppercase tracking-widest px-5 py-2.5 rounded-lg transition-all disabled:opacity-50"
        >
          <RotateCcw className="w-4 h-4" />
          {resetting ? 'Resetting...' : 'Reset Event Scores'}
        </button>
      </div>

      <StatsBar />

      {/* Tabs */}
      <div className="flex gap-8 border-b border-cyber-border mb-8">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`pb-3 text-[11px] font-bold uppercase tracking-widest transition-all ${
              activeTab === tab.id ? 'text-cyber-neon border-b-2 border-cyber-neon' : 'text-cyber-muted hover:text-white'
            }`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Challenges Tab */}
      {activeTab === 'challenges' && (
        <div>
          {(showForm || editChallenge) ? (
            <ChallengeForm
              initial={editChallenge ?? undefined}
              onSave={() => { setShowForm(false); setEditChallenge(null); loadChallenges(); }}
              onCancel={() => { setShowForm(false); setEditChallenge(null); }}
            />
          ) : (
            <button onClick={() => setShowForm(true)}
              className="flex items-center gap-2 bg-cyber-neon text-black px-5 py-2.5 rounded text-[11px] font-bold uppercase tracking-widest hover:bg-white transition-all mb-8">
              <Plus className="w-4 h-4" /> Add Challenge
            </button>
          )}

          <div className="overflow-hidden rounded-lg border border-cyber-border">
            <table className="w-full text-left">
              <thead className="bg-cyber-sidebar/50 border-b border-cyber-border">
                <tr>
                  {['Title', 'Category', 'Difficulty', 'Points', 'Max Attempts', 'Visible', 'Actions'].map(h => (
                    <th key={h} className="px-6 py-4 text-[10px] font-bold text-cyber-muted uppercase tracking-widest">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-cyber-border/50">
                {challenges.map(c => (
                  <tr key={c.id} className="hover:bg-cyber-sidebar/20 transition-colors">
                    <td className="px-6 py-4 text-sm font-medium text-white">{c.title}</td>
                    <td className="px-6 py-4 text-[10px] font-bold text-cyber-muted uppercase tracking-widest">{c.category}</td>
                    <td className="px-6 py-4 text-[10px] font-bold text-cyber-muted uppercase tracking-widest">{c.difficulty}</td>
                    <td className="px-6 py-4 text-sm font-mono text-cyber-neon">{c.points}</td>
                    <td className="px-6 py-4 text-sm font-mono text-cyber-muted">{(c as any).max_attempts ?? 15}</td>
                    <td className="px-6 py-4">
                      <button onClick={() => toggleVisibility(c.id, c.is_visible)}
                        className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest ${
                          c.is_visible ? 'text-cyber-neon' : 'text-cyber-muted'
                        }`}>
                        {c.is_visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                        {c.is_visible ? 'Live' : 'Hidden'}
                      </button>
                    </td>
                    <td className="px-6 py-4 flex items-center gap-3">
                      <button onClick={() => setEditChallenge(c)} className="text-cyber-muted hover:text-white transition-colors">
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button onClick={() => deleteChallenge(c.id)} className="text-cyber-muted hover:text-red-400 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
                {challenges.length === 0 && (
                  <tr><td colSpan={7} className="px-6 py-10 text-center text-cyber-muted text-xs">No challenges yet. Add one above.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Users Tab */}
      {activeTab === 'users' && <UsersTab />}
      {activeTab === 'teams' && <TeamsTab />}

      {/* Submissions Tab */}
      {activeTab === 'submissions' && <SubmissionsTab />}

      {/* Event Tab */}
      {activeTab === 'notifications' && <NotificationsTab />}
      {activeTab === 'event' && <EventTab />}
    </div>
  );
}

// ─────────────────────────────────────────
// USERS TAB
// ─────────────────────────────────────────
function UsersTab() {
  const [users, setUsers] = useState<any[]>([]);

  useEffect(() => {
    supabase.from('user_scores').select('*').order('total_points', { ascending: false }).limit(100)
      .then(({ data }) => setUsers(data ?? []));
  }, []);

  return (
    <div className="overflow-hidden rounded-lg border border-cyber-border">
      <table className="w-full text-left">
        <thead className="bg-cyber-sidebar/50 border-b border-cyber-border">
          <tr>
            {['#', 'Username', 'Points', 'Solved', 'Last Solve'].map(h => (
              <th key={h} className="px-6 py-4 text-[10px] font-bold text-cyber-muted uppercase tracking-widest">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-cyber-border/50">
          {users.map((u, i) => (
            <tr key={u.id} className="hover:bg-cyber-sidebar/20">
              <td className="px-6 py-4 text-sm font-bold text-cyber-muted">{i + 1}</td>
              <td className="px-6 py-4 text-sm font-medium text-white">{u.username}</td>
              <td className="px-6 py-4 text-sm font-mono text-cyber-neon">{u.total_points}</td>
              <td className="px-6 py-4 text-sm text-cyber-muted">{u.solved_count}</td>
              <td className="px-6 py-4 text-[10px] font-mono text-cyber-muted">
                {u.last_solve ? new Date(u.last_solve).toLocaleString() : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─────────────────────────────────────────
// SUBMISSIONS TAB
// ─────────────────────────────────────────
function SubmissionsTab() {
  const [subs, setSubs] = useState<any[]>([]);

  useEffect(() => {
    supabase.from('submissions')
      .select('*, submitted_flag_hash, profiles(username), challenges(title)')
      .order('submitted_at', { ascending: false })
      .limit(100)
      .then(({ data }) => setSubs(data ?? []));
  }, []);

  return (
    <div className="overflow-hidden rounded-lg border border-cyber-border">
      <table className="w-full text-left">
        <thead className="bg-cyber-sidebar/50 border-b border-cyber-border">
          <tr>
            {['User', 'Challenge', 'Flag Hash', 'Result', 'Time'].map(h => (
              <th key={h} className="px-6 py-4 text-[10px] font-bold text-cyber-muted uppercase tracking-widest">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-cyber-border/50">
          {subs.map(s => (
            <tr key={s.id} className="hover:bg-cyber-sidebar/20">
              <td className="px-6 py-4 text-sm text-white">{(s.profiles as any)?.username}</td>
              <td className="px-6 py-4 text-sm text-cyber-muted">{(s.challenges as any)?.title}</td>
              <td className="px-6 py-4 text-xs font-mono text-cyber-muted truncate max-w-[200px]">{s.submitted_flag_hash ? s.submitted_flag_hash.substring(0, 16) + '...' : '—'}</td>
              <td className="px-6 py-4">
                <span className={`text-[10px] font-bold uppercase tracking-widest ${s.is_correct ? 'text-cyber-neon' : 'text-red-400'}`}>
                  {s.is_correct ? '✓ Correct' : '✗ Wrong'}
                </span>
              </td>
              <td className="px-6 py-4 text-[10px] font-mono text-cyber-muted">
                {new Date(s.submitted_at).toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─────────────────────────────────────────
// NOTIFICATIONS TAB
// ─────────────────────────────────────────
function NotificationsTab() {
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [type, setType] = useState('info');
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState('');
  const [history, setHistory] = useState<any[]>([]);

  const loadHistory = () => {
    supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(10)
      .then(({ data }) => setHistory(data ?? []));
  };

  useEffect(() => { loadHistory(); }, []);

  const send = async () => {
    if (!title.trim() || !message.trim()) { setMsg('❌ Title and message required'); return; }
    setSending(true);
    const { error } = await supabase.from('notifications').insert({ title: title.trim(), message: message.trim(), type });
    setSending(false);
    if (error) { setMsg('❌ ' + error.message); return; }
    setMsg('✅ Notification sent to all users!');
    setTitle(''); setMessage('');
    setTimeout(() => setMsg(''), 3000);
    loadHistory();
  };

  const deleteNotif = async (id: string) => {
    await supabase.from('notifications').delete().eq('id', id);
    loadHistory();
  };

  const typeColors: Record<string, string> = {
    info: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    success: 'bg-green-500/20 text-green-400 border-green-500/30',
    warning: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    danger: 'bg-red-500/20 text-red-400 border-red-500/30',
  };

  return (
    <div className="flex gap-6">
      <div className="flex-1 bg-cyber-card border border-cyber-border rounded-lg p-6 space-y-4 self-start">
        <h3 className="text-sm font-bold text-white uppercase tracking-widest mb-4">Send Notification to All Users</h3>
        <div>
          <label className="text-[10px] font-bold text-cyber-muted uppercase tracking-widest block mb-1">Type</label>
          <div className="flex gap-2">
            {['info', 'success', 'warning', 'danger'].map(t => (
              <button key={t} onClick={() => setType(t)}
                className={`px-3 py-1.5 rounded text-[9px] font-bold uppercase tracking-widest border transition-all ${type === t ? typeColors[t] : 'bg-cyber-sidebar text-cyber-muted border-cyber-border hover:text-white'}`}>
                {t}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-[10px] font-bold text-cyber-muted uppercase tracking-widest block mb-1">Title</label>
          <input value={title} onChange={e => setTitle(e.target.value)}
            placeholder="e.g. New Challenge Released!"
            className="w-full bg-cyber-sidebar border border-cyber-border rounded px-3 py-2 text-white text-xs focus:outline-none focus:border-cyber-neon transition-all" />
        </div>
        <div>
          <label className="text-[10px] font-bold text-cyber-muted uppercase tracking-widest block mb-1">Message</label>
          <textarea value={message} onChange={e => setMessage(e.target.value)}
            placeholder="e.g. A new Web challenge 'SQLi Master' has been added. Good luck!"
            rows={3}
            className="w-full bg-cyber-sidebar border border-cyber-border rounded px-3 py-2 text-white text-xs focus:outline-none focus:border-cyber-neon transition-all resize-none" />
        </div>
        {msg && <p className="text-[11px] font-bold">{msg}</p>}
        <button disabled={sending} onClick={send}
          className="w-full py-3 bg-cyber-neon text-black text-[11px] font-bold uppercase tracking-widest rounded hover:bg-white transition-all disabled:opacity-50">
          {sending ? 'Sending...' : '📢 Send to All Users'}
        </button>
      </div>
      <div className="w-80 self-start">
        <h3 className="text-[10px] font-bold text-cyber-muted uppercase tracking-widest mb-3">Recent Notifications</h3>
        <div className="space-y-2">
          {history.length === 0 ? (
            <p className="text-cyber-muted text-xs">No notifications sent yet</p>
          ) : history.map(n => (
            <div key={n.id} className={`p-3 rounded border text-xs relative ${typeColors[n.type] ?? typeColors.info}`}>
              <button onClick={() => deleteNotif(n.id)} className="absolute top-2 right-2 text-current opacity-50 hover:opacity-100">×</button>
              <p className="font-bold text-[10px] uppercase mb-0.5">{n.type}</p>
              <p className="font-semibold">{n.title}</p>
              <p className="opacity-75 text-[10px] mt-0.5">{n.message}</p>
              <p className="opacity-50 text-[9px] mt-1">{new Date(n.created_at).toLocaleString()}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────
// EVENT TAB
// ─────────────────────────────────────────
function EventTab() {
  const [event, setEvent] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    supabase.from('event_settings').select('*').order('id', { ascending: false }).limit(1).single()
      .then(({ data }) => setEvent(data));
  }, []);

  const save = async () => {
    if (!event) return;
    setSaving(true);
    const { error } = await supabase.from('event_settings').update({
      name: event.name,
      start_time: event.start_time,
      end_time: event.end_time,
      is_active: event.is_active,
      freeze_scoreboard: event.freeze_scoreboard,
      registration_open: event.registration_open,
      mode: event.mode,
    }).eq('id', event.id);
    setSaving(false);
    setMsg(error ? '❌ ' + error.message : '✅ Event settings saved!');
    setTimeout(() => setMsg(''), 3000);
  };

  if (!event) return <div className="text-cyber-muted text-xs">Loading event settings...</div>;

  const now = new Date();
  const start = event.start_time ? new Date(event.start_time) : null;
  const end = event.end_time ? new Date(event.end_time) : null;
  const status = !event.is_active ? 'Inactive' : !start || !end ? 'Active (no time set)' : now < start ? '⏳ Scheduled' : now > end ? '🏁 Ended' : '🟢 LIVE';

  return (
    <div className="max-w-lg space-y-6">
      <div className="bg-cyber-card border border-cyber-border rounded-lg p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-widest text-cyber-neon">Event Settings</h3>
          <span className="text-[10px] font-bold uppercase tracking-widest text-cyber-muted">{status}</span>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-cyber-muted uppercase tracking-widest block">Event Name</label>
          <input type="text" value={event.name ?? ''} onChange={e => setEvent((p: any) => ({ ...p, name: e.target.value }))}
            className="w-full bg-cyber-sidebar border border-cyber-border rounded px-4 py-3 text-white text-xs focus:outline-none focus:border-cyber-neon font-mono" />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-cyber-muted uppercase tracking-widest block">Start Time</label>
          <input type="datetime-local" value={event.start_time ? event.start_time.slice(0, 16) : ''}
            onChange={e => setEvent((p: any) => ({ ...p, start_time: e.target.value }))}
            className="w-full bg-cyber-sidebar border border-cyber-border rounded px-4 py-3 text-white text-xs focus:outline-none focus:border-cyber-neon font-mono" />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-cyber-muted uppercase tracking-widest block">End Time</label>
          <input type="datetime-local" value={event.end_time ? event.end_time.slice(0, 16) : ''}
            onChange={e => setEvent((p: any) => ({ ...p, end_time: e.target.value }))}
            className="w-full bg-cyber-sidebar border border-cyber-border rounded px-4 py-3 text-white text-xs focus:outline-none focus:border-cyber-neon font-mono" />
        </div>
        <div className="flex items-center gap-3">
          <input type="checkbox" id="active" checked={event.is_active ?? false}
            onChange={e => setEvent((p: any) => ({ ...p, is_active: e.target.checked }))}
            className="w-4 h-4 accent-cyber-neon" />
          <label htmlFor="active" className="text-[11px] font-bold text-cyber-muted uppercase tracking-widest cursor-pointer">Event Active</label>
        </div>
        <div className="flex items-center gap-3">
          <input type="checkbox" id="freeze" checked={event.freeze_scoreboard ?? false}
            onChange={e => setEvent((p: any) => ({ ...p, freeze_scoreboard: e.target.checked }))}
            className="w-4 h-4 accent-cyber-neon" />
          <label htmlFor="freeze" className="text-[11px] font-bold text-cyber-muted uppercase tracking-widest cursor-pointer">Freeze Scoreboard</label>
        </div>
        <div className="flex items-center gap-3">
          <input type="checkbox" id="registration" checked={event.registration_open ?? true}
            onChange={e => setEvent((p: any) => ({ ...p, registration_open: e.target.checked }))}
            className="w-4 h-4 accent-cyber-neon" />
          <label htmlFor="registration" className="text-[11px] font-bold text-cyber-muted uppercase tracking-widest cursor-pointer">Registration Open</label>
        </div>
        {msg && <p className="text-xs font-bold text-cyber-neon">{msg}</p>}
        <button onClick={save} disabled={saving}
          className="bg-cyber-neon text-black px-6 py-2 rounded text-[11px] font-bold uppercase tracking-widest hover:bg-white transition-all disabled:opacity-50">
          {saving ? 'Saving...' : 'Save Event Settings'}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────
// TEAMS TAB
// ─────────────────────────────────────────
function TeamsTab() {
  const [teams, setTeams] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [selInvite, setSelInvite] = useState<string | null>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  const loadTeams = async () => {
    const { data: teamsData } = await supabase
      .from('teams')
      .select('id, name, is_banned, captain_id, created_at')
      .order('created_at', { ascending: true });

    if (!teamsData) return;

    const teamsWithCounts = await Promise.all(teamsData.map(async (t) => {
      const { count } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('team_id', t.id);
      return { ...t, member_count: count ?? 0 };
    }));

    setTeams(teamsWithCounts);
  };

  useEffect(() => { loadTeams(); }, []);

  useEffect(() => {
    if (!selected) { setMembers([]); setSelInvite(null); return; }
    supabase.rpc('admin_team_members', { p_team_id: selected.id }).then(({ data }) => setMembers(data ?? []));
    supabase.rpc('admin_team_invite', { p_team_id: selected.id }).then(({ data }) => setSelInvite(data ?? null));
  }, [selected]);

  const act = async (action: string, teamId: string) => {
    setLoading(true); setMsg('');
    let error: any = null;
    if (action === 'ban') {
      ({ error } = await supabase.from('teams').update({ is_banned: true }).eq('id', teamId));
    } else if (action === 'unban') {
      ({ error } = await supabase.from('teams').update({ is_banned: false }).eq('id', teamId));
    } else if (action === 'delete') {
      if (!confirm('Delete this team permanently? Members will be removed from the team.')) { setLoading(false); return; }
      await supabase.from('profiles').update({ team_id: null }).eq('team_id', teamId);
      ({ error } = await supabase.from('teams').delete().eq('id', teamId));
      setSelected(null);
    }
    setLoading(false);
    setMsg(error ? '❌ ' + error.message : '✅ Done!');
    setTimeout(() => setMsg(''), 2000);
    loadTeams();
  };

  return (
    <div className="flex gap-6">
      <div className="flex-1 overflow-hidden rounded-lg border border-cyber-border">
        <table className="w-full text-left">
          <thead className="bg-cyber-sidebar/50 border-b border-cyber-border">
            <tr>
              {['#', 'Team Name', 'Members', 'Invite Code', 'Status', 'Actions'].map(h => (
                <th key={h} className="px-4 py-4 text-[10px] font-bold text-cyber-muted uppercase tracking-widest">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-cyber-border/50">
            {teams.map((t, i) => (
              <tr key={t.id} onClick={() => setSelected(t)}
                className={`hover:bg-cyber-sidebar/30 cursor-pointer transition-colors ${selected?.id === t.id ? 'bg-cyber-sidebar/40' : ''}`}>
                <td className="px-4 py-3 text-xs text-cyber-muted">{i + 1}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-medium ${t.is_banned ? 'text-red-400 line-through' : 'text-white'}`}>{t.name}</span>
                    {t.is_banned && <span className="bg-red-600 text-white text-[8px] font-bold px-1.5 py-0.5 rounded uppercase">Banned</span>}
                  </div>
                </td>
                <td className="px-4 py-3 text-xs text-cyber-muted">{t.member_count ?? 0} members</td>
                <td className="px-4 py-3 text-xs font-mono text-cyber-muted">••••••••</td>
                <td className="px-4 py-3">
                  <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded ${t.is_banned ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}`}>
                    {t.is_banned ? 'Banned' : 'Active'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {t.is_banned
                    ? <button onClick={e => { e.stopPropagation(); act('unban', t.id); }} className="text-[9px] bg-green-600/20 text-green-400 px-2 py-1 rounded hover:bg-green-600/40 font-bold uppercase">Unban</button>
                    : <button onClick={e => { e.stopPropagation(); act('ban', t.id); }} className="text-[9px] bg-red-600/20 text-red-400 px-2 py-1 rounded hover:bg-red-600/40 font-bold uppercase">Ban</button>
                  }
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && (
        <div className="w-72 bg-cyber-card border border-cyber-border rounded-lg p-6 flex flex-col gap-4 self-start">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white">{selected.name}</h3>
            <button onClick={() => setSelected(null)} className="text-cyber-muted hover:text-white text-lg">×</button>
          </div>
          <div className="space-y-2 text-[10px] text-cyber-muted border-b border-cyber-border pb-4">
            <div className="flex justify-between"><span>Status</span><span className={selected.is_banned ? 'text-red-400' : 'text-green-400'}>{selected.is_banned ? 'Banned' : 'Active'}</span></div>
            <div className="flex justify-between"><span>Invite Code</span><span className="text-cyber-neon font-mono">{selInvite ?? '••••••••'}</span></div>
            <div className="flex justify-between"><span>Members</span><span className="text-white">{members.length}</span></div>
            <div className="flex justify-between"><span>Created</span><span className="text-white">{new Date(selected.created_at).toLocaleDateString()}</span></div>
          </div>
          <div className="border-b border-cyber-border pb-4">
            <p className="text-[10px] font-bold text-cyber-muted uppercase tracking-widest mb-3">Members</p>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {members.length === 0 ? (
                <p className="text-[10px] text-cyber-muted">No members</p>
              ) : members.map(m => (
                <div key={m.id} className="flex items-center justify-between bg-cyber-sidebar/40 rounded px-2 py-1.5">
                  <div>
                    <p className="text-[11px] font-bold text-white">{m.username}</p>
                    <p className="text-[9px] text-cyber-muted">{m.email}</p>
                  </div>
                  {m.id === selected.captain_id && (
                    <span className="text-[8px] font-bold bg-cyber-neon/20 text-cyber-neon px-1.5 py-0.5 rounded uppercase">Captain</span>
                  )}
                </div>
              ))}
            </div>
          </div>
          {msg && <p className="text-[10px] font-bold text-center">{msg}</p>}
          <div className="flex flex-col gap-2">
            {selected.is_banned
              ? <button disabled={loading} onClick={() => act('unban', selected.id)} className="w-full py-2 rounded text-[10px] font-bold uppercase tracking-widest bg-green-600/20 text-green-400 hover:bg-green-600/40 transition-all">✓ Unban Team</button>
              : <button disabled={loading} onClick={() => act('ban', selected.id)} className="w-full py-2 rounded text-[10px] font-bold uppercase tracking-widest bg-red-600/20 text-red-400 hover:bg-red-600/40 transition-all">⊘ Ban Team</button>
            }
            <button disabled={loading} onClick={() => act('delete', selected.id)} className="w-full py-2 rounded text-[10px] font-bold uppercase tracking-widest bg-red-900/30 text-red-500 hover:bg-red-900/50 transition-all mt-2">🗑 Delete Team</button>
          </div>
        </div>
      )}
    </div>
  );
}