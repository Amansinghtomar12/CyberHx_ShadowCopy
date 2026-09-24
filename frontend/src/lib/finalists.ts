/**
 * The teams that qualified for the Grand Finale, in qualifying order, as
 * announced. Only these teams (and admins) get the VIP finalist layer.
 * Presentation only: nothing here grants access or touches scoring.
 *
 * A plain name takes its place from its position in the list. A team let in
 * from further down the qualifier board is written [name, place] so its pass
 * shows the place it actually finished.
 */
export const FINALIST_TEAMS: readonly (string | readonly [string, number])[] = [
  'D3kh1_k1chu_p4r1_k1n4',
  'Team Pri5m',
  'BlackCipherz',
  'WTH',
  'JackSpeor',
  'Junkiessss',
  'Noirlycan',
  'djsimpsondoh',
  '5_Cu_Nam_Trong_Tay',
  'roamers',
  'H3XR41D',
  'Bournvita',
  'pc4pghost',
  'Breakingbad',
  'Cyber Titans',
  'RUY',
  'halliana',
  'AetherQuant',
  'Jokers',
  'Resonance',
  'NO1TrustUS',
  'D4RK SH3LL',
  'CuB_Networks',
  '0x05ad',
  'Skånepatrullen',
  'Street_Hackers',
  'Fourleaf Clovers',
  'Oggy V3r5e',
  'pissyboy67',
  'Ambr0s1a!',
  'ByteMe',
  'Inikan',
  'Gugugaga',
  'Downer',
  'The Shadows',
  'Spark',
  "H4CK3R'$ LOBBY",
  'Vyadh',
  '2Null',
  ['0xA', 74],
  ['Bl4ck_Kloud', 92],
];

/** Case, accents' encoding and stray spaces are not what makes a name different. */
const norm = (s: string) => s.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();

const PLACE = new Map(FINALIST_TEAMS.map((t, i) =>
  typeof t === 'string' ? [norm(t), i + 1] : [norm(t[0]), t[1]]));

/** Qualifying place (1-based) of a finalist team, or null for any other team. */
export function finalistPlace(teamName: string | null | undefined): number | null {
  return teamName ? PLACE.get(norm(teamName)) ?? null : null;
}
