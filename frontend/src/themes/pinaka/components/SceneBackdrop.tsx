/**
 * The story line for a battle scene — one or two sentences of the
 * organisers' own copy, above the challenge's real description.
 *
 * The scene's painting is not here. While a scene challenge is open the
 * whole page wears it (the environment's plate is swapped to the scene and
 * put back on close), so the dialog only has to carry the words.
 *
 * It is flavour, and is marked as such: the heading is visually hidden
 * rather than absent, so a screen reader hears that this is the scene's
 * prologue and not part of the brief.
 */
import React from 'react';
import type { Scene } from '../scenes/config';

export const SceneIntro: React.FC<{ scene: Scene }> = ({ scene }) => (
  <aside className="pk-scene-intro">
    <h3 className="sr-only">{scene.label} — prologue</h3>
    <p className="pk-scene-intro__eyebrow" aria-hidden="true">{scene.label}</p>
    <p className="pk-scene-intro__line">{scene.intro}</p>
  </aside>
);

export default SceneIntro;
