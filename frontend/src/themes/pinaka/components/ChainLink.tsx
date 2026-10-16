/**
 * The link between two cards of a chapter's chain.
 *
 * Six chapters, six links. The organisers' drawings do not just recolour
 * the chain as the story moves — Ayodhya's is a plain ring and Lanka's is
 * a molten thing with spikes — so the shape is part of what tells a player
 * where they are, and recolouring one glyph would have thrown that away.
 *
 * Each is a 20×20 stroke drawing on the chapter's own accents, which the
 * parent sets as custom properties. Lit means both ends are solved: the
 * same rule the steel chain uses for an ignited segment, and the only
 * state this file has.
 *
 * Stroke, not fill, so the painting behind the board reads through the
 * link exactly as it reads through everything else under this skin.
 */
import React from 'react';
import type { ChapterId } from '../chapters/config';

/** What each chapter's link is made of, drawn in a 20×20 box. */
const SHAPES: Record<ChapterId, React.ReactNode> = {
  // Ayodhya — a plain court ring. Nothing has been forged yet.
  ayodhya: <circle cx="10" cy="10" r="5.4" />,

  // Mithila — the bow's lens, standing upright on its string.
  mithila: (
    <>
      <path d="M10 3.4c3.6 3 3.6 10.2 0 13.2-3.6-3-3.6-10.2 0-13.2z" />
      <path d="M10 3.4v13.2" strokeWidth="1" opacity="0.55" />
    </>
  ),

  // Vanvaas — a forest leaf, with its midrib.
  vanvaas: (
    <>
      <path d="M10 3.2c4.2 2.4 5.2 8.2 0 13.6-5.2-5.4-4.2-11.2 0-13.6z" />
      <path d="M10 6v8.2" strokeWidth="1" opacity="0.55" />
    </>
  ),

  // Kishkindha — a forged oval, the first link an alliance makes.
  kishkindha: (
    <>
      <rect x="3.2" y="5.6" width="13.6" height="8.8" rx="4.4" />
      <rect x="6" y="8" width="8" height="4" rx="2" strokeWidth="1" opacity="0.5" />
    </>
  ),

  // Setu Bandhan — a dressed stone of the causeway.
  setu: (
    <path d="M6.4 3.6h7.2l3 3v6.8l-3 3H6.4l-3-3V6.6l3-3z" />
  ),

  // Lanka — the same ring, run molten and throwing sparks.
  lanka: (
    <>
      <circle cx="10" cy="10" r="4.6" />
      <path d="M10 1.8v2.6M10 15.6v2.6M1.8 10h2.6M15.6 10h2.6" strokeWidth="1.4" />
      <path d="M4.4 4.4l1.6 1.6M14 14l1.6 1.6M15.6 4.4L14 6M6 14l-1.6 1.6" strokeWidth="1" opacity="0.7" />
    </>
  ),
};

export const ChainLink: React.FC<{ chapter: ChapterId; lit: boolean }> = ({ chapter, lit }) => (
  <svg
    className="pk-chapchain__node"
    data-lit={lit ? '1' : undefined}
    viewBox="0 0 20 20"
    width="20"
    height="20"
    fill="none"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    {SHAPES[chapter]}
  </svg>
);

export default ChainLink;
