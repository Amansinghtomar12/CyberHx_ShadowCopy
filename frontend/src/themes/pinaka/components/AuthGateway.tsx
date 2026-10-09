/**
 * AuthGateway — the hero column of the sign-in page under the event skin.
 *
 * WHAT IT IS
 *   A palace entrance, drawn in stone and a few lines of light: two slender
 *   pillars at the column's edges, a shallow arch spanning the top with a
 *   keystone, a horizon with a soft dawn behind it and four small lamps at
 *   the capitals. Inside the gate, the title lockup and the facts of the
 *   event, every one of them from config.ts. At the foot, the organiser and
 *   partner recognition.
 *
 * WHAT IT IS NOT
 *   A dashboard. No stat tiles, no "LIVE" claims, no uptime, nothing the
 *   server did not say. It is also never a gate in the other sense: the
 *   whole composition is aria-hidden and pointer-transparent, and it lives
 *   in the hero cell only (hidden below lg by the page), so the card, the
 *   form, Turnstile and the Google button are exactly what they were.
 *
 * DRAWING
 *   Three inline SVGs with preserveAspectRatio="none" so the pillars take
 *   the column's full height and the arch its full width whatever the
 *   viewport. Only horizontal and vertical geometry stretches, and every
 *   stroke is non-scaling, so nothing reads as distorted. The sun and the
 *   lamps are CSS gradients (no filters). Styles in styles/gateway.css.
 *
 * THE PLATE
 *   Behind the stone, the hero photograph (assets/plates: Hampi at dusk, the
 *   Virupaksha tower lower-left): a same-origin <img> covering the column,
 *   positioned on the plate's focal point, clipped to the column and
 *   feathered at its edges so it never reads as a pasted rectangle. Two dark
 *   gradients lie over it, from the top and from the left, where the words
 *   are: the lockup, the taglines and the fact rows measure >= 4.5:1 against
 *   whatever the photograph puts behind them (see docs/pinaka/TEST_RESULTS).
 *   On the high tier only, the image drifts once: scale 1.06 -> 1 over 40 s,
 *   transform only, and the will-change is dropped when it ends. Nothing
 *   moves under reduced motion or on the 'still' tier. The form column is
 *   untouched: the plate is absolute inside this column and sizes nothing.
 */
import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { getCapability } from '../../../components/environment/performance';
import { PINAKA_EVENT } from '../config';
import { useMediaQuery } from '../hooks';
import { PLATES } from '../assets/plates';
import { plateFocal, plateSource } from '../assets/plates/sources';
import { PINAKA_IMAGES } from '../assets/images';
import { Eyebrow } from './BowMotifs';
import PartnerStrip from './PartnerStrip';

/** Reduced motion from either source: the OS preference or the player's dial. */
function useStill(): boolean {
  const reduce = useReducedMotion() ?? false;
  return reduce || getCapability().tier === 'still';
}

/* ── Plate: the photograph behind the gate ──────────────────────────────── */
/** AuthPage shows the hero column from Tailwind's `lg` breakpoint (64rem). */
const HERO_SHOWN = '(min-width: 64rem)';
/** The archer and the wheel beside the title need the column at its widest. */
const FIGURES_SHOWN = '(min-width: 80rem)';

/**
 * Decorative (alt="", aria-hidden), never draggable, decoded off the main
 * thread, fetched eagerly because it is the first thing on the page. It
 * fades in once loaded (the attribute, so a cached image that completed
 * before React listened still counts); the drift runs once, on the high
 * tier, and the animation and its will-change are dropped when it ends.
 * On a phone the whole hero column is display:none, which does not stop a
 * browser fetching an eager <img> inside it, so the image is only rendered
 * where the column is shown.
 */
