// Minimal, allocation-light 3D math for the chain engine. No gl-matrix
// dependency (DESIGN_SYSTEM Rule 7 — no new npm deps). Column-major mat4 to
// match WebGL. Only what the renderer needs.

export type Vec3 = [number, number, number];
export type Mat4 = Float32Array;

export function vec3(x = 0, y = 0, z = 0): Vec3 {
  return [x, y, z];
}

export function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}
export function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
export function scale(a: Vec3, s: number): Vec3 {
  return [a[0] * s, a[1] * s, a[2] * s];
}
export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
export function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}
export function length(a: Vec3): number {
  return Math.hypot(a[0], a[1], a[2]);
}
export function normalize(a: Vec3): Vec3 {
  const l = length(a);
  return l > 1e-6 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0];
}
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
export function lerp3(a: Vec3, b: Vec3, t: number): Vec3 {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}
export function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}
export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0 || 1e-6), 0, 1);
  return t * t * (3 - 2 * t);
}

export function mat4Identity(): Mat4 {
  const m = new Float32Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
}

export function mat4Perspective(fovY: number, aspect: number, near: number, far: number): Mat4 {
  const f = 1 / Math.tan(fovY / 2);
  const nf = 1 / (near - far);
  const m = new Float32Array(16);
  m[0] = f / aspect;
  m[5] = f;
  m[10] = (far + near) * nf;
  m[11] = -1;
  m[14] = 2 * far * near * nf;
  return m;
}

// Right-handed lookAt producing a view matrix (world → camera).
export function mat4LookAt(eye: Vec3, center: Vec3, up: Vec3): Mat4 {
  const z = normalize(sub(eye, center));
  const x = normalize(cross(up, z));
  const y = cross(z, x);
  const m = new Float32Array(16);
  m[0] = x[0]; m[1] = y[0]; m[2] = z[0]; m[3] = 0;
  m[4] = x[1]; m[5] = y[1]; m[6] = z[1]; m[7] = 0;
  m[8] = x[2]; m[9] = y[2]; m[10] = z[2]; m[11] = 0;
  m[12] = -dot(x, eye); m[13] = -dot(y, eye); m[14] = -dot(z, eye); m[15] = 1;
  return m;
}

export function mat4Multiply(a: Mat4, b: Mat4): Mat4 {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      o[c * 4 + r] =
        a[0 * 4 + r] * b[c * 4 + 0] +
        a[1 * 4 + r] * b[c * 4 + 1] +
        a[2 * 4 + r] * b[c * 4 + 2] +
        a[3 * 4 + r] * b[c * 4 + 3];
    }
  }
  return o;
}

// Compose a model matrix from position, a quaternion (x,y,z,w) and uniform scale.
export function mat4Compose(pos: Vec3, q: [number, number, number, number], s: number): Mat4 {
  const [x, y, z, w] = q;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  const m = new Float32Array(16);
  m[0] = (1 - (yy + zz)) * s; m[1] = (xy + wz) * s; m[2] = (xz - wy) * s; m[3] = 0;
  m[4] = (xy - wz) * s; m[5] = (1 - (xx + zz)) * s; m[6] = (yz + wx) * s; m[7] = 0;
  m[8] = (xz + wy) * s; m[9] = (yz - wx) * s; m[10] = (1 - (xx + yy)) * s; m[11] = 0;
  m[12] = pos[0]; m[13] = pos[1]; m[14] = pos[2]; m[15] = 1;
  return m;
}

// Quaternion that rotates unit vector `from` to unit vector `to`.
export function quatFromTo(from: Vec3, to: Vec3): [number, number, number, number] {
  const f = normalize(from);
  const t = normalize(to);
  const d = dot(f, t);
  if (d >= 1 - 1e-6) return [0, 0, 0, 1];
  if (d <= -1 + 1e-6) {
    // 180°: pick any orthogonal axis.
    let axis = cross([1, 0, 0], f);
    if (length(axis) < 1e-6) axis = cross([0, 1, 0], f);
    axis = normalize(axis);
    return [axis[0], axis[1], axis[2], 0];
  }
  const axis = cross(f, t);
  const w = 1 + d;
  const len = Math.hypot(axis[0], axis[1], axis[2], w);
  return [axis[0] / len, axis[1] / len, axis[2] / len, w / len];
}

export function quatMul(
  a: [number, number, number, number],
  b: [number, number, number, number],
): [number, number, number, number] {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

export function quatAxisAngle(axis: Vec3, angle: number): [number, number, number, number] {
  const h = angle / 2;
  const s = Math.sin(h);
  const n = normalize(axis);
  return [n[0] * s, n[1] * s, n[2] * s, Math.cos(h)];
}

// Project a world point through a view-projection matrix to normalized device
// coords; returns null if behind the camera.
export function projectToNDC(vp: Mat4, p: Vec3): { x: number; y: number; z: number } | null {
  const x = vp[0] * p[0] + vp[4] * p[1] + vp[8] * p[2] + vp[12];
  const y = vp[1] * p[0] + vp[5] * p[1] + vp[9] * p[2] + vp[13];
  const z = vp[2] * p[0] + vp[6] * p[1] + vp[10] * p[2] + vp[14];
  const w = vp[3] * p[0] + vp[7] * p[1] + vp[11] * p[2] + vp[15];
  if (w <= 1e-6) return null;
  return { x: x / w, y: y / w, z: z / w };
}
