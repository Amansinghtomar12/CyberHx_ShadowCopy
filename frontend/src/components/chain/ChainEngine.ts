// Bespoke WebGL2 chain engine. Renders an interlocking metal chain receding
// into a dark stage; solved-pair segments ignite with GPU fire + embers and the
// metal glows hot. Quality scales by tier. The rAF loop lives entirely outside
// React; the only bridge back is onFrame(nodeScreens) so the HTML overlay can
// track node positions without per-frame React renders.
//
// Robustness: createChainEngine returns null on any GL failure so the caller
// falls back to the 2D renderer. It never throws to the caller.

import {
  METAL_VS, METAL_FS, FIRE_VS, FIRE_FS, EMBER_VS, EMBER_FS, MAX_SEGMENTS,
} from './shaders';
import { createGL, createProgram, buffer, attrib } from './glutil';
import { buildTorus, layoutChain, chainCamera, samplePath } from './chainGeometry';
import {
  Mat4, Vec3, mat4Perspective, mat4LookAt, mat4Multiply, projectToNDC,
  add, clamp, smoothstep,
} from './chainMath';

export type QualityTier = 'ultra' | 'high' | 'medium' | 'low';

export interface NodeScreen {
  x: number; // CSS px within canvas
  y: number;
  depth: number; // 0 (near) .. 1 (far)
  visible: boolean;
}

export interface ChainEngineOptions {
  nodeCount: number;
  tier: QualityTier;
  reducedMotion: boolean;
  onFrame?: (nodes: NodeScreen[]) => void;
}

export interface ChainEngineHandle {
  resize: (cssW: number, cssH: number, dpr: number) => void;
  setState: (nodeSolved: boolean[], segmentActive: boolean[]) => void;
  destroy: () => void;
}

interface TierSpec { linksPerSeg: number; firePerSeg: number; emberPerSeg: number; dprCap: number; }

const TIERS: Record<QualityTier, TierSpec> = {
  ultra:  { linksPerSeg: 7, firePerSeg: 14, emberPerSeg: 20, dprCap: 2 },
  high:   { linksPerSeg: 6, firePerSeg: 10, emberPerSeg: 14, dprCap: 2 },
  medium: { linksPerSeg: 4, firePerSeg: 6,  emberPerSeg: 8,  dprCap: 1.5 },
  low:    { linksPerSeg: 3, firePerSeg: 3,  emberPerSeg: 4,  dprCap: 1 },
};

const IGNITE_MS = 1500;

