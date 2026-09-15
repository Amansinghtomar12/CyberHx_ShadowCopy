import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Plus, Trash2, ChevronUp, ChevronDown, Eye, EyeOff, Save, X,
  Flame, Loader2, Link2, PlayCircle,
} from 'lucide-react';
import { supabase, DBChallenge } from '../../lib/supabase';
import type { Challenge } from '../../types';
import { buildChainSeriesVM } from '../chain/chainModel';
import type { DBChainSeries, DBChainMember } from '../../lib/supabase';

const ChainExperience = React.lazy(() => import('../chain/ChainExperience'));

const CATEGORIES = ['web', 'crypto', 'steg', 'rev', 'pwn', 'forensic', 'osint', 'misc'];
const DIFFICULTIES = ['Easy', 'Medium', 'Hard', 'Insane'];

interface AdminMember { challenge_id: string; position: number; }
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

const blankDraft = (): AdminSeries => ({
  id: '', title: '', category: 'web', description: '', readme: '', readme_url: '',
  difficulty: null, display_order: 0, is_published: false, members: [],
});

function dbToPreviewChallenge(c: DBChallenge): Challenge {
  return {
    id: c.id, title: c.title, category: c.category, points: c.points,
    description: c.description, difficulty: c.difficulty, solvedCount: 0,
    author: c.author, flag: '', files: [], hints: [], tags: c.tags ?? [],
  };
}

