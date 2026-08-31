/**
 * THE LATTICE — the WebGL engine behind the CyberHX environment.
 *
 * CONCEPT
 *   Not a background image and not a particle field. The platform sits inside
 *   a volumetric intelligence lattice: thousands of nodes suspended in real 3D
 *   depth, wired to their neighbours, with encrypted payloads travelling the
 *   wires. The camera drifts forward through it forever, so the world is
 *   always arriving rather than looping. Far behind everything, two enormous
 *   ring structures counter-rotate at the edge of visibility to give the space
 *   a sense of scale that particles alone can never buy.
 *
 * WHY IT IS BUILT THIS WAY
 *   Real perspective projection, not a 2D parallax trick. Nodes carry a true z
 *   and are divided by it, so depth reads correctly: near nodes are large and
 *   bright and swing wide as the camera turns, far nodes barely move. That is
 *   the whole difference between "a canvas animation" and "a place".
 *
 * FOUR DRAW CALLS, IN ORDER
 *   1. field   — fullscreen shader: gradient, megastructures, volumetric strata
 *   2. edges   — GL_LINES between neighbouring nodes
 *   3. pulses  — payloads travelling along a subset of edges
 *   4. nodes   — GL_POINTS with a soft radial falloff
 *
 * PERFORMANCE
 *   Geometry is uploaded once and never touched again; every frame is four
 *   uniform updates and four draws. Motion, drift, z-wrapping and cursor
 *   response all happen in the vertex shader, so the CPU cost per frame is
 *   effectively zero. The z-wrap is what makes an infinite corridor out of a
 *   fixed 320-node buffer.
 */

import { subscribeMood, moodProfile } from './mood';
import { subscribeSignals, subscribePulse } from './signals';

export type Tier = 'high' | 'medium';

export interface LatticeOptions {
  tier: Tier;
  /** 0 = far behind the UI (app), 1 = foreground presence (auth). */
  presence: number;
}

/* ── Geometry constants ─────────────────────────────────────────────────── */
const DEPTH = 300;      // world depth of the slab the camera tunnels through
const SPREAD = 95;      // half-width of the lattice in x/y
const FOCAL = 1.55;
const MAX_LINK = 48;    // longest believable wire between two nodes

const TIERS = {
  high:   { nodes: 420, links: 3, pulses: 72, dpr: 2 },
  medium: { nodes: 240, links: 2, pulses: 40, dpr: 1.5 },
} as const;

/* ── Shared GLSL ────────────────────────────────────────────────────────── */

/**
 * The transform every node, edge and pulse shares.
 *
 * anchorZ is the subtlety here. Wrapping each vertex independently would tear
 * an edge in half the moment its two endpoints landed on opposite sides of the
 * seam. Passing the edge's own z as an anchor makes both endpoints wrap as one
 * unit, so a line either arrives whole or not at all.
 */
const TRANSFORM = `
  uniform float uTime, uCamZ, uAspect, uPresence, uTraffic;
  uniform vec2  uMouse;   // −1..1, spring-smoothed

  // A wave travelling the depth of the slab. Nodes brighten as it reaches
  // them, so the field reads as carrying activity rather than just existing.
  float energyWave(float z) {
    float phase = fract(uTime * 0.055);
    float d = abs(fract((-z / ${DEPTH}.0) - phase + 0.5) - 0.5) * 2.0;
    return pow(1.0 - d, 9.0);
  }

  vec3 latticePos(vec3 home, float seed, float anchorZ) {
    // Each node breathes around its home so the lattice never looks welded.
    vec3 p = home;
    p.x += sin(uTime * 0.21 + seed * 6.283) * 3.4;
    p.y += cos(uTime * 0.17 + seed * 4.712) * 3.4;

    // Infinite corridor: fold z into the slab in front of the camera, using
    // the shared anchor so edge endpoints agree.
    float wrapped = anchorZ - uCamZ;
    float folded  = wrapped - floor(wrapped / ${DEPTH}.0) * ${DEPTH}.0;
    p.z = (p.z - anchorZ) + folded - ${DEPTH}.0;

    // Cursor steers the camera. Nearer geometry swings wider, which is what
    // sells the parallax as depth rather than as a moving layer.
    float depthMix = 1.0 - clamp(-p.z / ${DEPTH}.0, 0.0, 1.0);
    p.x += uMouse.x * 26.0 * depthMix;
    p.y += uMouse.y * 18.0 * depthMix;
    return p;
  }

  vec4 project(vec3 p) {
    float z = max(-p.z, 0.6);
    vec2 ndc = vec2(p.x / z * ${FOCAL}, p.y / z * ${FOCAL});
    ndc.x /= uAspect;
    return vec4(ndc, 0.0, 1.0);
  }

  // Fog: things dissolve into the dark as they recede, and fade back in at the
  // near plane so nothing pops into existence in the viewer's face.
  float depthFade(vec3 p) {
    float d = clamp(-p.z / ${DEPTH}.0, 0.0, 1.0);
    // Both ramps run edge0 < edge1: smoothstep is only defined that way, and
    // a reversed one silently renders differently per driver.
    float far  = 1.0 - smoothstep(0.78, 1.0, d);   // dissolve into the dark
    float near = smoothstep(0.0, 0.035, d);        // no popping at the lens
    return far * near;
  }
`;

