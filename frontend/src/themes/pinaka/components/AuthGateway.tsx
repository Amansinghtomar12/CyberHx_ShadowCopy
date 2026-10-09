/**
 * AuthGateway — the sign-in page's event art under the skin.
 *
 * WHAT IT IS
 *   From lg up (part="hero", the default), the hero column: a palace
 *   entrance opening onto the event's own painting. Two slender stone pillars
 *   at the column's edges, a shallow arch with a keystone and four lamps;
 *   through the gate, the official artwork (the temple city at sunset, drawn
 *   by the environment layer behind the whole page) in full colour. Inside
 *   the gate, in the official art's own colours:
 *     · the title lockup, with the bronze dharma wheel turning slowly beside
 *       "PINAKA";
 *     · the taglines and the "Register now" plate, a real button that opens
 *       the card's Register tab;
 *     · the facts of the event, every one of them from config.ts;
 *     · the archer on his rock at the foot of the gate, looking in toward
 *       the words, and the glowing scroll as a small framed relic, wherever
 *       the first screen has room left for it under the facts;
 *     · at the very foot, the organiser and partner recognition.
 *   Below lg the page hides that column, and the phone's sign-in carries two
 *   small pieces of the same art instead: part="emblem", the bronze wheel
 *   over the title, and part="register", the Register plate under the card
 *   while the Sign-in tab is showing and registration is open.
 *
 * WHAT IT IS NOT
 *   A dashboard. No stat tiles, no "LIVE" claims, nothing the server did not
 *   say. All the drawing is aria-hidden and pointer-transparent, so the card,
 *   the form, Turnstile and the Google button are exactly what they were. The
 *   one control, the Register plate, only does what the card's own Register
 *   tab does, and is never drawn where the page cannot take that action.
 *
 * READABILITY
 *   The painting behind is bright in places (god-rays, the lit lake). A veil
 *   of feathered dark gradients sits between it and the words, heaviest under
 *   the lockup, the taglines and the facts, open toward the archer; the facts
 *   stand on their own dark tablet. Every line of text measures >= 4.5:1.
 *
 * MOTION
 *   Transform and opacity only. The wheel turns once every 150 s; the lamps
 *   breathe; the art fades and rises in once. Nothing moves under reduced
 *   motion or on the 'still' tier (the player's motion dial, read live): the
 *   resting composition is the complete picture.
 *
 * WHAT IT FETCHES
 *   Only what is shown. Each part renders nothing at the widths where the
 *   page would hide it (a display:none parent does not stop an eager <img>
 *   from being fetched), the relic and the phone's plate load lazily (the
 *   relic's slot is display:none where the first screen has no room for
 *   it), and every picture carries a smaller file for the size it is drawn at.
 *
 * DRAWING
 *   Two inline SVGs with preserveAspectRatio="none" so the pillars take the
 *   column's full height and the arch its full width whatever the viewport.
 *   Only horizontal and vertical geometry stretches, and every stroke is
 *   non-scaling, so nothing reads as distorted. Styles in styles/gateway.css.
 */
import { useEffect, useRef, useState, type ImgHTMLAttributes } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { getCapability } from '../../../components/environment/performance';
import { subscribeFx } from '../../../components/environment/fx';
import { PINAKA_EVENT } from '../config';
import { useMediaQuery } from '../hooks';
import { PINAKA_IMAGES } from '../assets/images';
import { Eyebrow } from './BowMotifs';
import PartnerStrip from './PartnerStrip';

/**
 * Reduced motion from either source: the OS preference or the player's dial.
 * The dial can be flipped on this very page (the motion toggle in the
 * corner), so the answer is re-read whenever it changes.
 */
function useStill(): boolean {
  const reduce = useReducedMotion() ?? false;
  const [dialStill, setDialStill] = useState(() => getCapability().tier === 'still');
  useEffect(() => subscribeFx(() => setDialStill(getCapability().tier === 'still')), []);
  return reduce || dialStill;
}

