import React, { useEffect, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { supabase } from './lib/supabase';

const COLORS = [
  '#c6ff00', '#ff00ff', '#00ffff', '#ff8800', '#ffffff',
  '#888888', '#ff0000', '#00ff00', '#0000ff', '#ffff00',
];

interface TeamScore {
  id: string;
  name: string;
  total_points: number;
  member_count: number;
  solved_count: number;
  last_solve: string | null;
}

interface GraphPoint {
  time: string;
  [team: string]: number | string;
}

export default function Scoreboard() {
  const [teams, setTeams] = useState<TeamScore[]>([]);
  const [graphData, setGraphData] = useState<GraphPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchScoreboard();
    const interval = setInterval(fetchScoreboard, 60000);
    return () => clearInterval(interval);
  }, []);

  const fetchScoreboard = async () => {
    // 1. Get top teams
    const { data: teamData } = await supabase
      .from('team_scores')
      .select('*')
      .order('total_points', { ascending: false })
      .order('last_solve', { ascending: true })
      .limit(10);

    if (!teamData?.length) { setLoading(false); return; }
    setTeams(teamData as TeamScore[]);

    const top10Teams = teamData as TeamScore[];
    const top10Names = top10Teams.map(t => t.name);
    const teamIdToName: Record<string, string> = {};
    top10Teams.forEach(t => { teamIdToName[t.id] = t.name; });

    // 2. ✅ Secure RPC — challenges table directly access nahi hoti
    const { data: subs, error } = await supabase
      .rpc('get_solve_data', {
        team_ids: top10Teams.map(t => t.id)
      });

    if (error || !subs?.length) { setLoading(false); return; }

    // 3. CTFd style graph: per team, count unique challenges only
    const teamPoints: Record<string, number> = {};
    const teamSeenChallenges: Record<string, Set<string>> = {};
    top10Names.forEach(name => {
      teamPoints[name] = 0;
      teamSeenChallenges[name] = new Set();
    });

    const points: GraphPoint[] = [];

    subs.forEach((s: any) => {
      const teamName = teamIdToName[s.team_id];
      if (!teamName || !top10Names.includes(teamName)) return;

      if (teamSeenChallenges[teamName].has(s.challenge_id)) return;
      teamSeenChallenges[teamName].add(s.challenge_id);

      // ✅ FIX: s.points use karo, s.challenges?.points nahi
      teamPoints[teamName] += s.points ?? 0;

      const time = new Date(s.submitted_at).toLocaleTimeString('en-US', {
        hour: '2-digit', minute: '2-digit'
      });

      const point: GraphPoint = { time };
      top10Names.forEach(name => { point[name] = teamPoints[name]; });
      points.push(point);
    });

    setGraphData(points);
    setLoading(false);
  };

  const top10Names = teams.slice(0, 10).map(t => t.name);

  return (
    <div className="flex-1 px-8 py-10 max-w-6xl mx-auto w-full">
      <div className="text-center mb-16">
        <h2 className="text-5xl font-bold text-white mb-4 tracking-tight">Scoreboard</h2>
        <div className="h-1 w-20 bg-cyber-neon mx-auto rounded-full" />
      </div>

      {/* Graph */}
      <div className="mb-20">
        <h3 className="text-sm font-bold text-cyber-muted uppercase tracking-[0.2em] mb-10 text-center">Top 10 Teams</h3>
        <div className="bg-cyber-card border border-cyber-border rounded-lg p-8 h-[450px] shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-cyber-neon/20 to-transparent" />
          {loading ? (
            <div className="flex items-center justify-center h-full text-cyber-muted text-xs uppercase tracking-widest animate-pulse">Loading...</div>
          ) : graphData.length === 0 ? (
            <div className="flex items-center justify-center h-full text-cyber-muted text-xs uppercase tracking-widest">No solve data yet</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={graphData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1d2b3a" vertical={false} />
                <XAxis dataKey="time" stroke="#4b5563" fontSize={10} tickLine={false} axisLine={false} dy={10} />
                <YAxis stroke="#4b5563" fontSize={10} tickLine={false} axisLine={false} dx={-10} />
                <Tooltip contentStyle={{ backgroundColor: '#0d161f', border: '1px solid #1d2b3a', borderRadius: '4px', fontSize: '12px', color: '#fff' }} />
                <Legend verticalAlign="bottom" height={36} iconType="circle"
                  wrapperStyle={{ fontSize: '10px', paddingTop: '20px', textTransform: 'uppercase', letterSpacing: '1px' }} />
                {top10Names.map((name, i) => (
                  <Line key={name} type="monotone" dataKey={name}
                    stroke={COLORS[i % COLORS.length]} strokeWidth={2}
                    dot={{ r: 3, fill: COLORS[i % COLORS.length], strokeWidth: 0 }}
                    activeDot={{ r: 5, strokeWidth: 0 }} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Scoreboard Table */}
      <div className="overflow-hidden rounded-lg border border-cyber-border bg-cyber-card shadow-2xl">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-cyber-sidebar/50 border-b border-cyber-border">
              <th className="px-8 py-5 text-[10px] font-bold text-cyber-muted uppercase tracking-[0.2em]">Place</th>
              <th className="px-8 py-5 text-[10px] font-bold text-cyber-muted uppercase tracking-[0.2em]">Team</th>
              <th className="px-8 py-5 text-[10px] font-bold text-cyber-muted uppercase tracking-[0.2em] text-center">Solves</th>
              <th className="px-8 py-5 text-[10px] font-bold text-cyber-muted uppercase tracking-[0.2em] text-right">Score</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-cyber-border/50">
            {loading ? (
              <tr><td colSpan={4} className="px-8 py-10 text-center text-cyber-muted text-xs animate-pulse">Loading...</td></tr>
            ) : teams.length === 0 ? (
              <tr><td colSpan={4} className="px-8 py-10 text-center text-cyber-muted text-xs">No teams yet</td></tr>
            ) : (
              teams.map((team, i) => (
                <tr key={team.id} className="hover:bg-cyber-sidebar/30 transition-colors">
                  <td className="px-8 py-5 text-sm font-bold text-white w-24">{i + 1}</td>
                  <td className="px-8 py-5">
                    <span className="text-sm font-medium text-cyber-neon">{team.name}</span>
                  </td>
                  <td className="px-8 py-5 text-sm font-mono text-cyber-muted text-center">
                    {(team as any).solved_count ?? 0}
                  </td>
                  <td className="px-8 py-5 text-sm font-mono text-white text-right font-bold">
                    {team.total_points}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}