/* ── 1. The field ───────────────────────────────────────────────────────── */
const FIELD_VS = `
  attribute vec2 aXY;
  varying vec2 vUV;
  void main() { vUV = aXY; gl_Position = vec4(aXY, 0.0, 1.0); }
`;

/**
 * Everything here is closed-form — no loops, no texture reads. It is the
 * cheapest pass in the frame despite covering every pixel.
 */
const FIELD_FS = `
  precision mediump float;
  varying vec2 vUV;
  uniform float uTime, uAspect, uPresence, uTraffic;
  uniform vec2  uMouse;

  // Distance to a ring of radius r, used for the distant megastructures.
  float ring(vec2 p, float r) { return abs(length(p) - r); }

  mat2 rot(float a) { float s = sin(a), c = cos(a); return mat2(c, -s, s, c); }

  void main() {
    vec2 p = vec2(vUV.x * uAspect, vUV.y);

    // Ground: a near-black blue that lifts very slightly toward the horizon.
    vec3 col = mix(vec3(0.012, 0.020, 0.028), vec3(0.020, 0.032, 0.042),
                   smoothstep(-1.0, 1.0, vUV.y));

    // Two counter-rotating structures, far enough away to read as architecture
    // rather than as decoration. They are the reason the space has a size.
    vec2 q1 = (p + vec2(uMouse.x, uMouse.y) * 0.05) * rot(uTime * 0.014);
    float s1 = ring(q1, 1.32) ;
    col += vec3(0.32, 0.52, 0.12) * 0.055 / (1.0 + s1 * 90.0);

    vec2 q2 = (p * 1.35 + vec2(uMouse.x, uMouse.y) * 0.03) * rot(-uTime * 0.009 + 1.2);
    float s2 = min(ring(q2, 0.86), ring(q2, 1.74));
    col += vec3(0.24, 0.34, 0.58) * 0.040 / (1.0 + s2 * 120.0);

    // Volumetric strata — slow horizontal energy drifting through the volume.
    float strata =
        sin(p.y * 2.6 - uTime * 0.10) * 0.5
      + sin(p.y * 5.9 + p.x * 0.7 + uTime * 0.07) * 0.3
      + sin(p.y * 11.3 - p.x * 0.4 - uTime * 0.05) * 0.2;
    col += vec3(0.30, 0.46, 0.16) * smoothstep(0.45, 1.0, strata) * 0.055 * uPresence;

    // A cold pool of light low and left keeps the palette from going monotone.
    col += vec3(0.10, 0.20, 0.34) * 0.055 / (1.0 + length(p - vec2(-0.9, -0.85)) * 3.2);

    // Volumetric shafts. Angled beams drifting across the upper field, masked
    // to fade out before they reach the ground where the content sits.
    float beam = 0.0;
    for (int i = 0; i < 3; i++) {
      float fi = float(i);
      float ang = 0.42 + fi * 0.13;
      // Project onto a tilted axis, then take a narrow band around it.
      float u = p.x * cos(ang) - p.y * sin(ang) + sin(uTime * 0.045 + fi * 2.1) * 0.9;
      beam += (1.0 - smoothstep(0.0, 0.36, abs(u))) * (0.55 + 0.45 * sin(uTime * 0.11 + fi));
    }
    col += vec3(0.26, 0.40, 0.14) * beam * 0.020
         * smoothstep(-0.9, 0.6, vUV.y) * uPresence;

    // Nebula: two decorrelated sine fields standing in for cheap noise. Gives
    // the void some internal structure so it is never a flat black rectangle.
    float n = sin(p.x * 1.7 + uTime * 0.03) * sin(p.y * 2.1 - uTime * 0.025)
            + sin(p.x * 3.3 - uTime * 0.017) * sin(p.y * 2.9 + uTime * 0.021) * 0.5;
    col += vec3(0.12, 0.20, 0.30) * smoothstep(0.35, 1.4, n) * 0.05;

    // Vignette last, so nothing above competes with foreground text.
    col *= 1.0 - smoothstep(0.55, 1.65, length(p)) * 0.65;

    // Ordered-ish grain. Kills banding across these very dark gradients.
    float g = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
    col += (g - 0.5) * 0.014;

    gl_FragColor = vec4(col, 1.0);
  }
`;

