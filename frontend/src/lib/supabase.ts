// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase env vars. Check your .env.local file.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

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
  category: 'web' | 'crypto' | 'steg' | 'rev' | 'pwn' | 'forensic' | 'osint' | 'misc';
  difficulty: 'Easy' | 'Medium' | 'Hard' | 'Insane';
  points: number;
  description: string;
  max_attempts?: number;
  author: string;
  is_visible: boolean;
  tags: string[];
  created_at: string;
  connection_info?: string;
  files?: { id: string; name: string; url: string }[];
  hints?: { id: string; cost: number }[];
}

export interface DBHint {
  id: string;
  challenge_id: string;
  cost: number;
  content: string;
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
