// Pure view-models for B2R (Boot-to-Root) boxes. Like chainModel, this NEVER
// decides "solved" — the caller passes the authoritative predicate (App's
// solve sets, derived from trusted solve records). A box has TWO flags, each
// an ordinary challenge underneath; the box is ROOTED when both are solved.

import type { Challenge } from '../../types';
import type { DBB2RBox, DBB2RSeries, DBB2RMember } from '../../lib/supabase';
import type { ChainSeriesVM, ChainNodeVM, ChainSegmentVM } from '../chain/chainModel';

export interface B2RBoxVM {
  id: string;
  title: string;
  category: string;
  description: string;
  difficulty: string | null;
  readmeUrl: string | null;
  userChallengeId: string;
  rootChallengeId: string;
  userChallenge: Challenge | null;   // null when not in the visible catalog
  rootChallenge: Challenge | null;
  userSolved: boolean;               // own OR teammate (authoritative)
  rootSolved: boolean;
  rooted: boolean;                   // both flags solved
  userSolvedByTeammate: boolean;
  rootSolvedByTeammate: boolean;
  points: number;                    // user + root points
  earned: number;                    // points from the flags already solved
  seriesId: string | null;           // published series => B2R-CHAINED
  position: number | null;
}

export function buildB2RBoxVM(
  box: DBB2RBox,
  challengeById: Map<string, Challenge>,
  isSolved: (id: string) => boolean,
  isSolvedByMe: (id: string) => boolean,
): B2RBoxVM {
  const uc = challengeById.get(box.user_challenge_id) ?? null;
  const rc = challengeById.get(box.root_challenge_id) ?? null;
  const userSolved = isSolved(box.user_challenge_id);
  const rootSolved = isSolved(box.root_challenge_id);
  const up = uc?.points ?? 0;
  const rp = rc?.points ?? 0;
  return {
    id: box.id,
    title: box.title,
    category: box.category,
    description: box.description,
    difficulty: box.difficulty,
    readmeUrl: box.readme_url ?? null,
    userChallengeId: box.user_challenge_id,
    rootChallengeId: box.root_challenge_id,
    userChallenge: uc,
    rootChallenge: rc,
    userSolved,
    rootSolved,
    rooted: userSolved && rootSolved,
    userSolvedByTeammate: userSolved && !isSolvedByMe(box.user_challenge_id),
    rootSolvedByTeammate: rootSolved && !isSolvedByMe(box.root_challenge_id),
    points: up + rp,
    earned: (userSolved ? up : 0) + (rootSolved ? rp : 0),
    seriesId: box.series_id ?? null,
    position: box.position ?? null,
  };
}

// A B2R chain is rendered by the SAME ChainExperience / Chain2D renderer as a
// regular chain. Each node is a BOX (node.challengeId = box id), a node is
// "solved" when the box is fully ROOTED, and a segment ignites when both
// adjacent boxes are rooted. `challenge` is the box's user-flag challenge so
// the renderer treats the node as available (it only checks for null).
export function buildB2RSeriesVM(
  series: DBB2RSeries,
  allMembers: DBB2RMember[],
  boxById: Map<string, B2RBoxVM>,
): ChainSeriesVM {
  const members = allMembers
    .filter((m) => m.series_id === series.id)
    .sort((a, b) => a.position - b.position);

  const nodes: ChainNodeVM[] = members.map((m) => {
    const box = boxById.get(m.box_id) ?? null;
    const avail = box?.userChallenge ?? box?.rootChallenge ?? null;
    const solved = !!box?.rooted;
    const mine = !!box && box.rooted && !box.userSolvedByTeammate && !box.rootSolvedByTeammate;
    return {
      position: m.position,
      challengeId: m.box_id,
      challenge: avail,
      title: box?.title ?? 'Locked box',
      difficulty: (box?.difficulty as ChainNodeVM['difficulty']) ?? null,
      points: box ? box.points : null,
      solveCount: box?.rootChallenge?.solvedCount ?? 0,
      solved,
      solvedByTeammate: solved && !mine,
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
