import React, { useState, useEffect } from 'react';
import { Search } from 'lucide-react';
import { supabase } from './lib/supabase';

interface TeamRow {
  id: string;
  name: string;
  total_points: number;
  member_count: number;
  last_solve: string | null;
}

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

  return (
    <div className="flex-1 max-w-6xl mx-auto w-full px-8 py-16 text-center">
      <h1 className="text-5xl font-bold text-white mb-16 tracking-tight">Teams</h1>

      <div className="flex gap-4 mb-10 max-w-4xl mx-auto">
        <select className="bg-cyber-sidebar border border-cyber-border rounded px-4 py-3 text-white focus:outline-none focus:border-blue-600 transition-all text-xs appearance-none min-w-[120px]">
          <option>Name</option>
        </select>
        <div className="relative flex-1">
          <input
            type="text"
            placeholder="Search for matching teams"
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
              <th className="px-6 py-5">Team</th>
              <th className="px-6 py-5 text-center">Members</th>
              <th className="px-6 py-5 text-right">Score</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-cyber-border/50">
            {loading ? (
              <tr><td colSpan={3} className="px-6 py-10 text-center text-cyber-muted animate-pulse">Loading...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={3} className="px-6 py-10 text-center text-cyber-muted">No teams yet</td></tr>
            ) : (
              filtered.map((team) => (
                <tr key={team.id} className="hover:bg-cyber-sidebar/30 transition-colors">
                  <td className="px-6 py-5">
                    <span className="text-cyber-neon font-medium">{team.name}</span>
                  </td>
                  <td className="px-6 py-5 text-center text-cyber-muted">{team.member_count}</td>
                  <td className="px-6 py-5 text-right font-mono font-bold text-white">{team.total_points}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
