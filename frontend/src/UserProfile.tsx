import React, { useEffect, useState } from 'react';
import { supabase } from './lib/supabase';
import { useAuth } from './hooks/useAuth';
import { ProgressBars, SolvesTable, ScoreChart } from './SharedComponents';

export default function UserProfile() {
  const { user, profile } = useAuth();
  const [solves, setSolves] = useState<any[]>([]);
  const [fails, setFails] = useState(0);
  const [scoreData, setScoreData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    fetchProfile();
  }, [user]);

  const fetchProfile = async () => {
    if (!user) return;

    // Fetch correct submissions — deduplicate by challenge (CTFd: only first solve counts)
    const { data: correctSubs } = await supabase
      .from('submissions')
      .select('submitted_at, challenge_id, challenges(title, category, points)')
      .eq('user_id', user.id)
      .eq('is_correct', true)
      .order('submitted_at', { ascending: true });

    // CTFd: keep only first solve per challenge
    const seenChallenges = new Set<string>();
    const dedupedSubs = (correctSubs ?? []).filter((s: any) => {
      if (seenChallenges.has(s.challenge_id)) return false;
      seenChallenges.add(s.challenge_id);
      return true;
    });

    // Fetch fail count
    const { count: failCount } = await supabase
      .from('submissions')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_correct', false);

    const solvesFormatted = dedupedSubs.map((s: any) => ({
      title: s.challenges?.title ?? '?',
      category: s.challenges?.category ?? '?',
      value: s.challenges?.points ?? 0,
      time: new Date(s.submitted_at).toLocaleString('en-US', {
        month: 'long', day: 'numeric', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      }),
    }));

    // Build score over time
    let cumulative = 0;
    const graph = solvesFormatted.map((s) => {
      cumulative += s.value;
      return { time: s.time, score: cumulative };
    });

    setSolves(solvesFormatted);
    setFails(failCount ?? 0);
    setScoreData(graph);
    setLoading(false);
  };

  // Category breakdown
  const categoryMap: Record<string, number> = {};
  solves.forEach(s => {
    categoryMap[s.category] = (categoryMap[s.category] || 0) + s.value;
  });
  const totalCatPoints = Object.values(categoryMap).reduce((a, b) => a + b, 0) || 1;
  const COLORS = ['#c6ff00', '#ff00ff', '#00ffff', '#ff8800', '#ff0000', '#ffffff'];
  const categories = Object.entries(categoryMap).map(([name, val], i) => ({
    name, value: (val / totalCatPoints) * 100, color: COLORS[i % COLORS.length]
  }));

  if (loading) return (
    <div className="flex-1 flex items-center justify-center text-cyber-muted text-xs uppercase tracking-widest animate-pulse">
      Loading profile...
    </div>
  );

  return (
    <div className="flex-1 max-w-6xl mx-auto w-full px-8 py-12">
      <div className="text-center mb-16">
        <h1 className="text-5xl font-bold text-white mb-4 tracking-tight">
          {profile?.username ?? user?.email}
        </h1>
        {profile?.team_id && (
          <div className="inline-block px-4 py-1.5 bg-cyber-border/50 text-white font-medium rounded text-sm mb-8 tracking-widest uppercase">
            Team Member
          </div>
        )}
        {/* CTFd: User profile shows solve count only, not personal points */}
        {/* Points belong to the TEAM, not the individual */}
        <div className="text-2xl text-cyber-muted font-light mb-10">
          {solves.length} challenge{solves.length !== 1 ? 's' : ''} solved
        </div>
      </div>

      {solves.length === 0 ? (
        <div className="text-center text-cyber-muted text-xs uppercase tracking-widest py-20">
          No solves yet — go crack some challenges!
        </div>
      ) : (
        <>
          <SolvesTable solves={solves} />
          <ProgressBars solvedCount={solves.length} failCount={fails} categories={categories} />
          {scoreData.length > 0 && <ScoreChart data={scoreData} />}
        </>
      )}

      <footer className="mt-20 text-center py-8 border-t border-cyber-border" />
    </div>
  );
}