/* ── 2. Edges ───────────────────────────────────────────────────────────── */
const EDGE_VS = `
  attribute vec3  aPos;
  attribute float aSeed;
  attribute float aAnchorZ;
  varying float vAlpha;
  ${TRANSFORM}
  void main() {
    vec3 p = latticePos(aPos, aSeed, aAnchorZ);
    gl_Position = project(p);
    // Links are the quietest element on screen by design: they describe the
    // topology without ever competing with the nodes sitting on top of them.
    vAlpha = depthFade(p) * 0.26 * (0.7 + 0.3 * uPresence) * (1.0 + energyWave(p.z) * 2.2);
  }
`;
const EDGE_FS = `
  precision mediump float;
  varying float vAlpha;
  void main() { gl_FragColor = vec4(0.62, 0.82, 0.30, vAlpha); }
`;

/* ── 3. Pulses ──────────────────────────────────────────────────────────── */
const PULSE_VS = `
  attribute vec3  aA;
  attribute vec3  aB;
  attribute float aSeed;
  attribute float aAnchorZ;
  varying float vAlpha;
  ${TRANSFORM}
  void main() {
    // Payload position along the wire. Each pulse has its own speed and phase,
    // so traffic never marches in lockstep.
    float t = fract(uTime * (0.055 + fract(aSeed * 7.13) * 0.075) * uTraffic + aSeed);
    vec3 home = mix(aA, aB, t);
    vec3 p = latticePos(home, aSeed, aAnchorZ);
    gl_Position = project(p);
    float z = max(-p.z, 0.6);
    gl_PointSize = clamp(230.0 / z, 2.0, 13.0);
    // Fade in and out at the ends of the wire so payloads emerge and arrive
    // rather than blinking on at a node.
    float ends = smoothstep(0.0, 0.14, t) * (1.0 - smoothstep(0.86, 1.0, t));
    vAlpha = depthFade(p) * ends * 0.95;
  }
`;
const PULSE_FS = `
  precision mediump float;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = 1.0 - smoothstep(0.0, 0.5, d);
    gl_FragColor = vec4(0.85, 1.0, 0.45, a * a * vAlpha);
  }
`;

