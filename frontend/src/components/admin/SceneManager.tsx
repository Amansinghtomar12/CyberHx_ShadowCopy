/**
 * SceneManager — adding a battle scene during the event.
 *
 * WHY IT EXISTS
 *   The twelve scenes that ship were a closed set: adding a thirteenth
 *   meant processing the art, editing source, a migration, a merge and a
 *   deploy. Organisers write challenges during their own event, and a
 *   deploy over a live board is the one thing nobody should be doing then.
 *
 * WHAT IT DOES
 *   Takes a picture, prepares it in the browser — resized to the width the
 *   board paints, and measured: where the subject sits, where the light is,
 *   and the accent its card border takes — uploads it, and writes the
 *   catalogue row. The scene is then in the dropdown on every challenge,
 *   with no deploy and nothing rebuilt.
 *
 * WHAT IT WILL NOT DO
 *   Replace the art of one of the twelve: theirs lives in the app's bundle,
 *   so a row pointing elsewhere would simply never be read. Their words can
 *   be edited; their pictures come with the build.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ImagePlus, Loader2, Trash2, Upload, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { prepareArt, slugify, type PreparedArt } from '../../themes/pinaka/scenes/prepareArt';
import type { SceneCatalogue } from '../../themes/pinaka/scenes/catalogue';

const BUCKET = 'scene-art';

const randomSegment = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(6)), b => b.toString(16).padStart(2, '0')).join('');

interface SceneManagerProps {
  catalogue: SceneCatalogue;
  /** Re-read the catalogue once a write lands. */
  onChanged: () => void;
}

