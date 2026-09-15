// Cinematic 3D metal chain (three.js). A heavy gunmetal chain of interlocking
// torus links recedes into a dark, foggy distance; PBR metal + a procedural
// environment give real reflections. Solved-pair segments ignite with orange
// fire billboards and a real warm point-light that illuminates the surrounding
// metal. Zoomed-out cinematic camera with a slow, heavy sway.
//
// No external/copyrighted assets: the environment is generated procedurally
// (RoomEnvironment → PMREM) and the fire is a procedural shader, so it is all
// CSP-safe. Lazy-loaded, so three.js only ships inside a chain view.

import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export interface Chain3DNodeScreen { x: number; y: number; scale: number; visible: boolean; }

export interface Chain3DHandle {
  resize: (cssW: number, cssH: number, dpr: number) => void;
  setState: (nodeSolved: boolean[], segmentActive: boolean[]) => void;
  destroy: () => void;
}

export interface Chain3DOptions {
  nodeCount: number;
  reducedMotion: boolean;
  quality: 'high' | 'medium' | 'low';
  onNodes?: (nodes: Chain3DNodeScreen[]) => void;
}

const MAX_SEG = 32;
const IGNITE_MS = 1500;

const QUALITY = {
  high:   { linksPerSeg: 9, firePerSeg: 16, dprCap: 2 },
  medium: { linksPerSeg: 7, firePerSeg: 10, dprCap: 1.75 },
  low:    { linksPerSeg: 5, firePerSeg: 5,  dprCap: 1.25 },
};

const FIRE_VS = `
precision highp float;
attribute vec2 a_corner;
attribute vec3 iPos;
attribute float iSeed;
attribute float iSize;
attribute float iSeg;
uniform mat4 u_viewProj;
uniform vec3 u_camRight;
uniform vec3 u_camUp;
uniform float u_time;
uniform float u_segHeat[${MAX_SEG}];
varying vec2 v_uv;
varying float v_intensity;
varying float v_seed;
void main(){
  float heat = u_segHeat[int(iSeg + 0.5)];
  float t = u_time * 0.9 + iSeed * 10.0;
  float rise = fract(t * 0.3 + iSeed);
  vec3 pos = iPos + u_camUp * rise * iSize * 1.6 + u_camRight * sin(t*3.0) * 0.10 * iSize;
  float sz = (1.0 - rise * 0.4) * iSize * (0.55 + heat * 0.85);
  vec3 world = pos + (a_corner.x * u_camRight + a_corner.y * u_camUp) * sz;
  v_uv = a_corner;
  v_intensity = heat * (1.0 - rise * 0.3);
  v_seed = iSeed;
  gl_Position = u_viewProj * vec4(world, 1.0);
}`;

const FIRE_FS = `
precision highp float;
varying vec2 v_uv;
varying float v_intensity;
varying float v_seed;
uniform float u_time;
float h21(vec2 p){ p=fract(p*vec2(123.34,345.45)); p+=dot(p,p+34.345); return fract(p.x*p.y); }
float noise(vec2 p){ vec2 i=floor(p),f=fract(p); float a=h21(i),b=h21(i+vec2(1,0)),c=h21(i+vec2(0,1)),d=h21(i+vec2(1,1)); vec2 u=f*f*(3.0-2.0*f); return mix(mix(a,b,u.x),mix(c,d,u.x),u.y); }
float fbm(vec2 p){ float v=0.0,a=0.5; for(int i=0;i<4;i++){ v+=a*noise(p); p*=2.0; a*=0.5; } return v; }
void main(){
  if(v_intensity <= 0.01) discard;
  float r = length(v_uv);
  if(r > 1.0) discard;
  float n = fbm(v_uv*3.0 + vec2(v_seed*7.0, -u_time*1.7));
  float flame = smoothstep(1.0, 0.05, r + (1.0-n)*0.55) * v_intensity;
  vec3 edge = vec3(0.45,0.05,0.01);
  vec3 mid  = vec3(1.0,0.42,0.07);
  vec3 core = vec3(1.0,0.93,0.68);
  vec3 col = mix(edge, mid, smoothstep(0.0,0.5,flame));
  col = mix(col, core, smoothstep(0.55,1.0,flame));
  float a = flame * 0.9;
  gl_FragColor = vec4(col*a, a);
}`;

