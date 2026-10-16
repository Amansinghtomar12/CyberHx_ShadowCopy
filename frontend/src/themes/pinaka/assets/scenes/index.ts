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
 * The organisers supply these at 3840x2160. Their own pack is plain that
 * those are "upscaled 4K exports, not native 4K renders" — the paintings
 * are generated near 1672 px and lifted with Lanczos before they reach us
 * — and a round trip back through 1672 confirms it: almost nothing of the
 * file survives as difference, so there is no detail finer than 1672 in
 * here to protect. Worth stating rather than implying, because "4K" on
 * these files describes the container and not the picture.
 *
 * What did change is that nothing is upscaled HERE any more. The supplied
 * 3840 is re-encoded at its own size, and 1920 and 960 are real
 * reductions with a light unsharp; the earlier set resampled 1672 up to
 * 3840 in this repo, which added a second lift on top of theirs.
 *
 * The 3840 still earns its place: a 4K screen would otherwise stretch the
 * 1920 with the browser's own filter, which is softer, and every chapter
 * plate beside these carries a 3840 — so an arena looked worse than the
 * chapter it opened from. Only a screen that asks for 3840 fetches one.
 *
 * All twelve are the organisers' own artwork and add nothing to the
 * photographers' credit line.
 */
import goldenDeer3840 from './golden-deer-3840.webp';
import jatayu3840 from './jatayus-last-stand-3840.webp';
import shabari3840 from './shabaris-offering-3840.webp';
import hanumanLeap3840 from './hanumans-leap-3840.webp';
import ashokaVatika3840 from './ashoka-vatika-3840.webp';
import lankaDahan3840 from './lanka-dahan-3840.webp';
import sanjeevani3840 from './sanjeevani-hunt-3840.webp';
import setuStones3840 from './setu-stones-3840.webp';
import meghnadTrap3840 from './meghnads-trap-3840.webp';
import kumbhakarna3840 from './kumbhakarna-awakens-3840.webp';
import angadaEmbassy3840 from './angadas-embassy-3840.webp';
import ravanaHeads3840 from './ravanas-ten-heads-3840.webp';
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
    w3840: goldenDeer3840, w1920: goldenDeer1920, w960: goldenDeer960, portrait: goldenDeerPortrait,
    width: 1920, height: 1080,
    alt: 'Pinaka CTF battle scene: a golden deer in a sunlit forest glade, a hermitage and waterfall beyond',
    focal: { x: 0.476, y: 0.528 },
    sun: { x: 0.594, y: 0.031 },
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
    w3840: jatayu3840, w1920: jatayu1920, w960: jatayu960, portrait: jatayuPortrait,
    width: 1920, height: 1080,
    alt: 'Pinaka CTF battle scene: a great bird fallen among rocks at dusk',
    focal: { x: 0.49, y: 0.491 },
    sun: { x: 0.406, y: 0.594 },
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
    w3840: shabari3840, w1920: shabari1920, w960: shabari960, portrait: shabariPortrait,
    width: 1920, height: 1080,
    alt: 'Pinaka CTF battle scene: Shabari offering berries to two travellers outside her hut',
    focal: { x: 0.494, y: 0.53 },
    sun: { x: 0.156, y: 0.156 },
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
    w3840: hanumanLeap3840, w1920: hanumanLeap1920, w960: hanumanLeap960, portrait: hanumanLeapPortrait,
    width: 1920, height: 1080,
    alt: 'Pinaka CTF battle scene: a vast leap across open sea from a cliff',
    focal: { x: 0.447, y: 0.53 },
    sun: { x: 0.656, y: 0.406 },
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
    w3840: ashokaVatika3840, w1920: ashokaVatika1920, w960: ashokaVatika960, portrait: ashokaVatikaPortrait,
    width: 1920, height: 1080,
    alt: 'Pinaka CTF battle scene: a woman seated beneath a tree in a guarded palace garden',
    focal: { x: 0.483, y: 0.541 },
    sun: { x: 0.906, y: 0.094 },
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
    w3840: lankaDahan3840, w1920: lankaDahan1920, w960: lankaDahan960, portrait: lankaDahanPortrait,
    width: 1920, height: 1080,
    alt: 'Pinaka CTF battle scene: a city skyline taken by fire',
    focal: { x: 0.486, y: 0.509 },
    sun: { x: 0.719, y: 0.094 },
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
    w3840: sanjeevani3840, w1920: sanjeevani1920, w960: sanjeevani960, portrait: sanjeevaniPortrait,
    width: 1920, height: 1080,
    alt: 'Pinaka CTF battle scene: a mountain carried under moonlight',
    focal: { x: 0.485, y: 0.574 },
    sun: { x: 0.844, y: 0.281 },
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
    w3840: setuStones3840, w1920: setuStones1920, w960: setuStones960, portrait: setuStonesPortrait,
    width: 1920, height: 1080,
    alt: 'Pinaka CTF battle scene: an army carrying stones into the sea to build a causeway',
    focal: { x: 0.49, y: 0.573 },
    sun: { x: 0.781, y: 0.344 },
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
    w3840: meghnadTrap3840, w1920: meghnadTrap1920, w960: meghnadTrap960, portrait: meghnadTrapPortrait,
    width: 1920, height: 1080,
    alt: 'Pinaka CTF battle scene: a shimmering illusion closing over a forest',
    focal: { x: 0.491, y: 0.548 },
    sun: { x: 0.656, y: 0.719 },
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
    w3840: kumbhakarna3840, w1920: kumbhakarna1920, w960: kumbhakarna960, portrait: kumbhakarnaPortrait,
    width: 1920, height: 1080,
    alt: 'Pinaka CTF battle scene: an enormous sleeper stirring underground',
    focal: { x: 0.482, y: 0.533 },
    sun: { x: 0.781, y: 0.094 },
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
    w3840: angadaEmbassy3840, w1920: angadaEmbassy1920, w960: angadaEmbassy960, portrait: angadaEmbassyPortrait,
    width: 1920, height: 1080,
    alt: 'Pinaka CTF battle scene: a lone envoy standing in a hostile court',
    focal: { x: 0.482, y: 0.509 },
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
  'ravanas-ten-heads': {
    w3840: ravanaHeads3840, w1920: ravanaHeads1920, w960: ravanaHeads960, portrait: ravanaHeadsPortrait,
    width: 1920, height: 1080,
    alt: 'Pinaka CTF battle scene: Ravana crowned and armoured above his citadel, his ten heads against a red sky',
    focal: { x: 0.511, y: 0.507 },
    sun: { x: 0.969, y: 0.281 },
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