export const SceneManager: React.FC<SceneManagerProps> = ({ catalogue, onChanged }) => {
  const [label, setLabel] = useState('');
  const [intro, setIntro] = useState('');
  const [buttonLabel, setButtonLabel] = useState('');
  const [enterLabel, setEnterLabel] = useState('');
  const [art, setArt] = useState<PreparedArt | null>(null);
  const [busy, setBusy] = useState<'' | 'reading' | 'saving'>('');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  // An object URL per preview; the previous one is dead the moment it is
  // replaced, and all of them when this unmounts.
  useEffect(() => () => { if (art) URL.revokeObjectURL(art.previewUrl); }, [art]);

  const id = slugify(label);
  const taken = !!id && catalogue.byId.has(id);
  const added = [...catalogue.byId.values()].filter(s => !s.builtin);

  const pick = useCallback(async (file: File | undefined) => {
    if (!file) return;
    setError(''); setNote(''); setBusy('reading');
    try {
      const prepared = await prepareArt(file);
      setArt(prev => { if (prev) URL.revokeObjectURL(prev.previewUrl); return prepared; });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That picture could not be read.');
    } finally {
      setBusy('');
    }
  }, []);

  const reset = () => {
    setArt(prev => { if (prev) URL.revokeObjectURL(prev.previewUrl); return null; });
    setLabel(''); setIntro(''); setButtonLabel(''); setEnterLabel('');
    if (fileRef.current) fileRef.current.value = '';
  };

  const save = async () => {
    if (!art || !id) return;
    setBusy('saving'); setError(''); setNote('');

    // The path carries a random segment so replacing a scene's art never
    // collides with the CDN's copy of the old one.
    const path = `${id}/${randomSegment()}.webp`;
    const { error: upErr } = await supabase.storage.from(BUCKET)
      .upload(path, art.blob, { upsert: false, contentType: 'image/webp', cacheControl: '31536000' });
    if (upErr) {
      setBusy('');
      setError(`The picture would not upload: ${upErr.message}`);
      return;
    }

    const url = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    const { data, error: rpcErr } = await supabase.rpc('admin_upsert_pinaka_scene', {
      p_id: id,
      p_label: label.trim(),
      p_intro: intro.trim(),
      p_button_label: buttonLabel.trim(),
      p_enter_label: enterLabel.trim(),
      p_accent: art.accent,
      p_art_url: url,
      p_art_width: art.width,
      p_art_height: art.height,
      p_focal_x: art.focal.x,
      p_focal_y: art.focal.y,
      p_sun_x: art.sun.x,
      p_sun_y: art.sun.y,
    });

    const failure = rpcErr?.message || (data && typeof data === 'object' && 'error' in data ? String(data.error) : '');
    if (failure) {
      // Nothing is left in the bucket for a row that was never written.
      await supabase.storage.from(BUCKET).remove([path]);
      setBusy('');
      setError(failure);
      return;
    }

    setBusy('');
    setNote(`“${label.trim()}” is in the dropdown now.`);
    reset();
    onChanged();
  };

  const remove = async (sceneId: string, sceneLabel: string) => {
    setError(''); setNote('');
    const { data, error: rpcErr } = await supabase.rpc('admin_delete_pinaka_scene', { p_id: sceneId });
    const failure = rpcErr?.message || (data && typeof data === 'object' && 'error' in data ? String(data.error) : '');
    if (failure) { setError(failure); return; }
    const undressed = data && typeof data === 'object' && 'challenges_undressed' in data
      ? Number(data.challenges_undressed) : 0;
    setNote(undressed > 0
      // Said plainly: the cascade is silent, and an organiser deleting a
      // scene mid-event should know what it took with it.
      ? `“${sceneLabel}” is gone. ${undressed} challenge${undressed === 1 ? '' : 's'} went back to the ordinary card.`
      : `“${sceneLabel}” is gone.`);
    onChanged();
  };

  const canSave = !!art && !!id && !taken && !busy;

  return (
    <div className="space-y-5">
      <div className="min-w-0">
        <label className="field-label" htmlFor="scene-art">Artwork</label>
        {/* Anything the browser can paint. An organiser picking their own art
            should not be told the file is the wrong kind before it has been
            tried; one that cannot be decoded says so, and says what it is. */}
        <input
          id="scene-art"
          ref={fileRef}
          type="file"
          className="input"
          accept="image/*"
          onChange={e => void pick(e.target.files?.[0])}
          disabled={!!busy}
        />
        <p className="mt-1.5 text-small text-text-muted leading-relaxed">
          A landscape picture, any format your browser can open. It is resized here — up to
          3840 wide, to match the shipped backgrounds on a 4K screen, plus a half-size copy for
          everything else — re-encoded as WebP, and measured for its focal point, its light and
          the card's accent colour. Nothing large crosses the network: a 20 MB export leaves as
          a few hundred KB. A HEIC straight from an iPhone is the one thing browsers cannot
          read; re-export it and it will go through.
        </p>
      </div>

      {busy === 'reading' && (
        <p className="text-small text-text-muted inline-flex items-center gap-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> Reading the picture…
        </p>
      )}

      {art && (
        <div className="rounded-lg border border-border overflow-hidden">
          <img
            src={art.previewUrl}
            alt=""
            className="block w-full h-auto max-h-56 object-cover"
            width={art.width}
            height={art.height}
          />
          <div className="pk-admin-scene-meta px-3 py-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-small text-text-muted">
            <span data-size>{art.width}×{art.height}</span>
            <span data-weight>{Math.round(art.blob.size / 1024)} KB</span>
            <span className="inline-flex items-center gap-1.5">
              accent
              <span
                aria-hidden="true"
                className="inline-block w-3 h-3 rounded-sm border border-border"
                style={{ background: art.accent }}
              />
              <code>{art.accent}</code>
            </span>
            {/* Where the crop will centre. Worth showing: it is the one
                number an organiser can sanity-check by eye, and a picture
                whose subject sits against an edge gets clamped. */}
            <span data-focal>
              focal {Math.round(art.focal.x * 100)}% / {Math.round(art.focal.y * 100)}%
            </span>
            <button type="button" className="btn btn-ghost btn-sm ml-auto" onClick={reset}>
              <X className="w-3.5 h-3.5" aria-hidden="true" /> Clear
            </button>
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="min-w-0">
          <label className="field-label" htmlFor="scene-label">Name</label>
          <input
            id="scene-label" className="input" value={label} maxLength={60}
            onChange={e => setLabel(e.target.value)}
            placeholder="Rama Returns"
          />
          {id && (
            <p className="mt-1.5 text-small text-text-muted">
              id <code>{id}</code>{taken && <span className="text-danger"> — already taken</span>}
            </p>
          )}
        </div>
        <div className="min-w-0">
          <label className="field-label" htmlFor="scene-enter">Card button</label>
          <input
            id="scene-enter" className="input" value={enterLabel} maxLength={40}
            onChange={e => setEnterLabel(e.target.value)}
            placeholder="Come Home"
          />
          <p className="mt-1.5 text-small text-text-muted">What a player clicks to enter the arena.</p>
        </div>
        <div className="min-w-0 md:col-span-2">
          <label className="field-label" htmlFor="scene-intro">Prologue</label>
          <textarea
            id="scene-intro" className="input" rows={2} value={intro} maxLength={400}
            onChange={e => setIntro(e.target.value)}
            placeholder="One or two sentences, shown above the brief."
          />
        </div>
        <div className="min-w-0">
          <label className="field-label" htmlFor="scene-submit">Submit button</label>
          <input
            id="scene-submit" className="input" value={buttonLabel} maxLength={40}
            onChange={e => setButtonLabel(e.target.value)}
            placeholder="Light the Lamps"
          />
          <p className="mt-1.5 text-small text-text-muted">Replaces the ordinary submit wording.</p>
        </div>
      </div>

      {error && <p className="text-small text-danger">{error}</p>}
      {note && <p className="text-small text-success">{note}</p>}

      <div className="flex items-center gap-3">
        <button type="button" className="btn btn-primary btn-sm" onClick={() => void save()} disabled={!canSave}>
          {busy === 'saving'
            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> Adding…</>
            : <><Upload className="w-3.5 h-3.5" aria-hidden="true" /> Add scene</>}
        </button>
        {!art && <span className="text-small text-text-muted">Pick a picture first.</span>}
        {art && !label.trim() && <span className="text-small text-text-muted">Give it a name.</span>}
      </div>

      <div>
        <h4 className="field-label flex items-center gap-2">
          <ImagePlus className="w-3.5 h-3.5" aria-hidden="true" />
          Scenes you have added
        </h4>
        {added.length === 0 ? (
          <p className="text-small text-text-muted">
            None yet. The twelve that ship with the event are always available and cannot be removed.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {added.map(s => (
              <li key={s.id} className="flex items-center gap-3 rounded-md border border-border p-2">
                <img src={s.plate.w960} alt="" className="w-16 h-10 object-cover rounded" width={64} height={40} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{s.label}</span>
                  <code className="text-small text-text-muted">{s.id}</code>
                </span>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm text-danger"
                  onClick={() => void remove(s.id, s.label)}
                >
                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true" /> Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default SceneManager;
