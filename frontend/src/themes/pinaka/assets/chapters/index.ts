/**
 * Chapter backgrounds — the event's own artwork, one place per chapter.
 *
 * Each chapter carries the same four files as a world plate: 3840, 1920 and
 * 960 px wide, and a 9:16 crop at full height for a phone held upright
 * (assets/plates/sources.ts picks between them). The supplied art is
 * 1672 px wide; it was upscaled ×2 with LapSRN and resampled, the same
 * treatment the key art gets.
 *
 * `focal` is the point the picture is cropped around, chosen so the subject
 * survives both a wide desktop and a tall phone. `sun` is where the light
 * actually falls, measured rather than guessed (the brightest cell of a
 * 16×16 grid), so the environment's bloom and rays leave the painted light
 * rather than an arbitrary corner.
 *
 * All six are the organisers' own artwork and are credited as such; none is
 * a stock photograph, so none of them adds to the photographers' credit line.
 */
import type { Plate } from '../plates';
import type { ChapterId } from '../../chapters/config';

import ayodhya3840 from './ayodhya-3840.webp';
import ayodhya1920 from './ayodhya-1920.webp';
import ayodhya960 from './ayodhya-960.webp';
import ayodhyaPortrait from './ayodhya-portrait.webp';
import mithila3840 from './mithila-3840.webp';
import mithila1920 from './mithila-1920.webp';
import mithila960 from './mithila-960.webp';
import mithilaPortrait from './mithila-portrait.webp';
import vanvaas3840 from './vanvaas-3840.webp';
import vanvaas1920 from './vanvaas-1920.webp';
import vanvaas960 from './vanvaas-960.webp';
import vanvaasPortrait from './vanvaas-portrait.webp';
import kishkindha3840 from './kishkindha-3840.webp';
import kishkindha1920 from './kishkindha-1920.webp';
import kishkindha960 from './kishkindha-960.webp';
import kishkindhaPortrait from './kishkindha-portrait.webp';
import setu3840 from './setu-3840.webp';
import setu1920 from './setu-1920.webp';
import setu960 from './setu-960.webp';
import setuPortrait from './setu-portrait.webp';
import lanka3840 from './lanka-3840.webp';
import lanka1920 from './lanka-1920.webp';
import lanka960 from './lanka-960.webp';
import lankaPortrait from './lanka-portrait.webp';

export type ChapterPlate = Plate;

/** Supplied by the organisers for this event, and used only for it. */
const EVENT_ART = {
  author: 'Pinaka CTF · NFSU Chennai',
  license: 'Official event artwork',
  licenseUrl: 'https://pinakactf.com/',
  sourceUrl: 'https://pinakactf.com/',
  photo: false,
} as const;

export const CHAPTER_PLATES: Record<ChapterId, ChapterPlate> = {
  ayodhya: {
    w3840: ayodhya3840, w1920: ayodhya1920, w960: ayodhya960, portrait: ayodhyaPortrait,
    width: 3840, height: 2160,
    alt: 'A city of temple spires and marble ghats along its river at sunrise, lamps lit along the steps',
    focal: { x: 0.55, y: 0.5 },
    sun: { x: 0.219, y: 0.344 },
    credit: { title: 'Ayodhya — the beginning', ...EVENT_ART },
  },
  mithila: {
    w3840: mithila3840, w1920: mithila1920, w960: mithila960, portrait: mithilaPortrait,
    width: 3840, height: 2160,
    alt: 'The great bow resting on its carved pedestal in a pillared court at dusk, lamps and petals across the floor',
    focal: { x: 0.55, y: 0.48 },
    sun: { x: 0.281, y: 0.344 },
    credit: { title: 'Mithila — the trial of Pinaka', ...EVENT_ART },
  },
  vanvaas: {
    w3840: vanvaas3840, w1920: vanvaas1920, w960: vanvaas960, portrait: vanvaasPortrait,
    width: 3840, height: 2160,
    alt: 'Rama, Sita and Lakshmana walking a forest path beside a stream in the morning light',
    // left of centre, and the portrait crop is taken further left again, so
    // the three figures stay in frame instead of being cropped away
    focal: { x: 0.42, y: 0.5 },
    sun: { x: 0.781, y: 0.094 },
    credit: { title: 'Vanvaas — into the forest', ...EVENT_ART },
  },
  kishkindha: {
    w3840: kishkindha3840, w1920: kishkindha1920, w960: kishkindha960, portrait: kishkindhaPortrait,
    width: 3840, height: 2160,
    alt: 'A valley of forested crags at sunrise seen from a cliff path, rope bridges and watchtowers above the mist',
    focal: { x: 0.55, y: 0.46 },
    sun: { x: 0.719, y: 0.156 },
    credit: { title: 'Kishkindha — alliance and recon', ...EVENT_ART },
  },
  setu: {
    w3840: setu3840, w1920: setu1920, w960: setu960, portrait: setuPortrait,
    width: 3840, height: 2160,
    alt: 'A causeway of inscribed stones laid across a breaking sea toward a far citadel at sunset',
    focal: { x: 0.6, y: 0.46 },
    sun: { x: 0.656, y: 0.156 },
    credit: { title: 'Setu Bandhan — the bridge', ...EVENT_ART },
  },
  lanka: {
    w3840: lanka3840, w1920: lanka1920, w960: lanka960, portrait: lankaPortrait,
    width: 3840, height: 2160,
    alt: 'A fortress city burning behind its gate under a red sky, banners along the walls',
    focal: { x: 0.56, y: 0.44 },
    sun: { x: 0.594, y: 0.469 },
    credit: { title: 'Lanka — the final war', ...EVENT_ART },
  },
};
