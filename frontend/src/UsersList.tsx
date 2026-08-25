import React, { useState, useEffect } from 'react';
import { Search, Globe2, Trophy, UserX, Flag } from 'lucide-react';
import { motion } from 'motion/react';
import { supabase } from './lib/supabase';

interface UserRow {
  id: string;
  username: string;
  country: string | null;
  total_points: number;
  solved_count: number;
}

/* ── presentational helpers (no logic, no data) ────────────────────────── */

const EASE_OUT_QUINT = [0.22, 1, 0.36, 1] as const;

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Podium colour for the top three ranks, neutral everywhere else. */
const rankAccent = (rank: number) =>
  rank === 1
    ? 'var(--color-neon)'
    : rank === 2
    ? 'var(--color-text-secondary)'
    : rank === 3
    ? 'var(--color-diff-medium)'
    : 'var(--color-text-muted)';

const RankBadge = ({ rank }: { rank: number }) => {
  const accent = rankAccent(rank);
  const podium = rank <= 3;
  return (
    <span
      className="inline-flex h-8 min-w-8 items-center justify-center rounded-inset border px-2 font-mono text-small font-bold tabular-nums"
      style={{
        color: accent,
        borderColor: podium ? `color-mix(in srgb, ${accent} 38%, transparent)` : 'var(--color-border-subtle)',
        backgroundColor: podium ? `color-mix(in srgb, ${accent} 10%, transparent)` : 'transparent',
      }}
    >
      {rank}
    </span>
  );
};

const Avatar = ({ name }: { name: string }) => (
  <span
    aria-hidden="true"
    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border-strong bg-surface-inset font-mono text-small font-bold text-cyber-muted"
  >
    {(name || '?').trim().charAt(0).toUpperCase()}
  </span>
);

const SkeletonRow = () => (
  <div className="flex items-center gap-3 px-4 py-4 sm:px-6">
    <div className="skeleton h-8 w-8 shrink-0 rounded-inset" />
    <div className="skeleton h-8 w-8 shrink-0 rounded-full" />
    <div className="skeleton skeleton-text w-32 flex-1" />
    <div className="skeleton skeleton-text hidden w-16 sm:block" />
    <div className="skeleton skeleton-text w-12" />
  </div>
);

/* ── page ───────────────────────────────────────────────────────────────── */

