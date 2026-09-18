import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Plus, Trash2, ChevronUp, ChevronDown, Eye, EyeOff, Save, X,
  Flame, Loader2, Server, PlayCircle, Link2, User, Crown, Edit3,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { DBChallenge, DBB2RSeries, DBB2RMember } from '../../lib/supabase';
import { buildB2RSeriesVM, type B2RBoxVM } from '../b2r/b2rModel';

const ChainExperience = React.lazy(() => import('../chain/ChainExperience'));

const CATEGORIES = ['web', 'crypto', 'steg', 'rev', 'pwn', 'forensic', 'osint', 'b2r', 'misc'];
const DIFFICULTIES = ['Easy', 'Medium', 'Hard', 'Insane'];

// Shapes returned by the admin_list_b2r_* RPCs (structure only — never flags).
interface AdminBox {
  id: string;
  title: string;
  category: string;
  description: string;
  difficulty: string | null;
  readme_url: string | null;
  display_order: number;
  is_published: boolean;
  user_challenge_id: string;
  root_challenge_id: string;
  user_points: number;
  root_points: number;
  max_attempts: number;
  connection_info: string | null;
  series_id: string | null;
  position: number | null;
}
interface AdminMember { box_id: string; position: number; }
interface AdminSeries {
  id: string;
  title: string;
  category: string;
  description: string;
  readme: string;
  readme_url: string | null;
  difficulty: string | null;
  display_order: number;
  is_published: boolean;
  members: AdminMember[];
}

// Editable copy of a box. Flags are write-only: blank = keep the current hash.
interface BoxDraft {
  id: string;
  title: string;
  category: string;
  description: string;
  difficulty: string | null;
  readme_url: string;
  display_order: number;
  is_published: boolean;
  user_flag: string;
  user_points: number;
  root_flag: string;
  root_points: number;
  max_attempts: number;
}

const blankSeries = (): AdminSeries => ({
  id: '', title: '', category: 'web', description: '', readme: '', readme_url: '',
  difficulty: null, display_order: 0, is_published: false, members: [],
});

const toDraft = (b: AdminBox): BoxDraft => ({
  id: b.id, title: b.title, category: b.category, description: b.description,
  difficulty: b.difficulty, readme_url: b.readme_url ?? '', display_order: b.display_order,
  is_published: b.is_published, user_flag: '', user_points: b.user_points,
  root_flag: '', root_points: b.root_points, max_attempts: b.max_attempts,
});

