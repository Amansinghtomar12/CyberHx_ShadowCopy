/**
 * The official Pinaka CTF 2026 artwork, supplied by the organisers from
 * pinakactf.com and bundled as supplied (resized and re-encoded only; the
 * smaller files are Lanczos reductions of the larger ones). Same-origin
 * URL strings: importing this module fetches nothing, an <img> does.
 *
 * Only what a component or stylesheet actually shows lives here; every
 * import below is emitted into the build, used or not. The temple-city
 * painting that used to sit here as a page background is a world plate now
 * (assets/plates).
 */
import duel2400 from './duel-2400.webp';
import duel1200 from './duel-1200.webp';
import ram1069 from './ram-1069.webp';
import ram640 from './ram-640.webp';
import wheelEmblem1000 from './wheel-emblem-1000.webp';
import wheelEmblem700 from './wheel-emblem-700.webp';
import wheelEmblem200 from './wheel-emblem-200.webp';
import scrollArt from './scroll-art.webp';
import scrollArt320 from './scroll-art-320.webp';
import registerCta from './register-cta.webp';
import registerCta600 from './register-cta-600.webp';
import navbarCompass from './navbar-compass.webp';
import navbarTexture from './navbar-texture.webp';
import navbarCornerLeft from './navbar-corner-left.webp';
import navbarCornerRight from './navbar-corner-right.webp';
import footerShield from './footer-shield.webp';

export const PINAKA_IMAGES = {
  /** Rama and Ravana, the intro's key illustration: 2400 × 1160 and 1200 × 580. */
  duel: { large: duel2400, small: duel1200 },
  /** The archer on his rock: 1069 × 1038 and 640 × 621. */
  archer: { large: ram1069, small: ram640 },
  /** The bronze dharma wheel: 1000, 700 and 200 px square (the 200 for the phone emblem). */
  wheelEmblem: { large: wheelEmblem1000, small: wheelEmblem700, tiny: wheelEmblem200 },
  /** The glowing scroll poster: 756 × 1024 and 320 × 433. */
  scrollArt: { large: scrollArt, small: scrollArt320 },
  /** The "Register now" plate: 1140 × 281 and 600 × 148. */
  registerCta: { large: registerCta, small: registerCta600 },
  navbar: {
    compass: navbarCompass,
    texture: navbarTexture,
    cornerLeft: navbarCornerLeft,
    cornerRight: navbarCornerRight,
  },
  footerShield,
} as const;