export default function UsersList() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('user_scores')
      .select('id, username, country, total_points, solved_count')
      .order('total_points', { ascending: false })
      .order('last_solve', { ascending: true })
      .then(({ data }) => {
        setUsers((data ?? []) as UserRow[]);
        setLoading(false);
      });
  }, []);

  const filtered = users.filter(u =>
    u.username.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const reduced = prefersReducedMotion();
  const rise = reduced
    ? { initial: undefined, animate: undefined, transition: undefined }
    : {
        initial: { opacity: 0, y: 12 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.32, ease: EASE_OUT_QUINT },
      };

  return (
    <div className="flex-1">
      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-8 lg:py-page">

        {/* ── header ──────────────────────────────────────────────────── */}
        <motion.header {...rise} className="mb-8">
          <p className="label-micro">Directory</p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
            <h1 className="text-h1 text-cyber-text">Users</h1>
            <span className="badge badge-neon shrink-0">
              <Trophy className="h-3 w-3" aria-hidden="true" />
              <span className="font-mono tabular-nums">{users.length}</span>
              registered
            </span>
          </div>
          <hr className="divider mt-5" />
        </motion.header>

        {/* ── search ──────────────────────────────────────────────────── */}
        <div className="mb-6 flex items-center gap-2 sm:gap-3">
          <div className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-text-faint"
              aria-hidden="true"
            />
            <label htmlFor="users-search" className="sr-only">Search for matching users</label>
            <input
              id="users-search"
              type="text"
              placeholder="Search for matching users"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input w-full pl-9"
            />
          </div>
          <button
            className="btn btn-primary btn-icon btn-md shrink-0"
            aria-label="Search users"
          >
            <Search className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* ── table (sm and up) ───────────────────────────────────────── */}
        <div className="surface overflow-hidden">
          <div className="hidden overflow-x-auto custom-scrollbar sm:block">
            <table className="w-full min-w-[38rem] border-collapse text-left">
              <thead>
                <tr className="border-b border-border-base bg-surface-rail">
                  <th scope="col" className="px-5 py-3.5 label-micro">#</th>
                  <th scope="col" className="px-5 py-3.5 label-micro">User</th>
                  <th scope="col" className="px-5 py-3.5 text-center label-micro">Solves</th>
                  <th scope="col" className="px-5 py-3.5 text-center label-micro">Country</th>
                  <th scope="col" className="px-5 py-3.5 text-right label-micro">Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {loading ? (
                  <tr><td colSpan={5} className="p-0">
                    <div role="status" aria-label="Loading users">
                      {[0, 1, 2, 3, 4].map((i) => <SkeletonRow key={i} />)}
                    </div>
                  </td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={5} className="px-6 py-16">
                    <div className="flex flex-col items-center text-center">
                      <span
                        aria-hidden="true"
                        className="flex h-12 w-12 items-center justify-center rounded-full border border-border-strong bg-surface-inset text-cyber-muted"
                      >
                        <UserX className="h-5 w-5" />
                      </span>
                      <p className="mt-4 text-h3 text-cyber-text">No users found</p>
                      <p className="mt-1.5 max-w-xs text-body text-text-muted">
                        Nothing matches that search. Try a shorter query or clear
                        the field to see everyone.
                      </p>
                    </div>
                  </td></tr>
                ) : (
                  filtered.map((user, i) => (
                    <tr
                      key={user.id}
                      className="transition-colors duration-[var(--duration-base)] ease-standard hover:bg-surface-raised"
                    >
                      <td className="px-5 py-4"><RankBadge rank={i + 1} /></td>
                      <td className="px-5 py-4">
                        <span className="flex items-center gap-3">
                          <Avatar name={user.username} />
                          <span className="min-w-0 truncate font-medium text-cyber-neon">{user.username}</span>
                        </span>
                      </td>
                      <td className="px-5 py-4 text-center font-mono text-small text-text-secondary tabular-nums">
                        {user.solved_count}
                      </td>
                      <td className="px-5 py-4 text-center text-small text-text-muted">
                        {user.country ?? '—'}
                      </td>
                      <td className="px-5 py-4 text-right font-mono font-bold text-cyber-text tabular-nums">
                        {user.total_points}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* ── card list (mobile) ────────────────────────────────────── */}
          <ul className="divide-y divide-border-subtle sm:hidden">
            {loading ? (
              <li role="status" aria-label="Loading users">
                {[0, 1, 2, 3, 4].map((i) => <SkeletonRow key={i} />)}
              </li>
            ) : filtered.length === 0 ? (
              <li className="px-5 py-14">
                <div className="flex flex-col items-center text-center">
                  <span
                    aria-hidden="true"
                    className="flex h-12 w-12 items-center justify-center rounded-full border border-border-strong bg-surface-inset text-cyber-muted"
                  >
                    <UserX className="h-5 w-5" />
                  </span>
                  <p className="mt-4 text-h3 text-cyber-text">No users found</p>
                  <p className="mt-1.5 text-body text-text-muted">
                    Nothing matches that search.
                  </p>
                </div>
              </li>
            ) : (
              filtered.map((user, i) => (
                <li key={user.id} className="flex items-center gap-3 px-4 py-3.5">
                  <RankBadge rank={i + 1} />
                  <Avatar name={user.username} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-cyber-neon">{user.username}</p>
                    <p className="mt-0.5 flex items-center gap-3 text-small text-text-muted">
                      <span className="inline-flex items-center gap-1">
                        <Flag className="h-3 w-3" aria-hidden="true" />
                        <span className="font-mono tabular-nums">{user.solved_count}</span>
                      </span>
                      <span className="inline-flex min-w-0 items-center gap-1">
                        <Globe2 className="h-3 w-3 shrink-0" aria-hidden="true" />
                        <span className="truncate">{user.country ?? '—'}</span>
                      </span>
                    </p>
                  </div>
                  <span className="shrink-0 text-right">
                    <span className="block font-mono font-bold text-cyber-text tabular-nums">
                      {user.total_points}
                    </span>
                    <span className="label-micro">pts</span>
                  </span>
                </li>
              ))
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}
