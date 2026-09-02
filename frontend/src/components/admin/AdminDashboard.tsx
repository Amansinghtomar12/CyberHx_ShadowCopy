// src/components/admin/AdminDashboard.tsx
import React, { useState, useEffect } from 'react';
import { supabase, DBChallenge } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import OwnerFlagVault from './OwnerFlagVault';
import {
  Plus, Eye, EyeOff, Trash2, Edit3, Shield, Users, Flag, Activity, RotateCcw, KeyRound,
  X, AlertTriangle, Megaphone, Zap, Lightbulb, Link2, Save, Inbox, Lock,
  Settings2, ListChecks, Hash, Send, CalendarClock, Radio, Paperclip, Upload, FileDown,
} from 'lucide-react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { resetEventScores } from '../../api/submitFlag';
import DateTimeField from '../DateTimeField';
// HARDENED: Challenge CRUD via admin_upsert_challenge RPC
// HARDENED: Reset via admin_reset_event RPC (no client-side DELETE)

// ─────────────────────────────────────────
// LOCAL PRESENTATIONAL HELPERS (no behaviour — markup + classes only)
// ─────────────────────────────────────────
const EASE_OUT_QUINT: [number, number, number, number] = [0.22, 1, 0.36, 1];

const DIFF_BADGE: Record<string, string> = {
  Easy: 'badge-easy',
  Medium: 'badge-medium',
  Hard: 'badge-hard',
  Insane: 'badge-insane',
};

/** Scroll-safe frame for a dense data table — the frame scrolls, the page never does. */
function TableFrame({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`surface overflow-hidden ${className}`}>
      <div className="overflow-x-auto custom-scrollbar">{children}</div>
    </div>
  );
}

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th
      scope="col"
      className={`px-5 py-3.5 label-micro whitespace-nowrap ${align === 'right' ? 'text-right' : 'text-left'}`}
    >
      {children}
    </th>
  );
}

/** Empty-state block used inside table bodies and card lists. */
function EmptyState({ icon, title, hint }: { icon: React.ReactNode; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <span
        aria-hidden
        className="grid h-12 w-12 place-items-center rounded-full border border-border-strong bg-surface-inset text-text-muted"
      >
        {icon}
      </span>
      <p className="mt-4 text-h3 text-cyber-text">{title}</p>
      {hint && <p className="mt-1.5 max-w-xs text-small text-text-muted">{hint}</p>}
    </div>
  );
}

/** Success / failure feedback line. The message strings are produced by the handlers — untouched. */
function StatusLine({ msg, className = '' }: { msg: string; className?: string }) {
  const bad = msg.startsWith('❌');
  return (
    <p
      role="status"
      aria-live="polite"
      className={`text-small font-semibold leading-relaxed ${
        bad ? 'text-diff-hard' : 'text-status-solved'
      } ${className}`}
    >
      {msg}
    </p>
  );
}