// Deterministic pseudo-random so the scene is stable across reloads.
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function createChainEngine(
  canvas: HTMLCanvasElement,
  opts: ChainEngineOptions,
): ChainEngineHandle | null {
  const gl = createGL(canvas);
  if (!gl) return null;

  const tier = TIERS[opts.tier];
  const nodeCount = Math.max(1, Math.min(opts.nodeCount, MAX_SEGMENTS + 1));
  const segCount = Math.max(0, nodeCount - 1);

  try {
    // ── Geometry ──────────────────────────────────────────────
    const torus = buildTorus(0.44, 0.15, 26, 14);
    const layout = layoutChain(nodeCount, tier.linksPerSeg, 0.5);

    // Per-instance node index (nodes appear in t-order).
    const instNodeIndex = new Int32Array(layout.count).fill(-1);
    let nc = 0;
    for (let i = 0; i < layout.count; i++) {
      if (layout.instanceIsNode[i] > 0.5) instNodeIndex[i] = nc++;
    }

    // ── Programs ──────────────────────────────────────────────
    const metalP = createProgram(gl, METAL_VS, METAL_FS);
    const fireP = createProgram(gl, FIRE_VS, FIRE_FS);
    const emberP = createProgram(gl, EMBER_VS, EMBER_FS);

    // ── Metal VAO ─────────────────────────────────────────────
    const metalVAO = gl.createVertexArray()!;
    gl.bindVertexArray(metalVAO);
    const posB = buffer(gl, torus.positions);
    attrib(gl, 0, posB, 3);
    const nrmB = buffer(gl, torus.normals);
    attrib(gl, 1, nrmB, 3);
    const idxB = buffer(gl, torus.indices, gl.ELEMENT_ARRAY_BUFFER);
    const matB = buffer(gl, layout.instanceMatrix);
    for (let k = 0; k < 4; k++) attrib(gl, 2 + k, matB, 4, 64, k * 16, 1);
    const heatArr = new Float32Array(layout.count);
    const heatB = buffer(gl, heatArr, gl.ARRAY_BUFFER, gl.DYNAMIC_DRAW);
    attrib(gl, 6, heatB, 1, 0, 0, 1);
    const glowArr = new Float32Array(layout.count);
    const glowB = buffer(gl, glowArr, gl.ARRAY_BUFFER, gl.DYNAMIC_DRAW);
    attrib(gl, 7, glowB, 1, 0, 0, 1);
    gl.bindVertexArray(null);

    // ── Fire emitters ─────────────────────────────────────────
    const firePos: number[] = [];
    const fireSeed: number[] = [];
    const fireSize: number[] = [];
    const fireSeg: number[] = [];
    const rand = rng(0x9e3779b1 ^ nodeCount);
    for (let s = 0; s < segCount; s++) {
      const t0 = nodeCount === 1 ? 0.5 : s / (nodeCount - 1);
      const t1 = nodeCount === 1 ? 0.5 : (s + 1) / (nodeCount - 1);
      for (let k = 0; k < tier.firePerSeg; k++) {
        const t = t0 + (t1 - t0) * (k + 0.5) / tier.firePerSeg;
        const p = samplePath(t);
        firePos.push(
          p[0] + (rand() - 0.5) * 0.5,
          p[1] + (rand() - 0.2) * 0.5,
          p[2] + (rand() - 0.5) * 0.5,
        );
        fireSeed.push(rand());
        fireSize.push(0.6 + rand() * 0.5);
        fireSeg.push(s);
      }
    }
    const fireCount = fireSeed.length;
    const corners = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]); // triangle strip quad
    const fireVAO = gl.createVertexArray()!;
    gl.bindVertexArray(fireVAO);
    const cornerB = buffer(gl, corners);
    attrib(gl, 0, cornerB, 2);
    if (fireCount > 0) {
      attrib(gl, 1, buffer(gl, new Float32Array(firePos)), 3, 0, 0, 1);
      attrib(gl, 2, buffer(gl, new Float32Array(fireSeed)), 1, 0, 0, 1);
      attrib(gl, 3, buffer(gl, new Float32Array(fireSize)), 1, 0, 0, 1);
      attrib(gl, 4, buffer(gl, new Float32Array(fireSeg)), 1, 0, 0, 1);
    }
    gl.bindVertexArray(null);

    // ── Ember emitters ────────────────────────────────────────
    const emPos: number[] = [];
    const emSeed: number[] = [];
    const emSeg: number[] = [];
    for (let s = 0; s < segCount; s++) {
      const t0 = nodeCount === 1 ? 0.5 : s / (nodeCount - 1);
      const t1 = nodeCount === 1 ? 0.5 : (s + 1) / (nodeCount - 1);
      for (let k = 0; k < tier.emberPerSeg; k++) {
        const t = t0 + (t1 - t0) * rand();
        const p = samplePath(t);
        emPos.push(p[0] + (rand() - 0.5) * 0.6, p[1], p[2] + (rand() - 0.5) * 0.6);
        emSeed.push(rand());
        emSeg.push(s);
      }
    }
    const emberCount = emSeed.length;
    const emberVAO = gl.createVertexArray()!;
    gl.bindVertexArray(emberVAO);
    if (emberCount > 0) {
      attrib(gl, 0, buffer(gl, new Float32Array(emPos)), 3, 0, 0, 0);
      attrib(gl, 1, buffer(gl, new Float32Array(emSeed)), 1, 0, 0, 0);
      attrib(gl, 2, buffer(gl, new Float32Array(emSeg)), 1, 0, 0, 0);
    }
    gl.bindVertexArray(null);

    // ── Uniform locations ─────────────────────────────────────
    const uMetal = {
      vp: gl.getUniformLocation(metalP, 'u_viewProj'),
      cam: gl.getUniformLocation(metalP, 'u_camPos'),
      time: gl.getUniformLocation(metalP, 'u_time'),
    };
    const uFire = {
      vp: gl.getUniformLocation(fireP, 'u_viewProj'),
      right: gl.getUniformLocation(fireP, 'u_camRight'),
      up: gl.getUniformLocation(fireP, 'u_camUp'),
      time: gl.getUniformLocation(fireP, 'u_time'),
      heat: gl.getUniformLocation(fireP, 'u_segHeat'),
    };
    const uEmber = {
      vp: gl.getUniformLocation(emberP, 'u_viewProj'),
      up: gl.getUniformLocation(emberP, 'u_camUp'),
      right: gl.getUniformLocation(emberP, 'u_camRight'),
      time: gl.getUniformLocation(emberP, 'u_time'),
      dpr: gl.getUniformLocation(emberP, 'u_dpr'),
      heat: gl.getUniformLocation(emberP, 'u_segHeat'),
    };

    // ── State ─────────────────────────────────────────────────
    const segHeat = new Float32Array(MAX_SEGMENTS);       // current, animated
    const segTarget = new Float32Array(MAX_SEGMENTS);     // 0/1 goal
    const segIgniteAt = new Float32Array(MAX_SEGMENTS).fill(-1);
    const nodeSolvedState = new Array<boolean>(nodeCount).fill(false);
    let dpr = 1;
    let cssW = 1, cssH = 1;
    let raf = 0;
    let disposed = false;
    const cam = chainCamera();

    function updateGlow() {
      for (let i = 0; i < layout.count; i++) {
        const ni = instNodeIndex[i];
        glowArr[i] = ni >= 0 && nodeSolvedState[ni] ? 1 : 0;
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, glowB);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, glowArr);
    }

    function updateHeatBuffer() {
      for (let i = 0; i < layout.count; i++) {
        const seg = layout.instanceSegment[i] | 0;
        heatArr[i] = seg >= 0 && seg < MAX_SEGMENTS ? segHeat[seg] : 0;
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, heatB);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, heatArr);
    }

    const t0 = performance.now();

    function frame(now: number) {
      if (disposed) return;
      const time = (now - t0) / 1000;

      // Animate segment heat toward target (ignition/cool).
      let animating = false;
      for (let s = 0; s < segCount; s++) {
        const goal = segTarget[s];
        if (segHeat[s] !== goal) {
          animating = true;
          if (goal > segHeat[s]) {
            const p = segIgniteAt[s] >= 0 ? clamp((now - segIgniteAt[s]) / IGNITE_MS, 0, 1) : 1;
            segHeat[s] = smoothstep(0, 1, p);
            if (p >= 1) segHeat[s] = 1;
          } else {
            segHeat[s] = Math.max(goal, segHeat[s] - 0.03); // quick cool
          }
        }
      }
      if (animating) updateHeatBuffer();

      // Camera drift (compositor-cheap; frozen under reduced motion).
      const drift = opts.reducedMotion ? 0 : 1;
      const eye: Vec3 = add(cam.eye, [
        Math.sin(time * 0.18) * 0.5 * drift,
        Math.cos(time * 0.13) * 0.3 * drift,
        Math.sin(time * 0.09) * 0.4 * drift,
      ]);
      const aspect = cssW / Math.max(1, cssH);
      const proj = mat4Perspective((50 * Math.PI) / 180, aspect, 0.1, 60);
      const view = mat4LookAt(eye, cam.center, cam.up);
      const vp: Mat4 = mat4Multiply(proj, view);

      // Billboard basis from the view matrix rows.
      const camRight: Vec3 = [view[0], view[4], view[8]];
      const camUp: Vec3 = [view[1], view[5], view[9]];

      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0.02, 0.03, 0.06, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      // Metal (opaque).
      gl.enable(gl.DEPTH_TEST);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
      gl.useProgram(metalP);
      gl.uniformMatrix4fv(uMetal.vp, false, vp);
      gl.uniform3f(uMetal.cam, eye[0], eye[1], eye[2]);
      gl.uniform1f(uMetal.time, time);
      gl.bindVertexArray(metalVAO);
      gl.drawElementsInstanced(gl.TRIANGLES, torus.indexCount, gl.UNSIGNED_SHORT, 0, layout.count);

      // Fire + embers (additive, depth-tested but no depth write).
      gl.depthMask(false);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);

      if (fireCount > 0) {
        gl.useProgram(fireP);
        gl.uniformMatrix4fv(uFire.vp, false, vp);
        gl.uniform3f(uFire.right, camRight[0], camRight[1], camRight[2]);
        gl.uniform3f(uFire.up, camUp[0], camUp[1], camUp[2]);
        gl.uniform1f(uFire.time, time);
        gl.uniform1fv(uFire.heat, segHeat);
        gl.bindVertexArray(fireVAO);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, fireCount);
      }

      if (emberCount > 0) {
        gl.useProgram(emberP);
        gl.uniformMatrix4fv(uEmber.vp, false, vp);
        gl.uniform3f(uEmber.up, camUp[0], camUp[1], camUp[2]);
        gl.uniform3f(uEmber.right, camRight[0], camRight[1], camRight[2]);
        gl.uniform1f(uEmber.time, time);
        gl.uniform1f(uEmber.dpr, dpr);
        gl.uniform1fv(uEmber.heat, segHeat);
        gl.bindVertexArray(emberVAO);
        gl.drawArrays(gl.POINTS, 0, emberCount);
      }

      gl.bindVertexArray(null);
      gl.depthMask(true);

      // Project node positions for the HTML overlay.
      if (opts.onFrame) {
        const screens: NodeScreen[] = layout.nodeWorld.map((w) => {
          const ndc = projectToNDC(vp, w);
          if (!ndc) return { x: 0, y: 0, depth: 1, visible: false };
          return {
            x: (ndc.x * 0.5 + 0.5) * cssW,
            y: (1 - (ndc.y * 0.5 + 0.5)) * cssH,
            depth: clamp(ndc.z * 0.5 + 0.5, 0, 1),
            visible: ndc.x >= -1.1 && ndc.x <= 1.1 && ndc.y >= -1.1 && ndc.y <= 1.1,
          };
        });
        opts.onFrame(screens);
      }

      raf = requestAnimationFrame(frame);
    }

    const handle: ChainEngineHandle = {
      resize(w, h, ratio) {
        cssW = Math.max(1, w);
        cssH = Math.max(1, h);
        dpr = Math.min(ratio, tier.dprCap);
        canvas.width = Math.round(cssW * dpr);
        canvas.height = Math.round(cssH * dpr);
      },
      setState(nodeSolved, segmentActive) {
        for (let i = 0; i < nodeCount; i++) nodeSolvedState[i] = !!nodeSolved[i];
        updateGlow();
        for (let s = 0; s < segCount; s++) {
          const want = segmentActive[s] ? 1 : 0;
          if (want === 1 && segTarget[s] !== 1) segIgniteAt[s] = performance.now();
          if (want === 0) segIgniteAt[s] = -1;
          segTarget[s] = want;
        }
        updateHeatBuffer();
      },
      destroy() {
        disposed = true;
        cancelAnimationFrame(raf);
        try {
          gl.deleteProgram(metalP);
          gl.deleteProgram(fireP);
          gl.deleteProgram(emberP);
          gl.deleteVertexArray(metalVAO);
          gl.deleteVertexArray(fireVAO);
          gl.deleteVertexArray(emberVAO);
          const ext = gl.getExtension('WEBGL_lose_context');
          ext?.loseContext();
        } catch {
          /* ignore teardown races */
        }
      },
    };

    updateGlow();
    updateHeatBuffer();
    raf = requestAnimationFrame(frame);
    return handle;
  } catch {
    const ext = gl.getExtension('WEBGL_lose_context');
    ext?.loseContext();
    return null;
  }
}
