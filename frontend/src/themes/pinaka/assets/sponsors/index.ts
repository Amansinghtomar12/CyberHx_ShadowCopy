/**
 * Sponsor and partner logos. Each import resolves to a Vite asset URL string.
 * Matched to PINAKA_PARTNERS entries by config.ts.
 */
import ine from './ine.webp';
import alteredSecurity from './altered-security.webp';
import redTeam from './red-team-hacker-academy.webp';
import cwl from './cwl.webp';
import blackperl from './blackperl-dfir.webp';
import stellar from './stellar-data-recovery.webp';
import unstop from './unstop.svg';
import knightsquad from './knightsquad.webp';
import cyberinfoga from './cyberinfoga.webp';
import thundercipher from './thundercipher.webp';
import metactf from './metactf-skillbit.webp';
import xssrat from './xss-rat.webp';
import xyz from './xyz-domains.webp';
import featuredIne from './featured-ine.webp';

export const SPONSOR_LOGOS: Record<string, string> = {
  'INE Security': ine,
  'Altered Security': alteredSecurity,
  'Red Team Hacker Academy': redTeam,
  'CWL · CyberWarFare Labs': cwl,
  'BlackPerl DFIR': blackperl,
  'Stellar Data Recovery': stellar,
  'Unstop': unstop,
  '.XYZ Domains': xyz,
  'MetaCTF · Skillbit': metactf,
  'KnightSquad': knightsquad,
  'ThunderCipher': thundercipher,
  'CyberInfoga': cyberinfoga,
  'XSS Rat': xssrat,
};

export const FEATURED_LOGOS = {
  ine: featuredIne,
} as const;

/**
 * How each logo sits on its tile, so it shows exactly as supplied. Square
 * logos that carry their own background fill the tile ('cover', and the tile
 * takes that colour); transparent ones sit inside it ('contain') on the
 * ground their colours were drawn for: light behind navy marks, dark behind
 * white or neon ones.
 */
export interface LogoTile { bg: string; fit: 'cover' | 'contain' }

const LIGHT = '#ffffff';
const DARK = '#10131c';

export const SPONSOR_TILES: Record<string, LogoTile> = {
  'INE Security': { bg: '#252525', fit: 'cover' },
  'Altered Security': { bg: LIGHT, fit: 'contain' },
  'Red Team Hacker Academy': { bg: LIGHT, fit: 'cover' },
  'CWL · CyberWarFare Labs': { bg: '#0f0f0f', fit: 'cover' },
  'BlackPerl DFIR': { bg: DARK, fit: 'contain' },
  'Stellar Data Recovery': { bg: LIGHT, fit: 'cover' },
  'Unstop': { bg: LIGHT, fit: 'contain' },
  '.XYZ Domains': { bg: LIGHT, fit: 'cover' },
  'MetaCTF · Skillbit': { bg: DARK, fit: 'contain' },
  'KnightSquad': { bg: DARK, fit: 'contain' },
  'ThunderCipher': { bg: DARK, fit: 'contain' },
  'CyberInfoga': { bg: DARK, fit: 'contain' },
  'XSS Rat': { bg: DARK, fit: 'contain' },
};
