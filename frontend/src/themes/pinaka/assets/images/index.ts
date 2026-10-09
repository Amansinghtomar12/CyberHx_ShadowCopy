import duel2400 from './duel-2400.webp';
import duel1200 from './duel-1200.webp';
import ram1069 from './ram-1069.webp';
import ram640 from './ram-640.webp';
import wheelEmblem1000 from './wheel-emblem-1000.webp';
import wheelEmblem700 from './wheel-emblem-700.webp';
import scrollArt from './scroll-art.webp';
import registerCta from './register-cta.webp';
import wheelSectionBg from './wheel-section-bg.webp';
import siteBg2560 from './site-bg-2560.webp';
import siteBg1280 from './site-bg-1280.webp';
import navbarCompass from './navbar-compass.webp';
import navbarTexture from './navbar-texture.webp';
import navbarCornerLeft from './navbar-corner-left.webp';
import navbarCornerRight from './navbar-corner-right.webp';
import footerShield from './footer-shield.webp';

export const PINAKA_IMAGES = {
  duel: { large: duel2400, small: duel1200 },
  archer: { large: ram1069, small: ram640 },
  wheelEmblem: { large: wheelEmblem1000, small: wheelEmblem700 },
  scrollArt,
  registerCta,
  wheelSectionBg,
  siteBg: { large: siteBg2560, small: siteBg1280 },
  navbar: {
    compass: navbarCompass,
    texture: navbarTexture,
    cornerLeft: navbarCornerLeft,
    cornerRight: navbarCornerRight,
  },
  footerShield,
} as const;
