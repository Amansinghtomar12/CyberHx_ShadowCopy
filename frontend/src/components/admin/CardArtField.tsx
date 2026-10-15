/**
 * CardArtField — the picture on a challenge's card.
 *
 * Sits on the challenge form, because that is when an organiser is
 * thinking about this challenge and has its art to hand. One picture, no
 * words: the battle scenes next door carry a name, a line of story and a
 * button's wording and are shared between challenges, which is a lot of
 * furniture for "I want a picture on this card".
 *
 * It uploads as soon as a picture is chosen rather than waiting for the
 * form's Save, because the picture has to exist somewhere before a row can
 * point at it, and an organiser who picks art and then abandons the form
 * has left one orphaned file rather than a half-saved challenge. Clearing
 * it is immediate for the same reason.
 *
 * A challenge that has not been saved yet has no id for a row to key on,
 * so the picture is held until the parent hands one over.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ImagePlus, Loader2, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { prepareArt, type PreparedArt } from '../../themes/pinaka/scenes/prepareArt';

const BUCKET = 'scene-art';

const randomSegment = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(6)), b => b.toString(16).padStart(2, '0')).join('');

export interface CardArtValue {
  url: string;
  halfUrl: string | null;
  width: number;
  height: number;
  focalX: number;
  focalY: number;
  accent: string;
}

interface CardArtFieldProps {
  /** The challenge being edited, or undefined for one not yet saved. */
  challengeId?: string;
  /** Handed up so the form can write the row when it saves a new challenge. */
  onChange: (value: CardArtValue | null) => void;
}

