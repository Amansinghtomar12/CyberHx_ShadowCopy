/**
 * ChapterUnlock — the moment a chapter closes and the next one opens.
 *
 * Shown once, when the platform's own solve records say the team has
 * completed a chapter: the organisers' sentence for the chapter just
 * finished, then the name of the one that has opened. The words come from
 * chapters/config.ts verbatim.
 *
 * It is a modal dialog: focus moves to it, Escape and the button close it,
 * and the page behind keeps working the moment it is dismissed. It never
 * gates play — a team that ignores it loses nothing.
 */
import { useEffect, useRef } from 'react';
import type { Chapter } from '../chapters/config';

export interface ChapterUnlockProps {
  /** The chapter the team has just completed. */
  completed: Chapter;
  /** The chapter that has opened, or null when the journey is over. */
  opened: Chapter | null;
  onDismiss: () => void;
}

export default function ChapterUnlock({ completed, opened, onDismiss }: ChapterUnlockProps) {
  const button = useRef<HTMLButtonElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const titleId = 'pk-unlock-title';

  // Focus the one control, and give it back to the page on close. Escape
  // closes, and Tab is kept inside the card while it is open.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    button.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onDismiss();
        return;
      }
      if (e.key !== 'Tab') return;
      const focusable = card.current?.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      previous?.focus?.();
    };
  }, [onDismiss]);

  return (
    <div
      className="pk-unlock"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={e => { if (e.target === e.currentTarget) onDismiss(); }}
    >
      <div className="pk-unlock-card" ref={card}>
        <span className="pk-unlock-eyebrow">Chapter {completed.index} complete</span>
        <h2 className="pk-unlock-done" id={titleId}>
          {completed.title} — {completed.subtitle}
        </h2>

        <p className="pk-unlock-message">{completed.completedMessage}</p>

        {opened && (
          <>
            <hr className="pk-unlock-rule" />
            <span className="pk-unlock-next-label">Chapter {opened.index} opens</span>
            <p className="pk-unlock-next">{opened.title}</p>
            <p className="pk-unlock-next-sub">{opened.subtitle}</p>
          </>
        )}

        <div className="pk-unlock-actions">
          <button type="button" className="btn btn-primary" ref={button} onClick={onDismiss}>
            {opened ? `Enter ${opened.title}` : 'Return to the board'}
          </button>
        </div>
      </div>
    </div>
  );
}