function HeroPlate({ still }: { still: boolean }) {
  const plate = PLATES.hero;
  const shown = useMediaQuery(HERO_SHOWN);
  const source = plateSource(plate);
  const focal = plateFocal(plate);
  const img = useRef<HTMLImageElement>(null);
  const [ready, setReady] = useState(false);
  const [drifted, setDrifted] = useState(false);
  const drift = !still && getCapability().tier === 'high';

  useEffect(() => {
    const el = img.current;
    if (el && el.complete && el.naturalWidth > 0) setReady(true);
  }, [shown]);

  return (
    <div
      className="pk-gateway-plate"
      aria-hidden="true"
      data-ready={ready ? 'true' : 'false'}
      data-drift={drift ? (drifted ? 'done' : 'on') : 'off'}
    >
      {shown && <img
        ref={img}
        src={source.src}
        srcSet={source.srcSet}
        sizes={source.sizes}
        width={plate.width}
        height={plate.height}
        alt=""
        aria-hidden="true"
        draggable={false}
        decoding="async"
        loading="eager"
        fetchPriority="high"
        style={{ objectPosition: focal, transformOrigin: focal }}
        onLoad={() => setReady(true)}
        onAnimationEnd={() => setDrifted(true)}
      />}
    </div>
  );
}

/* ── Pillar: shaft, three flutes, stepped capital, stepped base ─────────── */
/* viewBox 60 wide × 1000 tall; the component stretches it to the column. */
function Pillar({ side }: { side: 'left' | 'right' }) {
  return (
    <svg
      className="pk-gateway-pillar"
      data-side={side}
      viewBox="0 0 60 1000"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      {/* abacus and capital: slabs that widen toward the arch */}
      <rect className="pk-gateway-stone is-light" x="6" y="40" width="48" height="10" vectorEffect="non-scaling-stroke" />
      <rect className="pk-gateway-stone" x="10" y="50" width="40" height="12" vectorEffect="non-scaling-stroke" />
      <rect className="pk-gateway-stone" x="15" y="62" width="30" height="10" vectorEffect="non-scaling-stroke" />
      {/* a carved band under the capital */}
      <line className="pk-gateway-line is-faint" x1="18" y1="84" x2="42" y2="84" vectorEffect="non-scaling-stroke" />
      {/* shaft */}
      <rect className="pk-gateway-stone is-shaft" x="20" y="72" width="20" height="878" vectorEffect="non-scaling-stroke" />
      {/* flutes: light catches the centre one */}
      <line className="pk-gateway-line is-faint" x1="25" y1="92" x2="25" y2="940" vectorEffect="non-scaling-stroke" />
      <line className="pk-gateway-line" x1="30" y1="92" x2="30" y2="940" vectorEffect="non-scaling-stroke" />
      <line className="pk-gateway-line is-faint" x1="35" y1="92" x2="35" y2="940" vectorEffect="non-scaling-stroke" />
      {/* base: the capital, mirrored and heavier */}
      <rect className="pk-gateway-stone" x="15" y="950" width="30" height="10" vectorEffect="non-scaling-stroke" />
      <rect className="pk-gateway-stone" x="10" y="960" width="40" height="12" vectorEffect="non-scaling-stroke" />
      <rect className="pk-gateway-stone is-light" x="6" y="972" width="48" height="12" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/* ── Arch: a shallow double curve with a keystone and voussoir ticks ────── */
/* viewBox 600 × 140; the ends rest on the pillars' abaci. */
const ARCH_OUTER = 'M0 132 C 120 44, 480 44, 600 132';
const ARCH_INNER = 'M14 134 C 130 60, 470 60, 586 134';
/* Ticks: short radial marks between the two curves, the voussoirs of the arch.
   Positions are sampled along the outer curve; angles approximate its normal. */
const TICKS: readonly { x: number; y: number; dx: number; dy: number }[] = [
  { x: 60, y: 97, dx: 6, dy: 9 },
  { x: 120, y: 76, dx: 4, dy: 10 },
  { x: 180, y: 64, dx: 3, dy: 10 },
  { x: 240, y: 58, dx: 1, dy: 10 },
  { x: 360, y: 58, dx: -1, dy: 10 },
  { x: 420, y: 64, dx: -3, dy: 10 },
  { x: 480, y: 76, dx: -4, dy: 10 },
  { x: 540, y: 97, dx: -6, dy: 9 },
];

function Arch() {
  return (
    <svg
      className="pk-gateway-arch"
      viewBox="0 0 600 140"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      {/* the haze under the outer line: the same curve, wide and faint */}
      <path className="pk-gateway-arch-haze" d={ARCH_OUTER} vectorEffect="non-scaling-stroke" />
      <path className="pk-gateway-arch-line" d={ARCH_OUTER} vectorEffect="non-scaling-stroke" />
      <path className="pk-gateway-arch-line is-inner" d={ARCH_INNER} vectorEffect="non-scaling-stroke" />
      {TICKS.map(t => (
        <line
          key={t.x}
          className="pk-gateway-line is-faint"
          x1={t.x} y1={t.y} x2={t.x + t.dx} y2={t.y + t.dy}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {/* keystone: a slab at the apex, lit from above */}
      <path className="pk-gateway-stone is-light" d="M286 44 L314 44 L318 70 L282 70 Z" vectorEffect="non-scaling-stroke" />
      <line className="pk-gateway-line" x1="300" y1="30" x2="300" y2="44" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

const FACTS: readonly { label: string; value: string }[] = [
  { label: 'Qualifier', value: PINAKA_EVENT.qualifier.label },
  { label: 'Organised by', value: PINAKA_EVENT.organiser },
  { label: 'Platform', value: PINAKA_EVENT.platformLine },
];

export default function AuthGateway() {
  const reduce = useReducedMotion();
  const still = useStill();
  const figures = useMediaQuery(FIGURES_SHOWN);
  const ease = [0.22, 1, 0.36, 1] as const;

  return (
    <div className="pk-gateway relative flex flex-1 flex-col" data-still={still ? 'true' : undefined}>
      {/* ── The photograph, under everything, clipped to this column ── */}
      <HeroPlate still={still} />

      {/* ── The entrance: all decoration, none of it reachable ── */}
      <div className="pk-gateway-scene" aria-hidden="true">
        <span className="pk-gateway-sun" />
        <span className="pk-gateway-horizon" />
        <Pillar side="left" />
        <Pillar side="right" />
        <Arch />
        <span className="pk-gateway-lamp" data-pos="l1" />
        <span className="pk-gateway-lamp" data-pos="l2" />
        <span className="pk-gateway-lamp" data-pos="r1" />
        <span className="pk-gateway-lamp" data-pos="r2" />
        {/* Only where the column is wide enough to hold them beside the title,
            so a narrower screen never fetches the two images at all. */}
        {figures && <>
          <img
            className="pk-gateway-wheel"
            src={PINAKA_IMAGES.wheelEmblem.small}
            alt=""
            aria-hidden="true"
            draggable={false}
            loading="eager"
            decoding="async"
          />
          <img
            className="pk-gateway-archer"
            src={PINAKA_IMAGES.archer.large}
            alt=""
            aria-hidden="true"
            draggable={false}
            loading="eager"
            decoding="async"
          />
        </>}
      </div>

      {/* ── Inside the gate ── */}
      <div className="pk-gateway-body relative flex flex-1 flex-col">
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease, delay: reduce ? 0 : 0.1 }}
        >
          <Eyebrow>The Gateway to Ayodhya</Eyebrow>

          <div className="pk-gateway-lockup">
            <span className="pk-gateway-deva" lang="hi">{PINAKA_EVENT.devanagari}</span>
            <h1 className="pk-gateway-name pk-foil-text">PINAKA</h1>
            <span className="pk-gateway-edition">CTF 2026</span>
          </div>

          <p className="pk-gateway-tagline">{PINAKA_EVENT.tagline}</p>
          <p className="pk-gateway-tagline is-secondary">{PINAKA_EVENT.taglineSecondary}</p>
        </motion.div>

        <motion.dl
          className="pk-gateway-facts"
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease, delay: reduce ? 0 : 0.28 }}
        >
          {FACTS.map(f => (
            <div key={f.label} className="pk-gateway-fact">
              <dt className="label-micro">{f.label}</dt>
              <dd className="text-small text-text-primary">{f.value}</dd>
            </div>
          ))}
        </motion.dl>

        {/* The organiser and the partners, at the foot of the gate. */}
        <motion.div
          className="mt-auto pt-8"
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, ease, delay: reduce ? 0 : 0.45 }}
        >
          <PartnerStrip variant="gateway" />
        </motion.div>
      </div>
    </div>
  );
}
