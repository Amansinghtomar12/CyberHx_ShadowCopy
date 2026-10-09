/**
 * Sponsor and partner logos, exactly as supplied on pinakactf.com. Each import
 * resolves to a Vite asset URL string; config.ts matches them to the
 * PINAKA_PARTNERS entries by name.
 *
 * The files are shown as they are: full colour, no filter, no recolouring.
 * What differs between them is only the tile each one sits on, recorded in
 * SPONSOR_TILES below (measured from the files, not guessed):
 *
 *   cover    the file carries its own square background, so the tile is the
 *            logo edge to edge (object-fit: cover). Only uniform background
 *            is ever cropped by a non-square tile.
 *   contain  a transparent mark, padded on a plate whose colour it was drawn
 *            to read on: light for navy ink, dark for white or neon ink.
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

/** How one logo file sits in its tile. */
export interface SponsorTile {
  /** 'cover': the file's own background fills the tile. 'contain': a padded mark on a plate. */
  fit: 'cover' | 'contain';
  /** The tile colour: the file's own background (cover), or the plate the mark reads on (contain). */
  background: string;
  /** Whether that colour is light or dark; the frame and sheen follow it. */
  tone: 'light' | 'dark';
}

/** A white plate, for marks inked in navy that vanish on the night. */
const LIGHT_PLATE: SponsorTile = { fit: 'contain', background: '#ffffff', tone: 'light' };
/** A deep night plate, for marks drawn in white, neon or bright ink. */
const DARK_PLATE: SponsorTile = { fit: 'contain', background: '#0c1120', tone: 'dark' };

/** Used for a partner added later without an entry below. */
export const DEFAULT_TILE: SponsorTile = DARK_PLATE;

/** Per-logo tile, keyed like SPONSOR_LOGOS (by the partner's published name). */
export const SPONSOR_TILES: Record<string, SponsorTile> = {
  // Square files with their own background: the tile is the logo.
  'INE Security': { fit: 'cover', background: '#252525', tone: 'dark' },
  'CWL · CyberWarFare Labs': { fit: 'cover', background: '#0f0f0f', tone: 'dark' },
  'Red Team Hacker Academy': { fit: 'cover', background: '#ffffff', tone: 'light' },
  'Stellar Data Recovery': { fit: 'cover', background: '#ffffff', tone: 'light' },
  '.XYZ Domains': { fit: 'cover', background: '#ffffff', tone: 'light' },
  // Transparent marks in navy ink (Altered Security's "s", Unstop's #1C4980).
  'Altered Security': LIGHT_PLATE,
  'Unstop': LIGHT_PLATE,
  // Transparent marks in white, neon or bright ink.
  'BlackPerl DFIR': DARK_PLATE,
  'CyberInfoga': DARK_PLATE,
  'KnightSquad': DARK_PLATE,
  'MetaCTF · Skillbit': DARK_PLATE,
  'ThunderCipher': DARK_PLATE,
  'XSS Rat': DARK_PLATE,
};

/**
 * Larger files for a partner shown as featured (its published role, e.g. "In
 * association with"), keyed by name. INE's is 640×640 on its own textured
 * #252525 ground, so it fills its tile like the square files above.
 */
export const FEATURED_SPONSORS: Record<string, { src: string; tile: SponsorTile }> = {
  'INE Security': { src: featuredIne, tile: { fit: 'cover', background: '#252525', tone: 'dark' } },
};