/** Section header inside the challenge editor. */
function FormSection({
  icon, title, description, action, children, first = false,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  first?: boolean;
}) {
  return (
    <section className={first ? '' : 'mt-7 pt-7 border-t border-border-subtle'}>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div className="flex items-start gap-2.5 min-w-0">
          <span aria-hidden className="text-cyber-neon mt-0.5 shrink-0">{icon}</span>
          <div className="min-w-0">
            <h4 className="text-label text-cyber-text uppercase">{title}</h4>
            {description && <p className="text-small text-text-muted mt-1 leading-relaxed">{description}</p>}
          </div>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

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

  const reduceMotion = useReducedMotion();

  const items = [
    { label: 'Total Users', value: stats.users, icon: <Users className="w-4 h-4" />, tone: 'var(--color-cat-forensic)' },
    { label: 'Teams', value: stats.teams, icon: <Shield className="w-4 h-4" />, tone: 'var(--color-cat-crypto)' },
    { label: 'Challenges', value: stats.challenges, icon: <Flag className="w-4 h-4" />, tone: 'var(--color-neon)' },
    { label: 'Submissions', value: stats.submissions, icon: <Activity className="w-4 h-4" />, tone: 'var(--color-cat-web)' },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-section">
      {items.map((item, i) => (
        <motion.div
          key={item.label}
          initial={reduceMotion ? false : { opacity: 0, transform: 'translateY(8px)' }}
          animate={{ opacity: 1, transform: 'translateY(0px)' }}
          transition={{ duration: reduceMotion ? 0 : 0.24, delay: reduceMotion ? 0 : i * 0.04, ease: EASE_OUT_QUINT }}
          className="surface relative overflow-hidden p-4 sm:p-5 min-w-0"
        >
          <span
            aria-hidden
            className="absolute inset-x-0 top-0 h-px opacity-60"
            style={{ background: `linear-gradient(90deg, transparent, ${item.tone}, transparent)` }}
          />
          <div className="flex items-center gap-2.5 mb-3 min-w-0">
            <span
              aria-hidden
              className="grid place-items-center w-7 h-7 shrink-0 rounded-inset border border-border-subtle bg-surface-inset"
              style={{ color: item.tone }}
            >
              {item.icon}
            </span>
            <span className="label-micro truncate">{item.label}</span>
          </div>
          <div className="font-mono text-h2 font-bold text-cyber-text">{item.value}</div>
        </motion.div>
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
  const isEdit = !!initial?.id;
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

  // The flag is stored only as a hash, so there is nothing to prefill here.
  // An empty field on edit means "keep the existing flag" -- see handleSave.

  // Challenges saved through the old form had their flag overwritten with a
  // placeholder. Nothing can recover the original -- only the hash was ever
  // stored -- so say so plainly on the one screen that can fix it.
  const [flagClobbered, setFlagClobbered] = useState(false);
  useEffect(() => {
    if (!initial?.id) return;
    supabase.rpc('admin_challenges_needing_flag_reset')
      .then(({ data }) => {
        setFlagClobbered(Array.isArray(data) && data.some((c: any) => c.id === initial.id));
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

  /**
   * Attachments. Existing ones are rows in challenge_files; new ones queue
   * here and upload on Save, after the challenge exists, into
   * challenge-files/<challenge_id>/<64 random bits>/<name>. The random
   * segment is what keeps an unreleased challenge's files unguessable on a
   * public bucket. Removal deletes the object first, then the row, so a
   * failed delete can never leave a dangling button on the player's panel.
   */
  const FILE_BUCKET = 'challenge-files';
  const FILE_MAX_BYTES = 50 * 1024 * 1024;
  const [attachments, setAttachments] = useState<{ id: string; name: string; url: string }[]>([]);
  const [pending, setPending] = useState<File[]>([]);
  const [fileError, setFileError] = useState('');
  const fileInputId = `chal-files-${initial?.id ?? 'new'}`;

  useEffect(() => {
    if (!initial?.id) return;
    supabase.from('challenge_files').select('id, name, url').eq('challenge_id', initial.id).order('created_at')
      .then(({ data }) => setAttachments((data ?? []) as { id: string; name: string; url: string }[]));
  }, [initial?.id]);

  const queueFiles = (list: FileList | null) => {
    if (!list) return;
    const next: File[] = []; const rejected: string[] = [];
    Array.from(list).forEach(f => {
      if (f.size > FILE_MAX_BYTES) rejected.push(`${f.name} (${(f.size / 1048576).toFixed(1)} MB)`);
      else if (!pending.some(p => p.name === f.name && p.size === f.size)) next.push(f);
    });
    setPending(prev => [...prev, ...next]);
    setFileError(rejected.length ? `Over the 50 MB limit: ${rejected.join(', ')}. Host large images elsewhere and add a resource link.` : '');
  };
  const removePending = (i: number) => setPending(prev => prev.filter((_, idx) => idx !== i));

  const storagePathOf = (url: string) => {
    const marker = `/object/public/${FILE_BUCKET}/`;
    const at = url.indexOf(marker);
    return at === -1 ? null : decodeURIComponent(url.slice(at + marker.length).split('?')[0]);
  };
  const removeExisting = async (file: { id: string; name: string; url: string }) => {
    if (!confirm(`Remove attachment "${file.name}"? Players will no longer see it.`)) return;
    const path = storagePathOf(file.url);
    if (path) {
      const { error: rmErr } = await supabase.storage.from(FILE_BUCKET).remove([path]);
      if (rmErr) { setFileError(`Could not delete ${file.name}: ${rmErr.message}`); return; }
    }
    const { error: rowErr } = await supabase.from('challenge_files').delete().eq('id', file.id);
    if (rowErr) { setFileError(`Deleted the file but not its entry: ${rowErr.message}`); return; }
    setAttachments(prev => prev.filter(a => a.id !== file.id));
  };

  const safeName = (name: string) => name.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 120) || 'file';
  const randomSegment = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), b => b.toString(16).padStart(2, '0')).join('');
  const uploadPending = async (challengeId: string): Promise<string | null> => {
    for (const file of pending) {
      const path = `${challengeId}/${randomSegment()}/${safeName(file.name)}`;
      const { error: upErr } = await supabase.storage.from(FILE_BUCKET)
        .upload(path, file, { upsert: false, contentType: file.type || 'application/octet-stream', cacheControl: '31536000' });
      if (upErr) return `${file.name}: ${upErr.message}`;
      // ?download makes browsers save the file instead of rendering a .txt
      // or .png inline, which is what a player expects from an attachment.
      const url = supabase.storage.from(FILE_BUCKET).getPublicUrl(path, { download: file.name }).data.publicUrl;
      const { error: rowErr } = await supabase.from('challenge_files').insert({ challenge_id: challengeId, name: file.name, url });
      if (rowErr) {
        await supabase.storage.from(FILE_BUCKET).remove([path]);
        return `${file.name}: ${rowErr.message}`;
      }
    }
    setPending([]);
    return null;
  };

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
    if (!form.title || !form.description) {
      setError('Title and description are required.');
      return;
    }
    if (!isEdit && !form.flag.trim()) {
      setError('A flag is required for a new challenge.');
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
      flag: form.flag.trim(),
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

    // Save hints — delete old ones, insert new.
    // The column is content, not text; get_challenge_hints only aliases it as
    // text on the way out. Inserting text silently failed, so no hint a
    // moderator wrote was ever stored.
    if (challengeId) {
      await supabase.from('hints').delete().eq('challenge_id', challengeId);
      const validHints = hints.filter(h => h.text.trim());
      if (validHints.length > 0) {
        const { error: hintError } = await supabase.from('hints').insert(
          validHints.map(h => ({
            challenge_id: challengeId,
            content: h.text.trim(),
            cost: Math.max(0, Number(h.cost) || 0),
          }))
        );
        if (hintError) {
          setSaving(false);
          alert('Challenge saved, but hints failed: ' + hintError.message);
          return;
        }
      }
    }

    // Attachments last: the row needs a challenge id, and a failed upload
    // must not undo a saved challenge.
    if (challengeId && pending.length > 0) {
      const failed = await uploadPending(challengeId);
      if (failed) {
        setSaving(false);
        alert('Challenge saved, but an attachment failed: ' + failed);
        return;
      }
    }

    setSaving(false);
    onSave();
  };

  const field = (label: string, key: keyof typeof form, type = 'text', hint?: string, required = false) => {
    const id = `chal-${String(key)}`;
    const invalid = required && !!error && !form[key];
    return (
      <div className="min-w-0">
        <label className="field-label" htmlFor={id}>
          {label}
          {required && <span className="text-cyber-neon" aria-hidden> *</span>}
        </label>
        <input
          id={id}
          type={type}
          value={String(form[key])}
          onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
          aria-invalid={invalid || undefined}
          className={`input ${invalid ? 'is-invalid' : ''}`}
        />
        {hint && <p className="mt-1.5 text-small text-text-muted leading-relaxed">{hint}</p>}
      </div>
    );
  };

  return (
    <div className="surface p-5 sm:p-gutter lg:p-8 mb-8">
      {/* Editor header */}
      <div className="flex flex-wrap items-center gap-3 pb-5 border-b border-border-subtle">
        <span aria-hidden className="grid place-items-center w-9 h-9 rounded-control border border-border-neon bg-neon-wash text-cyber-neon">
          {initial?.id ? <Edit3 className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
        </span>
        <div className="min-w-0">
          <h3 className="text-h3 text-cyber-text">{initial?.id ? 'Edit Challenge' : 'New Challenge'}</h3>
          <p className="text-small text-text-muted mt-0.5">
            {initial?.id ? 'Changes go live the moment you save.' : 'Saved hidden by default — flip “Visible” when it is ready.'}
          </p>
        </div>
        <span className={`badge ml-auto ${initial?.id ? 'badge-info' : 'badge-neon'}`}>
          {initial?.id ? 'Editing' : 'Draft'}
        </span>
      </div>

      <div className="mt-7">
        <FormSection first icon={<ListChecks className="w-4 h-4" />} title="Identity">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {field('Title', 'title', 'text', undefined, true)}
            {field('Author', 'author', 'text', 'Blank falls back to “Cyberhx Team”.')}
            <div className="min-w-0">
              <label className="field-label" htmlFor="chal-category">Category</label>
              <select id="chal-category" value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value as any }))}
                className="select">
                {['web','crypto','steg','rev','pwn','forensic','osint','misc'].map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="min-w-0">
              <label className="field-label" htmlFor="chal-difficulty">Difficulty</label>
              <select id="chal-difficulty" value={form.difficulty} onChange={e => setForm(p => ({ ...p, difficulty: e.target.value as any }))}
                className="select">
                {['Easy','Medium','Hard','Insane'].map(d => <option key={d}>{d}</option>)}
              </select>
            </div>
          </div>
        </FormSection>

        <FormSection icon={<Hash className="w-4 h-4" />} title="Scoring & limits">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {field('Points', 'points', 'number')}
            {field('Max Attempts', 'max_attempts', 'number', 'Wrong submissions allowed per player.')}
            {field('Tags (comma separated)', 'tags')}
          </div>
        </FormSection>

        <FormSection icon={<Edit3 className="w-4 h-4" />} title="Description" description="Markdown is rendered on the player-facing challenge page.">
          <label className="field-label sr-only" htmlFor="chal-description">Description (Markdown)</label>
          <textarea id="chal-description" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
            aria-invalid={(!!error && !form.description) || undefined}
            rows={6} className={`textarea min-h-[9rem] ${!!error && !form.description ? 'is-invalid' : ''}`} />
        </FormSection>

        {/* FLAG — handled with visible care */}
        <div className="mt-7 pt-7 border-t border-border-subtle">
          <div
            className="rounded-card border p-4 sm:p-5"
            style={{ borderColor: 'var(--color-border-danger)', backgroundColor: 'var(--color-diff-hard-wash)' }}
          >
            <label className="flex items-start gap-2 mb-3" htmlFor="chal-flag">
              <AlertTriangle aria-hidden className="w-4 h-4 shrink-0 mt-px" style={{ color: 'var(--color-diff-hard)' }} />
              <span>
                <span className="block text-label uppercase" style={{ color: 'var(--color-diff-hard)' }}>
                  Flag {!isEdit && <span className="text-cyber-neon" aria-hidden>*</span>}
                </span>
                <span className="block text-small text-text-muted mt-1 leading-relaxed">
                  {isEdit
                    ? 'Leave blank to keep the current flag. Only type here to replace it — whatever you enter becomes the new flag.'
                    : 'Hashed server-side by admin_upsert_challenge — it is never sent back to a browser.'}
                </span>
              </span>
            </label>
            {flagClobbered && (
              <p
                role="alert"
                className="mb-3 rounded-control border p-3 text-small leading-relaxed"
                style={{
                  borderColor: 'var(--color-border-danger)',
                  backgroundColor: 'var(--color-diff-hard-wash)',
                  color: 'var(--color-diff-hard)',
                }}
              >
                This challenge&rsquo;s flag was overwritten by an earlier save and no
                longer matches anything a player can submit. Type the real flag below
                to restore it &mdash; the original cannot be recovered automatically.
              </p>
            )}
            <input id="chal-flag" type="text" value={form.flag} onChange={e => setForm(p => ({ ...p, flag: e.target.value }))}
              placeholder={isEdit ? 'Unchanged — type a new flag to replace it' : 'FLAG{...}'}
              aria-invalid={(!isEdit && !!error && !form.flag) || undefined}
              className="input"
              style={{ borderColor: 'var(--color-border-danger)' }} />
          </div>

          <div className="mt-4 flex items-center gap-3 rounded-control border border-border-subtle bg-surface-inset px-4 py-3">
            <input type="checkbox" id="visible" checked={form.is_visible} onChange={e => setForm(p => ({ ...p, is_visible: e.target.checked }))}
              className="w-4 h-4 accent-cyber-neon shrink-0" />
            <label htmlFor="visible" className="text-label uppercase text-text-secondary cursor-pointer">
              Visible to participants
            </label>
            <span className={`badge ml-auto ${form.is_visible ? 'badge-solved' : 'badge-locked'}`}>
              {form.is_visible ? 'Live' : 'Hidden'}
            </span>
          </div>
        </div>

        {/* HINTS SECTION */}
        <FormSection
          icon={<Lightbulb className="w-4 h-4" />}
          title="Hints"
          description="Each hint costs the player points when unlocked."
          action={
            <button onClick={addHint} type="button" className="btn btn-outline btn-sm">
              <Plus className="w-3.5 h-3.5" /> Add Hint
            </button>
          }
        >
          {hints.length === 0 ? (
            <div className="rounded-card border border-dashed border-border-base bg-surface-inset">
              <EmptyState icon={<Lightbulb className="w-5 h-5" />} title="No hints yet" hint='Use “Add Hint” to give players a paid nudge.' />
            </div>
          ) : (
            <div className="space-y-3">
              {hints.map((hint, i) => (
                <div key={i} className="surface-inset p-3 sm:p-4">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <span className="badge">Hint {i + 1}</span>
                    <button onClick={() => removeHint(i)} type="button"
                      aria-label={`Remove hint ${i + 1}`} title="Remove hint"
                      className="btn btn-ghost btn-sm btn-icon text-diff-hard hover:text-danger-fg">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_7.5rem]">
                    <div className="min-w-0">
                      <label className="field-label" htmlFor={`hint-text-${i}`}>Hint Text</label>
                      <textarea id={`hint-text-${i}`} value={hint.text} onChange={e => updateHint(i, 'text', e.target.value)}
                        placeholder="Give a helpful clue..."
                        rows={2}
                        className="textarea min-h-[4.5rem]" />
                    </div>
                    <div className="min-w-0">
                      <label className="field-label" htmlFor={`hint-cost-${i}`}>Cost (pts)</label>
                      <input id={`hint-cost-${i}`} type="number" value={hint.cost} onChange={e => updateHint(i, 'cost', Number(e.target.value))}
                        min={0}
                        className="input" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </FormSection>

        {/* ATTACHMENTS SECTION */}
        <FormSection
          icon={<Paperclip className="w-4 h-4" />}
          title="Attachments"
          description="Files players download from the challenge page — pcaps, binaries, images, archives. Up to 50 MB each."
          action={
            <>
              <input
                id={fileInputId}
                type="file"
                multiple
                className="sr-only"
                onChange={e => { queueFiles(e.target.files); e.target.value = ''; }}
              />
              <label htmlFor={fileInputId} className="btn btn-outline btn-sm cursor-pointer">
                <Upload className="w-3.5 h-3.5" /> Add files
              </label>
            </>
          }
        >
          {attachments.length === 0 && pending.length === 0 ? (
            <div className="rounded-card border border-dashed border-border-base bg-surface-inset">
              <EmptyState icon={<Paperclip className="w-5 h-5" />} title="No attachments" hint="Files upload when you save. Anything over 50 MB belongs on an external host — add it as a resource link below." />
            </div>
          ) : (
            <ul className="space-y-2">
              {attachments.map(file => (
                <li key={file.id} className="surface-inset flex items-center gap-3 px-3 py-2.5">
                  <FileDown aria-hidden className="w-4 h-4 shrink-0 text-cyber-neon" />
                  <a href={file.url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate font-mono text-small text-cyber-text hover:text-cyber-neon">{file.name}</a>
                  <span className="badge badge-solved">Uploaded</span>
                  <button type="button" onClick={() => removeExisting(file)} aria-label={`Remove ${file.name}`} title="Remove attachment"
                    className="btn btn-ghost btn-sm btn-icon text-diff-hard hover:text-danger-fg">
                    <X className="w-4 h-4" />
                  </button>
                </li>
              ))}
              {pending.map((file, i) => (
                <li key={`${file.name}-${file.size}`} className="surface-inset flex items-center gap-3 px-3 py-2.5">
                  <Upload aria-hidden className="w-4 h-4 shrink-0 text-text-muted" />
                  <span className="min-w-0 flex-1 truncate font-mono text-small text-cyber-text">{file.name}</span>
                  <span className="font-mono text-small text-text-muted tabular-nums">{file.size >= 1048576 ? `${(file.size / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(file.size / 1024))} KB`}</span>
                  <span className="badge">Uploads on save</span>
                  <button type="button" onClick={() => removePending(i)} aria-label={`Remove ${file.name}`} title="Remove"
                    className="btn btn-ghost btn-sm btn-icon text-diff-hard hover:text-danger-fg">
                    <X className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {fileError && (
            <p role="alert" className="mt-3 text-small" style={{ color: 'var(--color-danger-fg)' }}>{fileError}</p>
          )}
        </FormSection>

        {/* RESOURCE LINKS SECTION */}
        <FormSection
          icon={<Link2 className="w-4 h-4" />}
          title="Resource Links"
          description="External hosts and mirrors — for anything too large to attach, or a target players connect to."
          action={
            <button onClick={addLink} type="button" className="btn btn-outline btn-sm">
              <Plus className="w-3.5 h-3.5" /> Add Link
            </button>
          }
        >
          {links.length === 0 ? (
            <div className="rounded-card border border-dashed border-border-base bg-surface-inset">
              <EmptyState icon={<Link2 className="w-5 h-5" />} title="No links yet" hint="Google Drive, a ZIP mirror, or any URL players need." />
            </div>
          ) : (
            <div className="space-y-3">
              {links.map((link, i) => (
                <div key={i} className="surface-inset p-3 sm:p-4">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <span className="badge">Link {i + 1}</span>
                    <button onClick={() => removeLink(i)} type="button"
                      aria-label={`Remove link ${i + 1}`} title="Remove link"
                      className="btn btn-ghost btn-sm btn-icon text-diff-hard hover:text-danger-fg">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-[11rem_minmax(0,1fr)]">
                    <div className="min-w-0">
                      <label className="field-label" htmlFor={`link-label-${i}`}>Label</label>
                      <input id={`link-label-${i}`} type="text" value={link.label} onChange={e => updateLink(i, 'label', e.target.value)}
                        placeholder="e.g. chall.zip"
                        className="input" />
                    </div>
                    <div className="min-w-0">
                      <label className="field-label" htmlFor={`link-url-${i}`}>URL</label>
                      <input id={`link-url-${i}`} type="url" value={link.url} onChange={e => updateLink(i, 'url', e.target.value)}
                        placeholder="https://drive.google.com/..."
                        className="input" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </FormSection>
      </div>

      {error && (
        <div
          role="alert"
          className="mt-6 flex items-start gap-2.5 rounded-control border px-4 py-3 text-small leading-relaxed"
          style={{ borderColor: 'var(--color-border-danger)', backgroundColor: 'var(--color-diff-hard-wash)', color: 'var(--color-danger-fg)' }}
        >
          <AlertTriangle aria-hidden className="w-4 h-4 shrink-0 mt-0.5" />
          <span className="font-semibold">{error}</span>
        </div>
      )}
      <div className="mt-7 pt-6 border-t border-border-subtle flex flex-col-reverse sm:flex-row sm:items-center gap-3">
        <button onClick={handleSave} disabled={saving}
          className={`btn btn-primary btn-md ${saving ? 'is-loading' : ''}`}>
          <Save className="w-4 h-4" />
          {saving ? 'Saving...' : 'Save Challenge'}
        </button>
        <button onClick={onCancel}
          className="btn btn-ghost btn-md">
          Cancel
        </button>
        <p className="text-small text-text-muted sm:ml-auto">
          <span className="text-cyber-neon" aria-hidden>*</span>{' '}
          {isEdit
            ? 'Title and description are required. A blank flag keeps the current one.'
            : 'Title, description and flag are required.'}
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────
// MAIN ADMIN DASHBOARD
// ─────────────────────────────────────────
export default function AdminDashboard() {
  // HARDENED: Auth guard — server-confirmed role check
  const { profile, loading, profileLoading, profileError } = useAuth();

  // Wait for the role, not just the session. Flipping to the denied screen
  // while the profile request is still in flight is what made a healthy admin
  // see Access Denied on every visit to this tab.
  if (loading || profileLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="flex items-center gap-3">
          <span aria-hidden className="w-4 h-4 rounded-pill border-2 border-border-strong border-t-cyber-neon animate-spin" />
          <span className="label-micro">Verifying access...</span>
        </div>
      </div>
    );
  }

  // A failed fetch is not a denial. Saying so is the difference between an
  // organiser reloading the page and an organiser believing they were demoted
  // in the middle of a live event.
  if (profileError) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="surface max-w-sm w-full p-8 text-center">
          <span
            aria-hidden
            className="grid place-items-center w-12 h-12 mx-auto rounded-card border"
            style={{ borderColor: 'var(--color-border-strong)', backgroundColor: 'var(--color-surface-inset)' }}
          >
            <AlertTriangle className="w-5 h-5 text-text-secondary" />
          </span>
          <p className="mt-4 text-h3 text-cyber-text">Could not verify your account</p>
          <p className="mt-2 text-body text-text-muted">{profileError}</p>
          <p className="mt-2 text-small text-text-faint">
            This is a connection problem, not a permissions one — your role has not changed.
          </p>
          <button onClick={() => window.location.reload()} className="btn btn-secondary btn-md mt-5">
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!profile || profile.role !== 'admin') {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="surface max-w-sm w-full p-8 text-center">
          <span
            aria-hidden
            className="grid place-items-center w-12 h-12 mx-auto rounded-card border"
            style={{ borderColor: 'var(--color-border-danger)', backgroundColor: 'var(--color-diff-hard-wash)' }}
          >
            <Lock className="w-5 h-5" style={{ color: 'var(--color-diff-hard)' }} />
          </span>
          <p className="mt-4 text-h3" style={{ color: 'var(--color-diff-hard)' }}>Access Denied</p>
          <p className="mt-2 text-body text-text-muted">Admin privileges required.</p>
        </div>
      </div>
    );
  }

  return <AdminDashboardInner />;
}

// Inner component — only renders after auth confirmed
function AdminDashboardInner() {
  // Drawn for the owner only. Cosmetic: owner_reveal_flag() re-checks
  // ownership in the database and an admin who gets past this UI is refused
  // there and logged.
  const { profile: me } = useAuth();
  const [vaultFor, setVaultFor] = useState<{ id: string; title: string } | null>(null);
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
    { id: 'challenges', label: 'Challenges', icon: <Flag className="w-3.5 h-3.5" /> },
    { id: 'users', label: 'Users', icon: <Users className="w-3.5 h-3.5" /> },
    { id: 'teams', label: 'Teams', icon: <Shield className="w-3.5 h-3.5" /> },
    { id: 'submissions', label: 'Submissions', icon: <Activity className="w-3.5 h-3.5" /> },
    { id: 'notifications', label: 'Notifications', icon: <Megaphone className="w-3.5 h-3.5" /> },
    { id: 'event', label: 'Event', icon: <Zap className="w-3.5 h-3.5" /> },
  ] as const;

  return (
    <div className="flex-1 w-full min-w-0 max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
      {/* Admin Header */}
      <header className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between mb-8">
        <div className="flex items-start gap-3.5 min-w-0">
          <span
            aria-hidden
            className="grid place-items-center w-11 h-11 shrink-0 rounded-card border"
            style={{ borderColor: 'var(--color-border-danger)', backgroundColor: 'var(--color-diff-hard-wash)' }}
          >
            <Shield className="w-5 h-5" style={{ color: 'var(--color-diff-hard)' }} />
          </span>
          <div className="min-w-0">
            <h1 className="text-h1 text-cyber-text">Admin Panel</h1>
            <p className="label-micro mt-1.5">CyberHX Control Center</p>
          </div>
        </div>
        {/* Reset Event Button */}
        <div className="flex flex-col sm:items-end gap-2 sm:max-w-[17rem]">
          <button
            onClick={handleResetEvent}
            disabled={resetting}
            className={`btn btn-danger btn-md w-full sm:w-auto ${resetting ? 'is-loading' : ''}`}
          >
            <RotateCcw className="w-4 h-4" />
            {resetting ? 'Resetting...' : 'Reset Event Scores'}
          </button>
          <p className="text-small leading-relaxed text-text-muted sm:text-right">
            Deletes every submission and zeroes the scoreboard. You will be asked to confirm.
          </p>
        </div>
      </header>

      <StatsBar />

      {/* Tabs */}
      <div className="mb-8 -mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto custom-scrollbar">
        <div
          role="group"
          aria-label="Admin sections"
          className="inline-flex w-max gap-1 p-1 rounded-control border border-border-subtle bg-surface-rail"
        >
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              aria-pressed={activeTab === tab.id}
              className={`tab ${activeTab === tab.id ? 'is-active' : ''}`}>
              <span aria-hidden className="shrink-0">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>
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
            <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
              <div className="min-w-0">
                <h2 className="text-h3 text-cyber-text">Challenge catalogue</h2>
                <p className="text-small text-text-muted mt-1">
                  <span className="font-mono text-text-secondary">{challenges.length}</span> total · toggle “Visible” to publish
                </p>
              </div>
              <button onClick={() => setShowForm(true)} className="btn btn-primary btn-md">
                <Plus className="w-4 h-4" /> Add Challenge
              </button>
            </div>
          )}

          {/* Desktop / tablet: table */}
          <TableFrame className="hidden md:block">
            <table className="w-full text-left min-w-[860px]">
              <thead className="bg-surface-rail border-b border-border-base">
                <tr>
                  <Th>Title</Th>
                  <Th>Category</Th>
                  <Th>Difficulty</Th>
                  <Th>Points</Th>
                  <Th>Max Attempts</Th>
                  <Th>Visible</Th>
                  <Th align="right">Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {challenges.map(c => (
                  <tr key={c.id} className="transition-colors duration-[var(--duration-fast)] hover:bg-surface-raised">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span aria-hidden className="w-1.5 h-1.5 shrink-0 rounded-pill" style={{ backgroundColor: `var(--color-cat-${c.category})` }} />
                        <span className="text-body font-semibold text-cyber-text">{c.title}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span className="badge" style={{ color: `var(--color-cat-${c.category})` }}>{c.category}</span>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`badge ${DIFF_BADGE[String(c.difficulty)] ?? ''}`}>{c.difficulty}</span>
                    </td>
                    <td className="px-5 py-4 text-small font-mono text-cyber-neon">{c.points}</td>
                    <td className="px-5 py-4 text-small font-mono text-text-secondary">{(c as any).max_attempts ?? 15}</td>
                    <td className="px-5 py-4">
                      <button onClick={() => toggleVisibility(c.id, c.is_visible)}
                        aria-pressed={c.is_visible}
                        title={c.is_visible ? 'Visible to participants — click to hide' : 'Hidden from participants — click to publish'}
                        className={`chip ${c.is_visible ? 'is-active' : ''}`}>
                        {c.is_visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                        {c.is_visible ? 'Live' : 'Hidden'}
                      </button>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-1.5">
                        {me?.is_owner && (
                          <button onClick={() => setVaultFor({ id: c.id, title: c.title })}
                            aria-label={`Reveal the flag for ${c.title}`}
                            title="Owner only — reveal this operation's flag"
                            className="btn btn-ghost btn-sm btn-icon text-cyber-neon">
                            <KeyRound className="w-4 h-4" />
                          </button>
                        )}
                        <button onClick={() => setEditChallenge(c)} aria-label={`Edit ${c.title}`} title="Edit challenge"
                          className="btn btn-ghost btn-sm btn-icon">
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button onClick={() => deleteChallenge(c.id)} aria-label={`Delete ${c.title}`} title="Delete challenge"
                          className="btn btn-ghost btn-sm btn-icon text-diff-hard hover:text-danger-fg">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {challenges.length === 0 && (
                  <tr><td colSpan={7} className="p-0">
                    <EmptyState icon={<Flag className="w-5 h-5" />} title="No challenges yet" hint="Add one above — it stays hidden until you publish it." />
                  </td></tr>
                )}
              </tbody>
            </table>
          </TableFrame>

          {/* Mobile: card list */}
          <div className="md:hidden space-y-3">
            {challenges.map(c => (
              <div key={c.id} className="surface p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <span aria-hidden className="w-1.5 h-1.5 shrink-0 rounded-pill" style={{ backgroundColor: `var(--color-cat-${c.category})` }} />
                      <h3 className="text-body font-semibold text-cyber-text truncate">{c.title}</h3>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                      <span className="badge" style={{ color: `var(--color-cat-${c.category})` }}>{c.category}</span>
                      <span className={`badge ${DIFF_BADGE[String(c.difficulty)] ?? ''}`}>{c.difficulty}</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-mono text-h3 text-cyber-neon leading-none">{c.points}</p>
                    <p className="label-micro mt-1">pts</p>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-border-subtle flex items-center justify-between gap-2">
                  <button onClick={() => toggleVisibility(c.id, c.is_visible)}
                    aria-pressed={c.is_visible}
                    className={`chip ${c.is_visible ? 'is-active' : ''}`}>
                    {c.is_visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                    {c.is_visible ? 'Live' : 'Hidden'}
                  </button>
                  <div className="flex items-center gap-1.5">
                    <span className="label-micro mr-1">{(c as any).max_attempts ?? 15} tries</span>
                    {me?.is_owner && (
                      <button onClick={() => setVaultFor({ id: c.id, title: c.title })}
                        aria-label={`Reveal the flag for ${c.title}`}
                        className="btn btn-ghost btn-sm btn-icon text-cyber-neon">
                        <KeyRound className="w-4 h-4" />
                      </button>
                    )}
                    <button onClick={() => setEditChallenge(c)} aria-label={`Edit ${c.title}`}
                      className="btn btn-ghost btn-sm btn-icon">
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button onClick={() => deleteChallenge(c.id)} aria-label={`Delete ${c.title}`}
                      className="btn btn-ghost btn-sm btn-icon text-diff-hard hover:text-danger-fg">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {challenges.length === 0 && (
              <div className="surface">
                <EmptyState icon={<Flag className="w-5 h-5" />} title="No challenges yet" hint="Add one above — it stays hidden until you publish it." />
              </div>
            )}
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

      <AnimatePresence>
        {vaultFor && (
          <OwnerFlagVault
            key={vaultFor.id}
            challengeId={vaultFor.id}
            challengeTitle={vaultFor.title}
            onClose={() => setVaultFor(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ─────────────────────────────────────────
// USERS TAB
// ─────────────────────────────────────────
function UsersTab() {
  const [users, setUsers] = useState<any[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const { profile } = useAuth();

  // Ownership is a property of a row, so "am I the owner" is read off my own
  // row rather than tracked separately -- one source of truth, and it stays
  // correct the moment a transfer lands and the list reloads.
  const iAmOwner = users.some(u => u.id === profile?.id && u.is_owner);

  // admin_list_users, not user_scores: that view filters banned players out,
  // so a banned user would disappear from this table and could never be
  // unbanned from here.
  const load = () => {
    supabase.rpc('admin_list_users').then(({ data }) => setUsers(data ?? []));
  };

  useEffect(load, []);

  const setBan = async (u: any, banned: boolean) => {
    const verb = banned ? 'Ban' : 'Unban';
    if (!confirm(`${verb} ${u.username}?`)) return;
    setBusy(u.id);
    const { data, error } = await supabase.rpc('admin_set_user_ban', {
      p_user_id: u.id,
      p_banned: banned,
    });
    setBusy(null);
    if (error || data?.error) {
      alert(`${verb} failed: ` + (error?.message ?? data.error));
      return;
    }
    load();
  };

  // An admin cannot be banned while they are an admin, so demoting is the
  // first half of removing a rogue co-organiser's access.
  const setRole = async (u: any, role: string) => {
    if (!confirm(`Change ${u.username} from ${u.role} to ${role}?`)) return;
    setBusy(u.id);
    const { data, error } = await supabase.rpc('admin_set_user_role', {
      p_user_id: u.id,
      p_role: role,
    });
    setBusy(null);
    if (error || data?.error) {
      alert('Role change failed: ' + (error?.message ?? data.error));
      return;
    }
    load();
  };

  // Handing over is not undoable from this screen -- the moment it lands the
  // button disappears for you and appears for them -- so it asks for the
  // username in full rather than a yes/no nobody reads.
  const transferOwnership = async (u: any) => {
    const typed = prompt(
      `Hand ownership of this platform to ${u.username}?\n\n` +
      `They will be able to demote you, and only they can hand it back.\n\n` +
      `Type their username to confirm:`
    );
    if (typed === null) return;
    if (typed.trim() !== u.username) {
      alert('That did not match. Ownership was not transferred.');
      return;
    }
    setBusy(u.id);
    const { data, error } = await supabase.rpc('admin_transfer_ownership', { p_user_id: u.id });
    setBusy(null);
    if (error || data?.error) {
      alert('Transfer failed: ' + (error?.message ?? data.error));
      return;
    }
    load();
  };

  const ownerRoleHint = 'The owner\'s role cannot be changed. Hand ownership over instead.';

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
        <h2 className="text-h3 text-cyber-text">Players</h2>
        <p className="text-small text-text-muted">
          The <span className="text-cyber-text">owner</span> cannot be demoted or banned by anyone.
          Banning an admin is blocked — demote to <span className="font-mono text-text-secondary">player</span> first.
        </p>
      </div>

      {/* Desktop / tablet: table */}
      <TableFrame className="hidden md:block">
        <table className="w-full text-left min-w-[880px]">
          <thead className="bg-surface-rail border-b border-border-base">
            <tr>
              <Th>#</Th>
              <Th>Username</Th>
              <Th>Email</Th>
              <Th>Role</Th>
              <Th>Points</Th>
              <Th>Solved</Th>
              <Th>Status</Th>
              <Th align="right">Action</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {users.map((u, i) => (
              <tr key={u.id} className={`transition-colors duration-[var(--duration-fast)] hover:bg-surface-raised ${busy === u.id ? 'opacity-60' : ''}`}>
                <td className="px-5 py-4 text-small font-mono text-text-muted">{i + 1}</td>
                <td className="px-5 py-4">
                  <div className="flex items-center gap-2">
                    <span className={`text-body font-semibold ${u.is_banned ? 'line-through text-diff-hard' : 'text-cyber-text'}`}>
                      {u.username}
                    </span>
                    {u.is_owner && (
                      <span className="badge badge-solved shrink-0" title="Owner — cannot be demoted or banned by anyone.">
                        <Shield aria-hidden className="w-3 h-3" />
                        Owner
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-5 py-4 text-small font-mono text-text-muted">{u.email}</td>
                <td className="px-5 py-4">
                  <select
                    value={u.role}
                    disabled={busy === u.id || u.is_owner}
                    title={u.is_owner ? ownerRoleHint : undefined}
                    onChange={e => setRole(u, e.target.value)}
                    aria-label={`Role for ${u.username}`}
                    className="select w-[8.5rem] py-1.5"
                  >
                    <option value="player">player</option>
                    <option value="moderator">moderator</option>
                    <option value="admin">admin</option>
                  </select>
                </td>
                <td className="px-5 py-4 text-small font-mono text-cyber-neon">{u.total_points}</td>
                <td className="px-5 py-4 text-small font-mono text-text-secondary">{u.solved_count}</td>
                <td className="px-5 py-4">
                  <span className={`badge ${u.is_banned ? 'badge-hard' : 'badge-solved'}`}>
                    {u.is_banned ? 'Banned' : 'Active'}
                  </span>
                </td>
                <td className="px-5 py-4">
                  <div className="flex justify-end items-center gap-2">
                    {iAmOwner && !u.is_owner && u.role === 'admin' && !u.is_banned && (
                      <button
                        disabled={busy === u.id}
                        onClick={() => transferOwnership(u)}
                        title={`Hand ownership to ${u.username}`}
                        className="btn btn-outline btn-sm"
                      >
                        <Shield aria-hidden className="w-3 h-3" />
                        Hand over
                      </button>
                    )}
                    {u.is_owner
                      ? <button disabled title="The owner cannot be banned." className="btn btn-danger btn-sm">
                          <Lock aria-hidden className="w-3 h-3" />
                          Ban
                        </button>
                      : u.is_banned
                      ? <button disabled={busy === u.id} onClick={() => setBan(u, false)}
                          className={`btn btn-success btn-sm ${busy === u.id ? 'is-loading' : ''}`}>Unban</button>
                      : <button
                          disabled={busy === u.id || u.role === 'admin'}
                          title={u.role === 'admin' ? 'Change their role to player first' : undefined}
                          onClick={() => setBan(u, true)}
                          className={`btn btn-danger btn-sm ${busy === u.id ? 'is-loading' : ''}`}
                        >
                          {u.role === 'admin' && <Lock aria-hidden className="w-3 h-3" />}
                          Ban
                        </button>}
                  </div>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr><td colSpan={8} className="p-0">
                <EmptyState icon={<Users className="w-5 h-5" />} title="No players listed" hint="Registered accounts appear here as soon as they sign up." />
              </td></tr>
            )}
          </tbody>
        </table>
      </TableFrame>

      {/* Mobile: card list */}
      <div className="md:hidden space-y-3">
        {users.map((u, i) => (
          <div key={u.id} className={`surface p-4 ${busy === u.id ? 'opacity-60' : ''}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono text-small text-text-muted shrink-0">{i + 1}</span>
                  <p className={`text-body font-semibold truncate ${u.is_banned ? 'line-through text-diff-hard' : 'text-cyber-text'}`}>
                    {u.username}
                  </p>
                  {u.is_owner && (
                    <span className="badge badge-solved shrink-0" title="Owner — cannot be demoted or banned by anyone.">
                      <Shield aria-hidden className="w-3 h-3" />
                      Owner
                    </span>
                  )}
                </div>
                <p className="font-mono text-small text-text-muted truncate mt-1">{u.email}</p>
              </div>
              <span className={`badge shrink-0 ${u.is_banned ? 'badge-hard' : 'badge-solved'}`}>
                {u.is_banned ? 'Banned' : 'Active'}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-3">
              <div className="surface-inset px-3 py-2">
                <p className="label-micro">Points</p>
                <p className="font-mono text-body text-cyber-neon mt-0.5">{u.total_points}</p>
              </div>
              <div className="surface-inset px-3 py-2">
                <p className="label-micro">Solved</p>
                <p className="font-mono text-body text-text-secondary mt-0.5">{u.solved_count}</p>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-border-subtle flex items-center gap-2">
              <select
                value={u.role}
                disabled={busy === u.id || u.is_owner}
                title={u.is_owner ? ownerRoleHint : undefined}
                onChange={e => setRole(u, e.target.value)}
                aria-label={`Role for ${u.username}`}
                className="select flex-1 py-1.5"
              >
                <option value="player">player</option>
                <option value="moderator">moderator</option>
                <option value="admin">admin</option>
              </select>
              {iAmOwner && !u.is_owner && u.role === 'admin' && !u.is_banned && (
                <button disabled={busy === u.id} onClick={() => transferOwnership(u)}
                  title={`Hand ownership to ${u.username}`} className="btn btn-outline btn-sm">
                  <Shield aria-hidden className="w-3 h-3" />
                  Hand over
                </button>
              )}
              {u.is_owner
                ? <button disabled title="The owner cannot be banned." className="btn btn-danger btn-sm">
                    <Lock aria-hidden className="w-3 h-3" />
                    Ban
                  </button>
                : u.is_banned
                ? <button disabled={busy === u.id} onClick={() => setBan(u, false)}
                    className={`btn btn-success btn-sm ${busy === u.id ? 'is-loading' : ''}`}>Unban</button>
                : <button
                    disabled={busy === u.id || u.role === 'admin'}
                    title={u.role === 'admin' ? 'Change their role to player first' : undefined}
                    onClick={() => setBan(u, true)}
                    className={`btn btn-danger btn-sm ${busy === u.id ? 'is-loading' : ''}`}
                  >
                    {u.role === 'admin' && <Lock aria-hidden className="w-3 h-3" />}
                    Ban
                  </button>}
            </div>
          </div>
        ))}
        {users.length === 0 && (
          <div className="surface">
            <EmptyState icon={<Users className="w-5 h-5" />} title="No players listed" hint="Registered accounts appear here as soon as they sign up." />
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────
// SUBMISSIONS TAB
// ─────────────────────────────────────────
function SubmissionsTab() {
  const [subs, setSubs] = useState<any[]>([]);

  useEffect(() => {
    // admin_list_submissions, not a table read: SELECT on submissions is now
    // granted per-column to authenticated and excludes submitted_flag, so the
    // raw attempt is only reachable through this admin-gated RPC.
    supabase.rpc('admin_list_submissions', { p_limit: 100 })
      .then(({ data }) => setSubs(data ?? []));
  }, []);

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
        <h2 className="text-h3 text-cyber-text">Submission log</h2>
        <p className="text-small text-text-muted">Newest first · latest 100 attempts</p>
      </div>

      {/* Desktop / tablet: table */}
      <TableFrame className="hidden md:block">
        <table className="w-full text-left min-w-[820px]">
          <thead className="bg-surface-rail border-b border-border-base">
            <tr>
              <Th>User</Th>
              <Th>Challenge</Th>
              <Th>Submitted</Th>
              <Th>Result</Th>
              <Th align="right">Time</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {subs.map(s => (
              <tr key={s.id} className="transition-colors duration-[var(--duration-fast)] hover:bg-surface-raised">
                <td className="px-5 py-4 text-body font-semibold text-cyber-text">{s.username}</td>
                <td className="px-5 py-4 text-small text-text-secondary">{s.challenge_title}</td>
                <td className="px-5 py-4 text-small font-mono max-w-[300px]">
                  <span className="block truncate text-cyber-text" title={s.submitted_flag ?? ''}>
                    {s.submitted_flag ?? '—'}
                  </span>
                  <span className="block truncate text-micro text-text-faint" title={s.submitted_flag_hash ?? ''}>
                    {s.submitted_flag_hash ? s.submitted_flag_hash.substring(0, 16) + '…' : ''}
                  </span>
                </td>
                <td className="px-5 py-4">
                  <span className={`badge ${s.is_correct ? 'badge-solved' : 'badge-hard'}`}>
                    {s.is_correct ? '✓ Correct' : '✗ Wrong'}
                  </span>
                </td>
                <td className="px-5 py-4 text-small font-mono text-text-muted text-right whitespace-nowrap">
                  {new Date(s.submitted_at).toLocaleString()}
                </td>
              </tr>
            ))}
            {subs.length === 0 && (
              <tr><td colSpan={5} className="p-0">
                <EmptyState icon={<Inbox className="w-5 h-5" />} title="No submissions yet" hint="Every flag attempt lands here the moment a player submits." />
              </td></tr>
            )}
          </tbody>
        </table>
      </TableFrame>

      {/* Mobile: card list */}
      <div className="md:hidden space-y-2.5">
        {subs.map(s => (
          <div key={s.id} className="surface p-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-body font-semibold text-cyber-text truncate">{s.username}</p>
                <p className="text-small text-text-secondary truncate">{s.challenge_title}</p>
              </div>
              <span className={`badge shrink-0 ${s.is_correct ? 'badge-solved' : 'badge-hard'}`}>
                {s.is_correct ? '✓' : '✗'}
              </span>
            </div>
            <div className="mt-2.5 pt-2.5 border-t border-border-subtle flex items-center justify-between gap-3">
              <span className="text-small font-mono text-cyber-text truncate" title={s.submitted_flag ?? ''}>
                {s.submitted_flag ?? '—'}
              </span>
              <span className="text-small font-mono text-text-muted whitespace-nowrap shrink-0">
                {new Date(s.submitted_at).toLocaleString()}
              </span>
            </div>
          </div>
        ))}
        {subs.length === 0 && (
          <div className="surface">
            <EmptyState icon={<Inbox className="w-5 h-5" />} title="No submissions yet" hint="Every flag attempt lands here the moment a player submits." />
          </div>
        )}
      </div>
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
    info: 'bg-status-info-wash text-status-info border-status-info/40',
    success: 'bg-status-solved-wash text-status-solved border-status-solved/40',
    warning: 'bg-diff-medium-wash text-diff-medium border-diff-medium/40',
    danger: 'bg-diff-hard-wash text-diff-hard border-diff-hard/40',
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] items-start">
      <div className="surface p-5 sm:p-gutter space-y-5 min-w-0">
        <div className="flex items-start gap-3">
          <span aria-hidden className="grid place-items-center w-9 h-9 shrink-0 rounded-control border border-border-neon bg-neon-wash text-cyber-neon">
            <Megaphone className="w-4 h-4" />
          </span>
          <div className="min-w-0">
            <h3 className="text-h3 text-cyber-text">Broadcast</h3>
            <p className="text-small text-text-muted mt-0.5">Delivered to every signed-in participant immediately.</p>
          </div>
        </div>

        <div>
          <span className="field-label">Type</span>
          <div className="flex flex-wrap gap-2">
            {['info', 'success', 'warning', 'danger'].map(t => (
              <button key={t} onClick={() => setType(t)}
                aria-pressed={type === t}
                className={`chip ${type === t ? typeColors[t] : ''}`}>
                {t}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="field-label" htmlFor="notif-title">Title</label>
          <input id="notif-title" value={title} onChange={e => setTitle(e.target.value)}
            placeholder="e.g. New Challenge Released!"
            className="input" />
        </div>
        <div>
          <label className="field-label" htmlFor="notif-message">Message</label>
          <textarea id="notif-message" value={message} onChange={e => setMessage(e.target.value)}
            placeholder="e.g. A new Web challenge 'SQLi Master' has been added. Good luck!"
            rows={3}
            className="textarea min-h-[6rem]" />
        </div>
        {msg && <StatusLine msg={msg} />}
        <button disabled={sending} onClick={send}
          className={`btn btn-primary btn-lg btn-block ${sending ? 'is-loading' : ''}`}>
          <Send className="w-4 h-4" />
          {sending ? 'Sending...' : 'Send to All Users'}
        </button>
      </div>

      <div className="min-w-0">
        <h3 className="label-micro mb-3">Recent Notifications</h3>
        <div className="space-y-2">
          {history.length === 0 ? (
            <div className="surface">
              <EmptyState icon={<Megaphone className="w-5 h-5" />} title="Nothing sent yet" hint="Your last ten broadcasts show up here." />
            </div>
          ) : history.map(n => (
            <div key={n.id} className={`relative rounded-card border p-3.5 pr-10 ${typeColors[n.type] ?? typeColors.info}`}>
              <button onClick={() => deleteNotif(n.id)}
                aria-label={`Delete notification: ${n.title}`} title="Delete notification"
                className="btn btn-ghost btn-sm btn-icon absolute top-2 right-2 text-current opacity-60 hover:opacity-100">
                <X className="w-3.5 h-3.5" />
              </button>
              <p className="label-micro text-current opacity-80">{n.type}</p>
              <p className="text-body font-semibold text-cyber-text mt-1">{n.title}</p>
              <p className="text-small leading-relaxed text-text-secondary mt-1 break-words">{n.message}</p>
              <p className="text-small font-mono text-text-muted mt-2">{new Date(n.created_at).toLocaleString()}</p>
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
  const [freezing, setFreezing] = useState(false);
  const [hiding, setHiding] = useState(false);
  const [starting, setStarting] = useState(false);
  const [newName, setNewName] = useState('');
  const [clearChallenges, setClearChallenges] = useState(true);
  const [clearTeams, setClearTeams] = useState(true);
  const [clearNotifs, setClearNotifs] = useState(true);
  const [confirmText, setConfirmText] = useState('');
  const [msg, setMsg] = useState('');

  const loadEvent = () =>
    supabase.from('event_settings').select('*').order('id', { ascending: false }).limit(1).single()
      .then(({ data }) => setEvent(data));

  useEffect(() => { loadEvent(); }, []);

  // freeze_scoreboard is deliberately NOT in this payload. It is owned by the
  // Freeze control below, which writes it through its own RPC. Including it
  // here would let a Save with stale form state silently unfreeze a board that
  // was frozen from another tab moments earlier.
  const save = async () => {
    if (!event) return;
    setSaving(true);
    const { error } = await supabase.from('event_settings').update({
      name: event.name,
      start_time: event.start_time,
      end_time: event.end_time,
      is_active: event.is_active,
      registration_open: event.registration_open,
      mode: event.mode,
    }).eq('id', event.id);
    setSaving(false);
    setMsg(error ? '❌ ' + error.message : '✅ Event settings saved!');
    setTimeout(() => setMsg(''), 3000);
  };

  // Destructive and irreversible, so it asks for the event name to be typed
  // rather than relying on a confirm() nobody reads. Everything it clears is
  // listed on the button itself.
  const startNewEvent = async () => {
    if (!event) return;
    if (!newName.trim()) {
      setMsg('❌ Give the new event a name first.');
      setTimeout(() => setMsg(''), 5000);
      return;
    }
    if (confirmText.trim() !== 'START NEW EVENT') return;

    setStarting(true);
    const { data, error } = await supabase.rpc('admin_start_new_event', {
      p_name: newName.trim(),
      p_clear_challenges: clearChallenges,
      p_clear_teams: clearTeams,
      p_clear_notifications: clearNotifs,
    });
    setStarting(false);

    if (error || data?.error) {
      setMsg('❌ ' + (error?.message ?? data.error));
      setTimeout(() => setMsg(''), 6000);
      return;
    }
    setConfirmText('');
    setNewName('');
    await loadEvent();
    setMsg(
      `✅ New event ready — cleared ${data.submissions_cleared} submissions, ` +
      `${data.challenges_cleared} challenges, ${data.teams_cleared} teams. ` +
      `${data.users_kept} user accounts kept.`
    );
    setTimeout(() => setMsg(''), 12000);
  };

  const toggleHidden = async () => {
    if (!event) return;
    const next = !event.hide_scores;
    const warn = next
      ? 'Hide the scoreboard from players?\n\nStandings, the Teams list and the Users list all go dark for everyone except admins. Solves keep counting. You will still see everything.'
      : 'Show the scoreboard again?\n\nPlayers get the standings back immediately.';
    if (!confirm(warn)) return;

    setHiding(true);
    const { data, error } = await supabase.rpc('admin_set_scoreboard_hidden', { p_hidden: next });
    setHiding(false);

    if (error || data?.error) {
      setMsg('❌ ' + (error?.message ?? data.error));
      setTimeout(() => setMsg(''), 5000);
      return;
    }
    await loadEvent();
    setMsg(next ? '🙈 Scoreboard hidden from players' : '👁 Scoreboard visible again');
    setTimeout(() => setMsg(''), 5000);
  };

  const toggleFreeze = async () => {
    if (!event) return;
    const next = !event.freeze_scoreboard;
    const warn = next
      ? 'Freeze the scoreboard?\n\nPlayers will see the standings exactly as they are right now. Solves keep counting behind the scenes, and you will still see live scores.'
      : 'Unfreeze the scoreboard?\n\nEvery solve landed during the freeze becomes visible to players immediately.';
    if (!confirm(warn)) return;

    setFreezing(true);
    const { data, error } = await supabase.rpc('admin_set_scoreboard_freeze', { p_frozen: next });
    setFreezing(false);

    if (error || data?.error) {
      setMsg('❌ ' + (error?.message ?? data.error));
      setTimeout(() => setMsg(''), 5000);
      return;
    }
    await loadEvent();
    setMsg(next
      ? `🔒 Scoreboard frozen — ${data.teams_captured ?? 0} teams captured`
      : '🔓 Scoreboard unfrozen — live standings restored');
    setTimeout(() => setMsg(''), 5000);
  };

  if (!event) return (
    <div className="surface max-w-2xl p-gutter space-y-3">
      <div className="skeleton skeleton-text w-40" />
      <div className="skeleton h-10 w-full rounded-control" />
      <div className="skeleton h-10 w-full rounded-control" />
      <p className="label-micro pt-1">Loading event settings...</p>
    </div>
  );

  const now = new Date();
  const start = event.start_time ? new Date(event.start_time) : null;
  const end = event.end_time ? new Date(event.end_time) : null;
  const status = !event.is_active ? 'Inactive' : !start || !end ? 'Active (no time set)' : now < start ? '⏳ Scheduled' : now > end ? '🏁 Ended' : '🟢 LIVE';

  return (
    <div className="max-w-2xl space-y-6">
      <div className="surface p-5 sm:p-gutter">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-5 border-b border-border-subtle">
          <div className="flex items-center gap-3 min-w-0">
            <span aria-hidden className="grid place-items-center w-9 h-9 shrink-0 rounded-control border border-border-neon bg-neon-wash text-cyber-neon">
              <Settings2 className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <h3 className="text-h3 text-cyber-text">Event Settings</h3>
              <p className="text-small text-text-muted mt-0.5">Controls the timer, scoreboard freeze and registration.</p>
            </div>
          </div>
          <span className={`badge ${status.includes('LIVE') ? 'badge-live' : status === 'Inactive' ? 'badge-locked' : 'badge-info'}`}>
            {status}
          </span>
        </div>

        <div className="mt-6 space-y-4">
          <div>
            <label className="field-label" htmlFor="event-name">Event Name</label>
            <input id="event-name" type="text" value={event.name ?? ''} onChange={e => setEvent((p: any) => ({ ...p, name: e.target.value }))}
              className="input" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <DateTimeField
              id="event-start"
              label="Start Time"
              value={event.start_time}
              onChange={v => setEvent((p: any) => ({ ...p, start_time: v }))}
              hint="Click to open the calendar. Stored in your local timezone."
            />
            <DateTimeField
              id="event-end"
              label="End Time"
              value={event.end_time}
              onChange={v => setEvent((p: any) => ({ ...p, end_time: v }))}
              hint="Click to open the calendar. The scoreboard auto-freezes here."
            />
          </div>
        </div>

        <div className="mt-6 pt-6 border-t border-border-subtle">
          <p className="field-label flex items-center gap-1.5"><CalendarClock aria-hidden className="w-3.5 h-3.5" /> Switches</p>
          <div className="space-y-2">
            <div className="flex items-center gap-3 rounded-control border border-border-subtle bg-surface-inset px-4 py-3">
              <input type="checkbox" id="active" checked={event.is_active ?? false}
                onChange={e => setEvent((p: any) => ({ ...p, is_active: e.target.checked }))}
                className="w-4 h-4 accent-cyber-neon shrink-0" />
              <label htmlFor="active" className="text-label uppercase text-text-secondary cursor-pointer">Event Active</label>
            </div>
            <div className="flex items-center gap-3 rounded-control border border-border-subtle bg-surface-inset px-4 py-3">
              <input type="checkbox" id="registration" checked={event.registration_open ?? true}
                onChange={e => setEvent((p: any) => ({ ...p, registration_open: e.target.checked }))}
                className="w-4 h-4 accent-cyber-neon shrink-0" />
              <label htmlFor="registration" className="text-label uppercase text-text-secondary cursor-pointer">Registration Open</label>
            </div>
          </div>
        </div>

        {/* ── Scoreboard freeze: its own control, applied instantly ────── */}
        <div className="mt-6 pt-6 border-t border-border-subtle">
          <p className="field-label flex items-center gap-1.5">
            <Lock aria-hidden className="w-3.5 h-3.5" /> Scoreboard
          </p>
          <div
            className="rounded-control border px-4 py-4 flex flex-wrap items-center justify-between gap-4"
            style={{
              borderColor: event.freeze_scoreboard
                ? 'var(--color-border-neon)' : 'var(--color-border-subtle)',
              backgroundColor: event.freeze_scoreboard
                ? 'color-mix(in srgb, var(--color-neon) 8%, transparent)'
                : 'var(--color-surface-inset)',
            }}
          >
            <div className="min-w-0">
              <p className="text-small text-cyber-text flex items-center gap-2">
                {event.freeze_scoreboard ? (
                  <><Lock aria-hidden className="w-3.5 h-3.5 text-cyber-neon" /> Frozen</>
                ) : (
                  <><Radio aria-hidden className="w-3.5 h-3.5" /> Live</>
                )}
              </p>
              <p className="text-small text-text-muted mt-1 max-w-md">
                {event.freeze_scoreboard
                  ? <>Players see the standings captured at{' '}
                      <span className="font-mono text-cyber-text">
                        {event.freeze_time ? new Date(event.freeze_time).toLocaleString() : 'freeze time'}
                      </span>. Solves still count — you see live scores.</>
                  : <>Players see live standings. Freezing captures them so the final
                      placings stay hidden until you reveal them.</>}
              </p>
            </div>
            <button
              onClick={toggleFreeze}
              disabled={freezing}
              className={`btn btn-md shrink-0 ${event.freeze_scoreboard ? 'btn-secondary' : 'btn-primary'} ${freezing ? 'is-loading' : ''}`}
            >
              <Lock className="w-4 h-4" />
              {freezing
                ? 'Working…'
                : event.freeze_scoreboard ? 'Unfreeze Scoreboard' : 'Freeze Scoreboard'}
            </button>
          </div>

          {/* ── Hide: stronger than freeze, players see nothing ────────── */}
          <div
            className="mt-2 rounded-control border px-4 py-4 flex flex-wrap items-center justify-between gap-4"
            style={{
              borderColor: event.hide_scores
                ? 'var(--color-border-danger)' : 'var(--color-border-subtle)',
              backgroundColor: event.hide_scores
                ? 'var(--color-diff-hard-wash)' : 'var(--color-surface-inset)',
            }}
          >
            <div className="min-w-0">
              <p className="text-small text-cyber-text flex items-center gap-2">
                {event.hide_scores
                  ? <><EyeOff aria-hidden className="w-3.5 h-3.5" /> Hidden from players</>
                  : <><Eye aria-hidden className="w-3.5 h-3.5" /> Visible to players</>}
              </p>
              <p className="text-small text-text-muted mt-1 max-w-md">
                {event.hide_scores
                  ? <>Standings, Teams and Users are dark for everyone but admins. Solves
                      still count — nothing is lost.</>
                  : <>Hiding blanks the scoreboard entirely, rather than freezing it at a
                      moment. Use it to run a blackout without losing any progress.</>}
              </p>
            </div>
            <button
              onClick={toggleHidden}
              disabled={hiding}
              className={`btn btn-md shrink-0 ${event.hide_scores ? 'btn-secondary' : 'btn-danger'} ${hiding ? 'is-loading' : ''}`}
            >
              {event.hide_scores ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              {hiding
                ? 'Working…'
                : event.hide_scores ? 'Show Scoreboard' : 'Hide Scoreboard'}
            </button>
          </div>

          {event.auto_froze_at && (
            <p className="mt-3 text-small text-text-muted flex items-center gap-1.5">
              <Lock aria-hidden className="w-3 h-3" />
              Auto-froze at {new Date(event.auto_froze_at).toLocaleString()} when the event
              end time passed.
            </p>
          )}
          {!event.freeze_scoreboard && event.end_time && (
            <p className="mt-3 text-small text-text-muted">
              Freezes automatically at {new Date(event.end_time).toLocaleString()}.
            </p>
          )}
        </div>

        <div className="mt-6 pt-6 border-t border-border-subtle flex flex-wrap items-center gap-3">
          <button onClick={save} disabled={saving}
            className={`btn btn-primary btn-md ${saving ? 'is-loading' : ''}`}>
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save Event Settings'}
          </button>
          {msg && <StatusLine msg={msg} />}
        </div>

        {/* ── Start a new event: wipes this one, keeps the accounts ────── */}
        <div className="mt-8 pt-6 border-t-2" style={{ borderColor: 'var(--color-border-danger)' }}>
          <p className="field-label flex items-center gap-1.5" style={{ color: 'var(--color-diff-hard)' }}>
            <RotateCcw aria-hidden className="w-3.5 h-3.5" /> Start a new event
          </p>
          <p className="text-small text-text-muted mt-1 max-w-xl">
            Clears this event and leaves the platform ready for the next one. Scores,
            solves, hint unlocks and the frozen scoreboard always go.
            <b className="text-cyber-text"> Player accounts are never deleted</b> — people
            log back in with the same email next time. The new event starts inactive with
            no dates, so you can set it up before anyone sees it.
          </p>

          <div className="mt-4 grid gap-3 sm:max-w-xl">
            <div>
              <label className="field-label" htmlFor="new-event-name">
                New event name <span style={{ color: 'var(--color-diff-hard)' }}>*</span>
              </label>
              <input id="new-event-name" type="text" value={newName} className="input w-full"
                maxLength={80} required aria-required="true"
                placeholder="e.g. NullOrigin CTF 2027"
                onChange={e => setNewName(e.target.value)} />
              <p className="text-small text-text-muted mt-1">
                {newName.trim()
                  ? <>Players will see “<span className="text-cyber-text">{newName.trim()}</span>” on the scoreboard and sidebar.</>
                  : <>Required. Without it the new event would keep the old name, “{event.name}”.</>}
              </p>
            </div>

            <div className="space-y-2">
              {[
                { id: 'cc', on: clearChallenges, set: setClearChallenges,
                  label: 'Delete all challenges', sub: 'Their hints, files and flags go with them. Uncheck to reuse the same set.' },
                { id: 'ct', on: clearTeams, set: setClearTeams,
                  label: 'Delete all teams', sub: 'Members are released, not deleted. They form new teams next event.' },
                { id: 'cn', on: clearNotifs, set: setClearNotifs,
                  label: 'Clear notifications', sub: 'Removes announcements from the last event.' },
              ].map(o => (
                <div key={o.id} className="flex items-start gap-3 rounded-control border border-border-subtle bg-surface-inset px-4 py-3">
                  <input type="checkbox" id={o.id} checked={o.on} onChange={e => o.set(e.target.checked)}
                    className="w-4 h-4 mt-0.5 accent-cyber-neon shrink-0" />
                  <label htmlFor={o.id} className="cursor-pointer min-w-0">
                    <span className="text-small text-cyber-text">{o.label}</span>
                    <span className="block text-small text-text-muted mt-0.5">{o.sub}</span>
                  </label>
                </div>
              ))}
            </div>

            <div>
              <label className="field-label" htmlFor="confirm-new-event">
                Type <span className="font-mono text-cyber-text">START NEW EVENT</span> to enable the button
              </label>
              <input id="confirm-new-event" type="text" value={confirmText} className="input w-full"
                autoComplete="off" placeholder="START NEW EVENT"
                disabled={!newName.trim()}
                onChange={e => setConfirmText(e.target.value)} />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={startNewEvent}
                disabled={starting || !newName.trim() || confirmText.trim() !== 'START NEW EVENT'}
                className={`btn btn-danger btn-md ${starting ? 'is-loading' : ''}`}
              >
                <RotateCcw className="w-4 h-4" />
                {starting ? 'Clearing…' : 'Start New Event'}
              </button>
              <span className="text-small text-text-muted">
                Export the final scoreboard first — this cannot be undone.
              </span>
            </div>
          </div>
        </div>
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
    // These go through SECURITY DEFINER RPCs rather than direct table writes:
    // authenticated no longer holds UPDATE on teams.is_banned or DELETE on
    // teams, so that a compromised or mistaken RLS policy cannot be the only
    // thing standing between a captain and unbanning their own team.
    if (action === 'ban' || action === 'unban') {
      const { data, error: rpcError } = await supabase
        .rpc('admin_set_team_ban', { p_team_id: teamId, p_banned: action === 'ban' });
      error = rpcError ?? (data?.error ? { message: data.error } : null);
    } else if (action === 'delete') {
      if (!confirm('Delete this team permanently? Members will be removed from the team.')) { setLoading(false); return; }
      // One RPC, one transaction: members were previously released by a
      // separate request, so a failure between the two left them teamless
      // with the team still there.
      const { data, error: rpcError } = await supabase
        .rpc('admin_delete_team', { p_team_id: teamId });
      error = rpcError ?? (data?.error ? { message: data.error } : null);
      if (!error) setSelected(null);
    }
    setLoading(false);
    setMsg(error ? '❌ ' + error.message : '✅ Done!');
    setTimeout(() => setMsg(''), 2000);
    loadTeams();
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_19rem] items-start">
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
          <h2 className="text-h3 text-cyber-text">Teams</h2>
          <p className="text-small text-text-muted">Select a team to inspect members and its invite code.</p>
        </div>

        {/* Desktop / tablet: table */}
        <TableFrame className="hidden md:block">
          <table className="w-full text-left min-w-[720px]">
            <thead className="bg-surface-rail border-b border-border-base">
              <tr>
                <Th>#</Th>
                <Th>Team Name</Th>
                <Th>Members</Th>
                <Th>Invite Code</Th>
                <Th>Status</Th>
                <Th align="right">Actions</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {teams.map((t, i) => (
                <tr key={t.id} onClick={() => setSelected(t)}
                  title={`Inspect ${t.name}`}
                  className={`cursor-pointer transition-colors duration-[var(--duration-fast)] hover:bg-surface-raised ${selected?.id === t.id ? 'bg-surface-raised' : ''}`}>
                  <td className="px-5 py-4 text-small font-mono text-text-muted">{i + 1}</td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`text-body font-semibold ${t.is_banned ? 'line-through text-diff-hard' : 'text-cyber-text'}`}>{t.name}</span>
                      {selected?.id === t.id && <span className="badge badge-neon">Selected</span>}
                    </div>
                  </td>
                  <td className="px-5 py-4 text-small text-text-secondary whitespace-nowrap">
                    <span className="font-mono">{t.member_count ?? 0}</span> members
                  </td>
                  <td className="px-5 py-4 text-small font-mono text-text-muted">••••••••</td>
                  <td className="px-5 py-4">
                    <span className={`badge ${t.is_banned ? 'badge-hard' : 'badge-solved'}`}>
                      {t.is_banned ? 'Banned' : 'Active'}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex justify-end">
                      {t.is_banned
                        ? <button onClick={e => { e.stopPropagation(); act('unban', t.id); }} className="btn btn-success btn-sm">Unban</button>
                        : <button onClick={e => { e.stopPropagation(); act('ban', t.id); }} className="btn btn-danger btn-sm">Ban</button>
                      }
                    </div>
                  </td>
                </tr>
              ))}
              {teams.length === 0 && (
                <tr><td colSpan={6} className="p-0">
                  <EmptyState icon={<Shield className="w-5 h-5" />} title="No teams yet" hint="Teams appear here as soon as a player creates one." />
                </td></tr>
              )}
            </tbody>
          </table>
        </TableFrame>

        {/* Mobile: card list */}
        <div className="md:hidden space-y-3">
          {teams.map((t, i) => (
            <div key={t.id} className={`surface p-4 ${selected?.id === t.id ? 'border-border-neon' : ''}`}>
              <button type="button" onClick={() => setSelected(t)} className="w-full text-left focus-ring rounded-inset">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono text-small text-text-muted shrink-0">{i + 1}</span>
                      <p className={`text-body font-semibold truncate ${t.is_banned ? 'line-through text-diff-hard' : 'text-cyber-text'}`}>{t.name}</p>
                    </div>
                    <p className="text-small text-text-muted mt-1">
                      <span className="font-mono">{t.member_count ?? 0}</span> members · code ••••••••
                    </p>
                  </div>
                  <span className={`badge shrink-0 ${t.is_banned ? 'badge-hard' : 'badge-solved'}`}>
                    {t.is_banned ? 'Banned' : 'Active'}
                  </span>
                </div>
              </button>
              <div className="mt-3 pt-3 border-t border-border-subtle flex justify-end">
                {t.is_banned
                  ? <button onClick={e => { e.stopPropagation(); act('unban', t.id); }} className="btn btn-success btn-sm">Unban</button>
                  : <button onClick={e => { e.stopPropagation(); act('ban', t.id); }} className="btn btn-danger btn-sm">Ban</button>
                }
              </div>
            </div>
          ))}
          {teams.length === 0 && (
            <div className="surface">
              <EmptyState icon={<Shield className="w-5 h-5" />} title="No teams yet" hint="Teams appear here as soon as a player creates one." />
            </div>
          )}
        </div>
      </div>

      {selected && (
        <aside className="surface p-5 flex flex-col gap-4 min-w-0 lg:sticky lg:top-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-h3 text-cyber-text truncate">{selected.name}</h3>
              <p className="label-micro mt-1">Team detail</p>
            </div>
            <button onClick={() => setSelected(null)} aria-label="Close team detail" title="Close"
              className="btn btn-ghost btn-sm btn-icon shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>

          <dl className="surface-inset px-3.5 py-3 space-y-2 text-small">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-text-muted">Status</dt>
              <dd><span className={`badge ${selected.is_banned ? 'badge-hard' : 'badge-solved'}`}>{selected.is_banned ? 'Banned' : 'Active'}</span></dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-text-muted">Invite Code</dt>
              <dd className="font-mono text-cyber-neon truncate">{selInvite ?? '••••••••'}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-text-muted">Members</dt>
              <dd className="font-mono text-cyber-text">{members.length}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-text-muted">Created</dt>
              <dd className="font-mono text-text-secondary">{new Date(selected.created_at).toLocaleDateString()}</dd>
            </div>
          </dl>

          <div>
            <p className="label-micro mb-2">Members</p>
            <div className="space-y-1.5 max-h-56 overflow-y-auto custom-scrollbar pr-1">
              {members.length === 0 ? (
                <p className="text-small text-text-muted py-2">No members</p>
              ) : members.map(m => (
                <div key={m.id} className="flex items-center justify-between gap-2 rounded-inset bg-surface-inset border border-border-subtle px-2.5 py-2">
                  <div className="min-w-0">
                    <p className="text-small font-semibold text-cyber-text truncate">{m.username}</p>
                    <p className="text-small font-mono text-text-muted truncate">{m.email}</p>
                  </div>
                  {m.id === selected.captain_id && (
                    <span className="badge badge-neon shrink-0">Captain</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {msg && <StatusLine msg={msg} className="text-center" />}

          <div className="flex flex-col gap-2 pt-1 border-t border-border-subtle">
            <p className="label-micro pt-3">Danger zone</p>
            {selected.is_banned
              ? <button disabled={loading} onClick={() => act('unban', selected.id)} className={`btn btn-success btn-sm btn-block ${loading ? 'is-loading' : ''}`}>Unban Team</button>
              : <button disabled={loading} onClick={() => act('ban', selected.id)} className={`btn btn-danger btn-sm btn-block ${loading ? 'is-loading' : ''}`}>Ban Team</button>
            }
            <button disabled={loading} onClick={() => act('delete', selected.id)} className={`btn btn-danger btn-sm btn-block ${loading ? 'is-loading' : ''}`}>
              <Trash2 className="w-3.5 h-3.5" /> Delete Team
            </button>
            <p className="text-small leading-relaxed text-text-muted">
              Deleting is permanent and detaches every member. You will be asked to confirm.
            </p>
          </div>
        </aside>
      )}
    </div>
  );
}
