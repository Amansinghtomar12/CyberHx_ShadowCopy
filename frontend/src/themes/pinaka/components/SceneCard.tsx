/**
 * A Free challenge dressed as its battle scene.
 *
 * The card is the arena door. Closed, it shows the scene's name and a call
 * to arms; the challenge's own title sits under it in small type, because
 * a player still has to be able to find a particular challenge on a board
 * of twelve. Opening it turns the card over and hands the scene to the
 * whole page — the site's background becomes the painting — and the
 * ordinary challenge dialog opens on top of it, unchanged.
 *
 * The flip is a real rotation rather than a crossfade so the two faces
 * read as one object turning: the back is what the player is looking
 * *through* once the arena is open, and it stays legible behind the
 * dialog. Under `prefers-reduced-motion` the rotation is dropped and the
 * faces simply swap.
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
  /** True while this card's challenge is the one open on screen. */
  open: boolean;
  /** Receives the card's viewport-centre offset, for the dialog to grow from. */
  onEnter: (origin: { x: number; y: number } | null) => void;
}

export const SceneCard: React.FC<SceneCardProps> = ({
  scene, title, category, points, solvedCount, difficulty, isSolved, open, onEnter,
}) => {
  const ref = React.useRef<HTMLDivElement>(null);

  const enter = () => {
    const el = ref.current;
    if (!el) { onEnter(null); return; }
    const r = el.getBoundingClientRect();
    onEnter({
      x: r.left + r.width / 2 - window.innerWidth / 2,
      y: r.top + r.height / 2 - window.innerHeight / 2,
    });
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
        <div className="pk-scenecard__face pk-scenecard__front">
          <div className="pk-scenecard__head">
            <span className="pk-scenecard__cat">{category}</span>
            {isSolved && <Check className="h-4 w-4 text-cyber-neon" aria-hidden="true" />}
          </div>

          <h3 className="pk-scenecard__scene">{scene.label}</h3>
          {/* The real challenge name, so the board stays navigable. */}
          <p className="pk-scenecard__title">{title}</p>

          <div className="pk-scenecard__foot">
            <span className="pk-scenecard__pts">
              <span className="pk-scenecard__ptsnum">{points}</span> pts
            </span>
            {difficulty && <span className="pk-scenecard__diff">{difficulty}</span>}
            {solvedCount > 0 && (
              <span className="pk-scenecard__solves">{solvedCount}★</span>
            )}
          </div>

          <button type="button" className="pk-scenecard__enter" onClick={enter}>
            {isSolved ? 'Return to the field' : scene.enterLabel}
          </button>
        </div>

        {/* ── open: what the player looks through ────────────────────── */}
        <div className="pk-scenecard__face pk-scenecard__back" aria-hidden="true">
          <p className="pk-scenecard__backeyebrow">{scene.label}</p>
          <p className="pk-scenecard__backline">{scene.intro}</p>
        </div>
      </div>
    </div>
  );
};

export default SceneCard;
