/**
 * Battle-scene backgrounds for Free challenges — the event's own artwork.
 *
 * Twelve scenes, each at three widths. They sit behind a dark readability
 * overlay on the challenge dialog, so they are encoded at q68: fine detail
 * is budget spent under a scrim nobody sees through. The supplied art is
 * 1672 px wide, so 1600 is effectively native and nothing is upscaled.
 *
 * All twelve are the organisers' own artwork, so none adds to the
 * photographers' credit line. A scene shows no deity figure.
 */
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

import goldenDeer1600 from './golden-deer-1600.webp';
import goldenDeer1000 from './golden-deer-1000.webp';
import goldenDeer600 from './golden-deer-600.webp';
import jatayu1600 from './jatayus-last-stand-1600.webp';
import jatayu1000 from './jatayus-last-stand-1000.webp';
import jatayu600 from './jatayus-last-stand-600.webp';
import shabari1600 from './shabaris-offering-1600.webp';
import shabari1000 from './shabaris-offering-1000.webp';
import shabari600 from './shabaris-offering-600.webp';
import hanumanLeap1600 from './hanumans-leap-1600.webp';
import hanumanLeap1000 from './hanumans-leap-1000.webp';
import hanumanLeap600 from './hanumans-leap-600.webp';
import ashokaVatika1600 from './ashoka-vatika-1600.webp';
import ashokaVatika1000 from './ashoka-vatika-1000.webp';
import ashokaVatika600 from './ashoka-vatika-600.webp';
import lankaDahan1600 from './lanka-dahan-1600.webp';
import lankaDahan1000 from './lanka-dahan-1000.webp';
import lankaDahan600 from './lanka-dahan-600.webp';
import sanjeevani1600 from './sanjeevani-hunt-1600.webp';
import sanjeevani1000 from './sanjeevani-hunt-1000.webp';
import sanjeevani600 from './sanjeevani-hunt-600.webp';
import setuStones1600 from './setu-stones-1600.webp';
import setuStones1000 from './setu-stones-1000.webp';
import setuStones600 from './setu-stones-600.webp';
import meghnadTrap1600 from './meghnads-trap-1600.webp';
import meghnadTrap1000 from './meghnads-trap-1000.webp';
import meghnadTrap600 from './meghnads-trap-600.webp';
import kumbhakarna1600 from './kumbhakarna-awakens-1600.webp';
import kumbhakarna1000 from './kumbhakarna-awakens-1000.webp';
import kumbhakarna600 from './kumbhakarna-awakens-600.webp';
import angadaEmbassy1600 from './angadas-embassy-1600.webp';
import angadaEmbassy1000 from './angadas-embassy-1000.webp';
import angadaEmbassy600 from './angadas-embassy-600.webp';
import ravanaHeads1600 from './ravanas-ten-heads-1600.webp';
import ravanaHeads1000 from './ravanas-ten-heads-1000.webp';
import ravanaHeads600 from './ravanas-ten-heads-600.webp';

/** One scene's files, widest first — `sizes` picks per viewport. */
export interface SceneArt {
  readonly w1600: string;
  readonly w1000: string;
  readonly w600: string;
}

export const SCENE_ART: Readonly<Record<SceneId, SceneArt>> = {
  'golden-deer': { w1600: goldenDeer1600, w1000: goldenDeer1000, w600: goldenDeer600 },
  'jatayus-last-stand': { w1600: jatayu1600, w1000: jatayu1000, w600: jatayu600 },
  'shabaris-offering': { w1600: shabari1600, w1000: shabari1000, w600: shabari600 },
  'hanumans-leap': { w1600: hanumanLeap1600, w1000: hanumanLeap1000, w600: hanumanLeap600 },
  'ashoka-vatika': { w1600: ashokaVatika1600, w1000: ashokaVatika1000, w600: ashokaVatika600 },
  'lanka-dahan': { w1600: lankaDahan1600, w1000: lankaDahan1000, w600: lankaDahan600 },
  'sanjeevani-hunt': { w1600: sanjeevani1600, w1000: sanjeevani1000, w600: sanjeevani600 },
  'setu-stones': { w1600: setuStones1600, w1000: setuStones1000, w600: setuStones600 },
  'meghnads-trap': { w1600: meghnadTrap1600, w1000: meghnadTrap1000, w600: meghnadTrap600 },
  'kumbhakarna-awakens': { w1600: kumbhakarna1600, w1000: kumbhakarna1000, w600: kumbhakarna600 },
  'angadas-embassy': { w1600: angadaEmbassy1600, w1000: angadaEmbassy1000, w600: angadaEmbassy600 },
  'ravanas-ten-heads': { w1600: ravanaHeads1600, w1000: ravanaHeads1000, w600: ravanaHeads600 },
};

/** `srcset` for a scene, so the browser fetches one file, not three. */
export function sceneSrcSet(id: SceneId): string {
  const a = SCENE_ART[id];
  return `${a.w600} 600w, ${a.w1000} 1000w, ${a.w1600} 1600w`;
}