/* ── 4. Nodes ───────────────────────────────────────────────────────────── */
const NODE_VS = `
  attribute vec3  aPos;
  attribute float aSeed;
  attribute float aSize;
  // Identity, uploaded from the live board. kind 1 = this node is a challenge.
  attribute float aKind;
  attribute float aHeat;    // 0..1, share of the field that has solved it
  attribute float aSolved;  // 1 = you cracked it
  uniform float uSurgeAt;   // seconds since a solve shockwave started
  uniform vec3  uSurgeOrigin;
  varying float vAlpha;
  varying float vHot;
  varying float vSolved;
  ${TRANSFORM}
  void main() {
    vec3 p = latticePos(aPos, aSeed, aPos.z);
    vec4 clip = project(p);
    gl_Position = clip;

    float z = max(-p.z, 0.6);
    gl_PointSize = clamp(aSize * 620.0 / z, 2.5, 52.0);

    // Proximity response. Comparing in clip space means the reaction tracks
    // what the eye sees, not where things happen to be in world units.
    float near = 1.0 - smoothstep(0.0, 0.42, distance(clip.xy, uMouse));
    vHot = near;

    // Slow individual respiration keeps the field from reading as static
    // even when the camera and cursor are both still.
    float breathe = 0.72 + 0.28 * sin(uTime * 0.85 + aSeed * 6.283);
    float wave = energyWave(p.z) * uTraffic;

    // A challenge you have solved burns steadily instead of breathing: the
    // difference between a light that is on and one that is idling.
    float lit = aSolved;
    breathe = mix(breathe, 0.94 + 0.06 * sin(uTime * 2.1 + aSeed * 6.283), lit);

    // Shockwave from the node of a freshly solved challenge. An expanding
    // shell rather than a flash, so the whole field registers the event.
    float surge = 0.0;
    if (uSurgeAt >= 0.0) {
      float t = uSurgeAt;
      float radius = t * 110.0;
      float d = abs(distance(p, uSurgeOrigin) - radius);
      surge = (1.0 - smoothstep(0.0, 26.0, d)) * (1.0 - smoothstep(0.0, 1.6, t));
    }

    // A challenge nobody has touched sits quieter than the ambient field, so
    // the board's difficulty is legible in the environment itself.
    float ident = mix(1.0, 0.40 + aHeat * 1.6 + lit * 2.6, aKind);

    vAlpha = depthFade(p) * breathe * (0.85 + 0.35 * uPresence)
           * (1.0 + near * 1.8 + wave * 1.6 + surge * 3.0) * ident;
    vHot = max(max(vHot, wave * 0.8), max(aHeat * aKind * 0.7, surge));
    vSolved = lit;

    // Solved nodes read larger. Progress becomes something you can see in the
    // shape of the field, not only in a number on the header.
    gl_PointSize *= 1.0 + lit * 1.5 + surge * 1.1;
  }
`;
const NODE_FS = `
  precision mediump float;
  varying float vAlpha;
  varying float vHot;
  varying float vSolved;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    // Two-part falloff: a tight core with a wide bloom around it. A single
    // smoothstep gives you a dot; this gives you a light source.
    float core  = 1.0 - smoothstep(0.0, 0.22, d);
    float bloom = (1.0 - smoothstep(0.04, 0.5, d)) * 0.55;
    vec3 cool = vec3(0.55, 0.74, 0.42);
    vec3 hot  = vec3(0.86, 1.0, 0.42);
    vec3 col  = mix(cool, hot, vHot);
    // Yours burn near-white at the core: unmistakable at a glance.
    col = mix(col, vec3(1.0, 1.0, 0.82), vSolved * 0.9);
    gl_FragColor = vec4(col, (core + bloom) * vAlpha);
  }
`;

/* ── Engine ─────────────────────────────────────────────────────────────── */

function compile(gl: WebGLRenderingContext, vs: string, fs: string) {
  const mk = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      // Surfacing this in dev saves an hour of staring at a black screen.
      console.warn('[lattice] shader:', gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  };
  const v = mk(gl.VERTEX_SHADER, vs);
  const f = mk(gl.FRAGMENT_SHADER, fs);
  if (!v || !f) return null;
  const p = gl.createProgram()!;
  gl.attachShader(p, v);
  gl.attachShader(p, f);
  gl.linkProgram(p);
  gl.deleteShader(v);
  gl.deleteShader(f);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    console.warn('[lattice] link:', gl.getProgramInfoLog(p));
    return null;
  }
  return p;
}

const buffer = (gl: WebGLRenderingContext, data: Float32Array) => {
  const b = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, b);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  return b;
};

export interface LatticeHandle {
  /** How many nodes exist — the capacity challenges can be mapped into. */
  nodeCount: number;
  resize: () => void;
  setPointer: (x: number, y: number) => void;
  setRunning: (on: boolean) => void;
  destroy: () => void;
}