export default function ChainManager({ challenges }: { challenges: DBChallenge[] }) {
  const [enabled, setEnabled] = useState<boolean>(false);
  const [enabledBusy, setEnabledBusy] = useState(false);
  const [series, setSeries] = useState<AdminSeries[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<AdminSeries | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(false);
  const [simulate, setSimulate] = useState(0);

  const challengeById = useMemo(() => {
    const m = new Map<string, DBChallenge>();
    challenges.forEach((c) => m.set(c.id, c));
    return m;
  }, [challenges]);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: listRes }, { data: es }] = await Promise.all([
      supabase.rpc('admin_list_chain_series'),
      supabase.from('event_settings').select('chain_experience_enabled').eq('id', 1).maybeSingle(),
    ]);
    if (listRes && !listRes.error) setSeries((listRes.series ?? []) as AdminSeries[]);
    if (es) setEnabled(!!es.chain_experience_enabled);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const toggleEnabled = async () => {
    setEnabledBusy(true);
    const next = !enabled;
    const { data, error: err } = await supabase.rpc('admin_set_chain_experience', { p_enabled: next });
    setEnabledBusy(false);
    if (err || data?.error) { alert('Could not change setting: ' + (data?.error ?? err?.message)); return; }
    setEnabled(next);
  };

  const startNew = () => { setDraft(blankDraft()); setError(''); setPreview(false); };
  const editSeries = (s: AdminSeries) => { setDraft({ ...s, members: [...s.members] }); setError(''); setPreview(false); };

  const availableToAdd = useMemo(() => {
    if (!draft) return [];
    const used = new Set(draft.members.map((m) => m.challenge_id));
    return challenges.filter((c) => !used.has(c.id));
  }, [draft, challenges]);

  const addMember = (challengeId: string) => {
    if (!draft || !challengeId) return;
    setDraft({ ...draft, members: [...draft.members, { challenge_id: challengeId, position: draft.members.length + 1 }] });
  };
  const removeMember = (challengeId: string) => {
    if (!draft) return;
    setDraft({ ...draft, members: draft.members.filter((m) => m.challenge_id !== challengeId).map((m, i) => ({ ...m, position: i + 1 })) });
  };
  const moveMember = (idx: number, dir: -1 | 1) => {
    if (!draft) return;
    const arr = [...draft.members];
    const j = idx + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[idx], arr[j]] = [arr[j], arr[idx]];
    setDraft({ ...draft, members: arr.map((m, i) => ({ ...m, position: i + 1 })) });
  };

  const validate = (d: AdminSeries, forPublish: boolean): string | null => {
    if (!d.title.trim()) return 'Title is required';
    if (!d.category.trim()) return 'Category is required';
    if (forPublish && d.members.length < 2) return 'A chain needs at least 2 challenges to publish';
    const ids = d.members.map((m) => m.challenge_id);
    if (new Set(ids).size !== ids.length) return 'A challenge cannot appear twice in the same chain';
    return null;
  };

  const saveDraft = async (publishAfter?: boolean) => {
    if (!draft) return;
    const wantPublish = publishAfter ?? draft.is_published;
    const v = validate(draft, wantPublish);
    if (v) { setError(v); return; }
    setSaving(true); setError('');
    try {
      // 1. Upsert the series row (unpublished first so members can be set).
      const up = await supabase.rpc('admin_upsert_chain_series', {
        p_id: draft.id || null,
        p_title: draft.title,
        p_category: draft.category,
        p_description: draft.description,
        p_readme: draft.readme,
        p_difficulty: draft.difficulty,
        p_display_order: draft.display_order,
        p_is_published: draft.id ? false : null,
        p_readme_url: draft.readme_url ?? '',
      });
      if (up.error || up.data?.error) throw new Error(up.data?.error ?? up.error?.message);
      const seriesId = draft.id || up.data.series_id;

      // 2. Replace membership atomically (validated server-side).
      const setM = await supabase.rpc('admin_set_chain_members', {
        p_series_id: seriesId,
        p_challenge_ids: draft.members.map((m) => m.challenge_id),
      });
      if (setM.error || setM.data?.error) throw new Error(setM.data?.error ?? setM.error?.message);

      // 3. Apply the requested publish state last (server re-checks >= 2 members).
      const pub = await supabase.rpc('admin_upsert_chain_series', {
        p_id: seriesId,
        p_is_published: wantPublish,
      });
      if (pub.error || pub.data?.error) throw new Error(pub.data?.error ?? pub.error?.message);

      await load();
      setDraft(null);
    } catch (e: any) {
      setError(e?.message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const togglePublish = async (s: AdminSeries) => {
    const { data, error: err } = await supabase.rpc('admin_upsert_chain_series', {
      p_id: s.id, p_is_published: !s.is_published,
    });
    if (err || data?.error) { alert(data?.error ?? err?.message); return; }
    void load();
  };

  const deleteSeries = async (s: AdminSeries) => {
    if (!confirm(`Delete chain "${s.title}"? Challenges and solves are NOT affected.`)) return;
    const { data, error: err } = await supabase.rpc('admin_delete_chain_series', { p_id: s.id });
    if (err || data?.error) { alert(data?.error ?? err?.message); return; }
    if (draft?.id === s.id) setDraft(null);
    void load();
  };

  // Preview VM from the current draft.
  const previewVM = useMemo(() => {
    if (!draft) return null;
    const byId = new Map<string, Challenge>();
    challenges.forEach((c) => byId.set(c.id, dbToPreviewChallenge(c)));
    const dbSeries: DBChainSeries = {
      id: draft.id || 'preview', title: draft.title || 'Untitled chain', category: draft.category,
      description: draft.description, readme: draft.readme, readme_url: draft.readme_url ?? null,
      difficulty: (draft.difficulty as DBChainSeries['difficulty']) ?? null,
      display_order: draft.display_order, challenge_count: draft.members.length,
    };
    const dbMembers: DBChainMember[] = draft.members.map((m) => ({
      series_id: dbSeries.id, challenge_id: m.challenge_id, position: m.position,
    }));
    const solvedSet = new Set(draft.members.slice(0, simulate).map((m) => m.challenge_id));
    return buildChainSeriesVM(dbSeries, dbMembers, byId, (id) => solvedSet.has(id), (id) => solvedSet.has(id));
  }, [draft, challenges, simulate]);

  return (
    <div className="space-y-6">
      {/* Master toggle */}
      <div className="surface flex flex-col gap-4 rounded-lg border border-border-subtle p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-card border border-border-neon bg-cyber-neon/10">
            <Link2 className="h-5 w-5 text-cyber-neon" />
          </span>
          <div>
            <h3 className="text-h3 font-bold text-cyber-text">Chain Experience Engine</h3>
            <p className="max-w-xl text-small text-text-muted">
              Enables the advanced chained-challenge experience: the animated chain visualization, chain
              progression, and green fire activation. When OFF, the platform behaves exactly as the normal CTF —
              no chain UI is loaded and no chain data is shown to players. Turning it off never deletes chains or solves.
            </p>
          </div>
        </div>
        <button
          onClick={toggleEnabled}
          disabled={enabledBusy}
          className={`btn btn-md shrink-0 ${enabled ? 'btn-danger' : 'btn-primary'}`}
        >
          {enabledBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : enabled ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          {enabled ? 'Disable Chain Experience' : 'Enable Chain Experience'}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        {/* Series list */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-h3 font-bold text-cyber-text">Chain Series</h3>
            <button onClick={startNew} className="btn btn-primary btn-sm inline-flex items-center gap-1.5">
              <Plus className="h-4 w-4" /> New chain
            </button>
          </div>
          {loading ? (
            <div className="flex items-center gap-2 p-4 text-text-muted"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
          ) : series.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border-subtle p-6 text-center text-small text-text-muted">
              No chains yet. Create one to group existing challenges into an ordered series.
            </p>
          ) : (
            <ul className="space-y-2">
              {series.map((s) => (
                <li
                  key={s.id}
                  className={`flex items-center justify-between gap-2 rounded-lg border p-3 ${draft?.id === s.id ? 'border-border-neon bg-cyber-neon/5' : 'border-border-subtle bg-surface-raised'}`}
                >
                  <button onClick={() => editSeries(s)} className="min-w-0 flex-1 text-left">
                    <div className="flex items-center gap-2">
                      <span className="label-micro text-text-muted">{s.category}</span>
                      {s.is_published
                        ? <span className="rounded-full bg-cyber-neon/15 px-1.5 py-0.5 text-micro font-semibold text-cyber-neon">Published</span>
                        : <span className="rounded-full bg-surface-sunken px-1.5 py-0.5 text-micro text-text-muted">Draft</span>}
                    </div>
                    <div className="truncate text-body font-semibold text-cyber-text">{s.title}</div>
                    <div className="text-micro text-text-muted">{s.members.length} challenges</div>
                  </button>
                  <div className="flex shrink-0 items-center gap-1">
                    <button onClick={() => togglePublish(s)} title={s.is_published ? 'Unpublish' : 'Publish'} className="btn btn-ghost btn-sm btn-icon">
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

        {/* Editor */}
        {draft && (
          <div className="space-y-4 rounded-lg border border-border-subtle bg-surface-raised p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-h3 font-bold text-cyber-text">{draft.id ? 'Edit chain' : 'New chain'}</h3>
              <button onClick={() => setDraft(null)} className="btn btn-ghost btn-sm btn-icon"><X className="h-4 w-4" /></button>
            </div>

            {error && <div className="rounded-md border border-border-danger bg-diff-hard-wash px-3 py-2 text-small text-diff-hard">{error}</div>}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="label-micro">Name</span>
                <input className="input mt-1" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Operation Blackout" />
              </label>
              <label className="block">
                <span className="label-micro">Category</span>
                <select className="select mt-1" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="label-micro">Difficulty</span>
                <select className="select mt-1" value={draft.difficulty ?? ''} onChange={(e) => setDraft({ ...draft, difficulty: e.target.value || null })}>
                  <option value="">—</option>
                  {DIFFICULTIES.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="label-micro">Display order</span>
                <input type="number" className="input mt-1" value={draft.display_order} onChange={(e) => setDraft({ ...draft, display_order: Number(e.target.value) || 0 })} />
              </label>
            </div>

            <label className="block">
              <span className="label-micro">Short description</span>
              <input className="input mt-1" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} maxLength={2000} />
            </label>

            <label className="block">
              <span className="label-micro">Briefing file URL (players see a "Download briefing" button at the top of the chain)</span>
              <input className="input mt-1" type="url" value={draft.readme_url ?? ''} onChange={(e) => setDraft({ ...draft, readme_url: e.target.value })} maxLength={2048} placeholder="https://files.cyberhx.com/… (upload the file yourself, paste the link)" />
              <span className="mt-1 block text-micro text-text-muted">Upload your briefing/story/strategy file to your own storage and paste the direct download link here. Leave blank for none.</span>
            </label>

            <label className="block">
              <span className="label-micro">Inline briefing text (optional, Markdown — no HTML is rendered)</span>
              <textarea className="textarea mt-1 min-h-[120px] font-mono text-small" value={draft.readme} onChange={(e) => setDraft({ ...draft, readme: e.target.value })} maxLength={20000} placeholder="# Mission&#10;Explain the story, objectives, rules…" />
            </label>

            {/* Members */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="label-micro">Chain order ({draft.members.length})</span>
                <select
                  className="select select-sm w-56"
                  value=""
                  onChange={(e) => { addMember(e.target.value); e.currentTarget.value = ''; }}
                >
                  <option value="">+ Add challenge…</option>
                  {availableToAdd.map((c) => <option key={c.id} value={c.id}>{c.title} ({c.category})</option>)}
                </select>
              </div>
              {draft.members.length === 0 ? (
                <p className="rounded-md border border-dashed border-border-subtle p-4 text-center text-small text-text-muted">
                  Add at least 2 challenges to form a chain.
                </p>
              ) : (
                <ol className="space-y-1.5">
                  {draft.members.map((m, idx) => {
                    const ch = challengeById.get(m.challenge_id);
                    return (
                      <li key={m.challenge_id} className="flex items-center gap-2 rounded-md border border-border-subtle bg-surface-sunken px-3 py-2">
                        <span className="w-6 shrink-0 font-mono text-micro text-text-muted">{String(idx + 1).padStart(2, '0')}</span>
                        <span className="min-w-0 flex-1 truncate text-small text-cyber-text">
                          {ch ? ch.title : <span className="text-diff-hard">Unknown challenge ({m.challenge_id.slice(0, 8)}…)</span>}
                          {ch && <span className="ml-2 text-micro text-text-muted">{ch.category}</span>}
                        </span>
                        <button onClick={() => moveMember(idx, -1)} disabled={idx === 0} className="btn btn-ghost btn-sm btn-icon"><ChevronUp className="h-4 w-4" /></button>
                        <button onClick={() => moveMember(idx, 1)} disabled={idx === draft.members.length - 1} className="btn btn-ghost btn-sm btn-icon"><ChevronDown className="h-4 w-4" /></button>
                        <button onClick={() => removeMember(m.challenge_id)} className="btn btn-ghost btn-sm btn-icon text-diff-hard"><Trash2 className="h-4 w-4" /></button>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-2">
              <button onClick={() => saveDraft(false)} disabled={saving} className="btn btn-secondary btn-md inline-flex items-center gap-1.5">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save draft
              </button>
              <button onClick={() => saveDraft(true)} disabled={saving} className="btn btn-primary btn-md inline-flex items-center gap-1.5">
                <Eye className="h-4 w-4" /> Save &amp; publish
              </button>
              <button onClick={() => { setPreview(true); setSimulate(0); }} disabled={draft.members.length < 1} className="btn btn-ghost btn-md inline-flex items-center gap-1.5">
                <PlayCircle className="h-4 w-4" /> Preview chain
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 3D preview modal */}
      {preview && previewVM && (
        <div className="fixed inset-0 z-[5000] flex items-center justify-center bg-black/80 p-4" role="dialog" aria-modal="true" aria-label="Chain preview">
          <div className="w-full max-w-5xl">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="label-micro text-text-muted">Preview</span>
                <label className="flex items-center gap-2 text-small text-text-secondary">
                  <Flame className="h-4 w-4 text-orange-400" />
                  Simulate solved:
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
