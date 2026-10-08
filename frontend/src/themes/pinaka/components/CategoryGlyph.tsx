/**
 * CategoryGlyph — the ten category marks of the Pinaka theme.
 *
 * A drop-in for the Lucide map in App.tsx: same keys, same contract
 * (`React.ComponentType<{ className?: string }>`), same 24×24 / 1.5 stroke /
 * currentColor idiom, so a chip at `h-3`, a section header at `h-3.5` and the
 * modal all pick these up without a single call site changing. The theme
 * fills the registry in place at boot (`overrideCategoryIcons`); the default
 * skin never sees them.
 *
 * Every glyph is an abstract motif from CATEGORY_MOTIF in config.ts — an
 * aesthetic for a discipline, never a character, a face or an episode. The
 * category id stays the visible label; these only sit beside it.
 *
 * DRAWING RULES
 *   Original geometry, ≤ 6 strokes each, strong silhouette: every mark has to
 *   survive the 12 px chip. Stroke only, round caps and joins, nothing filled,
 *   no text. Decorative, so aria-hidden and unfocusable; the label next to it
 *   carries the meaning.
 *
 * Nothing here animates and nothing here fetches. Props in, pixels out.
 */
import type { ComponentType, ReactNode, SVGProps } from 'react';

/* ── The shared frame ────────────────────────────────────────────────────── */

type GlyphProps = SVGProps<SVGSVGElement>;

/**
 * One frame for all ten so the attributes can never drift between them.
 * `className` lands on the <svg>; Tailwind's `h-3 w-3` then beats the
 * width/height attributes, exactly as it does for Lucide.
 */
function Glyph({ children, ...rest }: GlyphProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

/* ── The ten marks ───────────────────────────────────────────────────────── */

/**
 * web — gateways. Two nested arches on a sill, a keystone at the crown and a
 * clear path through the middle. The web is doors behind doors: every
 * request passes a gateway, every gateway opens onto another.
 */
export function WebGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      {/* outer arch */}
      <path d="M3 21v-9a9 9 0 0 1 18 0v9" />
      {/* inner arch */}
      <path d="M7.5 21v-8.5a4.5 4.5 0 0 1 9 0V21" />
      {/* keystone wedge under the crown */}
      <path d="m10.4 5.6 1.6-2.3 1.6 2.3" />
      {/* the sill, the path runs through */}
      <path d="M2 21h20" />
    </Glyph>
  );
}

/**
 * crypto — cipher. A square turned on its point, a second one nested inside
 * and a knot at the centre: a lattice that only resolves when the pieces
 * are aligned. Interlocking geometry for interlocking keys.
 */
export function CryptoGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      {/* outer lattice */}
      <path d="m12 2 10 10-10 10L2 12z" />
      {/* inner lattice */}
      <path d="m12 7 5 5-5 5-5-5z" />
      {/* the knot: a ring with its key-slot */}
      <circle cx="12" cy="11.4" r="1.9" />
      <path d="M12 13.3v1.6" />
    </Glyph>
  );
}

/**
 * steg — veil. A rail with three draped lines falling from it, and a mark
 * on the right that the last drape half covers. The message is there; the
 * material in front of it is the puzzle.
 */
export function StegGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      {/* the rail */}
      <path d="M3 3h18" />
      {/* three drapes, each with a soft swell; spaced so they stay apart at 12 px */}
      <path d="M4 3c1.6 3.2 1.6 14.8 0 18" />
      <path d="M9 3c1.6 3.2 1.6 14.8 0 18" />
      <path d="M14 3c1.6 3.2 1.6 14.8 0 18" />
      {/* the hidden mark, its left point behind the last drape */}
      <path d="m17.5 9 3 3-3 3-3-3z" />
    </Glyph>
  );
}

/**
 * rev — mechanism. Two concentric rings, each with the same quadrant cut
 * out, and that quadrant lifted away to the top-right so the layers show.
 * Reverse engineering is taking the thing apart to see how it was built.
 */
export function RevGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      {/* outer ring, three quarters */}
      <path d="M12 3a9 9 0 1 0 9 9" />
      {/* inner ring, three quarters */}
      <path d="M12 7.5a4.5 4.5 0 1 0 4.5 4.5" />
      {/* the lifted quadrant, outer and inner */}
      <path d="M14.5 1a8.5 8.5 0 0 1 8.5 8.5" />
      <path d="M14.5 5.5a4 4 0 0 1 4 4" />
      {/* the axle */}
      <circle cx="12" cy="12" r="1.2" />
    </Glyph>
  );
}

/**
 * pwn — edge. An arrow seen from the side: a shaft, a bladed head with its
 * spine, and two sparks off the tip. Precise metal, controlled energy —
 * the one exact input that breaks the thing open.
 */
export function PwnGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      {/* shaft */}
      <path d="M2 12h11" />
      {/* bladed head */}
      <path d="M13 5.5 22 12l-9 6.5z" />
      {/* spine of the blade */}
      <path d="M13 12h9" />
      {/* sparks off the edge */}
      <path d="m18 4.5 1.5-2.5M18 19.5l1.5 2.5" />
    </Glyph>
  );
}

