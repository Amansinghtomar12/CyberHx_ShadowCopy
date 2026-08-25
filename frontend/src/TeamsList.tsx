import React, { useState, useEffect } from 'react';
import { Search, Users, Trophy, SearchX } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { supabase } from './lib/supabase';

interface TeamRow {
  id: string;
  name: string;
  total_points: number;
  member_count: number;
  last_solve: string | null;
}

/* ── presentational helpers (no logic) ─────────────────────────── */

const TeamMonogram = ({ name }: { name: string }) => (
  <span
    aria-hidden="true"
    className="hidden sm:flex w-8 h-8 shrink-0 items-center justify-center rounded-inset
               bg-surface-inset border border-border-subtle font-mono text-small font-bold
               text-text-secondary shadow-well"
  >
    {(name?.trim()?.[0] ?? '?').toUpperCase()}
  </span>
);

const SkeletonRow = () => (
  <tr>
    <td className="px-5 py-4">
      <div className="flex items-center gap-3">
        <span className="hidden sm:block skeleton w-8 h-8 rounded-inset" />
        <span className="skeleton skeleton-text w-32 sm:w-48" />
      </div>
    </td>
    <td className="px-5 py-4">
      <span className="skeleton skeleton-text w-6 mx-auto" />
    </td>
    <td className="px-5 py-4">
      <span className="skeleton skeleton-text w-12 ml-auto" />
    </td>
  </tr>
);

export default function TeamsList() {
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('team_scores')
      .select('*')
      .order('total_points', { ascending: false })
      .then(({ data }) => {
        setTeams((data ?? []) as TeamRow[]);
        setLoading(false);
      });
  }, []);

  const filtered = teams.filter(t =>
    t.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const reduceMotion = useReducedMotion();

  return (
    <div className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
      {/* ── Page head ─────────────────────────────────────────── */}
      <header className="mb-8">
        <p className="label-micro">Directory</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <h1 className="text-h1 text-cyber-text">Teams</h1>
          <span className="badge badge-neon shrink-0">
            <Trophy className="h-3 w-3" aria-hidden="true" />
            <span className="font-mono tabular-nums">{teams.length}</span>
            registered
          </span>
        </div>
        <hr className="divider mt-5" />
      </header>

      {/* ── Toolbar ───────────────────────────────────────────── */}
      <div className="mb-6 flex items-center gap-2 sm:gap-3">
        <div className="relative min-w-0 flex-1">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-faint"
          />
          <label className="sr-only" htmlFor="teams-search">Search for matching teams</label>
          <input
            id="teams-search"
            type="text"
            placeholder="Search for matching teams"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input w-full pl-9"
          />
        </div>
        <button
          className="btn btn-primary btn-icon btn-md shrink-0"
          aria-label="Search teams"
        >
          <Search className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {/* ── Table ─────────────────────────────────────────────── */}
      <div className="surface overflow-hidden">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full min-w-[19rem] border-collapse text-left">
            <thead>
              <tr className="bg-surface-rail border-b border-border-base">
                <th scope="col" className="px-5 py-3.5 label-micro">Team</th>
                <th scope="col" className="px-5 py-3.5 label-micro text-center whitespace-nowrap">Members</th>
                <th scope="col" className="px-5 py-3.5 label-micro text-right">Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {loading ? (
                <>
                  <SkeletonRow />
                  <SkeletonRow />
                  <SkeletonRow />
                  <SkeletonRow />
                  <SkeletonRow />
                </>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-6 py-16 text-center">
                    <span
                      aria-hidden="true"
                      className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-border-strong bg-surface-inset text-text-muted"
                    >
                      <SearchX className="h-5 w-5" />
                    </span>
                    <p className="text-h3 text-cyber-text">No teams found</p>
                    <p className="mt-1.5 text-small text-text-muted">
                      Nothing matches that search. Clear the field to see every team.
                    </p>
                  </td>
                </tr>
              ) : (
                filtered.map((team, i) => (
                  <motion.tr
                    key={team.id}
                    initial={reduceMotion ? false : { opacity: 0, transform: 'translateY(6px)' }}
                    animate={{ opacity: 1, transform: 'translateY(0px)' }}
                    transition={{
                      duration: reduceMotion ? 0 : 0.2,
                      delay: reduceMotion ? 0 : Math.min(i, 12) * 0.02,
                      ease: [0.22, 1, 0.36, 1],
                    }}
                    className="group transition-colors duration-[var(--duration-fast)] hover:bg-surface-raised"
                  >
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <TeamMonogram name={team.name} />
                        <span className="truncate text-body font-medium text-cyber-neon transition-colors group-hover:text-neon-bright">
                          {team.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-center">
                      <span className="inline-flex items-center gap-1.5 text-small font-mono text-text-secondary">
                        <Users aria-hidden="true" className="w-3.5 h-3.5 text-text-faint" />
                        {team.member_count}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <span className="font-mono text-body font-bold text-cyber-text tabular-nums">
                        {team.total_points}
                      </span>
                      <span className="hidden sm:inline label-micro ml-1.5 align-baseline">pts</span>
                    </td>
                  </motion.tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="mt-3 flex items-center justify-end gap-1.5 label-micro">
        <Trophy aria-hidden="true" className="w-3 h-3" />
        Ranked by total points
      </p>
    </div>
  );
}
