// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js';
import { configureUplink, uplinkFetch } from './uplink';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase env vars. Check your .env.local file.');
}

configureUplink(supabaseUrl, supabaseAnonKey);

// Every request goes through the uplink monitor, so an unreachable backend is
// noticed by the platform rather than discovered by the player.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: { fetch: uplinkFetch },
});

// ─────────────────────────────────────────
// DATABASE TYPES
// ─────────────────────────────────────────
export interface DBProfile {
  id: string;
  username: string;
  email?: string; // not always returned
  avatar_url: string | null;
  website?: string | null;
  affiliation?: string | null;
  country: string | null;
  bio: string | null;
  role: 'player' | 'moderator' | 'admin';
  is_admin: boolean; // computed from role for backward compat
  /** Exactly one profile carries this. Gates the flag vault in the UI;
      the server re-checks it in is_owner() and never trusts this field. */
  is_owner: boolean;
  is_banned: boolean;
  is_hidden: boolean;
  is_moderator: boolean; // computed from role for backward compat
  team_id: string | null;
  created_at: string;
}

export interface DBTeam {
  id: string;
  name: string;
  invite_code: string;
  captain_id: string | null;
  created_at: string;
}

export interface DBChallenge {
  id: string;
  title: string;
  category: 'web' | 'crypto' | 'steg' | 'rev' | 'pwn' | 'forensic' | 'osint' | 'mobile' | 'b2r' | 'misc';
  difficulty: 'Easy' | 'Medium' | 'Hard' | 'Insane';
  points: number;
  description: string;
  max_attempts?: number;
  author: string;
  is_visible: boolean;
  tags: string[];
  created_at: string;
  connection_info?: string;
  files?: { id: string; name: string; url: string; size_bytes?: number }[];
  hints?: { id: string; cost: number }[];
}

export interface DBHint {
  id: string;
  challenge_id: string;
  cost: number;
  content: string;
}

// ── Chained Challenges (optional experience layer) ──────────────────────
// Shapes returned by the gated public_chain_series / public_chain_members
// views. Structure only — never flags, scores, or hidden-challenge data.
export interface DBChainSeries {
  id: string;
  title: string;
  category: string;
  description: string;
  readme: string;
  readme_url: string | null;
  difficulty: 'Easy' | 'Medium' | 'Hard' | 'Insane' | null;
  display_order: number;
  challenge_count: number;
}

export interface DBChainMember {
  series_id: string;
  challenge_id: string;
  position: number;
}

// ── B2R / Boot-to-Root boxes (optional experience layer) ────────────────
// Shapes returned by the gated public_b2r_boxes / public_b2r_series /
// public_b2r_members views. Structure only — never flags, scores, or
// hidden-challenge data. A box's two flags are ordinary challenge rows
// (user_challenge_id / root_challenge_id) that live in the normal catalog.
export interface DBB2RBox {
  id: string;
  title: string;
  category: string;
  description: string;
  difficulty: 'Easy' | 'Medium' | 'Hard' | 'Insane' | null;
  display_order: number;
  readme_url: string | null;
  user_challenge_id: string;
  root_challenge_id: string;
  series_id: string | null;   // the PUBLISHED series it belongs to; null => B2R-FREE
  position: number | null;
}

export interface DBB2RSeries {
  id: string;
  title: string;
  category: string;
  description: string;
  readme: string;
  readme_url: string | null;
  difficulty: 'Easy' | 'Medium' | 'Hard' | 'Insane' | null;
  display_order: number;
  box_count: number;
}

export interface DBB2RMember {
  series_id: string;
  box_id: string;
  position: number;
}

export interface UserScore {
  id: string;
  username: string;
  team_id: string | null;
  country: string | null;
  avatar_url: string | null;
  total_points: number;
  solved_count: number;
  last_solve: string | null;
}

export interface TeamScore {
  id: string;
  name: string;
  member_count: number;
  total_points: number;
  solved_count?: number;
  last_solve: string | null;
}
