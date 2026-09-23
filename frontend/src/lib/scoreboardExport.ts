/**
 * Scoreboard export.
 *
 * One CSV: every team that scored at least one point, in standings order,
 * with the roster of each. Teams on zero are left out. Built from the same
 * view the live scoreboard reads (team_scores, ordered by points then
 * earliest last solve), and ranked the way the scoreboard ranks a team
 * (teams strictly ahead + 1), so the file says what the board said. Nothing
 * here needs new database access: an admin can already read every column
 * involved.
 *
 * It exists for two moments: handing out certificates after an event, and
 * the instant before "Start new event" wipes the tables. That handler calls
 * exportScoreboardCsv() first and refuses to proceed if the export fails, so
 * a result can never be lost to a reset.
 */
import { supabase } from './supabase';

interface TeamRow { id: string; name: string; member_count: number; total_points: number; solved_count: number; last_solve: string | null }
interface Member { id: string; username: string; email: string; team_id: string | null; country: string | null; is_banned: boolean | null }

/**
 * Every row a query matches, a page at a time. PostgREST caps each response
 * (1000 rows on this project), so a single read silently stops there. Paging
 * ends on an empty page rather than a short one, which keeps it correct
 * whatever the cap is. The query must have a total order or pages overlap.
 */
async function readAll<T>(label: string, build: () => any): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; ) {
    const { data, error } = await build().range(from, from + 999);
    if (error) throw new Error(`${label}: ${error.message}`);
    const page = (data ?? []) as T[];
    if (!page.length) return all;
    all.push(...page);
    from += page.length;
  }
}

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
  const standings = await readAll<TeamRow>('standings', () => supabase
    .from('team_scores')
    .select('id, name, member_count, total_points, solved_count, last_solve')
    .gt('total_points', 0)
    .order('total_points', { ascending: false })
    .order('last_solve', { ascending: true, nullsFirst: false })
    .order('id', { ascending: true }));
  // A solve landing mid-export can shift a team across a page boundary.
  const seen = new Set<string>();
  const rows = standings.filter(t => !seen.has(t.id) && seen.add(t.id));

  // Whole tables, filtered here: a list of every scoring team's id would not
  // fit in a request URL once the board runs to a few hundred teams.
  const wanted = new Set(rows.map(t => t.id));
  const membersByTeam = new Map<string, Member[]>();
  const captainByTeam = new Map<string, string>();
  if (wanted.size) {
    const members = await readAll<Member>('rosters', () => supabase
      .from('profiles')
      .select('id, username, email, team_id, country, is_banned')
      .not('team_id', 'is', null)
      .order('id', { ascending: true }));
    const usernameById = new Map<string, string>();
    members.forEach(m => {
      // Banned players are not in member_count, and get no certificate.
      if (!m.team_id || !wanted.has(m.team_id) || m.is_banned) return;
      usernameById.set(m.id, m.username);
      if (!membersByTeam.has(m.team_id)) membersByTeam.set(m.team_id, []);
      membersByTeam.get(m.team_id)!.push(m);
    });
    const caps = await readAll<{ id: string; captain_id: string | null }>('captains', () => supabase
      .from('public_teams')
      .select('id, captain_id')
      .order('id', { ascending: true }));
    caps.forEach(t => {
      const cap = t.captain_id && wanted.has(t.id) ? usernameById.get(t.captain_id) : undefined;
      if (cap) captainByTeam.set(t.id, cap);
    });
  }

  const header = ['rank', 'team', 'points', 'solves', 'last_solve_utc', 'member_count', 'captain', 'members', 'emails', 'countries'];
  const lines = [header.join(',')];
  let rank = 0;
  rows.forEach((t, i) => {
    // Level on points and last solve means level on the board: same rank.
    const prev = rows[i - 1];
    if (!prev || prev.total_points !== t.total_points || prev.last_solve !== t.last_solve) rank = i + 1;
    const roster = (membersByTeam.get(t.id) ?? []).sort((a, b) => a.username.localeCompare(b.username));
    const countries = Array.from(new Set(roster.map(m => m.country).filter(Boolean))).join(' | ');
    lines.push([
      rank, t.name, t.total_points, t.solved_count,
      t.last_solve ? new Date(t.last_solve).toISOString().replace('T', ' ').slice(0, 19) : '',
      t.member_count, captainByTeam.get(t.id) ?? '',
      roster.map(m => m.username).join(' | '),
      roster.map(m => m.email).join(' | '),
      countries,
    ].map(cell).join(','));
  });

  const stamp = new Date().toISOString().slice(0, 16).replace('T', '-').replace(':', '');
  const filename = `${slug(eventName || 'cyberhx-ctf')}-scoreboard-${rows.length}-teams-${stamp}.csv`;
  // BOM so Excel reads UTF-8 team names correctly.
  const blob = new Blob(['﻿' + lines.join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return { filename, rows: rows.length };
}