/** AuthPage shows the hero column from Tailwind's `lg` breakpoint (64rem). */
const HERO_SHOWN = '(min-width: 64rem)';

/** The accessible name of the Register plate, wherever it is drawn. */
const REGISTER_LABEL = 'Register for Pinaka CTF 2026';

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

/** Every decorative image here: no name, never dragged, decoded off the main thread. */
const DECOR = { alt: '', 'aria-hidden': true, draggable: false, decoding: 'async' } as const;

/**
 * True once the image can be painted, so it fades in whole (data-ready, see
 * gateway.css). Decoded is the aim: an async decode can land frames after
 * the load, and on a page at rest (reduced motion, the still tier) nothing
 * else may ask for that frame; the state change does. But decode() rejects
 * when the request it waits on is replaced (the srcset choice changing
 * mid-load, on a pixel-ratio or width change) and for a broken file, so it
 * is only ever asked once a request has loaded, and every load event asks
 * again: whichever request completes reveals the picture, decoded or not,
 * and the art can never stay invisible. A file that fails to load stays
 * hidden, which for a decorative picture is the right answer.
 */
function useDecoded() {
  const ref = useRef<HTMLImageElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let live = true;
    const show = () => { if (live) setReady(true); };
    const reveal = () => {
      if (!el.complete || el.naturalWidth === 0) return; // still loading (a load event comes back here) or broken
      if (typeof el.decode === 'function') el.decode().then(show, show);
      else show();
    };
    el.addEventListener('load', reveal);
    reveal(); // already loaded (from the cache) before this effect ran
    return () => {
      live = false;
      el.removeEventListener('load', reveal);
    };
  }, []);
  return [ref, ready] as const;
}

/** A decorative image that fades in once it can be painted (data-ready, see gateway.css). */
function ArtImg(props: Omit<ImgHTMLAttributes<HTMLImageElement>, 'alt'>) {
  const [ref, ready] = useDecoded();
  return <img {...DECOR} {...props} ref={ref} data-ready={ready ? 'true' : 'false'} />;
}

/**
 * The scroll in its gold frame. The frame waits for the picture, so it never
 * shows as an empty gold slab. Lazy: its slot is display:none wherever the
 * first screen has no room left under the facts, and a lazy image that is
 * never laid out is never fetched.
 */
function Relic() {
  const [img, ready] = useDecoded();
  const { small, large } = PINAKA_IMAGES.scrollArt;
  return (
    <span className="pk-gateway-relic-frame" data-ready={ready ? 'true' : 'false'}>
      <img
        {...DECOR}
        ref={img}
        src={small}
        srcSet={`${small} 320w, ${large} 756w`}
        sizes="9.5rem"
        width={320}
        height={433}
        loading="lazy"
      />
    </span>
  );
}

/**
 * Opens the card's Register tab, then takes the player to the first field of
 * the form it opened. Two frames: one for React to commit the tab, one for
 * the field to mount. Centred, so the tab and the heading above it stay in
 * view; a jump rather than a glide when motion is off.
 */
function openRegister(onRegister: (() => void) | undefined, still: boolean) {
  if (!onRegister) return;
  onRegister();
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const field = document.getElementById('auth-username');
    if (!(field instanceof HTMLElement)) return;
    field.focus({ preventScroll: true });
    field.scrollIntoView({ block: 'center', behavior: still ? 'auto' : 'smooth' });
  }));
}

/** The plate's picture: the 600 px file for the ~17rem it is drawn at, the 1140 px one on dense screens. */
function RegisterArt({ loading }: { loading: 'eager' | 'lazy' }) {
  const { small, large } = PINAKA_IMAGES.registerCta;
  return (
    <ArtImg
      src={small}
      srcSet={`${small} 600w, ${large} 1140w`}
      sizes="17rem"
      width={600}
      height={148}
      loading={loading}
    />
  );
}

