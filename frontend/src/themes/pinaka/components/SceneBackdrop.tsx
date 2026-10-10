/**
 * The battle scene behind a Free challenge.
 *
 * Two pieces, both purely decorative and both `aria-hidden`: the picture
 * itself, and the scrim that makes text on top of it readable. The scrim
 * is not a nicety — the art is a full-contrast painting, and the dialog's
 * body copy, flag field and hint prices all have to stay legible on it, so
 * the image never appears without it.
 *
 * The picture is a real <img> rather than a CSS background so it can be
 * lazy and async-decoded, and so the browser picks one file off `srcset`
 * instead of fetching the widest and throwing most of it away.
 */
import React from 'react';
import { SCENE_ART, sceneSrcSet, type Scene } from '../scenes/config';

export interface SceneBackdropProps {
  scene: Scene;
}

export const SceneBackdrop: React.FC<SceneBackdropProps> = ({ scene }) => (
  <div className="pk-scene-bg" aria-hidden="true">
    <img
      className="pk-scene-bg__img"
      src={SCENE_ART[scene.id].w1000}
      srcSet={sceneSrcSet(scene.id)}
      /* The dialog is at most 42rem wide, so never fetch the 1600 for it
         on a phone; above that the picture is what the width buys. */
      sizes="(max-width: 48rem) 100vw, 42rem"
      alt=""
      loading="lazy"
      decoding="async"
      draggable={false}
    />
    <div className="pk-scene-bg__scrim" />
  </div>
);

/**
 * The story line for a scene — one or two sentences of the organisers'
 * own copy, above the challenge's real description.
 *
 * It is flavour, so it is marked as such: the heading is visually hidden
 * rather than absent, so a screen reader hears that this is the scene's
 * prologue and not part of the brief.
 */
export const SceneIntro: React.FC<{ scene: Scene }> = ({ scene }) => (
  <aside className="pk-scene-intro">
    <h3 className="sr-only">{scene.label} — prologue</h3>
    <p className="pk-scene-intro__eyebrow" aria-hidden="true">{scene.label}</p>
    <p className="pk-scene-intro__line">{scene.intro}</p>
  </aside>
);

export default SceneBackdrop;
