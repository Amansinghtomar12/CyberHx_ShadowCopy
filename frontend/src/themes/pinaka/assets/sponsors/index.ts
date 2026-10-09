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
