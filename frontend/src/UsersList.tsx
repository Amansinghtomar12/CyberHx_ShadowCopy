import React, { useState, useEffect } from 'react';
import { Search } from 'lucide-react';
import { supabase } from './lib/supabase';

interface UserRow {
  id: string;
  username: string;
  country: string | null;
  total_points: number;
  solved_count: number;
}

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

  return (
    <div className="flex-1 max-w-6xl mx-auto w-full px-8 py-16 text-center">
      <h1 className="text-5xl font-bold text-white mb-16 tracking-tight">Users</h1>

      <div className="flex gap-4 mb-10 max-w-4xl mx-auto">
        <div className="relative flex-1">
          <input
            type="text"
            placeholder="Search for matching users"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-cyber-sidebar border border-cyber-border rounded px-4 py-3 text-white focus:outline-none focus:border-blue-600 transition-all text-xs"
          />
        </div>
        <button className="bg-blue-600 text-white px-8 py-3 rounded text-[11px] font-bold uppercase tracking-widest transition-all hover:bg-blue-700 shadow-lg">
          <Search className="w-4 h-4" />
        </button>
      </div>

      <div className="overflow-hidden rounded-lg border border-cyber-border bg-cyber-card text-left max-w-6xl mx-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-cyber-sidebar/50 border-b border-cyber-border text-[10px] font-bold text-cyber-muted uppercase tracking-widest">
              <th className="px-6 py-5">#</th>
              <th className="px-6 py-5">User</th>
              <th className="px-6 py-5 text-center">Solves</th>
              <th className="px-6 py-5 text-center">Country</th>
              <th className="px-6 py-5 text-right">Score</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-cyber-border/50">
            {loading ? (
              <tr><td colSpan={5} className="px-6 py-10 text-center text-cyber-muted animate-pulse">Loading...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={5} className="px-6 py-10 text-center text-cyber-muted">No users found</td></tr>
            ) : (
              filtered.map((user, i) => (
                <tr key={user.id} className="hover:bg-cyber-sidebar/30 transition-colors">
                  <td className="px-6 py-5 text-cyber-muted font-bold">{i + 1}</td>
                  <td className="px-6 py-5">
                    <span className="text-cyber-neon font-medium">{user.username}</span>
                  </td>
                  <td className="px-6 py-5 text-center text-cyber-muted">{user.solved_count}</td>
                  <td className="px-6 py-5 text-center text-cyber-muted">{user.country ?? '—'}</td>
                  <td className="px-6 py-5 text-right font-mono font-bold text-white">{user.total_points}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

