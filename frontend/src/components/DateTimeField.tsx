// src/components/DateTimeField.tsx
//
// A datetime-local input that behaves the way people expect, and that stores
// the instant the organiser actually meant.
//
// TWO PROBLEMS WITH THE BARE INPUT
//
// 1. The picker barely opens. Chrome only shows the calendar when you hit the
//    small icon at the right edge; clicking the text just drops a caret into
//    whichever segment you happened to land on. So people type dates digit by
//    digit into a masked field, which is exactly where dd/mm and mm/dd
//    mistakes come from. showPicker() opens the real picker from a click
//    anywhere in the field.
//
// 2. It silently shifted the event by the UTC offset. A datetime-local input
//    yields a naive string with no zone -- "2026-09-18T10:00". That went
//    straight into a timestamptz column, so Postgres read it as UTC. An
//    organiser in IST setting a 10:00 start actually scheduled 15:30 IST.
//    Five and a half hours is the difference between a CTF that opens on time
//    and one that opens after half the field has given up.
//
//    This converts both ways instead: local wall-clock in, UTC instant out,
//    and back again for display. The preview line under the field spells out
//    the resolved date, time and zone, so the value can be checked before it
//    is saved rather than discovered during the event.

import React, { useRef } from 'react';
import { CalendarClock } from 'lucide-react';

interface DateTimeFieldProps {
  id: string;
  label: string;
  /** ISO 8601 instant from the database (timestamptz), or null/'' when unset. */
  value: string | null | undefined;
  /** Receives a full ISO instant, or null when the field is cleared. */
  onChange: (isoOrNull: string | null) => void;
  hint?: string;
}

/** DB instant -> the "YYYY-MM-DDTHH:mm" local wall-clock the input wants. */
function toLocalInputValue(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  // Shift by the offset so toISOString yields local wall-clock, then trim the
  // seconds and zone the input will not accept.
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

/** Local wall-clock from the input -> the ISO instant it denotes. */
function toIsoInstant(localValue: string): string | null {
  if (!localValue) return null;
  // new Date("YYYY-MM-DDTHH:mm") parses as LOCAL time, which is the whole point.
  const d = new Date(localValue);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export default function DateTimeField({
  id, label, value, onChange, hint,
}: DateTimeFieldProps) {
  const ref = useRef<HTMLInputElement>(null);

  // showPicker throws without user activation and is missing on older
  // browsers; either way the field still works as a normal input.
  const openPicker = () => {
    const el = ref.current as (HTMLInputElement & { showPicker?: () => void }) | null;
    try { el?.showPicker?.(); } catch { /* fall back to typing */ }
  };

  const local = toLocalInputValue(value);

  let preview: string | null = null;
  if (value) {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) {
      const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      preview = `${d.toLocaleString(undefined, {
        weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })}${zone ? ` · ${zone}` : ''}`;
    }
  }

  return (
    <div className="min-w-0">
      <label className="field-label" htmlFor={id}>{label}</label>
      <div className="relative">
        <input
          ref={ref}
          id={id}
          type="datetime-local"
          value={local}
          onChange={e => onChange(toIsoInstant(e.target.value))}
          onClick={openPicker}
          className="input w-full cursor-pointer pr-10"
        />
        <button
          type="button"
          onClick={openPicker}
          tabIndex={-1}
          aria-label={`Open calendar for ${label}`}
          className="absolute right-2 top-1/2 -translate-y-1/2 grid place-items-center
                     w-7 h-7 rounded-inset text-text-muted hover:text-cyber-neon
                     transition-colors"
        >
          <CalendarClock className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
      {preview ? (
        <p className="text-small text-text-muted mt-1">
          <span className="text-cyber-text">{preview}</span>
        </p>
      ) : (
        <p className="text-small text-text-muted mt-1">
          {hint ?? 'Click the field to open the calendar.'}
        </p>
      )}
    </div>
  );
}
