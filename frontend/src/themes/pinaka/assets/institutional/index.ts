/**
 * Institutional marks, as supplied on pinakactf.com. All four are dark ink on
 * a transparent ground (navy names, a black emblem), so they are only ever
 * shown on a light plate, in full colour, with no filter.
 */
import nfsuEmblem from './nfsu-emblem.webp';
import nfsuEmblemOnly from './nfsu-emblem-only.webp';
import nfsuChennai from './nfsu-chennai.webp';
import mha from './mha.webp';

export const INSTITUTIONAL_LOGOS = {
  nfsuEmblem,
  nfsuEmblemOnly,
  nfsuChennai,
  mha,
} as const;

/**
 * One mark with the name it is captioned by. The name is the one printed in
 * the artwork itself; nothing here states a role (config.ts holds who
 * organises the event). Width and height are the file's, so the browser can
 * reserve the box before the image arrives.
 */
export interface InstitutionalMark { src: string; name: string; width: number; height: number }

export const INSTITUTIONAL_MARKS = {
  nfsu: { src: nfsuEmblem, name: 'National Forensic Sciences University', width: 540, height: 185 },
  nfsuChennai: { src: nfsuChennai, name: 'NFSU Chennai Campus', width: 450, height: 259 },
  mha: { src: mha, name: 'Ministry of Home Affairs', width: 360, height: 194 },
} as const satisfies Record<string, InstitutionalMark>;