/**
 * forensic — fragments. A lens on a handle and three corner shards drawing
 * in toward it from the edges of the frame: evidence assembling into a
 * picture under magnification.
 */
export function ForensicGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      {/* the lens */}
      <circle cx="11" cy="11" r="5" />
      {/* the handle */}
      <path d="m14.6 14.6 5.4 5.4" />
      {/* three shards converging */}
      <path d="M3 6.5V3h3.5" />
      <path d="M15.5 3H19v3.5" />
      <path d="M3 15.5V19h3.5" />
    </Glyph>
  );
}

/**
 * osint — map. A compass-rose cross with an observation post at its centre,
 * two outlying nodes and the sight lines between them. Open-source
 * intelligence is a network of things seen and the lines that connect them.
 */
export function OsintGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      {/* compass rose */}
      <path d="M12 3v18M3 12h18" />
      {/* the observation post */}
      <circle cx="12" cy="12" r="2.5" />
      {/* two outlying nodes */}
      <circle cx="18.5" cy="5.5" r="1.5" />
      <circle cx="5.5" cy="18.5" r="1.5" />
      {/* sight lines */}
      <path d="m13.8 10.2 3.6-3.6M10.2 13.8l-3.6 3.6" />
    </Glyph>
  );
}

/**
 * mobile — tablet. A slim rounded slab with an arch on two pillars carved
 * into its face, a sill beneath and a speaker slit above. A handheld
 * device drawn in the theme's architectural line.
 */
export function MobileGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      {/* the slab */}
      <rect x="6" y="2" width="12" height="20" rx="2.5" />
      {/* speaker slit */}
      <path d="M10.5 5h3" />
      {/* arch on its pillars */}
      <path d="M9 17v-5a3 3 0 0 1 6 0v5" />
      {/* the sill */}
      <path d="M8.5 17h7" />
    </Glyph>
  );
}

/**
 * b2r — citadel. Three stepped tiers of wall: the base with its gate, the
 * middle tier, and the top tier broken open. A fortified box is taken one
 * layer at a time, and the last one opens to the sky.
 */
export function B2rGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      {/* base wall */}
      <path d="M3 21v-6h18v6" />
      {/* the gate */}
      <path d="M10 21v-2.5a2 2 0 0 1 4 0V21" />
      {/* middle tier */}
      <path d="M6 15v-5h12v5" />
      {/* top tier, opened */}
      <path d="M9 10V5.5h1.5" />
      <path d="M13.5 5.5H15V10" />
    </Glyph>
  );
}

/**
 * misc — celestial. A crescent with two small stars in the dark of its
 * bow: the catch-all category gets the night sky, where the unconventional
 * things live.
 */
export function MiscGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      {/* the crescent: outer limb three quarters round, inner limb back */}
      <path d="M11 4a8 8 0 1 0 8 8 6 6 0 0 1-8-8z" />
      {/* two stars in the dark side */}
      <path d="M19.5 4.25v3.5M17.75 6h3.5" />
      <path d="M14.5 1.75v2.5M13.25 3h2.5" />
    </Glyph>
  );
}

/* ── The map and the pickers ─────────────────────────────────────────────── */

/**
 * Category id → glyph. Keys match `Category` in src/types.ts and the Lucide
 * map in App.tsx one for one, so `overrideCategoryIcons(PINAKA_CATEGORY_ICON)`
 * swaps every chip, header and modal icon in place.
 */
export const PINAKA_CATEGORY_ICON: Record<string, ComponentType<{ className?: string }>> = {
  web: WebGlyph,
  crypto: CryptoGlyph,
  steg: StegGlyph,
  rev: RevGlyph,
  pwn: PwnGlyph,
  forensic: ForensicGlyph,
  osint: OsintGlyph,
  mobile: MobileGlyph,
  b2r: B2rGlyph,
  misc: MiscGlyph,
};

interface CategoryGlyphProps {
  /** A `Category` id; anything unmapped falls back to misc. */
  category: string;
  className?: string;
}

/** The glyph for a category, by id. Unknown ids wear the celestial mark. */
export function CategoryGlyph({ category, className }: CategoryGlyphProps) {
  const Icon = PINAKA_CATEGORY_ICON[category] ?? MiscGlyph;
  return <Icon className={className} />;
}

/**
 * The same glyph at 64 px and 8% opacity, for the corner of a section
 * header. Purely ornamental: it never takes the pointer and never speaks to
 * assistive tech. Position it with `className` (e.g. `absolute right-2 top-0`);
 * the size and opacity are fixed here so every header carries the same weight.
 */
export function CategoryWatermark({ category, className = '' }: CategoryGlyphProps) {
  const Icon = PINAKA_CATEGORY_ICON[category] ?? MiscGlyph;
  return (
    <span
      aria-hidden="true"
      className={`inline-block shrink-0 select-none pointer-events-none ${className}`}
      style={{ width: 64, height: 64, opacity: 0.08 }}
    >
      <Icon className="h-full w-full" />
    </span>
  );
}
