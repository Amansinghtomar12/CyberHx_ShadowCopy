// Pure view-model for a chain series. Shared by the player experience and the
// admin 3D preview. It NEVER decides "solved" — the caller passes in the
// authoritative predicate (App's isChallengeSolved, derived from trusted solve
// records). A segment ignites iff BOTH its endpoints are solved.

import type { Challenge } from '../../types';
import type { DBChainSeries, DBChainMember } from '../../lib/supabase';

export interface ChainNodeVM {
  position: number;          // 1-based position along the chain
  challengeId: string;
  challenge: Challenge | null; // null when the member isn't in the visible catalog
  title: string;
  difficulty: Challenge['difficulty'] | null;
  points: number | null;
  solveCount: number;
  solved: boolean;           // own OR teammate (authoritative)
  solvedByTeammate: boolean; // solved by a teammate but not by me
}

export interface ChainSegmentVM {
  from: number;              // position of the earlier node
  to: number;                // position of the later node
  active: boolean;           // both endpoints solved → burning
}

export interface ChainSeriesVM {
  id: string;
  title: string;
  category: string;
  description: string;
  readme: string;
  readmeUrl: string | null;
  difficulty: string | null;
  nodes: ChainNodeVM[];
  segments: ChainSegmentVM[];
  solvedCount: number;
  total: number;
  activeSegmentCount: number;
}

export function buildChainSeriesVM(
  series: DBChainSeries,
  allMembers: DBChainMember[],
  challengeById: Map<string, Challenge>,
  isSolved: (id: string) => boolean,
  isSolvedByMe: (id: string) => boolean,
): ChainSeriesVM {
  const members = allMembers
    .filter((m) => m.series_id === series.id)
    .sort((a, b) => a.position - b.position);

  const nodes: ChainNodeVM[] = members.map((m) => {
    const ch = challengeById.get(m.challenge_id) ?? null;
    const solved = isSolved(m.challenge_id);
    return {
      position: m.position,
      challengeId: m.challenge_id,
      challenge: ch,
      title: ch?.title ?? 'Locked node',
      difficulty: ch?.difficulty ?? null,
      points: ch?.points ?? null,
      solveCount: ch?.solvedCount ?? 0,
      solved,
      solvedByTeammate: solved && !isSolvedByMe(m.challenge_id),
    };
  });

  const segments: ChainSegmentVM[] = [];
  for (let i = 0; i < nodes.length - 1; i++) {
    const a = nodes[i];
    const b = nodes[i + 1];
    segments.push({ from: a.position, to: b.position, active: a.solved && b.solved });
  }

  const solvedCount = nodes.filter((n) => n.solved).length;
  return {
    id: series.id,
    title: series.title,
    category: series.category,
    description: series.description,
    readme: series.readme,
    readmeUrl: series.readme_url ?? null,
    difficulty: series.difficulty,
    nodes,
    segments,
    solvedCount,
    total: nodes.length,
    activeSegmentCount: segments.filter((s) => s.active).length,
  };
}
