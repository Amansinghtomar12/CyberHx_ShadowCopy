/**
 * AuthGateway — the sign-in page's event art under the skin.
 *
 * From lg up (part="hero"), a frosted glass card centred over the event's
 * painting carrying the title lockup, taglines, event facts and partner
 * strip. Below lg, part="emblem": the bronze wheel over the title.
 *
 * All drawing is aria-hidden and pointer-transparent; the form is untouched.
 * Styles in styles/gateway.css.
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

function useStill(): boolean {
  const reduce = useReducedMotion() ?? false;
  const [dialStill, setDialStill] = useState(() => getCapability().tier === 'still');
  useEffect(() => subscribeFx(() => setDialStill(getCapability().tier === 'still')), []);
  return reduce || dialStill;
}

/** AuthPage shows the hero column from Tailwind's `lg` breakpoint (64rem). */
const HERO_SHOWN = '(min-width: 64rem)';

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
      if (!el.complete || el.naturalWidth === 0) return;
      if (typeof el.decode === 'function') el.decode().then(show, show);
      else show();
    };
    el.addEventListener('load', reveal);
    reveal();
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

export interface AuthGatewayProps {
  /**
   * Which piece of the page to draw: 'hero' (the default), the hero column,
   * from lg up; below lg, 'emblem' (the wheel over the title).
   */
  part?: 'hero' | 'emblem';
}

export default function AuthGateway({ part = 'hero' }: AuthGatewayProps = {}) {
  if (part === 'emblem') return <PhoneEmblem />;
  return <Hero />;
}

/* ── The phone: the bronze wheel over the title ──────────────────────────── */

/**
 * The bronze wheel over the title, 3.5rem across: the size and place of the
 * mark it stands in for, so nothing under it moves.
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

/* ── The hero column, lg and up ──────────────────────────────────────────── */

function Hero() {
  const still = useStill();
  const shown = useMediaQuery(HERO_SHOWN);
  const ease = [0.22, 1, 0.36, 1] as const;
  const enter = (delay: number, y = 10, duration = 0.55) => ({
    initial: still ? false : { opacity: 0, y },
    animate: { opacity: 1, y: 0 },
    transition: still ? { duration: 0 } : { duration, ease, delay },
  });

  if (!shown) return null;

  return (
    <div className="pk-gateway relative flex flex-1 flex-col" data-still={still ? 'true' : undefined}>
      <div className="pk-gateway-body relative flex flex-1 flex-col items-center justify-start">
        <motion.div className="pk-gateway-glass" {...enter(0.1)}>
          <Eyebrow>The Gateway to Ayodhya</Eyebrow>

          <div className="pk-gateway-lockup">
            <span className="pk-gateway-deva" lang="hi">{PINAKA_EVENT.devanagari}</span>
            <h1 className="pk-gateway-name pk-foil-text">PINAKA</h1>
            <span className="pk-gateway-edition">CTF 2026</span>
          </div>

          <p className="pk-gateway-tagline">{PINAKA_EVENT.tagline}</p>
          <p className="pk-gateway-tagline is-secondary">{PINAKA_EVENT.taglineSecondary}</p>

          <dl className="pk-gateway-facts">
            {FACTS.map(f => (
              <div key={f.label} className="pk-gateway-fact">
                <dt className="label-micro">{f.label}</dt>
                <dd className="text-small text-text-primary">{f.value}</dd>
              </div>
            ))}
          </dl>

          <motion.div className="pk-gateway-partners" {...enter(0.4, 0, 0.6)}>
            <PartnerStrip variant="gateway" />
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