export interface AuthGatewayProps {
  /**
   * Opens the sign-in card's Register tab. When absent, the Register plate is
   * not drawn: the gateway never offers an action the page cannot take.
   */
  onRegister?: () => void;
  /** False once the server has said registration is closed: the plate goes. */
  registrationOpen?: boolean;
  /** The card's current tab. The plate stands aside while Register is already open. */
  mode?: 'login' | 'register';
  /**
   * Which piece of the page to draw: 'hero' (the default), the hero column,
   * from lg up; below lg, where the page hides that column, 'emblem' (the
   * wheel over the title) and 'register' (the plate under the card). Each
   * renders nothing outside its own widths.
   */
  part?: 'hero' | 'emblem' | 'register';
}

export default function AuthGateway({ part = 'hero', ...props }: AuthGatewayProps = {}) {
  if (part === 'emblem') return <PhoneEmblem />;
  if (part === 'register') return <PhoneRegister {...props} />;
  return <Hero {...props} />;
}

/* ── The phone: a touch of the same art, never in the way of the form ────── */

/**
 * The bronze wheel over the title, 3.5rem across: the size and place of the
 * mark it stands in for, so nothing under it moves. Still: at this size a
 * turn would be a flicker, not a wheel.
 */
function PhoneEmblem() {
  const still = useStill();
  const heroShown = useMediaQuery(HERO_SHOWN);
  if (heroShown) return null;
  const { tiny, small } = PINAKA_IMAGES.wheelEmblem;
  return (
    <span className="pk-auth-emblem" data-still={still ? 'true' : undefined} aria-hidden="true">
      <ArtImg
        src={tiny}
        srcSet={`${tiny} 200w, ${small} 700w`}
        sizes="3.5rem"
        width={200}
        height={200}
        loading="eager"
      />
    </span>
  );
}

/**
 * The Register plate under the card, while the card shows Sign in and the
 * server has not closed registration. Below the fold on a phone, so lazy.
 * Once pressed, the card is on Register and the plate goes (the card's own
 * tab is the way back).
 */
