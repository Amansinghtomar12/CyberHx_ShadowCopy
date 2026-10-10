/**
 * Battle-scene plates — the Free-challenge half of the Pinaka event.
 *
 * These are full-viewport backgrounds, not card art: opening a scene
 * challenge swaps the whole site's plate to its painting, and closing it
 * puts the chapter's plate back. They therefore carry the same four
 * numbers a world plate does.
 *
 * `focal` is the luminance-weighted centroid, clamped well inside the
 * frame so the subject survives both a wide desktop crop and a tall phone
 * one. `sun` is the brightest cell of a 16x16 grid, measured rather than
 * guessed, so the environment's bloom and rays leave the painted light.
 *
 * The source art is 1672 px wide, so 1920 is a 1.15x lift with a light
 * unsharp pass rather than a real upscale. All twelve are the organisers'
 * own artwork and add nothing to the photographers' credit line.
 */
import type { Plate } from '../plates';

export type SceneId =
  | 'golden-deer'
  | 'jatayus-last-stand'
  | 'shabaris-offering'
  | 'hanumans-leap'
  | 'ashoka-vatika'
  | 'lanka-dahan'
  | 'sanjeevani-hunt'
  | 'setu-stones'
  | 'meghnads-trap'
  | 'kumbhakarna-awakens'
  | 'angadas-embassy'
  | 'ravanas-ten-heads'
;

import goldenDeer1920 from './golden-deer-1920.webp';
import goldenDeer960 from './golden-deer-960.webp';
import goldenDeerPortrait from './golden-deer-portrait.webp';
import jatayu1920 from './jatayus-last-stand-1920.webp';
import jatayu960 from './jatayus-last-stand-960.webp';
import jatayuPortrait from './jatayus-last-stand-portrait.webp';
import shabari1920 from './shabaris-offering-1920.webp';
import shabari960 from './shabaris-offering-960.webp';
import shabariPortrait from './shabaris-offering-portrait.webp';
import hanumanLeap1920 from './hanumans-leap-1920.webp';
import hanumanLeap960 from './hanumans-leap-960.webp';
import hanumanLeapPortrait from './hanumans-leap-portrait.webp';
import ashokaVatika1920 from './ashoka-vatika-1920.webp';
import ashokaVatika960 from './ashoka-vatika-960.webp';
import ashokaVatikaPortrait from './ashoka-vatika-portrait.webp';
import lankaDahan1920 from './lanka-dahan-1920.webp';
import lankaDahan960 from './lanka-dahan-960.webp';
import lankaDahanPortrait from './lanka-dahan-portrait.webp';
import sanjeevani1920 from './sanjeevani-hunt-1920.webp';
import sanjeevani960 from './sanjeevani-hunt-960.webp';
import sanjeevaniPortrait from './sanjeevani-hunt-portrait.webp';
import setuStones1920 from './setu-stones-1920.webp';
import setuStones960 from './setu-stones-960.webp';
import setuStonesPortrait from './setu-stones-portrait.webp';
import meghnadTrap1920 from './meghnads-trap-1920.webp';
import meghnadTrap960 from './meghnads-trap-960.webp';
import meghnadTrapPortrait from './meghnads-trap-portrait.webp';
import kumbhakarna1920 from './kumbhakarna-awakens-1920.webp';
import kumbhakarna960 from './kumbhakarna-awakens-960.webp';
import kumbhakarnaPortrait from './kumbhakarna-awakens-portrait.webp';
import angadaEmbassy1920 from './angadas-embassy-1920.webp';
import angadaEmbassy960 from './angadas-embassy-960.webp';
import angadaEmbassyPortrait from './angadas-embassy-portrait.webp';
import ravanaHeads1920 from './ravanas-ten-heads-1920.webp';
import ravanaHeads960 from './ravanas-ten-heads-960.webp';
import ravanaHeadsPortrait from './ravanas-ten-heads-portrait.webp';

