// Tiny WebGL2 helpers. No dependency; mirrors the raw-GL approach the existing
// environment/lattice.ts already uses (DESIGN_SYSTEM Rule 7).

export function createGL(canvas: HTMLCanvasElement): WebGL2RenderingContext | null {
  const opts: WebGLContextAttributes = {
    alpha: true,
    antialias: true,
    depth: true,
    premultipliedAlpha: true,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: false,
    failIfMajorPerformanceCaveat: false,
  };
  try {
    const gl = canvas.getContext('webgl2', opts);
    return gl ?? null;
  } catch {
    return null;
  }
}

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error('Chain shader compile failed: ' + log);
  }
  return sh;
}

export function createProgram(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const v = compile(gl, gl.VERTEX_SHADER, vs);
  const f = compile(gl, gl.FRAGMENT_SHADER, fs);
  const p = gl.createProgram()!;
  gl.attachShader(p, v);
  gl.attachShader(p, f);
  gl.linkProgram(p);
  gl.deleteShader(v);
  gl.deleteShader(f);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(p);
    gl.deleteProgram(p);
    throw new Error('Chain program link failed: ' + log);
  }
  return p;
}

export function buffer(
  gl: WebGL2RenderingContext,
  data: BufferSource,
  target: number = gl.ARRAY_BUFFER,
  usage: number = gl.STATIC_DRAW,
): WebGLBuffer {
  const b = gl.createBuffer()!;
  gl.bindBuffer(target, b);
  gl.bufferData(target, data, usage);
  return b;
}

// Bind a float vertex attribute (optionally instanced).
export function attrib(
  gl: WebGL2RenderingContext,
  loc: number,
  buf: WebGLBuffer,
  size: number,
  stride = 0,
  offset = 0,
  divisor = 0,
) {
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, offset);
  if (divisor) gl.vertexAttribDivisor(loc, divisor);
}