function PhoneRegister({ onRegister, registrationOpen = true, mode }: Omit<AuthGatewayProps, 'part'>) {
  const still = useStill();
  const heroShown = useMediaQuery(HERO_SHOWN);
  if (heroShown || !onRegister || registrationOpen === false || mode === 'register') return null;
  return (
    <motion.div
      className="pk-auth-cta"
      data-still={still ? 'true' : undefined}
      initial={still ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={still ? { duration: 0 } : { duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
      <button
        type="button"
        className="pk-gateway-register"
        aria-label={REGISTER_LABEL}
        onClick={() => openRegister(onRegister, still)}
      >
        <RegisterArt loading="lazy" />
      </button>
    </motion.div>
  );
}

/* ── The hero column, lg and up ──────────────────────────────────────────── */

function Hero({ onRegister, registrationOpen = true, mode }: Omit<AuthGatewayProps, 'part'>) {
  const still = useStill();
  const shown = useMediaQuery(HERO_SHOWN);
  const ease = [0.22, 1, 0.36, 1] as const;
  // Opacity and a short rise, once; the resting state outright when still.
  const enter = (delay: number, y = 10, duration = 0.55) => ({
    initial: still ? false : { opacity: 0, y },
    animate: { opacity: 1, y: 0 },
    transition: still ? { duration: 0 } : { duration, ease, delay },
  });

  // The plate exists while registration is open; on the Register tab it keeps
  // its place (no jump in the column) but is disabled and visibility-hidden,
  // so it is out of sight, out of the tab order and out of the a11y tree.
  const offerRegister = !!onRegister && registrationOpen !== false;
  const registerHidden = mode === 'register';

  // Below lg the page hides this whole column (display: none), and a hidden
  // column still fetches every eager image in it (the archer, the wheel, the
  // Register plate, the partner and institutional marks): about 0.4 MB a phone
  // would download and never see. So below lg nothing is rendered at all; the
  // phone's sign-in has its own two pieces (part="emblem", part="register").
  if (!shown) return null;

  return (
    <div className="pk-gateway relative flex flex-1 flex-col" data-still={still ? 'true' : undefined}>
      {/* ── The veil: darkness under the words, over the painting ── */}
      <div className="pk-gateway-veil" aria-hidden="true" />

      {/* ── The entrance: all decoration, none of it reachable ── */}
      <div className="pk-gateway-scene" aria-hidden="true">
        <Pillar side="left" />
        <Pillar side="right" />
        <Arch />
        <span className="pk-gateway-lamp" data-pos="l1" />
        <span className="pk-gateway-lamp" data-pos="l2" />
        <span className="pk-gateway-lamp" data-pos="r1" />
        <span className="pk-gateway-lamp" data-pos="r2" />
      </div>

      {/* ── Inside the gate ── */}
      <div className="pk-gateway-body relative flex flex-1 flex-col">
        <div className="pk-gateway-stage">
          {/* The art of the first screen. */}
          <div className="pk-gateway-art" aria-hidden="true">
            <motion.div className="pk-gateway-hero" {...enter(0.25, 18, 1.1)}>
              <span className="pk-gateway-aura" />
              <ArtImg
                className="pk-gateway-archer"
                src={PINAKA_IMAGES.archer.large}
                srcSet={`${PINAKA_IMAGES.archer.small} 640w, ${PINAKA_IMAGES.archer.large} 1069w`}
                sizes="32rem"
                width={1069}
                height={1038}
                loading="eager"
              />
            </motion.div>
            <motion.div className="pk-gateway-wheel" {...enter(0.15, 0, 1.2)}>
              <span className="pk-gateway-wheel-halo" />
              <ArtImg
                className="pk-gateway-wheel-img"
                src={PINAKA_IMAGES.wheelEmblem.small}
                width={700}
                height={700}
                loading="eager"
              />
            </motion.div>
          </div>

          <motion.div className="pk-gateway-copy" {...enter(0.1)}>
            <Eyebrow>The Gateway to Ayodhya</Eyebrow>

            <div className="pk-gateway-lockup">
              <span className="pk-gateway-deva" lang="hi">{PINAKA_EVENT.devanagari}</span>
              <h1 className="pk-gateway-name pk-foil-text">PINAKA</h1>
              <span className="pk-gateway-edition">CTF 2026</span>
            </div>

            <p className="pk-gateway-tagline">{PINAKA_EVENT.tagline}</p>
            <p className="pk-gateway-tagline is-secondary">{PINAKA_EVENT.taglineSecondary}</p>
          </motion.div>

          {offerRegister && (
            <motion.div className="pk-gateway-cta" {...enter(0.2, 8)}>
              <button
                type="button"
                className="pk-gateway-register"
                aria-label={REGISTER_LABEL}
                data-hidden={registerHidden ? 'true' : undefined}
                disabled={registerHidden}
                onClick={() => openRegister(onRegister, still)}
              >
                <RegisterArt loading="eager" />
              </button>
            </motion.div>
          )}

          <motion.dl className="pk-gateway-facts" {...enter(0.28, 8, 0.5)}>
            {FACTS.map(f => (
              <div key={f.label} className="pk-gateway-fact">
                <dt className="label-micro">{f.label}</dt>
                <dd className="text-small text-text-primary">{f.value}</dd>
              </div>
            ))}
          </motion.dl>

          {/* The scroll, as a relic laid at the foot of the gate: it takes
              what is left of the first screen under the facts, and is not
              drawn (nor fetched) where that is too little. */}
          <motion.div className="pk-gateway-relic" aria-hidden="true" {...enter(0.4, 12, 0.8)}>
            <Relic />
          </motion.div>
        </div>

        {/* The organiser and the partners, at the foot of the gate. */}
        <motion.div className="pk-gateway-foot" {...enter(0.45, 0, 0.6)}>
          <PartnerStrip variant="gateway" />
        </motion.div>
      </div>
    </div>
  );
}
