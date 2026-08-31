/**
 * Signals — the bridge that turns the environment into the event.
 *
 * THE IDEA
 *   Until now the lattice was scenery: a few hundred nodes with no meaning.
 *   This gives a subset of them identity. Node n *is* challenge n. It sits
 *   dark while the challenge is unsolved, carries heat in proportion to how
 *   much of the field has cracked it, and ignites permanently once you solve
 *   it yourself. The constellation behind the interface stops being wallpaper
 *   and becomes a live picture of the competition you are inside.
 *
 *   That is the part no template can hand you. It only works because the
 *   renderer is ours: a bought background has no idea what a challenge is.
 *
 * WHY A STORE AND NOT PROPS
 *   The consumer is a WebGL loop that already runs every frame and does not
 *   participate in React rendering. Pushing this through context would
 *   re-render the tree to hand a number to something that never reads props.
 *
 * MAPPING
 *   Challenges are sorted by id before being indexed, so a given challenge
 *   keeps the same node across reloads, poll refreshes and re-sorts of the
 *   board. Without that the constellation would rearrange itself every five
 *   minutes and mean nothing.
 */

export interface ChallengeSignal {
  id: string;
  /** You (or your team) have solved it. Ignites the node for good. */
  solved: boolean;
  /** 0..1 — share of the field that has solved it. Drives colour temperature. */
  heat: number;
}

/** Packed per-node state the shader reads. Index = node index. */
export interface SignalFrame {
  /** 0 = ambient node with no meaning, 1 = a challenge. */
  kind: Float32Array;
  /** 0..1 heat. */
  heat: Float32Array;
  /** 0 or 1 — solved by you. */
  solved: Float32Array;
}

type Listener = (f: SignalFrame) => void;
type PulseListener = (nodeIndex: number) => void;

let capacity = 0;
let frame: SignalFrame | null = null;

/**
 * Set by the renderer once it knows how many nodes it built. Zero means there
 * is no lattice (static tier, no WebGL), and every publish below becomes a
 * cheap no-op rather than something callers have to guard.
 */
export function setLatticeCapacity(n: number) { capacity = n; }
export function latticeCapacity() { return capacity; }
let order: string[] = [];
const listeners = new Set<Listener>();
const pulseListeners = new Set<PulseListener>();

/**
 * Publish the current board. `capacity` is how many nodes the renderer has to
 * spend; challenges beyond it simply stay ambient rather than overflowing.
 */
export function setSignals(list: ChallengeSignal[]) {
  if (capacity <= 0) return;
  const sorted = [...list].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  order = sorted.map(c => c.id);

  const kind = new Float32Array(capacity);
  const heat = new Float32Array(capacity);
  const solved = new Float32Array(capacity);

  // Spread challenges through the field rather than filling the first N nodes,
  // so the meaningful ones are not all bunched in one corner of the volume.
  const stride = Math.max(1, Math.floor(capacity / Math.max(1, sorted.length)));
  sorted.forEach((c, i) => {
    const n = (i * stride) % capacity;
    kind[n] = 1;
    heat[n] = Math.max(0, Math.min(1, c.heat));
    solved[n] = c.solved ? 1 : 0;
  });

  frame = { kind, heat, solved };
  listeners.forEach(fn => fn(frame!));
}

/** The node a challenge currently occupies, or -1. */
export function nodeForChallenge(id: string): number {
  if (capacity <= 0) return -1;
  const i = order.indexOf(id);
  if (i < 0) return -1;
  const stride = Math.max(1, Math.floor(capacity / Math.max(1, order.length)));
  return (i * stride) % capacity;
}

/** Fire a one-shot shockwave from a challenge's node. Called on a fresh solve. */
export function pulseChallenge(id: string) {
  const n = nodeForChallenge(id);
  if (n >= 0) pulseListeners.forEach(fn => fn(n));
}

export function subscribeSignals(fn: Listener): () => void {
  listeners.add(fn);
  if (frame) fn(frame);          // late subscriber still gets current state
  return () => { listeners.delete(fn); };
}

export function subscribePulse(fn: PulseListener): () => void {
  pulseListeners.add(fn);
  return () => { pulseListeners.delete(fn); };
}
