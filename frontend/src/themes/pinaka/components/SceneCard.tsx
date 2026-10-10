/**
 * A Free challenge dressed as its battle scene.
 *
 * The card is the arena door, and it opens in three beats rather than
 * two. Closed, it is the scene and nothing else: a name, a call to arms,
 * and the numbers a player needs to choose between arenas. Answering the
 * call turns the card over, hands the scene to the whole page, and
 * reveals what actually waits inside — the challenge's real name — with
 * no brief yet. Reading the brief is a third, separate press.
 *
 * Holding the real name back is the point: a closed arena should be a
 * decision about the scene, not a disguised challenge list. The cost is
 * that a player hunting one challenge by name has to enter to find it;
 * search still matches the hidden title, so the card is findable even
 * while it is not readable.
 *
 * Being in the arena and reading the brief are two different things. The
 * dialog can be dismissed (Escape, its close button, the scrim) without
 * leaving: the card stays turned, the page keeps the painting, and this
 * face is what the player is left looking at — the scene they came for,
 * with the brief one press away and the way out beside it. Only "Take
 * rest" folds the card and gives the chapter's sky back.
 *
 * The flip is a real rotation rather than a crossfade so the two faces
 * read as one object turning. Under `prefers-reduced-motion` the rotation
 * is dropped and the faces simply swap.
 *
 * Nothing here gates anything. A Free challenge is free: this is the same
 * challenge, the same scoring, the same flag, in different clothes.
 */
import React from 'react';
import { Check } from 'lucide-react';
import type { Scene } from '../scenes/config';

export interface SceneCardProps {
  scene: Scene;
  title: string;
  category: string;
  points: number;
  solvedCount: number;
  /** Kept alongside the scene so the board stays as scannable as before. */
  difficulty?: string;
  isSolved: boolean;
  /** True while this card's arena is the one the page is wearing. */
  open: boolean;
  /** True while the brief is also on screen, covering this face. */
  briefOpen: boolean;
  /** Receives the card's viewport-centre offset, for the dialog to grow from. */
  onEnter: (origin: { x: number; y: number } | null) => void;
  /** Bring the brief back without leaving the arena. */
  onResume: (origin: { x: number; y: number } | null) => void;
  /** Fold the card and give the chapter's sky back. */
  onLeave: () => void;
}

export const SceneCard: React.FC<SceneCardProps> = ({
  scene, title, category, points, solvedCount, difficulty, isSolved,
  open, briefOpen, onEnter, onResume, onLeave,
}) => {
  const ref = React.useRef<HTMLDivElement>(null);

  const origin = () => {
    const el = ref.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      x: r.left + r.width / 2 - window.innerWidth / 2,
      y: r.top + r.height / 2 - window.innerHeight / 2,
    };
  };

  return (
    <div
      ref={ref}
      className="pk-scenecard"
      data-open={open ? '1' : undefined}
      style={{ ['--pk-scene-accent' as string]: scene.accent }}
    >
      <div className="pk-scenecard__inner">
        {/* ── closed: the arena door ─────────────────────────────────── */}
        <div className="pk-scenecard__face pk-scenecard__front" aria-hidden={open}>
          <div className="pk-scenecard__head">
            <span className="pk-scenecard__cat">{category}</span>
            {isSolved && <Check className="h-4 w-4 text-cyber-neon" aria-hidden="true" />}
          </div>

          <h3 className="pk-scenecard__scene">{scene.label}</h3>
          {/* The real challenge name is deliberately not here. A closed
              arena is the scene and nothing else; learning what actually
              waits inside is what entering buys. */}

          <div className="pk-scenecard__foot">
            <span className="pk-scenecard__pts">
              <span className="pk-scenecard__ptsnum">{points}</span> pts
            </span>
            {difficulty && <span className="pk-scenecard__diff">{difficulty}</span>}
            {solvedCount > 0 && (
              <span className="pk-scenecard__solves">{solvedCount}★</span>
            )}
          </div>

          <button
            type="button"
            className="pk-scenecard__enter"
            onClick={() => onEnter(origin())}
            tabIndex={open ? -1 : undefined}
          >
            {isSolved ? 'Return to the field' : scene.enterLabel}
          </button>
        </div>

        {/* ── open: standing in the arena ─────────────────────────────
            Hidden from assistive tech while the brief is up, because the
            dialog is the thing being read then; it becomes the live
            content again the moment the brief is dismissed. */}
        <div className="pk-scenecard__face pk-scenecard__back" aria-hidden={!open || briefOpen}>
          <p className="pk-scenecard__backeyebrow">{scene.label}</p>
          {/* The reveal: what this arena actually holds. */}
          <h3 className="pk-scenecard__reveal">{title}</h3>
          <p className="pk-scenecard__backline">{scene.intro}</p>

          <div className="pk-scenecard__backacts">
            <button
              type="button"
              className="pk-scenecard__enter pk-scenecard__brief"
              onClick={() => onResume(origin())}
              tabIndex={open && !briefOpen ? undefined : -1}
            >
              Open the brief
            </button>
            <button
              type="button"
              className="pk-scenecard__leave"
              onClick={onLeave}
              tabIndex={open && !briefOpen ? undefined : -1}
            >
              Take rest
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SceneCard;
