// Chain geometry: a single torus "link" mesh, a receding 3D path, and an
// interlocking layout of links along it with anchor nodes for the challenges.
// All procedural — no model files (the CSP only allows self/data assets).

import {
  Vec3, normalize, sub, cross, lerp, lerp3,
  quatFromTo, quatMul, quatAxisAngle, mat4Compose,
} from './chainMath';

export interface TorusMesh {
  positions: Float32Array; // vec3
  normals: Float32Array;   // vec3
  indices: Uint16Array;
  vertexCount: number;
  indexCount: number;
}

// Torus centred at origin, tube around the XY plane, hole-axis = local +Z.
export function buildTorus(R: number, r: number, majSeg: number, minSeg: number): TorusMesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i <= majSeg; i++) {
    const u = (i / majSeg) * Math.PI * 2;
    const cu = Math.cos(u), su = Math.sin(u);
    for (let j = 0; j <= minSeg; j++) {
      const v = (j / minSeg) * Math.PI * 2;
      const cv = Math.cos(v), sv = Math.sin(v);
      // Point on tube.
      const x = (R + r * cv) * cu;
      const y = (R + r * cv) * su;
      const z = r * sv;
      positions.push(x, y, z);
      // Normal points from the tube centre-line outward.
      const nx = cv * cu, ny = cv * su, nz = sv;
      normals.push(nx, ny, nz);
    }
  }
  const stride = minSeg + 1;
  for (let i = 0; i < majSeg; i++) {
    for (let j = 0; j < minSeg; j++) {
      const a = i * stride + j;
      const b = (i + 1) * stride + j;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    indices: new Uint16Array(indices),
    vertexCount: positions.length / 3,
    indexCount: indices.length,
  };
}

// A cinematic path that recedes into the distance with a gentle sinuous sway
// and a slight downward arc — the "chain extending into the dark" composition.
const NEAR_Z = 2.4;
const FAR_Z = -20.0;

export function samplePath(t: number): Vec3 {
  const z = lerp(NEAR_Z, FAR_Z, t);
  // Sway grows a little with depth so the near links sit centred and the tail
  // curls off toward the horizon.
  const sway = 0.35 + 0.65 * t;
  const x = Math.sin(t * 2.35) * 1.7 * sway;
  const y = Math.cos(t * 1.65) * 0.9 * sway - t * 1.6 - 0.2;
  return [x, y, z];
}

function pathTangent(t: number): Vec3 {
  const h = 0.5e-2;
  const a = samplePath(Math.max(0, t - h));
  const b = samplePath(Math.min(1, t + h));
  return normalize(sub(b, a));
}

export interface ChainLayout {
  instanceMatrix: Float32Array; // 16 per instance
  instanceSegment: Float32Array; // segment index per instance
  instanceIsNode: Float32Array;  // 1 for challenge anchors, 0 for filler links
  count: number;
  nodeWorld: Vec3[];             // world position of each challenge node (for overlay/picking)
  nodeScreenScale: number[];     // relative size hint per node (perspective-ish)
}

// Build the full chain: `nodeCount` challenge anchors evenly along the path,
// with `linksPerSeg` filler links between each adjacent pair. Consecutive links
// alternate their hole-axis between the path normal and binormal so they
// physically interlock, exactly like a real chain.
export function layoutChain(nodeCount: number, linksPerSeg: number, linkR: number): ChainLayout {
  const n = Math.max(1, nodeCount);
  const nodeTs: number[] = [];
  for (let i = 0; i < n; i++) nodeTs.push(n === 1 ? 0.5 : i / (n - 1));

  // Collect instances as {t, isNode, segment}.
  const items: { t: number; isNode: boolean; segment: number }[] = [];
  for (let i = 0; i < n; i++) items.push({ t: nodeTs[i], isNode: true, segment: Math.min(i, n - 2 < 0 ? 0 : n - 2) });
  for (let s = 0; s < n - 1; s++) {
    for (let k = 1; k <= linksPerSeg; k++) {
      const t = lerp(nodeTs[s], nodeTs[s + 1], k / (linksPerSeg + 1));
      items.push({ t, isNode: false, segment: s });
    }
  }
  items.sort((a, b) => a.t - b.t);

  const count = items.length;
  const instanceMatrix = new Float32Array(16 * count);
  const instanceSegment = new Float32Array(count);
  const instanceIsNode = new Float32Array(count);

  const up: Vec3 = [0, 1, 0];
  for (let idx = 0; idx < count; idx++) {
    const it = items[idx];
    const pos = samplePath(it.t);
    const T = pathTangent(it.t);
    let N = cross(up, T);
    if (N[0] * N[0] + N[1] * N[1] + N[2] * N[2] < 1e-4) N = cross([1, 0, 0], T);
    N = normalize(N);
    const B = normalize(cross(T, N));
    // Alternate the ring's hole-axis so neighbours are perpendicular → interlock.
    const holeAxis = idx % 2 === 0 ? B : N;
    let q = quatFromTo([0, 0, 1], holeAxis);
    // A little twist along the tangent adds physical irregularity.
    q = quatMul(quatAxisAngle(T, (idx % 2) * 0.18), q);

    const scale = it.isNode ? linkR * 2.1 : linkR;
    const m = mat4Compose(pos, q, scale);
    instanceMatrix.set(m, idx * 16);
    instanceSegment[idx] = it.segment;
    instanceIsNode[idx] = it.isNode ? 1 : 0;
  }

  const nodeWorld = nodeTs.map((t) => samplePath(t));
  const nodeScreenScale = nodeTs.map((t) => 1 / (1 + t * 2.2)); // nearer = larger

  return { instanceMatrix, instanceSegment, instanceIsNode, count, nodeWorld, nodeScreenScale };
}

// Camera framing for a chain of the given length: sit just behind/above the
// near end and look down the chain toward the horizon.
export function chainCamera(): { eye: Vec3; center: Vec3; up: Vec3 } {
  return {
    eye: [0.2, 1.4, 6.2],
    center: [0.0, -1.6, -6.0],
    up: [0, 1, 0],
  };
}

// Convenience: world position at arbitrary t (used for spark emitters, etc.).
export function pathAt(t: number): Vec3 {
  return samplePath(t);
}

export function segmentMidpoint(fromT: number, toT: number): Vec3 {
  return lerp3(samplePath(fromT), samplePath(toT), 0.5);
}