export const CardArtField: React.FC<CardArtFieldProps> = ({ challengeId, onChange }) => {
  const [value, setValue] = useState<CardArtValue | null>(null);
  const [busy, setBusy] = useState<'' | 'reading' | 'uploading'>('');
  const [error, setError] = useState('');
  const prepared = useRef<PreparedArt | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => {
    if (prepared.current) URL.revokeObjectURL(prepared.current.previewUrl);
  }, []);

  // What this challenge already wears, if anything.
  useEffect(() => {
    if (!challengeId) { setValue(null); return; }
    let live = true;
    void (async () => {
      const { data, error: err } = await supabase
        .from('pinaka_challenge_card')
        .select('art_url,art_half_url,art_width,art_height,focal_x,focal_y,accent')
        .eq('challenge_id', challengeId).maybeSingle();
      // An un-migrated database is not an error worth showing mid-edit.
      if (!live || err || !data) return;
      const r = data as Record<string, unknown>;
      setValue({
        url: String(r.art_url),
        halfUrl: (r.art_half_url as string) ?? null,
        width: Number(r.art_width ?? 1920),
        height: Number(r.art_height ?? 1080),
        focalX: Number(r.focal_x ?? 0.5),
        focalY: Number(r.focal_y ?? 0.5),
        accent: String(r.accent ?? '#e3bb66'),
      });
    })();
    return () => { live = false; };
  }, [challengeId]);

  const pick = useCallback(async (file: File | undefined) => {
    if (!file) return;
    setError(''); setBusy('reading');
    try {
      const art = await prepareArt(file);
      if (prepared.current) URL.revokeObjectURL(prepared.current.previewUrl);
      prepared.current = art;

      setBusy('uploading');
      // Both sizes under one folder, so removing the art later means
      // removing one prefix rather than hunting for siblings.
      const folder = `cards/${challengeId ?? 'draft'}/${randomSegment()}`;
      const put = async (blob: Blob, name: string) => {
        const path = `${folder}/${name}.webp`;
        const { error: upErr } = await supabase.storage.from(BUCKET)
          .upload(path, blob, { upsert: false, contentType: 'image/webp', cacheControl: '31536000' });
        if (upErr) throw new Error(upErr.message);
        return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
      };

      const url = await put(art.full.blob, 'full');
      const halfUrl = art.half === art.full ? null : await put(art.half.blob, 'half');

      const next: CardArtValue = {
        url, halfUrl,
        width: art.full.width, height: art.full.height,
        focalX: art.focal.x, focalY: art.focal.y,
        accent: art.accent,
      };
      setValue(next);
      onChange(next);

      // A saved challenge gets its row now; a new one waits for its id.
      if (challengeId) await write(challengeId, next);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That picture could not be used.');
    } finally {
      setBusy('');
    }
  }, [challengeId, onChange]);

  const clear = async () => {
    setValue(null);
    onChange(null);
    if (fileRef.current) fileRef.current.value = '';
    if (challengeId) await write(challengeId, null);
  };

  const sizeLine = prepared.current
    ? `${prepared.current.full.width}×${prepared.current.full.height} · ${Math.round(prepared.current.full.blob.size / 1024)} KB`
    : value ? `${value.width}×${value.height}` : '';

  return (
    <div className="min-w-0">
      <label className="field-label" htmlFor="chal-card-art">Card picture</label>

      {value && (
        <div className="mb-2 overflow-hidden rounded-lg border border-border">
          {/* The band as the card will draw it, not a thumbnail of it. The
              old preview was a fixed strip cropped to fill, which told an
              organiser nothing about what their picture would look like on
              the board -- and for a tall picture it showed a slice of the
              middle and hid that the card shows the whole thing. Same
              rules as the card: the picture's own shape, floored so a
              portrait cannot take the card, the whole picture inside it,
              and the blurred bed filling whatever is left. */}
          <div
            className="relative w-full overflow-hidden"
            style={{ aspectRatio: String(Math.max(value.width / value.height || 1.7778, 1.25)) }}
          >
            <img
              src={value.halfUrl ?? value.url}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 h-full w-full object-cover"
              style={{
                transform: 'scale(1.1)',
                filter: 'blur(16px) saturate(1.15) brightness(0.62)',
                opacity: 0.8,
              }}
            />
            <img
              src={value.halfUrl ?? value.url}
              alt=""
              className="relative z-[1] block h-full w-full object-contain"
            />
          </div>
          <div className="flex items-center gap-3 px-3 py-2 text-small text-text-muted">
            <span>{sizeLine}</span>
            <span className="inline-flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="inline-block h-3 w-3 rounded-sm border border-border"
                style={{ background: value.accent }}
              />
              <code>{value.accent}</code>
            </span>
            <button type="button" className="btn btn-ghost btn-sm ml-auto text-danger" onClick={() => void clear()}>
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Remove
            </button>
          </div>
        </div>
      )}

      <input
        id="chal-card-art"
        ref={fileRef}
        type="file"
        className="input"
        accept="image/*"
        onChange={e => void pick(e.target.files?.[0])}
        disabled={!!busy}
      />

      {busy && (
        <p className="mt-1.5 inline-flex items-center gap-2 text-small text-text-muted">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          {busy === 'reading' ? 'Reading the picture…' : 'Uploading…'}
        </p>
      )}
      {error && <p className="mt-1.5 text-small text-danger">{error}</p>}

      <p className="mt-1.5 text-small text-text-muted leading-relaxed">
        <ImagePlus className="mr-1 inline h-3.5 w-3.5 align-[-2px]" aria-hidden="true" />
        Any format your browser can open. It is resized here — up to 3840 wide for a 4K screen,
        plus a half-size copy for cards — and the focal point and border colour are measured from
        the picture, so the subject survives the crop. The card keeps its category, points and
        title exactly where they are; the picture goes behind them.
      </p>
    </div>
  );
};

/** Writes (or clears) the row. Exported so the form can call it after it
    saves a challenge that had no id when its picture was chosen. */
export async function write(challengeId: string, value: CardArtValue | null): Promise<string | null> {
  const { data, error } = await supabase.rpc('admin_set_challenge_card', {
    p_challenge_id: challengeId,
    p_art_url: value?.url ?? null,
    p_art_half_url: value?.halfUrl ?? null,
    p_art_width: value?.width ?? null,
    p_art_height: value?.height ?? null,
    p_focal_x: value?.focalX ?? 0.5,
    p_focal_y: value?.focalY ?? 0.5,
    p_accent: value?.accent ?? '#e3bb66',
  });
  if (error) return error.message;
  if (data && typeof data === 'object' && 'error' in data) return String((data as { error: unknown }).error);
  return null;
}

export default CardArtField;
