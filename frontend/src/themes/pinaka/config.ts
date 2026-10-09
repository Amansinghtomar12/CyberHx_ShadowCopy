/**
 * Pinaka theme — facts and copy.
 *
 * Everything here is presentation. The event itself (start, end, pause,
 * scoreboard state) always comes from event_settings on the server; these
 * dates only label the narrative. Verify them against pinakactf.com before
 * the event: they were taken from the public site on 2026-10-08.
 */
import { SPONSOR_LOGOS } from './assets/sponsors';

export const PINAKA_THEME_COLOR = '#0a0e17';

/** Cinzel for display, EB Garamond for narrative prose. UI stays on Inter. */
export const PINAKA_FONTS_HREF =
  'https://fonts.googleapis.com/css2?family=Cinzel:wght@500;600;700&family=EB+Garamond:ital,wght@0,400;0,500;0,600;1,400&display=swap';

export const PINAKA_EVENT = {
  name: 'Pinaka CTF 2026',
  /** Short tag used in nav badges and the pass. */
  tag: 'Pinaka CTF',
  /** The name, in Devanagari. पिनाक — used once, in the title lockup. */
  devanagari: 'पिनाक',
  tagline: 'One Arrow. Ten Heads. Infinite Possibilities.',
  taglineSecondary: 'Precision is the weapon. Knowledge is the path.',
  organiser: 'National Forensic Sciences University, Chennai Campus',
  organiserShort: 'NFSU Chennai',
  organiserUrl: 'https://pinakactf.com/',
  /** CyberHX runs the scoring platform. It does not organise the event. */
  platformLine: 'Scoring platform by CyberHX · Team CyberXoX',
  platformRole: 'CTF Platform Partner',
  /** Published qualifier window (IST). The live clock is the server's. */
  qualifier: { startIso: '2026-10-31T00:00:00+05:30', endIso: '2026-11-01T23:59:59+05:30', label: '31 Oct – 1 Nov 2026' },
  writeupsDue: '2 Nov 2026, 23:59 IST',
  resultsOn: '4 Nov 2026',
  /** Offline final: not run on this platform. Mentioned, never counted down. */
  final: { label: '28 Nov 2026 · NFSU Chennai · 12 hours · Top 10' },
} as const;

/**
 * Partner recognition. Names as published on pinakactf.com (Oct 2026).
 * Logos are not bundled: usage rights were not confirmed for this repo. Add
 * approved logo files under src/themes/pinaka/assets/partners/ and set `logo`
 * to the imported URL; a partner without one renders as a name mark.
 */
export interface Partner { name: string; role?: string; logo?: string; url?: string }

export const PINAKA_PARTNERS: readonly Partner[] = [
  { name: 'INE Security', role: 'In association with', logo: SPONSOR_LOGOS['INE Security'] },
  { name: 'Altered Security', logo: SPONSOR_LOGOS['Altered Security'] },
  { name: 'Red Team Hacker Academy', logo: SPONSOR_LOGOS['Red Team Hacker Academy'] },
  { name: 'CWL · CyberWarFare Labs', logo: SPONSOR_LOGOS['CWL · CyberWarFare Labs'] },
  { name: 'BlackPerl DFIR', logo: SPONSOR_LOGOS['BlackPerl DFIR'] },
  { name: 'Stellar Data Recovery', logo: SPONSOR_LOGOS['Stellar Data Recovery'] },
  { name: 'Unstop', logo: SPONSOR_LOGOS['Unstop'] },
  { name: '.XYZ Domains', logo: SPONSOR_LOGOS['.XYZ Domains'] },
  { name: 'MetaCTF · Skillbit', logo: SPONSOR_LOGOS['MetaCTF · Skillbit'] },
  { name: 'KnightSquad', logo: SPONSOR_LOGOS['KnightSquad'] },
  { name: 'ThunderCipher', logo: SPONSOR_LOGOS['ThunderCipher'] },
  { name: 'CyberInfoga', logo: SPONSOR_LOGOS['CyberInfoga'] },
  { name: 'XSS Rat', logo: SPONSOR_LOGOS['XSS Rat'] },
];

/** The five narrative environments. Each view of the platform lives in one. */
export type World = 'ayodhya' | 'vanavasa' | 'setu' | 'lanka' | 'vijaya';

export const WORLDS: Record<World, { title: string; chapter: string; line: string }> = {
  ayodhya:  { title: 'Ayodhya',  chapter: 'I',   line: 'The awakening. Gather, prepare, take your place in the hall.' },
  vanavasa: { title: 'Vanavasa', chapter: 'II',  line: 'The forest of trials. Every path is a challenge; choose yours.' },
  setu:     { title: 'Setu',     chapter: 'III', line: 'The path of connections. One stone after another, until the far shore.' },
  lanka:    { title: 'Lanka',    chapter: 'IV',  line: 'The arena of strategy. Standings, rivals, and the long game.' },
  vijaya:   { title: 'Vijaya',   chapter: 'V',   line: 'The light of victory. The field is quiet; the record stands.' },
};

/**
 * Category motifs. Abstract aesthetics for each technical discipline — never
 * a claim that a discipline "is" a character or episode of the epic. The key
 * is the platform's own Category id, which stays the visible label.
 */
export const CATEGORY_MOTIF: Record<string, { motif: string; hint: string }> = {
  web:      { motif: 'gateways',    hint: 'interconnected gateways and shifting architectural layers' },
  crypto:   { motif: 'cipher',      hint: 'luminous ancient-script geometry, interlocking cipher patterns' },
  steg:     { motif: 'veil',        hint: 'symbols concealed within layered material' },
  rev:      { motif: 'mechanism',   hint: 'layered mechanical structure revealing its construction' },
  pwn:      { motif: 'edge',        hint: 'precise metallic geometry and controlled energy' },
  forensic: { motif: 'fragments',   hint: 'fragments of evidence assembling into a picture' },
  osint:    { motif: 'map',         hint: 'an illuminated map, an observation network' },
  mobile:   { motif: 'tablet',      hint: 'a handheld device merged with architectural linework' },
  b2r:      { motif: 'citadel',     hint: 'a fortified citadel with layers that open one by one' },
  misc:     { motif: 'celestial',   hint: 'celestial patterns and unconventional geometry' },
};

/** Devanagari digits, for chapter and stage numerals (०–९). */
export const DEVANAGARI_DIGITS = ['०', '१', '२', '३', '४', '५', '६', '७', '८', '९'] as const;
export function devanagariNumber(n: number): string {
  return String(Math.max(0, Math.floor(n))).split('').map(d => DEVANAGARI_DIGITS[Number(d)] ?? d).join('');
}

/** Storage keys owned by the theme. Listed so the restore guide can clear them. */
// The storage keys live in keys.ts (see the note there).
export { PINAKA_STORAGE_KEYS } from './keys';
