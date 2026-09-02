/**
 * Scoreboard export.
 *
 * One CSV, the top 200 teams in standings order, with the roster of each.
 * Built from the same views the live scoreboard reads (team_scores, ordered
 * by points then earliest last solve), so the file says what the board
 * said. Nothing here needs new database access: an admin can already read
 * every column involved.
 *
 * It exists for one moment in particular: the instant before "Start new
 * event" wipes the tables. That handler calls exportScoreboardCsv() first
 * and refuses to proceed if the export fails, so a result can never be lost
 * to a reset.
 */
import { supabase } from './supabase';

const TOP = 200;

interface TeamRow { id: string; name: string; member_count: number; total_points: number; solved_count: number; last_solve: string | null }
interface Member { id: string; username: string; team_id: string | null; country: string | null }

/** Excel-safe cell: quoted, quotes doubled, formula-leading characters defused. */
function cell(v: unknown): string {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'event';
}

export interface ExportResult { filename: string; rows: number }

/** Fetch, build and hand the browser the file. Throws on any failure. */
export async function exportScoreboardCsv(eventName: string | null | undefined): Promise<ExportResult> {
  const { data: teams, error: tErr } = await supabase
    .from('team_scores')
    .select('id, name, member_count, total_points, solved_count, last_solve')
    .order('total_points', { ascending: false })
    .order('last_solve', { ascending: true, nullsFirst: false })
    .limit(TOP);
  if (tErr) throw new Error(`standings: ${tErr.message}`);
  const rows = (teams ?? []) as TeamRow[];

  // Rosters and captains for exactly these teams. Two reads, not two hundred.
  const ids = rows.map(t => t.id);
  const membersByTeam = new Map<string, Member[]>();
  const captainByTeam = new Map<string, string>();
  if (ids.length) {
    const { data: members, error: mErr } = await supabase
      .from('safe_profiles').select('id, username, team_id, country').in('team_id', ids);
    if (mErr) throw new Error(`rosters: ${mErr.message}`);
    (members ?? []).forEach((m: Member) => {
      if (!m.team_id) return;
      if (!membersByTeam.has(m.team_id)) membersByTeam.set(m.team_id, []);
      membersByTeam.get(m.team_id)!.push(m);
    });
    const { data: caps } = await supabase.from('public_teams').select('id, captain_id').in('id', ids);
    (caps ?? []).forEach((t: { id: string; captain_id: string | null }) => {
      if (!t.captain_id) return;
      const cap = (members ?? []).find((m: Member) => m.id === t.captain_id);
      if (cap) captainByTeam.set(t.id, cap.username);
    });
  }

  const header = ['rank', 'team', 'points', 'solves', 'last_solve_utc', 'member_count', 'captain', 'members', 'countries'];
  const lines = [header.join(',')];
  rows.forEach((t, i) => {
    const roster = (membersByTeam.get(t.id) ?? []).sort((a, b) => a.username.localeCompare(b.username));
    const countries = Array.from(new Set(roster.map(m => m.country).filter(Boolean))).join(' | ');
    lines.push([
      i + 1, t.name, t.total_points, t.solved_count,
      t.last_solve ? new Date(t.last_solve).toISOString().replace('T', ' ').slice(0, 19) : '',
      t.member_count, captainByTeam.get(t.id) ?? '',
      roster.map(m => m.username).join(' | '), countries,
    ].map(cell).join(','));
  });

  const stamp = new Date().toISOString().slice(0, 16).replace('T', '-').replace(':', '');
  const filename = `${slug(eventName || 'cyberhx-ctf')}-scoreboard-top${TOP}-${stamp}.csv`;
  // BOM so Excel reads UTF-8 team names correctly.
  const blob = new Blob(['﻿' + lines.join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return { filename, rows: rows.length };
}