export function createChain3D(canvas: HTMLCanvasElement, opts: Chain3DOptions): Chain3DHandle | null {
  const q = QUALITY[opts.quality];
  const n = Math.max(1, Math.min(opts.nodeCount, MAX_SEG));
  const segCount = Math.max(0, n - 1);

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch {
    return null;
  }

  try {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.dprCap));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x05070a);
    scene.fog = new THREE.FogExp2(0x05070a, 0.028);

    // Procedural environment for real metal reflections (no asset).
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;

    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 120);
    const camBase = new THREE.Vector3(0.4, 1.6, 12.5); // zoomed out
    const camTarget = new THREE.Vector3(-0.5, -1.8, -10);
    camera.position.copy(camBase);
    camera.lookAt(camTarget);

    // ── Lights ────────────────────────────────────────────────
    scene.add(new THREE.HemisphereLight(0x33405a, 0x05060a, 0.5));
    const key = new THREE.DirectionalLight(0xcfe0ff, 1.6);
    key.position.set(4, 8, 6);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x8fa5c8, 0.6);
    rim.position.set(-6, 2, -6);
    scene.add(rim);

    // ── Chain curve (recedes into the distance, gentle sway + droop) ──
    const pts: THREE.Vector3[] = [];
    for (let i = -1; i <= n; i++) {
      const f = (i + 1) / (n + 1);
      const z = THREE.MathUtils.lerp(5, -30, f);
      const x = Math.sin(f * 6.0) * 2.3 * (0.5 + f);
      const y = -Math.cos(f * 4.2) * 1.1 - f * 3.2 + 1.2;
      pts.push(new THREE.Vector3(x, y, z));
    }
    const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.5);
    const nodeU: number[] = [];
    for (let j = 0; j < n; j++) nodeU.push((j + 1) / (pts.length - 1));

    // ── Chain links (instanced gunmetal PBR torus) ──────────────
    const linkCount = Math.max(segCount, 1) * q.linksPerSeg + 6;
    const torus = new THREE.TorusGeometry(0.42, 0.15, 12, 24);
    const metal = new THREE.MeshStandardMaterial({
      color: 0x3b4048, metalness: 1.0, roughness: 0.38, envMapIntensity: 1.1,
    });
    const links = new THREE.InstancedMesh(torus, metal, linkCount);
    links.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    const frames = curve.computeFrenetFrames(linkCount - 1, false);
    const dummy = new THREE.Object3D();
    const zAxis = new THREE.Vector3(0, 0, 1);
    const linkSeg = new Float32Array(linkCount);
    for (let i = 0; i < linkCount; i++) {
      const u = i / (linkCount - 1);
      const p = curve.getPointAt(Math.min(u, 1));
      const axis = (i % 2 === 0 ? frames.binormals[i] : frames.normals[i]).clone().normalize();
      dummy.position.copy(p);
      dummy.quaternion.setFromUnitVectors(zAxis, axis);
      // slight elongation along the tangent so links read as chain links
      dummy.scale.set(1, 1.25, 1);
      dummy.updateMatrix();
      links.setMatrixAt(i, dummy.matrix);
      // which segment this link belongs to (by nearest node span)
      const seg = Math.min(segCount - 1, Math.max(0, Math.floor(u * segCount)));
      linkSeg[i] = seg;
    }
    links.instanceMatrix.needsUpdate = true;
    const chainGroup = new THREE.Group();
    chainGroup.add(links);
    scene.add(chainGroup);

    // ── Fire billboards (instanced, additive, procedural orange) ──
    const firePos: number[] = [];
    const fireSeed: number[] = [];
    const fireSize: number[] = [];
    const fireSeg: number[] = [];
    for (let s = 0; s < segCount; s++) {
      const u0 = nodeU[s], u1 = nodeU[s + 1];
      for (let k = 0; k < q.firePerSeg; k++) {
        const u = u0 + (u1 - u0) * ((k + 0.5) / q.firePerSeg);
        const p = curve.getPointAt(Math.min(u, 1));
        firePos.push(p.x + (Math.sin(k * 12.9) * 0.4), p.y + 0.2 + Math.sin(k * 3.3) * 0.2, p.z + Math.cos(k * 7.1) * 0.4);
        fireSeed.push((k * 0.137 + s * 0.311) % 1);
        fireSize.push(0.5 + ((k * 7) % 5) * 0.08);
        fireSeg.push(s);
      }
    }
    const fireCount = fireSeed.length;
    const segHeatUniform = new Array(MAX_SEG).fill(0);
    let fireMesh: THREE.Mesh | null = null;
    let fireMat: THREE.RawShaderMaterial | null = null;
    if (fireCount > 0) {
      const fg = new THREE.InstancedBufferGeometry();
      const quad = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);
      fg.setAttribute('a_corner', new THREE.BufferAttribute(quad, 2));
      fg.setAttribute('iPos', new THREE.InstancedBufferAttribute(new Float32Array(firePos), 3));
      fg.setAttribute('iSeed', new THREE.InstancedBufferAttribute(new Float32Array(fireSeed), 1));
      fg.setAttribute('iSize', new THREE.InstancedBufferAttribute(new Float32Array(fireSize), 1));
      fg.setAttribute('iSeg', new THREE.InstancedBufferAttribute(new Float32Array(fireSeg), 1));
      fg.instanceCount = fireCount;
      fireMat = new THREE.RawShaderMaterial({
        vertexShader: FIRE_VS, fragmentShader: FIRE_FS,
        transparent: true, depthWrite: false, depthTest: true,
        blending: THREE.AdditiveBlending,
        uniforms: {
          u_time: { value: 0 },
          u_viewProj: { value: new THREE.Matrix4() },
          u_camRight: { value: new THREE.Vector3() },
          u_camUp: { value: new THREE.Vector3() },
          u_segHeat: { value: segHeatUniform },
        },
      });
      fireMesh = new THREE.Mesh(fg, fireMat);
      fireMesh.frustumCulled = false;
      chainGroup.add(fireMesh);
    }

    // ── Per-segment warm point light (fire illuminates the metal) ──
    const fireLights: THREE.PointLight[] = [];
    const lightCap = Math.min(segCount, 10);
    for (let s = 0; s < lightCap; s++) {
      const mid = curve.getPointAt(Math.min((nodeU[s] + nodeU[s + 1]) / 2, 1));
      const light = new THREE.PointLight(0xff6a1e, 0, 9, 2);
      light.position.copy(mid);
      scene.add(light);
      fireLights.push(light);
    }

    // ── State + loop ──────────────────────────────────────────
    const nodeSolvedState = new Array<boolean>(n).fill(false);
    const segHeat = new Float32Array(segCount);
    const segTarget = new Float32Array(segCount);
    const segIgniteAt = new Float32Array(segCount).fill(-1);
    let cssW = 1, cssH = 1;
    let raf = 0, disposed = false;
    const t0 = performance.now();
    const _vp = new THREE.Matrix4();
    const _right = new THREE.Vector3();
    const _up = new THREE.Vector3();
    const _proj = new THREE.Vector3();

    function frame(now: number) {
      if (disposed) return;
      const time = (now - t0) / 1000;

      let animating = false;
      for (let s = 0; s < segCount; s++) {
        const goal = segTarget[s];
        if (segHeat[s] !== goal) {
          animating = true;
          if (goal > segHeat[s]) {
            const p = segIgniteAt[s] >= 0 ? Math.min((now - segIgniteAt[s]) / IGNITE_MS, 1) : 1;
            segHeat[s] = p * p * (3 - 2 * p);
            if (p >= 1) segHeat[s] = 1;
          } else {
            segHeat[s] = Math.max(goal, segHeat[s] - 0.03);
          }
        }
        segHeatUniform[s] = segHeat[s];
      }

      // Heavy, slow sway; a brief extra jitter right after an ignition.
      const swing = opts.reducedMotion ? 0 : 1;
      chainGroup.rotation.z = Math.sin(time * 0.25) * 0.015 * swing;
      chainGroup.position.x = Math.sin(time * 0.2) * 0.12 * swing;
      chainGroup.position.y = Math.cos(time * 0.17) * 0.08 * swing;

      // Slow cinematic camera drift.
      const d = opts.reducedMotion ? 0 : 1;
      camera.position.set(
        camBase.x + Math.sin(time * 0.13) * 0.6 * d,
        camBase.y + Math.cos(time * 0.11) * 0.35 * d,
        camBase.z + Math.sin(time * 0.07) * 0.5 * d,
      );
      camera.lookAt(camTarget);
      camera.updateMatrixWorld();

      // Fire light intensity follows the heat, with a flicker.
      for (let s = 0; s < fireLights.length; s++) {
        const flick = 0.75 + 0.25 * Math.sin(time * 22 + s * 3);
        fireLights[s].intensity = segHeat[s] * 5.5 * flick;
      }

      if (fireMat) {
        _vp.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
        const e = camera.matrixWorld.elements;
        _right.set(e[0], e[1], e[2]);
        _up.set(e[4], e[5], e[6]);
        fireMat.uniforms.u_time.value = time;
        fireMat.uniforms.u_viewProj.value.copy(_vp);
        fireMat.uniforms.u_camRight.value.copy(_right);
        fireMat.uniforms.u_camUp.value.copy(_up);
        fireMat.uniforms.u_segHeat.value = segHeatUniform;
      }

      renderer.render(scene, camera);

      // Project node positions for the HTML overlay.
      if (opts.onNodes) {
        const out: Chain3DNodeScreen[] = [];
        for (let j = 0; j < n; j++) {
          _proj.copy(curve.getPointAt(Math.min(nodeU[j], 1)));
          // account for chainGroup transform
          _proj.applyMatrix4(chainGroup.matrixWorld);
          _proj.project(camera);
          out.push({
            x: (_proj.x * 0.5 + 0.5) * cssW,
            y: (-_proj.y * 0.5 + 0.5) * cssH,
            scale: THREE.MathUtils.clamp(1.6 - (_proj.z) * 0.9, 0.5, 1.25),
            visible: _proj.z < 1 && _proj.x > -1.15 && _proj.x < 1.15 && _proj.y > -1.15 && _proj.y < 1.15,
          });
        }
        opts.onNodes(out);
      }

      raf = requestAnimationFrame(frame);
    }

    chainGroup.updateMatrixWorld();
    raf = requestAnimationFrame(frame);

    return {
      resize(w, h, ratio) {
        cssW = Math.max(1, w); cssH = Math.max(1, h);
        renderer.setPixelRatio(Math.min(ratio, q.dprCap));
        renderer.setSize(cssW, cssH, false);
        camera.aspect = cssW / cssH;
        camera.updateProjectionMatrix();
      },
      setState(nodeSolved, segmentActive) {
        for (let i = 0; i < n; i++) nodeSolvedState[i] = !!nodeSolved[i];
        for (let s = 0; s < segCount; s++) {
          const want = segmentActive[s] ? 1 : 0;
          if (want === 1 && segTarget[s] !== 1) segIgniteAt[s] = performance.now();
          if (want === 0) segIgniteAt[s] = -1;
          segTarget[s] = want;
        }
      },
      destroy() {
        disposed = true;
        cancelAnimationFrame(raf);
        try {
          torus.dispose();
          metal.dispose();
          links.dispose();
          fireMesh?.geometry.dispose();
          fireMat?.dispose();
          envTex.dispose();
          pmrem.dispose();
          renderer.dispose();
        } catch { /* ignore teardown races */ }
      },
    };
  } catch {
    try { renderer.dispose(); } catch { /* noop */ }
    return null;
  }
}