export default function B2RManager({ challenges: _challenges, onChanged }: { challenges: DBChallenge[]; onChanged?: () => void }) {
  const [enabled, setEnabled] = useState(false);
  const [enabledBusy, setEnabledBusy] = useState(false);
  const [boxes, setBoxes] = useState<AdminBox[]>([]);
  const [series, setSeries] = useState<AdminSeries[]>([]);
  const [loading, setLoading] = useState(true);
  const [boxDraft, setBoxDraft] = useState<BoxDraft | null>(null);
  const [seriesDraft, setSeriesDraft] = useState<AdminSeries | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(false);
  const [simulate, setSimulate] = useState(0);

  const boxById = useMemo(() => {
    const m = new Map<string, AdminBox>();
    boxes.forEach((b) => m.set(b.id, b));
    return m;
  }, [boxes]);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: bRes }, { data: sRes }, { data: es }] = await Promise.all([
      supabase.rpc('admin_list_b2r_boxes'),
      supabase.rpc('admin_list_b2r_series'),
      supabase.from('event_settings').select('b2r_enabled').eq('id', 1).maybeSingle(),
    ]);
    if (bRes && !bRes.error) setBoxes((bRes.boxes ?? []) as AdminBox[]);
    if (sRes && !sRes.error) setSeries((sRes.series ?? []) as AdminSeries[]);
    if (es) setEnabled(!!es.b2r_enabled);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const fail = (e: unknown) => setError((e as any)?.message ?? 'Save failed');

  const toggleEnabled = async () => {
    setEnabledBusy(true);
    const next = !enabled;
    const { data, error: err } = await supabase.rpc('admin_set_b2r_enabled', { p_enabled: next });
    setEnabledBusy(false);
    if (err || data?.error) { alert('Could not change setting: ' + (data?.error ?? err?.message)); return; }
    setEnabled(next);
  };

  // ── Boxes ────────────────────────────────────────────────────────────
  const editBox = (b: AdminBox) => { setBoxDraft(toDraft(b)); setSeriesDraft(null); setError(''); };

  const saveBox = async () => {
    if (!boxDraft) return;
    if (!boxDraft.title.trim()) { setError('Title is required'); return; }
    if (boxDraft.user_flag.trim() && boxDraft.root_flag.trim() && boxDraft.user_flag.trim() === boxDraft.root_flag.trim()) {
      setError('User and root flags must be different'); return;
    }
    setSaving(true); setError('');
    try {
      const { data, error: err } = await supabase.rpc('admin_upsert_b2r_box', {
        p_id: boxDraft.id,
        p_title: boxDraft.title,
        p_category: boxDraft.category,
        p_difficulty: boxDraft.difficulty,
        p_description: boxDraft.description,
        p_user_flag: boxDraft.user_flag.trim() || null,
        p_user_points: Number(boxDraft.user_points) || null,
        p_root_flag: boxDraft.root_flag.trim() || null,
        p_root_points: Number(boxDraft.root_points) || null,
        p_max_attempts: Number(boxDraft.max_attempts),
        p_readme_url: boxDraft.readme_url ?? '',
        p_display_order: boxDraft.display_order,
        p_is_published: boxDraft.is_published,
      });
      if (err || data?.error) throw new Error(data?.error ?? err?.message);
      await load(); onChanged?.();
      setBoxDraft(null);
    } catch (e) { fail(e); } finally { setSaving(false); }
  };

  const toggleBoxPublish = async (b: AdminBox) => {
    const { data, error: err } = await supabase.rpc('admin_upsert_b2r_box', { p_id: b.id, p_is_published: !b.is_published });
    if (err || data?.error) { alert(data?.error ?? err?.message); return; }
    void load(); onChanged?.();
  };

  const deleteBox = async (b: AdminBox) => {
    if (!confirm(`Delete B2R box "${b.title}"? This removes BOTH its user and root flag challenges and their submissions. This cannot be undone.`)) return;
    const { data, error: err } = await supabase.rpc('admin_delete_b2r_box', { p_id: b.id });
    if (err || data?.error) { alert(data?.error ?? err?.message); return; }
    if (boxDraft?.id === b.id) setBoxDraft(null);
    void load(); onChanged?.();
  };

  // ── Series (B2R chains) ──────────────────────────────────────────────
  const startNewSeries = () => { setSeriesDraft(blankSeries()); setBoxDraft(null); setError(''); setPreview(false); };
  const editSeries = (s: AdminSeries) => { setSeriesDraft({ ...s, members: [...s.members] }); setBoxDraft(null); setError(''); setPreview(false); };

  const availableBoxes = useMemo(() => {
    if (!seriesDraft) return [];
    const used = new Set(seriesDraft.members.map((m) => m.box_id));
    // A box lives in at most one chain — hide boxes already in ANOTHER chain.
    return boxes.filter((b) => !used.has(b.id) && (!b.series_id || b.series_id === seriesDraft.id));
  }, [seriesDraft, boxes]);

  const addMember = (boxId: string) => {
    if (!seriesDraft || !boxId) return;
    setSeriesDraft({ ...seriesDraft, members: [...seriesDraft.members, { box_id: boxId, position: seriesDraft.members.length + 1 }] });
  };
  const removeMember = (boxId: string) => {
    if (!seriesDraft) return;
    setSeriesDraft({ ...seriesDraft, members: seriesDraft.members.filter((m) => m.box_id !== boxId).map((m, i) => ({ ...m, position: i + 1 })) });
  };
  const moveMember = (idx: number, dir: -1 | 1) => {
    if (!seriesDraft) return;
    const arr = [...seriesDraft.members];
    const j = idx + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[idx], arr[j]] = [arr[j], arr[idx]];
    setSeriesDraft({ ...seriesDraft, members: arr.map((m, i) => ({ ...m, position: i + 1 })) });
  };

  const saveSeries = async (publishAfter?: boolean) => {
    if (!seriesDraft) return;
    const wantPublish = publishAfter ?? seriesDraft.is_published;
    if (!seriesDraft.title.trim()) { setError('Title is required'); return; }
    if (wantPublish && seriesDraft.members.length < 2) { setError('A B2R chain needs at least 2 boxes to publish'); return; }
    setSaving(true); setError('');
    try {
      const up = await supabase.rpc('admin_upsert_b2r_series', {
        p_id: seriesDraft.id || null,
        p_title: seriesDraft.title,
        p_category: seriesDraft.category,
        p_description: seriesDraft.description,
        p_readme: seriesDraft.readme,
        p_difficulty: seriesDraft.difficulty,
        p_display_order: seriesDraft.display_order,
        p_is_published: seriesDraft.id ? false : null,
        p_readme_url: seriesDraft.readme_url ?? '',
      });
      if (up.error || up.data?.error) throw new Error(up.data?.error ?? up.error?.message);
      const seriesId = seriesDraft.id || up.data.series_id;

      const setM = await supabase.rpc('admin_set_b2r_members', {
        p_series_id: seriesId,
        p_box_ids: seriesDraft.members.map((m) => m.box_id),
      });
      if (setM.error || setM.data?.error) throw new Error(setM.data?.error ?? setM.error?.message);

      const pub = await supabase.rpc('admin_upsert_b2r_series', { p_id: seriesId, p_is_published: wantPublish });
      if (pub.error || pub.data?.error) throw new Error(pub.data?.error ?? pub.error?.message);

      await load();
      setSeriesDraft(null);
    } catch (e) { fail(e); } finally { setSaving(false); }
  };

  const toggleSeriesPublish = async (s: AdminSeries) => {
    const { data, error: err } = await supabase.rpc('admin_upsert_b2r_series', { p_id: s.id, p_is_published: !s.is_published });
    if (err || data?.error) { alert(data?.error ?? err?.message); return; }
    void load();
  };

  const deleteSeries = async (s: AdminSeries) => {
    if (!confirm(`Delete B2R chain "${s.title}"? Boxes, flags and solves are NOT affected.`)) return;
    const { data, error: err } = await supabase.rpc('admin_delete_b2r_series', { p_id: s.id });
    if (err || data?.error) { alert(data?.error ?? err?.message); return; }
    if (seriesDraft?.id === s.id) setSeriesDraft(null);
    void load();
  };

  // Preview VM from the current chain draft — box N is "rooted" when N <= simulate.
  const previewVM = useMemo(() => {
    if (!seriesDraft) return null;
    const dbSeries: DBB2RSeries = {
      id: seriesDraft.id || 'preview', title: seriesDraft.title || 'Untitled B2R chain',
      category: seriesDraft.category, description: seriesDraft.description, readme: seriesDraft.readme,
      readme_url: seriesDraft.readme_url ?? null,
      difficulty: (seriesDraft.difficulty as DBB2RSeries['difficulty']) ?? null,
      display_order: seriesDraft.display_order, box_count: seriesDraft.members.length,
    };
    const dbMembers: DBB2RMember[] = seriesDraft.members.map((m) => ({ series_id: dbSeries.id, box_id: m.box_id, position: m.position }));
    const rootedIds = new Set(seriesDraft.members.slice(0, simulate).map((m) => m.box_id));
    const vmById = new Map<string, B2RBoxVM>();
    seriesDraft.members.forEach((m) => {
      const b = boxById.get(m.box_id);
      if (!b) return;
      const rooted = rootedIds.has(b.id);
      const fake = { id: b.user_challenge_id, title: b.title, category: b.category as any, points: b.user_points, description: b.description, difficulty: (b.difficulty ?? 'Easy') as any, solvedCount: 0, author: '', flag: '', tags: [] };
      vmById.set(b.id, {
        id: b.id, title: b.title, category: b.category, description: b.description, difficulty: b.difficulty,
        readmeUrl: b.readme_url, userChallengeId: b.user_challenge_id, rootChallengeId: b.root_challenge_id,
        userChallenge: fake, rootChallenge: { ...fake, id: b.root_challenge_id, points: b.root_points },
        userSolved: rooted, rootSolved: rooted, rooted, userSolvedByTeammate: false, rootSolvedByTeammate: false,
        points: b.user_points + b.root_points, earned: rooted ? b.user_points + b.root_points : 0,
        seriesId: dbSeries.id, position: m.position,
      });
    });
    return buildB2RSeriesVM(dbSeries, dbMembers, vmById);
  }, [seriesDraft, boxById, simulate]);

  return (
    <div className="space-y-6">
      {/* Master toggle */}
      <div className="surface flex flex-col gap-4 rounded-lg border border-border-subtle p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-card border border-border-neon bg-cyber-neon/10">
            <Server className="h-5 w-5 text-cyber-neon" />
          </span>
          <div>
            <h3 className="text-h3 font-bold text-cyber-text">B2R — Boot-to-Root</h3>
            <p className="max-w-xl text-small text-text-muted">
              Enables the B2R tab: machines with a <strong>user</strong> flag and a <strong>root</strong> flag, in FREE
              (standalone) and CHAINED (ordered story) sub-modes. When OFF, no B2R UI is loaded and no B2R data is shown to
              players. Turning it off never deletes boxes, flags or solves. Create boxes from the Challenges tab by choosing
              a B2R placement; edit them, and build B2R chains, here.
            </p>
          </div>
        </div>
        <button onClick={toggleEnabled} disabled={enabledBusy} className={`btn btn-md shrink-0 ${enabled ? 'btn-danger' : 'btn-primary'}`}>
          {enabledBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : enabled ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          {enabled ? 'Disable B2R' : 'Enable B2R'}
        </button>
      </div>

      {error && <div className="rounded-md border border-border-danger bg-diff-hard-wash px-3 py-2 text-small text-diff-hard">{error}</div>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="space-y-6">
          {/* Boxes */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-h3 font-bold text-cyber-text">B2R Boxes</h3>
              <span className="text-micro text-text-muted">Create new boxes in Challenges → Placement</span>
            </div>
            {loading ? (
              <div className="flex items-center gap-2 p-4 text-text-muted"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
            ) : boxes.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border-subtle p-6 text-center text-small text-text-muted">
                No B2R boxes yet. Add a challenge and choose the <strong>B2R Free</strong> or <strong>B2R Chain</strong> placement.
              </p>
            ) : (
              <ul className="space-y-2">
                {boxes.map((b) => (
                  <li key={b.id} className={`flex items-center justify-between gap-2 rounded-lg border p-3 ${boxDraft?.id === b.id ? 'border-border-neon bg-cyber-neon/5' : 'border-border-subtle bg-surface-raised'}`}>
                    <button onClick={() => editBox(b)} className="min-w-0 flex-1 text-left">
                      <div className="flex items-center gap-2">
                        <span className="label-micro text-text-muted">{b.category}</span>
                        {b.is_published
                          ? <span className="rounded-full bg-cyber-neon/15 px-1.5 py-0.5 text-micro font-semibold text-cyber-neon">Published</span>
                          : <span className="rounded-full bg-surface-sunken px-1.5 py-0.5 text-micro text-text-muted">Draft</span>}
                        {b.series_id
                          ? <span className="inline-flex items-center gap-1 rounded-full bg-surface-sunken px-1.5 py-0.5 text-micro text-text-muted"><Link2 className="h-3 w-3" /> chained</span>
                          : <span className="rounded-full bg-surface-sunken px-1.5 py-0.5 text-micro text-text-muted">free</span>}
                      </div>
                      <div className="truncate text-body font-semibold text-cyber-text">{b.title}</div>
                      <div className="flex items-center gap-3 text-micro text-text-muted">
                        <span className="inline-flex items-center gap-1"><User className="h-3 w-3" /> {b.user_points}p</span>
                        <span className="inline-flex items-center gap-1"><Crown className="h-3 w-3" /> {b.root_points}p</span>
                      </div>
                    </button>
                    <div className="flex shrink-0 items-center gap-1">
                      <button onClick={() => toggleBoxPublish(b)} title={b.is_published ? 'Unpublish' : 'Publish'} className="btn btn-ghost btn-sm btn-icon">
                        {b.is_published ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                      <button onClick={() => deleteBox(b)} title="Delete" className="btn btn-ghost btn-sm btn-icon text-diff-hard">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Series */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-h3 font-bold text-cyber-text">B2R Chains</h3>
              <button onClick={startNewSeries} className="btn btn-primary btn-sm inline-flex items-center gap-1.5">
                <Plus className="h-4 w-4" /> New B2R chain
              </button>
            </div>
            {!loading && series.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border-subtle p-6 text-center text-small text-text-muted">
                No B2R chains yet. Create one to link boxes into an ordered story.
              </p>
            ) : (
              <ul className="space-y-2">
                {series.map((s) => (
                  <li key={s.id} className={`flex items-center justify-between gap-2 rounded-lg border p-3 ${seriesDraft?.id === s.id ? 'border-border-neon bg-cyber-neon/5' : 'border-border-subtle bg-surface-raised'}`}>
                    <button onClick={() => editSeries(s)} className="min-w-0 flex-1 text-left">
                      <div className="flex items-center gap-2">
                        <span className="label-micro text-text-muted">{s.category}</span>
                        {s.is_published
                          ? <span className="rounded-full bg-cyber-neon/15 px-1.5 py-0.5 text-micro font-semibold text-cyber-neon">Published</span>
                          : <span className="rounded-full bg-surface-sunken px-1.5 py-0.5 text-micro text-text-muted">Draft</span>}
                      </div>
                      <div className="truncate text-body font-semibold text-cyber-text">{s.title}</div>
                      <div className="text-micro text-text-muted">{s.members.length} boxes</div>
                    </button>
                    <div className="flex shrink-0 items-center gap-1">
                      <button onClick={() => toggleSeriesPublish(s)} title={s.is_published ? 'Unpublish' : 'Publish'} className="btn btn-ghost btn-sm btn-icon">
                        {s.is_published ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                      <button onClick={() => deleteSeries(s)} title="Delete" className="btn btn-ghost btn-sm btn-icon text-diff-hard">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Box editor */}
        {boxDraft && (
          <div className="space-y-4 rounded-lg border border-border-subtle bg-surface-raised p-5">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-h3 font-bold text-cyber-text"><Edit3 className="h-4 w-4" /> Edit box</h3>
              <button onClick={() => setBoxDraft(null)} className="btn btn-ghost btn-sm btn-icon"><X className="h-4 w-4" /></button>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="label-micro">Name</span>
                <input className="input mt-1" value={boxDraft.title} onChange={(e) => setBoxDraft({ ...boxDraft, title: e.target.value })} />
              </label>
              <label className="block">
                <span className="label-micro">Category</span>
                <select className="select mt-1" value={boxDraft.category} onChange={(e) => setBoxDraft({ ...boxDraft, category: e.target.value })}>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="label-micro">Difficulty</span>
                <select className="select mt-1" value={boxDraft.difficulty ?? ''} onChange={(e) => setBoxDraft({ ...boxDraft, difficulty: e.target.value || null })}>
                  <option value="">—</option>
                  {DIFFICULTIES.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="label-micro">Display order</span>
                <input type="number" className="input mt-1" value={boxDraft.display_order} onChange={(e) => setBoxDraft({ ...boxDraft, display_order: Number(e.target.value) || 0 })} />
              </label>
            </div>

            <label className="block">
              <span className="label-micro">Description (Markdown)</span>
              <textarea className="textarea mt-1 min-h-[100px]" value={boxDraft.description} onChange={(e) => setBoxDraft({ ...boxDraft, description: e.target.value })} maxLength={10000} />
            </label>

            <label className="block">
              <span className="label-micro">Briefing file URL (optional)</span>
              <input className="input mt-1" type="url" value={boxDraft.readme_url} onChange={(e) => setBoxDraft({ ...boxDraft, readme_url: e.target.value })} maxLength={2048} placeholder="https://…" />
            </label>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-md border border-border-subtle bg-surface-sunken p-3">
                <div className="mb-2 flex items-center gap-1.5 label-micro text-text-muted"><User className="h-3.5 w-3.5" /> USER FLAG</div>
                <input className="input" value={boxDraft.user_flag} onChange={(e) => setBoxDraft({ ...boxDraft, user_flag: e.target.value })} placeholder="Unchanged — type a new flag to replace it" />
                <label className="mt-2 block">
                  <span className="label-micro">User points</span>
                  <input type="number" min={1} className="input mt-1" value={boxDraft.user_points} onChange={(e) => setBoxDraft({ ...boxDraft, user_points: Number(e.target.value) || 0 })} />
                </label>
              </div>
              <div className="rounded-md border border-border-subtle bg-surface-sunken p-3">
                <div className="mb-2 flex items-center gap-1.5 label-micro text-text-muted"><Crown className="h-3.5 w-3.5" /> ROOT FLAG</div>
                <input className="input" value={boxDraft.root_flag} onChange={(e) => setBoxDraft({ ...boxDraft, root_flag: e.target.value })} placeholder="Unchanged — type a new flag to replace it" />
                <label className="mt-2 block">
                  <span className="label-micro">Root points</span>
                  <input type="number" min={1} className="input mt-1" value={boxDraft.root_points} onChange={(e) => setBoxDraft({ ...boxDraft, root_points: Number(e.target.value) || 0 })} />
                </label>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="label-micro">Max attempts per flag (0 = unlimited)</span>
                <input type="number" min={0} className="input mt-1" value={boxDraft.max_attempts} onChange={(e) => setBoxDraft({ ...boxDraft, max_attempts: Number(e.target.value) || 0 })} />
              </label>
              <label className="flex items-center gap-2 self-end rounded-md border border-border-subtle bg-surface-sunken px-3 py-2">
                <input type="checkbox" className="h-4 w-4 accent-cyber-neon" checked={boxDraft.is_published} onChange={(e) => setBoxDraft({ ...boxDraft, is_published: e.target.checked })} />
                <span className="text-small text-text-secondary">Published (both flags visible to players)</span>
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-2">
              <button onClick={saveBox} disabled={saving} className="btn btn-primary btn-md inline-flex items-center gap-1.5">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save box
              </button>
            </div>
          </div>
        )}

        {/* Series editor */}
        {seriesDraft && (
          <div className="space-y-4 rounded-lg border border-border-subtle bg-surface-raised p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-h3 font-bold text-cyber-text">{seriesDraft.id ? 'Edit B2R chain' : 'New B2R chain'}</h3>
              <button onClick={() => setSeriesDraft(null)} className="btn btn-ghost btn-sm btn-icon"><X className="h-4 w-4" /></button>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="label-micro">Name</span>
                <input className="input mt-1" value={seriesDraft.title} onChange={(e) => setSeriesDraft({ ...seriesDraft, title: e.target.value })} placeholder="Operation Rootkit" />
              </label>
              <label className="block">
                <span className="label-micro">Category</span>
                <select className="select mt-1" value={seriesDraft.category} onChange={(e) => setSeriesDraft({ ...seriesDraft, category: e.target.value })}>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="label-micro">Difficulty</span>
                <select className="select mt-1" value={seriesDraft.difficulty ?? ''} onChange={(e) => setSeriesDraft({ ...seriesDraft, difficulty: e.target.value || null })}>
                  <option value="">—</option>
                  {DIFFICULTIES.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="label-micro">Display order</span>
                <input type="number" className="input mt-1" value={seriesDraft.display_order} onChange={(e) => setSeriesDraft({ ...seriesDraft, display_order: Number(e.target.value) || 0 })} />
              </label>
            </div>

            <label className="block">
              <span className="label-micro">Short description</span>
              <input className="input mt-1" value={seriesDraft.description} onChange={(e) => setSeriesDraft({ ...seriesDraft, description: e.target.value })} maxLength={2000} />
            </label>
            <label className="block">
              <span className="label-micro">Briefing file URL (optional)</span>
              <input className="input mt-1" type="url" value={seriesDraft.readme_url ?? ''} onChange={(e) => setSeriesDraft({ ...seriesDraft, readme_url: e.target.value })} maxLength={2048} placeholder="https://…" />
            </label>
            <label className="block">
              <span className="label-micro">Inline briefing text (optional, Markdown)</span>
              <textarea className="textarea mt-1 min-h-[100px] font-mono text-small" value={seriesDraft.readme} onChange={(e) => setSeriesDraft({ ...seriesDraft, readme: e.target.value })} maxLength={20000} />
            </label>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="label-micro">Chain order ({seriesDraft.members.length})</span>
                <select className="select select-sm w-56" value="" onChange={(e) => { addMember(e.target.value); e.currentTarget.value = ''; }}>
                  <option value="">+ Add box…</option>
                  {availableBoxes.map((b) => <option key={b.id} value={b.id}>{b.title} ({b.category})</option>)}
                </select>
              </div>
              {seriesDraft.members.length === 0 ? (
                <p className="rounded-md border border-dashed border-border-subtle p-4 text-center text-small text-text-muted">Add at least 2 boxes to form a chain.</p>
              ) : (
                <ol className="space-y-1.5">
                  {seriesDraft.members.map((m, idx) => {
                    const b = boxById.get(m.box_id);
                    return (
                      <li key={m.box_id} className="flex items-center gap-2 rounded-md border border-border-subtle bg-surface-sunken px-3 py-2">
                        <span className="w-6 shrink-0 font-mono text-micro text-text-muted">{String(idx + 1).padStart(2, '0')}</span>
                        <span className="min-w-0 flex-1 truncate text-small text-cyber-text">
                          {b ? b.title : <span className="text-diff-hard">Unknown box ({m.box_id.slice(0, 8)}…)</span>}
                          {b && <span className="ml-2 text-micro text-text-muted">{b.category}</span>}
                        </span>
                        <button onClick={() => moveMember(idx, -1)} disabled={idx === 0} className="btn btn-ghost btn-sm btn-icon"><ChevronUp className="h-4 w-4" /></button>
                        <button onClick={() => moveMember(idx, 1)} disabled={idx === seriesDraft.members.length - 1} className="btn btn-ghost btn-sm btn-icon"><ChevronDown className="h-4 w-4" /></button>
                        <button onClick={() => removeMember(m.box_id)} className="btn btn-ghost btn-sm btn-icon text-diff-hard"><Trash2 className="h-4 w-4" /></button>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-2">
              <button onClick={() => saveSeries(false)} disabled={saving} className="btn btn-secondary btn-md inline-flex items-center gap-1.5">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save draft
              </button>
              <button onClick={() => saveSeries(true)} disabled={saving} className="btn btn-primary btn-md inline-flex items-center gap-1.5">
                <Eye className="h-4 w-4" /> Save &amp; publish
              </button>
              <button onClick={() => { setPreview(true); setSimulate(0); }} disabled={seriesDraft.members.length < 1} className="btn btn-ghost btn-md inline-flex items-center gap-1.5">
                <PlayCircle className="h-4 w-4" /> Preview chain
              </button>
            </div>
          </div>
        )}
      </div>

      {preview && previewVM && (
        <div className="fixed inset-0 z-[5000] flex items-center justify-center bg-black/80 p-4" role="dialog" aria-modal="true" aria-label="B2R chain preview">
          <div className="w-full max-w-5xl">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="label-micro text-text-muted">Preview</span>
                <label className="flex items-center gap-2 text-small text-text-secondary">
                  <Flame className="h-4 w-4 text-orange-400" />
                  Simulate rooted:
                  <input type="range" min={0} max={previewVM.total} value={simulate} onChange={(e) => setSimulate(Number(e.target.value))} />
                  <span className="font-mono">{simulate}/{previewVM.total}</span>
                </label>
              </div>
              <button onClick={() => setPreview(false)} className="btn btn-ghost btn-sm"><X className="h-4 w-4" /> Close</button>
            </div>
            <Suspense fallback={<div className="flex h-[60vh] items-center justify-center text-text-muted"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Initializing chain…</div>}>
              <ChainExperience key={`${previewVM.id}-${simulate}`} series={previewVM} onOpenChallenge={() => {}} onBack={() => setPreview(false)} />
            </Suspense>
          </div>
        </div>
      )}
    </div>
  );
}
