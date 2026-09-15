// GLSL ES 3.00 (WebGL2) sources for the chain engine.
// Three passes: metal links (opaque, PBR-ish), fire billboards (additive),
// ember points (additive). Fire/ember intensity is driven by a per-segment
// heat uniform array, so igniting a segment is a uniform update — no rebuilds.

export const MAX_SEGMENTS = 64;

export const METAL_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 a_pos;
layout(location=1) in vec3 a_nrm;
layout(location=2) in vec4 iM0;
layout(location=3) in vec4 iM1;
layout(location=4) in vec4 iM2;
layout(location=5) in vec4 iM3;
layout(location=6) in float a_heat;
layout(location=7) in float a_glow;
uniform mat4 u_viewProj;
out vec3 v_worldPos;
out vec3 v_normal;
out float v_heat;
out float v_glow;
void main(){
  mat4 model = mat4(iM0,iM1,iM2,iM3);
  vec4 wp = model * vec4(a_pos,1.0);
  v_worldPos = wp.xyz;
  v_normal = normalize(mat3(model) * a_nrm);
  v_heat = a_heat;
  v_glow = a_glow;
  gl_Position = u_viewProj * wp;
}`;

export const METAL_FS = `#version 300 es
precision highp float;
in vec3 v_worldPos;
in vec3 v_normal;
in float v_heat;
in float v_glow;
uniform vec3 u_camPos;
uniform float u_time;
out vec4 frag;

float hash(vec3 p){ p=fract(p*0.3183+0.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }

vec3 envColor(vec3 dir){
  float up = clamp(dir.y*0.5+0.5, 0.0, 1.0);
  vec3 sky = mix(vec3(0.02,0.03,0.05), vec3(0.16,0.20,0.27), up);
  vec3 warm = vec3(0.22,0.11,0.05) * clamp(-dir.y, 0.0, 1.0);
  return sky + warm;
}

void main(){
  vec3 N = normalize(v_normal);
  vec3 V = normalize(u_camPos - v_worldPos);
  float ndv = clamp(dot(N,V), 0.0, 1.0);
  vec3 R = reflect(-V, N);

  float micro = hash(floor(v_worldPos*42.0));
  vec3 base = mix(vec3(0.33,0.35,0.39), vec3(0.47,0.49,0.54), micro);

  vec3 keyDir = normalize(vec3(0.4,0.9,0.5));
  float key = clamp(dot(N,keyDir), 0.0, 1.0);
  float fres = pow(1.0-ndv, 5.0);
  float rim  = pow(1.0-ndv, 3.0);
  vec3 refl = envColor(R);
  float spec = pow(clamp(dot(R,keyDir),0.0,1.0), 48.0);

  vec3 col = base*(0.25 + 0.75*key) + refl*(0.35 + 0.65*fres) + spec*vec3(1.0);
  col += vec3(0.55,0.85,0.15) * rim * 0.45;               // neon rim (house accent)

  col += vec3(0.10,0.62,0.72) * v_glow * (0.6 + 0.4*sin(u_time*3.0)); // solved energy

  float h = clamp(v_heat, 0.0, 1.0);
  vec3 hot = mix(vec3(1.0,0.35,0.05), vec3(1.0,0.95,0.72), smoothstep(0.5,1.0,h));
  col = mix(col, col*0.35 + hot*2.3, h);
  col += hot * h * 0.28 * (0.5 + 0.5*sin(u_time*20.0 + v_worldPos.z*3.0)); // shimmer

  frag = vec4(col, 1.0);
}`;

export const FIRE_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 a_corner;
layout(location=1) in vec3 i_pos;
layout(location=2) in float i_seed;
layout(location=3) in float i_size;
layout(location=4) in float i_seg;
uniform mat4 u_viewProj;
uniform vec3 u_camRight;
uniform vec3 u_camUp;
uniform float u_time;
uniform float u_segHeat[${MAX_SEGMENTS}];
out vec2 v_uv;
out float v_intensity;
out float v_seed;
void main(){
  float heat = u_segHeat[int(i_seg + 0.5)];
  float t = u_time*0.9 + i_seed*10.0;
  float rise = fract(t*0.32 + i_seed);
  vec3 pos = i_pos;
  pos += u_camUp * rise * i_size * 1.6;
  pos += u_camRight * sin(t*3.0)*0.10*i_size;
  float sizeFade = (1.0 - rise*0.45) * i_size * (0.55 + heat*0.85);
  vec3 world = pos + (a_corner.x*u_camRight + a_corner.y*u_camUp) * sizeFade;
  v_uv = a_corner;
  v_intensity = heat * (1.0 - rise*0.35);
  v_seed = i_seed;
  gl_Position = u_viewProj * vec4(world, 1.0);
}`;

export const FIRE_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
in float v_intensity;
in float v_seed;
uniform float u_time;
out vec4 frag;
float hash21(vec2 p){ p=fract(p*vec2(123.34,345.45)); p+=dot(p,p+34.345); return fract(p.x*p.y); }
float noise(vec2 p){
  vec2 i=floor(p), f=fract(p);
  float a=hash21(i), b=hash21(i+vec2(1,0)), c=hash21(i+vec2(0,1)), d=hash21(i+vec2(1,1));
  vec2 u=f*f*(3.0-2.0*f);
  return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
}
float fbm(vec2 p){ float v=0.0, a=0.5; for(int i=0;i<4;i++){ v+=a*noise(p); p*=2.0; a*=0.5; } return v; }
void main(){
  if(v_intensity <= 0.01) discard;
  float r = length(v_uv);
  if(r > 1.0) discard;
  float n = fbm(v_uv*3.0 + vec2(v_seed*7.0, -u_time*1.7));
  float flame = smoothstep(1.0, 0.05, r + (1.0-n)*0.55) * v_intensity;
  vec3 edge=vec3(0.72,0.13,0.02), mid=vec3(1.0,0.55,0.12), core=vec3(1.0,0.96,0.78);
  vec3 col = mix(edge, mid, smoothstep(0.0,0.5,flame));
  col = mix(col, core, smoothstep(0.55,1.0,flame));
  float a = flame*0.9;
  frag = vec4(col*a, a);
}`;

export const EMBER_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 i_pos;
layout(location=1) in float i_seed;
layout(location=2) in float i_seg;
uniform mat4 u_viewProj;
uniform vec3 u_camUp;
uniform vec3 u_camRight;
uniform float u_time;
uniform float u_dpr;
uniform float u_segHeat[${MAX_SEGMENTS}];
out float v_intensity;
void main(){
  float heat = u_segHeat[int(i_seg + 0.5)];
  float t = u_time*0.6 + i_seed*13.0;
  float rise = fract(t*0.4 + i_seed);
  vec3 pos = i_pos + u_camUp*rise*2.4 + u_camRight*sin(t*2.0 + i_seed*6.0)*0.6;
  v_intensity = heat * (1.0 - rise);
  gl_Position = u_viewProj * vec4(pos, 1.0);
  gl_PointSize = max(1.0, (6.5 - rise*4.5) * heat * u_dpr);
}`;

export const EMBER_FS = `#version 300 es
precision highp float;
in float v_intensity;
out vec4 frag;
void main(){
  if(v_intensity <= 0.01) discard;
  vec2 c = gl_PointCoord*2.0 - 1.0;
  float d = 1.0 - clamp(length(c), 0.0, 1.0);
  vec3 col = mix(vec3(1.0,0.4,0.1), vec3(1.0,0.9,0.6), v_intensity);
  float a = d*d*v_intensity;
  frag = vec4(col*a, a);
}`;