export const SCENE_PLATES: Record<SceneId, Plate> = {
  'golden-deer': {
    w1920: goldenDeer1920, w960: goldenDeer960, portrait: goldenDeerPortrait,
    width: 1920, height: 1080,
    alt: 'Pinaka CTF battle scene: a golden deer glowing on a forest path at sunrise',
    focal: { x: 0.33, y: 0.423 },
    sun: { x: 0.156, y: 0.094 },
    credit: {
      title: 'Pinaka CTF 2026 battle scenes',
      author: 'Pinaka CTF · NFSU Chennai',
      license: 'Official event artwork',
      licenseUrl: 'https://pinakactf.com/',
      sourceUrl: 'https://pinakactf.com/',
      photo: false,
    },
  },
  'jatayus-last-stand': {
    w1920: jatayu1920, w960: jatayu960, portrait: jatayuPortrait,
    width: 1920, height: 1080,
    alt: 'Pinaka CTF battle scene: a great bird fallen among rocks at dusk',
    focal: { x: 0.464, y: 0.406 },
    sun: { x: 0.469, y: 0.406 },
    credit: {
      title: 'Pinaka CTF 2026 battle scenes',
      author: 'Pinaka CTF · NFSU Chennai',
      license: 'Official event artwork',
      licenseUrl: 'https://pinakactf.com/',
      sourceUrl: 'https://pinakactf.com/',
      photo: false,
    },
  },
  'shabaris-offering': {
    w1920: shabari1920, w960: shabari960, portrait: shabariPortrait,
    width: 1920, height: 1080,
    alt: 'Pinaka CTF battle scene: berries set out on leaves in a forest clearing',
    focal: { x: 0.431, y: 0.464 },
    sun: { x: 0.406, y: 0.094 },
    credit: {
      title: 'Pinaka CTF 2026 battle scenes',
      author: 'Pinaka CTF · NFSU Chennai',
      license: 'Official event artwork',
      licenseUrl: 'https://pinakactf.com/',
      sourceUrl: 'https://pinakactf.com/',
      photo: false,
    },
  },
  'hanumans-leap': {
    w1920: hanumanLeap1920, w960: hanumanLeap960, portrait: hanumanLeapPortrait,
    width: 1920, height: 1080,
    alt: 'Pinaka CTF battle scene: a vast leap across open sea from a cliff',
    focal: { x: 0.428, y: 0.441 },
    sun: { x: 0.281, y: 0.406 },
    credit: {
      title: 'Pinaka CTF 2026 battle scenes',
      author: 'Pinaka CTF · NFSU Chennai',
      license: 'Official event artwork',
      licenseUrl: 'https://pinakactf.com/',
      sourceUrl: 'https://pinakactf.com/',
      photo: false,
    },
  },
  'ashoka-vatika': {
    w1920: ashokaVatika1920, w960: ashokaVatika960, portrait: ashokaVatikaPortrait,
    width: 1920, height: 1080,
    alt: 'Pinaka CTF battle scene: a walled garden at night under lanterns',
    focal: { x: 0.474, y: 0.436 },
    sun: { x: 0.344, y: 0.156 },
    credit: {
      title: 'Pinaka CTF 2026 battle scenes',
      author: 'Pinaka CTF · NFSU Chennai',
      license: 'Official event artwork',
      licenseUrl: 'https://pinakactf.com/',
      sourceUrl: 'https://pinakactf.com/',
      photo: false,
    },
  },
  'lanka-dahan': {
    w1920: lankaDahan1920, w960: lankaDahan960, portrait: lankaDahanPortrait,
    width: 1920, height: 1080,
    alt: 'Pinaka CTF battle scene: a city skyline taken by fire',
    focal: { x: 0.421, y: 0.522 },
    sun: { x: 0.281, y: 0.344 },
    credit: {
      title: 'Pinaka CTF 2026 battle scenes',
      author: 'Pinaka CTF · NFSU Chennai',
      license: 'Official event artwork',
      licenseUrl: 'https://pinakactf.com/',
      sourceUrl: 'https://pinakactf.com/',
      photo: false,
    },
  },
  'sanjeevani-hunt': {
    w1920: sanjeevani1920, w960: sanjeevani960, portrait: sanjeevaniPortrait,
    width: 1920, height: 1080,
    alt: 'Pinaka CTF battle scene: a mountain carried under moonlight',
    focal: { x: 0.478, y: 0.492 },
    sun: { x: 0.219, y: 0.094 },
    credit: {
      title: 'Pinaka CTF 2026 battle scenes',
      author: 'Pinaka CTF · NFSU Chennai',
      license: 'Official event artwork',
      licenseUrl: 'https://pinakactf.com/',
      sourceUrl: 'https://pinakactf.com/',
      photo: false,
    },
  },
  'setu-stones': {
    w1920: setuStones1920, w960: setuStones960, portrait: setuStonesPortrait,
    width: 1920, height: 1080,
    alt: 'Pinaka CTF battle scene: stones laid across the sea to form a causeway',
    focal: { x: 0.434, y: 0.434 },
    sun: { x: 0.469, y: 0.281 },
    credit: {
      title: 'Pinaka CTF 2026 battle scenes',
      author: 'Pinaka CTF · NFSU Chennai',
      license: 'Official event artwork',
      licenseUrl: 'https://pinakactf.com/',
      sourceUrl: 'https://pinakactf.com/',
      photo: false,
    },
  },
  'meghnads-trap': {
    w1920: meghnadTrap1920, w960: meghnadTrap960, portrait: meghnadTrapPortrait,
    width: 1920, height: 1080,
    alt: 'Pinaka CTF battle scene: a shimmering illusion closing over a forest',
    focal: { x: 0.35, y: 0.475 },
    sun: { x: 0.156, y: 0.406 },
    credit: {
      title: 'Pinaka CTF 2026 battle scenes',
      author: 'Pinaka CTF · NFSU Chennai',
      license: 'Official event artwork',
      licenseUrl: 'https://pinakactf.com/',
      sourceUrl: 'https://pinakactf.com/',
      photo: false,
    },
  },
  'kumbhakarna-awakens': {
    w1920: kumbhakarna1920, w960: kumbhakarna960, portrait: kumbhakarnaPortrait,
    width: 1920, height: 1080,
    alt: 'Pinaka CTF battle scene: an enormous sleeper stirring underground',
    focal: { x: 0.386, y: 0.447 },
    sun: { x: 0.219, y: 0.031 },
    credit: {
      title: 'Pinaka CTF 2026 battle scenes',
      author: 'Pinaka CTF · NFSU Chennai',
      license: 'Official event artwork',
      licenseUrl: 'https://pinakactf.com/',
      sourceUrl: 'https://pinakactf.com/',
      photo: false,
    },
  },
  'angadas-embassy': {
    w1920: angadaEmbassy1920, w960: angadaEmbassy960, portrait: angadaEmbassyPortrait,
    width: 1920, height: 1080,
    alt: 'Pinaka CTF battle scene: a lone envoy standing in a hostile court',
    focal: { x: 0.349, y: 0.478 },
    sun: { x: 0.219, y: 0.719 },
    credit: {
      title: 'Pinaka CTF 2026 battle scenes',
      author: 'Pinaka CTF · NFSU Chennai',
      license: 'Official event artwork',
      licenseUrl: 'https://pinakactf.com/',
      sourceUrl: 'https://pinakactf.com/',
      photo: false,
    },
  },
  'ravanas-ten-heads': {
    w1920: ravanaHeads1920, w960: ravanaHeads960, portrait: ravanaHeadsPortrait,
    width: 1920, height: 1080,
    alt: 'Pinaka CTF battle scene: ten crowned silhouettes against a storm',
    focal: { x: 0.295, y: 0.444 },
    sun: { x: 0.094, y: 0.219 },
    credit: {
      title: 'Pinaka CTF 2026 battle scenes',
      author: 'Pinaka CTF · NFSU Chennai',
      license: 'Official event artwork',
      licenseUrl: 'https://pinakactf.com/',
      sourceUrl: 'https://pinakactf.com/',
      photo: false,
    },
  },
};