export function createLattice(
  canvas: HTMLCanvasElement,
  opts: LatticeOptions,
): LatticeHandle | null {
  const gl = (canvas.getContext('webgl', {
    alpha: false, antialias: false, depth: false,
    powerPreference: 'low-power', preserveDrawingBuffer: false,
  }) ?? canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
  if (!gl) return null;

  const cfg = TIERS[opts.tier];

  const progField = compile(gl, FIELD_VS, FIELD_FS);
  const progEdge  = compile(gl, EDGE_VS, EDGE_FS);
  const progPulse = compile(gl, PULSE_VS, PULSE_FS);
  const progNode  = compile(gl, NODE_VS, NODE_FS);
  if (!progField || !progEdge || !progPulse || !progNode) return null;

  /* ── Build the lattice once ─────────────────────────────────────────── */
  type P = { x: number; y: number; z: number; seed: number; size: number };
  const pts: P[] = [];

  // Hubs first. An evenly scattered field reads as confetti; a real network
  // has dense knots joined by sparse runs, so most nodes are hung off a hub
  // and only a minority are free-floating connective tissue.
  const HUBS = Math.max(5, Math.round(cfg.nodes / 26));
  const edgeBias = (v: number) => Math.sign(v) * Math.pow(Math.abs(v), 1.35);
  const hubs = Array.from({ length: HUBS }, () => ({
    x: edgeBias(Math.random() * 2 - 1) * SPREAD,
    y: edgeBias(Math.random() * 2 - 1) * SPREAD * 0.72,
    z: -Math.random() * DEPTH,
  }));

  for (let i = 0; i < cfg.nodes; i++) {
    // A fifth wander free so the clusters never look like separate objects.
    const loose = i % 5 === 0;
    const h = hubs[i % HUBS];
    // Cubed uniform gives a dense core with a long tail, rather than a shell.
    const r = Math.pow(Math.random(), 3) * 34;
    const th = Math.random() * Math.PI * 2;
    const ph = Math.acos(2 * Math.random() - 1);
    pts.push({
      x: loose ? edgeBias(Math.random() * 2 - 1) * SPREAD
               : h.x + r * Math.sin(ph) * Math.cos(th),
      y: loose ? edgeBias(Math.random() * 2 - 1) * SPREAD * 0.72
               : h.y + r * Math.sin(ph) * Math.sin(th) * 0.8,
      z: loose ? -Math.random() * DEPTH
               : h.z + r * Math.cos(ph) * 1.6,
      seed: Math.random(),
      // Hub cores are bigger, so the eye can read the structure's hierarchy.
      size: (loose ? 0.5 : 0.6 + (1 - r / 34) * 0.7) + Math.random() * 0.45,
    });
  }
  // Clustering can push a node outside the slab; fold it back so the z-wrap
  // stays exact and nothing pops.
  pts.forEach(p => { p.z = -((-p.z) % DEPTH); });

  // Neighbour topology, computed once. Nodes only breathe a few units around
  // home, so a static graph stays truthful for the life of the page.
  const edges: Array<[number, number]> = [];
  for (let i = 0; i < pts.length; i++) {
    const d: Array<[number, number]> = [];
    for (let j = 0; j < pts.length; j++) {
      if (i === j) continue;
      const dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y, dz = pts[i].z - pts[j].z;
      d.push([dx * dx + dy * dy + dz * dz, j]);
    }
    d.sort((a, b) => a[0] - b[0]);
    for (let k = 0; k < cfg.links && k < d.length; k++) {
      const [dist2, j] = d[k];
      if (dist2 > MAX_LINK * MAX_LINK) break;   // sorted, so the rest are further
      if (i < j) edges.push([i, j]);            // dedupe: store each pair once
    }
  }

  const nodePos = new Float32Array(pts.length * 3);
  const nodeSeed = new Float32Array(pts.length);
  const nodeSize = new Float32Array(pts.length);
  pts.forEach((p, i) => {
    nodePos[i * 3] = p.x; nodePos[i * 3 + 1] = p.y; nodePos[i * 3 + 2] = p.z;
    nodeSeed[i] = p.seed; nodeSize[i] = p.size;
  });

  const edgePos = new Float32Array(edges.length * 6);
  const edgeSeed = new Float32Array(edges.length * 2);
  const edgeAnchor = new Float32Array(edges.length * 2);
  edges.forEach(([a, b], e) => {
    const A = pts[a], B = pts[b];
    edgePos.set([A.x, A.y, A.z, B.x, B.y, B.z], e * 6);
    edgeSeed[e * 2] = A.seed; edgeSeed[e * 2 + 1] = B.seed;
    edgeAnchor[e * 2] = A.z;  edgeAnchor[e * 2 + 1] = A.z;   // shared anchor
  });

  const pn = Math.min(cfg.pulses, edges.length);
  const pulseA = new Float32Array(pn * 3);
  const pulseB = new Float32Array(pn * 3);
  const pulseSeed = new Float32Array(pn);
  const pulseAnchor = new Float32Array(pn);
  for (let i = 0; i < pn; i++) {
    const [a, b] = edges[Math.floor((i / pn) * edges.length)];
    const A = pts[a], B = pts[b];
    pulseA.set([A.x, A.y, A.z], i * 3);
    pulseB.set([B.x, B.y, B.z], i * 3);
    pulseSeed[i] = Math.random();
    pulseAnchor[i] = A.z;
  }

  // Tracked so destroy() can actually free them. Relying on loseContext alone
  // leaves the driver to guess when to reclaim, which on a long-lived SPA
  // session means several megabytes of dead buffers per remount.
  const owned: WebGLBuffer[] = [];
  const track = (b: WebGLBuffer) => { owned.push(b); return b; };

  // Identity buffers are DYNAMIC_DRAW: they are rewritten whenever the board
  // changes, unlike the geometry which is uploaded once and never touched.
  const dyn = (n: number) => {
    const b = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(n), gl.DYNAMIC_DRAW);
    owned.push(b);
    return b;
  };
  const bKind = dyn(pts.length);
  const bHeat = dyn(pts.length);
  const bSolved = dyn(pts.length);

  const quad = track(buffer(gl, new Float32Array([-1, -1, 3, -1, -1, 3])));
  const bNodePos = track(buffer(gl, nodePos)), bNodeSeed = track(buffer(gl, nodeSeed)), bNodeSize = track(buffer(gl, nodeSize));
  const bEdgePos = track(buffer(gl, edgePos)), bEdgeSeed = track(buffer(gl, edgeSeed)), bEdgeAnchor = track(buffer(gl, edgeAnchor));
  const bPulseA = track(buffer(gl, pulseA)), bPulseB = track(buffer(gl, pulseB));
  const bPulseSeed = track(buffer(gl, pulseSeed)), bPulseAnchor = track(buffer(gl, pulseAnchor));

  // Every location we have ever enabled, so each pass can start from a known
  // clean slate instead of inheriting the previous program's wiring.
  const armed = new Set<number>();
  const disarm = () => {
    armed.forEach(loc => gl.disableVertexAttribArray(loc));
    armed.clear();
  };
  const bind = (prog: WebGLProgram, name: string, buf: WebGLBuffer, size: number) => {
    const loc = gl.getAttribLocation(prog, name);
    if (loc < 0) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
    armed.add(loc);
  };
  const U = (p: WebGLProgram, n: string) => gl.getUniformLocation(p, n);

  const uniforms = (p: WebGLProgram) => ({
    time: U(p, 'uTime'), camZ: U(p, 'uCamZ'),
    aspect: U(p, 'uAspect'), mouse: U(p, 'uMouse'), presence: U(p, 'uPresence'),
    traffic: U(p, 'uTraffic'),
  });
  const uField = uniforms(progField), uEdge = uniforms(progEdge);
  const uPulse = uniforms(progPulse), uNode = uniforms(progNode);
  const uSurgeAt = U(progNode, 'uSurgeAt');
  const uSurgeOrigin = U(progNode, 'uSurgeOrigin');

  // Live board state, pushed in by the app through the signals store.
  const unsubSignals = subscribeSignals(f => {
    const put = (b: WebGLBuffer, data: Float32Array) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      // A sub-update rather than a realloc: same size every time.
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, data.subarray(0, pts.length));
    };
    put(bKind, f.kind);
    put(bHeat, f.heat);
    put(bSolved, f.solved);
  });

  // Shockwave bookkeeping. -1 means no wave in flight.
  let surgeStart = -1;
  let surgeOrigin: [number, number, number] = [0, 0, 0];
  const unsubPulse = subscribePulse(nodeIndex => {
    const n = pts[nodeIndex];
    if (!n) return;
    surgeStart = t;
    surgeOrigin = [n.x, n.y, n.z];
  });

  /* ── Frame loop ─────────────────────────────────────────────────────── */
  let raf = 0, running = true, aspect = 1;
  let camZ = 0, last = 0, t = 0;
  // Two-stage smoothing on the pointer: a target that snaps, and a value that
  // chases it. Without the second stage the whole world twitches with the
  // mouse and the effect reads as cheap.
  let mx = 0, my = 0, tmx = 0, tmy = 0;

  // Mood: the world shifts energy as you move between views. Targets are set
  // by navigation; the live values chase them over about a second so the
  // change is felt rather than seen.
  let pres = moodProfile().presence * opts.presence;
  let drift = moodProfile().drift;
  let traffic = moodProfile().traffic;
  let tPres = pres, tDrift = drift, tTraffic = traffic;
  const unsubMood = subscribeMood(p => {
    tPres = p.presence * opts.presence;
    tDrift = p.drift;
    tTraffic = p.traffic;
  });

  const dprCap = Math.min(window.devicePixelRatio || 1, cfg.dpr);

  const resize = () => {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    canvas.width = Math.max(1, Math.round(w * dprCap));
    canvas.height = Math.max(1, Math.round(h * dprCap));
    aspect = canvas.width / Math.max(1, canvas.height);
    gl.viewport(0, 0, canvas.width, canvas.height);
  };
  resize();

  gl.disable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  // Additive: overlapping light accumulates, which is what light actually does
  // and what keeps dense regions of the lattice feeling energetic.
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE);

  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    if (!running) { last = now; return; }
    const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016);
    last = now;
    t += dt;
    camZ -= dt * 7.2 * drift;               // perpetual forward drift

    mx += (tmx - mx) * Math.min(1, dt * 2.4);
    my += (tmy - my) * Math.min(1, dt * 2.4);

    const ease = Math.min(1, dt * 1.6);
    pres    += (tPres - pres) * ease;
    drift   += (tDrift - drift) * ease;
    traffic += (tTraffic - traffic) * ease;

    const set = (u: ReturnType<typeof uniforms>) => {
      gl.uniform1f(u.time, t);
      gl.uniform1f(u.camZ, camZ);
      gl.uniform1f(u.aspect, aspect);
      gl.uniform1f(u.presence, pres);
      gl.uniform1f(u.traffic, traffic);
      gl.uniform2f(u.mouse, mx, my);
    };

    // 1. field — opaque, so it also clears the frame
    gl.disable(gl.BLEND);
    disarm();
    gl.useProgram(progField);
    bind(progField, 'aXY', quad, 2);
    set(uField);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.enable(gl.BLEND);

    // 2. edges
    disarm();
    gl.useProgram(progEdge);
    bind(progEdge, 'aPos', bEdgePos, 3);
    bind(progEdge, 'aSeed', bEdgeSeed, 1);
    bind(progEdge, 'aAnchorZ', bEdgeAnchor, 1);
    set(uEdge);
    gl.drawArrays(gl.LINES, 0, edges.length * 2);

    // 3. pulses
    disarm();
    gl.useProgram(progPulse);
    bind(progPulse, 'aA', bPulseA, 3);
    bind(progPulse, 'aB', bPulseB, 3);
    bind(progPulse, 'aSeed', bPulseSeed, 1);
    bind(progPulse, 'aAnchorZ', bPulseAnchor, 1);
    set(uPulse);
    gl.drawArrays(gl.POINTS, 0, pn);

    // 4. nodes last so they sit on top of their own wiring
    disarm();
    gl.useProgram(progNode);
    bind(progNode, 'aPos', bNodePos, 3);
    bind(progNode, 'aSeed', bNodeSeed, 1);
    bind(progNode, 'aSize', bNodeSize, 1);
    bind(progNode, 'aKind', bKind, 1);
    bind(progNode, 'aHeat', bHeat, 1);
    bind(progNode, 'aSolved', bSolved, 1);
    set(uNode);
    // The wave expires on its own; -1 tells the shader to skip the work.
    const age = surgeStart >= 0 ? t - surgeStart : -1;
    if (age > 1.8) surgeStart = -1;
    gl.uniform1f(uSurgeAt, surgeStart >= 0 ? age : -1);
    gl.uniform3f(uSurgeOrigin, surgeOrigin[0], surgeOrigin[1], surgeOrigin[2]);
    gl.drawArrays(gl.POINTS, 0, pts.length);
  };
  raf = requestAnimationFrame(frame);

  return {
    nodeCount: pts.length,
    resize,
    setPointer: (x, y) => { tmx = x; tmy = y; },
    setRunning: (on) => { running = on; if (on) last = 0; },
    destroy: () => {
      unsubMood();
      unsubSignals();
      unsubPulse();
      cancelAnimationFrame(raf);
      // Free what we allocated before dropping the context, so a remount does
      // not accumulate GPU memory across a long session.
      owned.forEach(b => gl.deleteBuffer(b));
      owned.length = 0;
      [progField, progEdge, progPulse, progNode].forEach(pr => gl.deleteProgram(pr));
      const ext = gl.getExtension('WEBGL_lose_context');
      if (ext) ext.loseContext();
    },
  };
}
