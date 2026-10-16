import { analyze, bilinear, edt, fbm, setNoiseSeed, SRGB2LIN, tangentField } from './analysis.js';
import { button, colorRow, section, slider } from './ui.js';

// ============================================================================
// Parameters
// ============================================================================

const RENDER = 0, WARM = 1, FLOW = 2, COLD = 3, ANALYSIS = 4;

const P = {
  minSize: 5, maxSize: 30, detailGamma: 0.6, detailBlur: 12, sizeJitter: 0.12,
  edgeBlur: 3.0, edgeThresh: 0.55, edgeMinLen: 80, block: true,
  guides: 3, swirlScale: 420, guard: 4, rowsReach: 40, attract: 0.8, seamAlign: 1, angleJitter: 0.08,
  outlineRows: 1, outlineSide: 1, outlineStrength: 0, outlineMinLen: 120, outlineContrast: 0.95,
  aspect: 2.85, roundness: 9.6, irregular: 0.17, irrFreq: 1.25,
  grout: 0.7, groutVar: 0.82, bevel: 1, light: 0.75, colorVar: 0.3, groutColor: '#181716',
  hueVar: 7, litVar: 0.01,
  iterations: 30, seed: 1,
};

// Only the settings that change the look are exposed; the rest stay fixed at the values in P.
// `to`/`from` map a parameter to the slider scale where the raw one reads backwards.
const pct = (v) => `${Math.round(v * 100)}%`;
const SCHEMA = [
  { id: 'tiles', group: 'Tiles', items: [
    { k: 'minSize', label: 'Min size', min: 2, max: 30, step: 0.5, unit: 'px', kind: COLD },
    { k: 'maxSize', label: 'Max size', min: 6, max: 90, step: 1, unit: 'px', kind: COLD },
    { k: 'detailGamma', label: 'Detail', min: 0, max: 1, step: 0.01, kind: COLD, format: pct,
      to: (g) => (2 - Math.log2(g)) / 4, from: (d) => 2 ** (2 - 4 * d),
      title: 'Higher gives more of the area to small tiles' },
    { k: 'aspect', label: 'Elongation', min: 1, max: 3.5, step: 0.05, kind: FLOW },
    { k: 'roundness', label: 'Squareness', min: 1, max: 12, step: 0.1, kind: WARM,
      title: '1 — round tiles, 12 — rectangular' },
    { k: 'irregular', label: 'Irregularity', min: 0, max: 0.45, step: 0.01, kind: WARM, format: (v) => pct(v / 0.45) },
    { type: 'button', label: 'New layout', action: () => { P.seed = (P.seed % 999) + 1; schedule(COLD); },
      title: 'Same settings, new random layout' },
  ] },
  { id: 'rows', group: 'Rows and edges', items: [
    { k: 'guides', label: 'Swirls', min: 0, max: 14, step: 1, kind: FLOW, format: (v) => (v ? String(v) : 'off'),
      title: 'Swirl guides away from edges; rows of tiles follow them' },
    { k: 'swirlScale', label: 'Swirl scale', min: 40, max: 900, step: 10, unit: 'px', kind: FLOW },
    { k: 'attract', label: 'Row order', min: 0, max: 1, step: 0.01, kind: WARM, format: pct },
    { k: 'edgeThresh', label: 'Edges', min: 0.05, max: 0.9, step: 0.01, kind: ANALYSIS, release: true, format: pct,
      to: (t) => 0.95 - t, from: (v) => 0.95 - v, title: 'Edge sensitivity' },
    { k: 'outlineStrength', label: 'Outline', min: 0, max: 1, step: 0.01, kind: RENDER,
      format: (v) => (v ? pct(v) : 'off'), title: 'Darkens the row of tiles along large silhouettes' },
  ] },
  { id: 'surface', group: 'Surface', items: [
    { k: 'grout', label: 'Grout', min: 0, max: 6, step: 0.1, unit: 'px', kind: RENDER },
    { k: 'groutVar', label: 'Grout variation', min: 0, max: 1, step: 0.01, kind: RENDER, format: pct },
    { k: 'bevel', label: 'Bevel', min: 0, max: 8, step: 0.1, unit: 'px', kind: RENDER },
    { k: 'light', label: 'Light', min: 0, max: 1, step: 0.01, kind: RENDER, format: pct },
    { k: 'hueVar', label: 'Hue variation', min: 0, max: 45, step: 0.5, kind: RENDER, format: (v) => `${v}°` },
    { k: 'litVar', label: 'Lightness variation', min: 0, max: 0.2, step: 0.005, kind: RENDER, format: (v) => pct(v / 0.2) },
    { k: 'colorVar', label: 'Texture', min: 0, max: 0.3, step: 0.005, kind: RENDER, format: (v) => pct(v / 0.3) },
    { k: 'groutColor', label: 'Grout colour', type: 'color', kind: RENDER },
  ] },
];

// ============================================================================
// GL setup
// ============================================================================

const $ = (id) => document.getElementById(id);
const canvas = $('view');
const stage = $('stage');
const gl = canvas.getContext('webgl2', { antialias: false, depth: false, preserveDrawingBuffer: true });

function fail(msg) { $('err').textContent = msg; throw new Error(msg); }
if (!gl) fail('WebGL2 is not available');
if (!gl.getExtension('EXT_color_buffer_float')) fail('EXT_color_buffer_float is required');

const GLSL_NOISE = `
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}`;

// Each site is drawn as an instanced quad. The fragment writes the site id and a depth equal to
// the site's anisotropic p-norm distance (multiplicatively weighted by tile size), so the depth
// test resolves a weighted Voronoi diagram. Pixels hidden from the site behind an edge get a
// depth penalty: tiles never straddle contours unless nothing else can claim the pixel.
const SITE_VS = `#version 300 es
layout(location=0) in vec2 aCorner;
layout(location=1) in vec4 aSite;   // x, y, theta, size
layout(location=2) in float aRnd;
uniform vec2 uImg;
uniform vec4 uWin;                  // visible window of the image: x0, y0, width, height (image px)
uniform float uAspect, uReach;
out vec2 vP;
flat out vec4 vSite;
flat out float vRnd;
flat out int vId;
void main(){
  float r = uReach * aSite.w * sqrt(uAspect);
  vec2 p = aSite.xy + aCorner * r;
  vP = p; vSite = aSite; vRnd = aRnd; vId = gl_InstanceID;
  gl_Position = vec4((p - uWin.xy) / uWin.zw * 2.0 - 1.0, 0.0, 1.0);
}`;

const SITE_FS = `#version 300 es
precision highp float; precision highp int;
in vec2 vP; flat in vec4 vSite; flat in float vRnd; flat in int vId;
uniform sampler2D uEdt;
uniform vec2 uImg;
uniform float uAspect, uPow, uIrr, uIrrFreq, uBlock;
out vec4 oId;
${GLSL_NOISE}
// x: distance to nearest edge, yz: its gradient (unit length off the edge, ~0 on the edge line)
vec3 fld(vec2 p){ return texture(uEdt, p / uImg).xyz; }
// The segment crossed an edge line when the gradient flips between two samples close to it.
// Rays that merely graze a contour keep a consistent gradient and stay visible, so the
// decision does not flicker between neighbouring rays (that flicker drew jagged "teeth").
bool crossed(vec2 gp, float ep, vec3 f){
  return ep < 1.5 && f.x < 1.5 && dot(f.yz, f.yz) > 0.25 && dot(normalize(gp), normalize(f.yz)) < -0.3;
}
void main(){
  vec2 d = vP - vSite.xy;
  float c = cos(vSite.z), s = sin(vSite.z);
  vec2 q = vec2(c * d.x + s * d.y, -s * d.x + c * d.y);
  float sa = sqrt(uAspect);
  q /= vec2(vSite.w * sa, vSite.w / sa) * 0.5;
  vec2 a = abs(q) + 1e-6;
  float dist = pow(pow(a.x, uPow) + pow(a.y, uPow), 1.0 / uPow);
  dist *= 1.0 + uIrr * (vnoise(q * uIrrFreq + vRnd * 173.0) * 2.0 - 1.0);
  float pen = 0.0;
  if (uBlock > 0.5) {
    float len = length(d);
    vec3 f0 = fld(vSite.xy);
    if (len > f0.x - 0.5) {                     // inside the edge-free disc nothing can be crossed
      vec2 dir = d / max(len, 1e-4);
      vec2 gPrev = f0.yz;
      float ePrev = dot(gPrev, gPrev) > 0.25 ? f0.x : 1e9;
      float t = min(max(f0.x - 0.75, 0.5), len);
      for (int i = 0; i < 64; i++) {           // sphere-trace the distance-to-edge field
        bool last = t >= len - 1e-3;
        vec3 f = fld(last ? vP : vSite.xy + dir * t);
        if (crossed(gPrev, ePrev, f)) { pen = 32.0; break; }
        if (dot(f.yz, f.yz) > 0.25) { gPrev = f.yz; ePrev = f.x; }
        if (last) break;
        t = min(t + max(f.x - 0.35, 0.5), len);
      }
    }
  }
  gl_FragDepth = clamp((dist + pen) / 64.0, 0.0, 1.0);
  int id = vId + 1;
  oId = vec4(float(id & 255), float((id >> 8) & 255), float((id >> 16) & 255), 255.0) / 255.0;
}`;

const FS_VS = `#version 300 es
const vec2 V[3] = vec2[3](vec2(-1, -1), vec2(3, -1), vec2(-1, 3));
void main(){ gl_Position = vec4(V[gl_VertexID], 0.0, 1.0); }`;

// Jump flooding: distance from every pixel to the nearest cell boundary.
const JFA_SEED_FS = `#version 300 es
precision highp float; precision highp int;
uniform sampler2D uId;
out vec4 o;
void main(){
  ivec2 p = ivec2(gl_FragCoord.xy), mx = textureSize(uId, 0) - 1;
  vec4 c = texelFetch(uId, p, 0);
  bool b = c.a == 0.0;
  b = b || any(notEqual(c, texelFetch(uId, clamp(p + ivec2(1, 0), ivec2(0), mx), 0)));
  b = b || any(notEqual(c, texelFetch(uId, clamp(p - ivec2(1, 0), ivec2(0), mx), 0)));
  b = b || any(notEqual(c, texelFetch(uId, clamp(p + ivec2(0, 1), ivec2(0), mx), 0)));
  b = b || any(notEqual(c, texelFetch(uId, clamp(p - ivec2(0, 1), ivec2(0), mx), 0)));
  o = b ? vec4(gl_FragCoord.xy, 0, 1) : vec4(-1e5, -1e5, 0, 0);
}`;

const JFA_FS = `#version 300 es
precision highp float; precision highp int;
uniform sampler2D uSrc;
uniform int uStep;
out vec4 o;
void main(){
  ivec2 p = ivec2(gl_FragCoord.xy), sz = textureSize(uSrc, 0);
  vec2 fp = gl_FragCoord.xy, best = vec2(-1e5);
  float bd = 1e20;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    ivec2 q = p + ivec2(x, y) * uStep;
    if (q.x < 0 || q.y < 0 || q.x >= sz.x || q.y >= sz.y) continue;
    vec2 s = texelFetch(uSrc, q, 0).xy;
    if (s.x < -1e4) continue;
    vec2 v = fp - s; float dd = dot(v, v);
    if (dd < bd) { bd = dd; best = s; }
  }
  o = vec4(best, 0, 1);
}`;

const COMP_FS = `#version 300 es
precision highp float; precision highp int;
uniform sampler2D uId, uJfa, uSrc, uDbg, uCol;
uniform vec2 uOut, uImg;
uniform vec4 uWin;
uniform vec3 uBg;
uniform float uScale, uGrout, uGroutVar, uBevel, uLight, uColorVar;
uniform vec3 uGroutCol;
uniform int uView;
out vec4 o;
${GLSL_NOISE}
void main(){
  ivec2 t = ivec2(int(gl_FragCoord.x), int(uOut.y) - 1 - int(gl_FragCoord.y));
  vec2 pImg = uWin.xy + (vec2(t) + 0.5) / uScale;      // this pixel in image coordinates
  if (any(lessThan(pImg, vec2(0))) || any(greaterThan(pImg, uImg))) { o = vec4(uBg, 1); return; }
  vec2 uv = pImg / uImg;
  if (uView == 2) { o = vec4(texture(uSrc, uv).rgb, 1); return; }
  if (uView >= 3) { o = vec4(texture(uDbg, uv).rgb, 1); return; }
  vec4 c = texelFetch(uId, t, 0);
  if (c.a == 0.0) { o = vec4(uGroutCol, 1); return; }
  int id = int(c.r * 255.0 + 0.5) + int(c.g * 255.0 + 0.5) * 256 + int(c.b * 255.0 + 0.5) * 65536 - 1;
  vec4 sc = texelFetch(uCol, ivec2(id % 2048, id / 2048), 0);
  vec2 pc = vec2(t) + 0.5;
  vec2 sd = texelFetch(uJfa, t, 0).xy;
  float b = sd.x < -1e4 ? 1e4 : length(pc - sd) + 0.5;   // distance to cell border, output px

  if (uView == 1) {
    vec3 rc = 0.3 + 0.65 * vec3(hash(vec2(id, 1.7)), hash(vec2(id, 2.9)), hash(vec2(id, 4.3)));
    o = vec4(mix(vec3(0.08), rc, smoothstep(0.5, 1.5, b)), 1);
    return;
  }

  // half grout width: each tile gets its own (hand-cut tiles sit unevenly), plus slow noise
  // along the seam; the seam is the sum of both neighbours' halves, so it varies pair to pair
  float gv = uGroutVar * (0.6 * (hash(vec2(sc.a * 91.3, 7.1)) * 2.0 - 1.0)
                        + 0.8 * (vnoise(pImg * 0.15 + 31.7) - 0.5));
  float gh = max(0.0, 0.5 * uGrout * uScale * (1.0 + gv));
  float m = smoothstep(gh - 0.5, gh + 0.5, b);
  float bw = max(uBevel * uScale, 1e-3);
  float x = clamp((b - gh) / bw, 0.0, 1.0);
  float slope = uBevel > 0.0 ? 1.3 * (1.0 - x) : 0.0;
  vec2 dir = (b < 1e3 && length(pc - sd) > 1e-3) ? normalize(pc - sd) : vec2(0);
  vec3 n = normalize(vec3(-dir * slope, 1.0));
  vec3 L = normalize(vec3(-0.55, -0.65, 0.75));        // light from top-left (image y points down)
  float shade = mix(1.0, dot(n, L) / L.z, uLight);
  float spec = pow(max(dot(reflect(-L, n), vec3(0, 0, 1)), 0.0), 24.0) * uLight * 0.35;
  vec3 col = sc.rgb;
  col *= 1.0 + uColorVar * 0.6 * (vnoise(pImg * 0.45 + sc.a * 50.0) - 0.5);
  col = col * shade + spec;
  vec3 g = uGroutCol * mix(1.15, 0.7, smoothstep(0.0, gh + 0.5, b));
  o = vec4(mix(g, col, m), 1);
}`;

function compile(vs, fs) {
  const mk = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) fail(gl.getShaderInfoLog(s) + '\n' + src);
    return s;
  };
  const p = gl.createProgram();
  gl.attachShader(p, mk(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) fail(gl.getProgramInfoLog(p));
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const name = gl.getActiveUniform(p, i).name;
    u[name] = gl.getUniformLocation(p, name);
  }
  return { p, u };
}

const progSite = compile(SITE_VS, SITE_FS);
const progSeed = compile(FS_VS, JFA_SEED_FS);
const progJfa = compile(FS_VS, JFA_FS);
const progComp = compile(FS_VS, COMP_FS);

function makeTex(w, h, ifmt, fmt, type, filter, data = null) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, ifmt, w, h, 0, fmt, type, data);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}

function makeTarget(w, h, withDepth, float) {
  const tex = float
    ? makeTex(w, h, gl.RG32F, gl.RG, gl.FLOAT, gl.NEAREST)
    : makeTex(w, h, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.NEAREST);
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  let rb = null;
  if (withDepth) {
    rb = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rb);
  }
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) fail('Framebuffer incomplete');
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { fb, tex, rb, w, h };
}

function freeTarget(t) {
  if (!t) return;
  gl.deleteFramebuffer(t.fb); gl.deleteTexture(t.tex);
  if (t.rb) gl.deleteRenderbuffer(t.rb);
}

// --- sites ---
const MAX_SITES = 120000;
const COL_W = 2048, COL_H = Math.ceil(MAX_SITES / COL_W);
const S = {
  n: 0,
  x: new Float32Array(MAX_SITES), y: new Float32Array(MAX_SITES),
  s: new Float32Array(MAX_SITES), th: new Float32Array(MAX_SITES), rnd: new Float32Array(MAX_SITES),
  sb: new Float32Array(MAX_SITES),  // base size before row-spacing correction
  wk: new Float32Array(MAX_SITES),  // row-spacing correction factor from seam alignment
  m: new Float32Array(MAX_SITES),   // rows in the half-gap last iteration (hysteresis), 0 = none
};
const baseCol = new Float32Array(MAX_SITES * 3);  // mean cell colour (sRGB), before outline tint
const inst = new Float32Array(MAX_SITES * 5);
const colData = new Float32Array(COL_W * COL_H * 4);

const siteVAO = gl.createVertexArray();
gl.bindVertexArray(siteVAO);
const quadBuf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
gl.enableVertexAttribArray(0);
gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
const instBuf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, instBuf);
gl.bufferData(gl.ARRAY_BUFFER, inst.byteLength, gl.DYNAMIC_DRAW);
gl.enableVertexAttribArray(1);
gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 20, 0);
gl.vertexAttribDivisor(1, 1);
gl.enableVertexAttribArray(2);
gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 20, 16);
gl.vertexAttribDivisor(2, 1);
gl.bindVertexArray(null);
const emptyVAO = gl.createVertexArray();

const colTex = makeTex(COL_W, COL_H, gl.RGBA32F, gl.RGBA, gl.FLOAT, gl.NEAREST);
let srcTex = null, edtTex = null, dbgTex = null;
let layoutT = null, outId = null, jfaA = null, jfaB = null;
let outW = 0, outH = 0;

// ============================================================================
// State
// ============================================================================

let img = null;   // ImageData
let A = null;     // analysis result
let R = null;     // row field: distance to guide curves + its tangent flow
let O = null;     // outline field: distance to significant silhouettes only
let W = 0, H = 0;
let idBuf = null; // layout readback
let acc = new Float64Array(0);
let job = null;
let needRender = false;
let debugDirty = true;
let view = 0;

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sizeAt(x, y) {
  const lo = Math.min(P.minSize, P.maxSize), hi = Math.max(P.minSize, P.maxSize);
  const d = bilinear(A.detail, W, H, x, y);
  return hi + (lo - hi) * Math.pow(Math.max(d, 0), P.detailGamma);
}

// Tile orientation: tangent to the iso-lines of the row field, i.e. parallel to the nearest
// guide curve (a real contour, or a noise iso-line far from contours). Without any guides,
// fall back to the tangent of the fbm iso-lines.
function flowAngle(x, y) {
  if (R.count) return 0.5 * Math.atan2(bilinear(R.ey, W, H, x, y), bilinear(R.ex, W, H, x, y));
  const sc = 1 / P.swirlScale, h = 0.04, u = x * sc, v = y * sc;
  const gx = fbm(u + h, v) - fbm(u - h, v), gy = fbm(u, v + h) - fbm(u, v - h);
  return Math.atan2(gx, -gy);
}

// Guide curves = real contours + quantised fbm iso-lines kept away from contours.
// Rows of tesserae are laid along offset curves of this set (its distance transform).
function computeRows() {
  const N = W * H, sa = Math.sqrt(P.aspect);
  const guide = new Uint8Array(N);
  let count = 0;
  if (P.guides > 0) {
    setNoiseSeed(P.seed);
    const q = new Int16Array(N), sc = 1 / P.swirlScale;
    for (let y = 0, i = 0; y < H; y++) {
      for (let x = 0; x < W; x++, i++) q[i] = Math.floor(fbm((x + 0.5) * sc, (y + 0.5) * sc) * P.guides);
    }
    for (let y = 0, i = 0; y < H; y++) {
      for (let x = 0; x < W; x++, i++) {
        const c = (x < W - 1 && q[i] !== q[i + 1]) || (y < H - 1 && q[i] !== q[i + W]);
        if (!c) continue;
        if (A.edgeCount && A.dist[i] < (P.guard * sizeAt(x + 0.5, y + 0.5)) / sa) continue;
        guide[i] = 2; count++;
      }
    }
  }
  for (let i = 0; i < N; i++) if (A.edges[i]) { guide[i] = 1; count++; }
  const rowDist = count ? edt(guide, W, H) : new Float32Array(N).fill(4000);
  const { ex, ey } = tangentField(rowDist, W, H);
  R = { guide, count, rowDist, ex, ey };
}

function seedSites() {
  setNoiseSeed(P.seed);
  const rng = mulberry32(P.seed * 7919 + 13);
  S.n = 0;
  const B = 8;
  for (let by = 0; by < H; by += B) {
    for (let bx = 0; bx < W; bx += B) {
      const bw = Math.min(B, W - bx), bh = Math.min(B, H - by);
      const s = sizeAt(bx + bw / 2, by + bh / 2);
      const e = (bw * bh) / (s * s);
      const cnt = Math.floor(e) + (rng() < e - Math.floor(e) ? 1 : 0);
      for (let k = 0; k < cnt && S.n < MAX_SITES; k++) {
        S.x[S.n] = bx + rng() * bw;
        S.y[S.n] = by + rng() * bh;
        S.rnd[S.n] = rng();
        S.wk[S.n] = 1;
        S.m[S.n] = 0;
        S.n++;
      }
    }
  }
}

function updateInstances() {
  const sa = Math.sqrt(P.aspect);
  for (let i = 0; i < S.n; i++) {
    const x = S.x[i], y = S.y[i], r = S.rnd[i];
    const sb = sizeAt(x, y) * (1 + P.sizeJitter * (2 * r - 1));
    const r2 = (r * 7.13) % 1;
    const th = flowAngle(x, y) + P.angleJitter * (r2 - 0.5) * Math.PI * 0.5;
    const s = sb * S.wk[i];
    S.sb[i] = sb; S.s[i] = s; S.th[i] = th;
    const o = i * 5;
    inst[o] = x; inst[o + 1] = y; inst[o + 2] = th; inst[o + 3] = s; inst[o + 4] = r;
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, instBuf);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, inst, 0, S.n * 5);
}

function renderSites(t, vw = [0, 0, W, H]) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb);
  gl.viewport(0, 0, t.w, t.h);
  gl.clearColor(0, 0, 0, 0); gl.clearDepth(1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS); gl.depthMask(true);
  const { p, u } = progSite;
  gl.useProgram(p);
  gl.uniform2f(u.uImg, W, H);
  gl.uniform4f(u.uWin, vw[0], vw[1], vw[2], vw[3]);
  gl.uniform1f(u.uAspect, P.aspect);
  gl.uniform1f(u.uReach, 1.5);
  gl.uniform1f(u.uPow, P.roundness);
  gl.uniform1f(u.uIrr, P.irregular);
  gl.uniform1f(u.uIrrFreq, P.irrFreq);
  gl.uniform1f(u.uBlock, P.block && A.edgeCount ? 1 : 0);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, edtTex);
  gl.uniform1i(u.uEdt, 0);
  gl.bindVertexArray(siteVAO);
  gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, S.n);
  gl.bindVertexArray(null);
  gl.disable(gl.DEPTH_TEST);
}

const lin2srgb = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

// Half-width of the strip between two guides, measured through (x, y): gradient ascent on the
// row distance field until it stops growing, i.e. until the medial axis where rows from the
// opposite guide begin. The image border also stops the walk, so rows end cleanly at the frame.
function halfGap(x, y) {
  const D = R.rowDist, st = 2;
  let d = bilinear(D, W, H, x, y);
  for (let i = 0; i < 300; i++) {
    const gx = bilinear(D, W, H, x + 1, y) - bilinear(D, W, H, x - 1, y);
    const gy = bilinear(D, W, H, x, y + 1) - bilinear(D, W, H, x, y - 1);
    const l = Math.hypot(gx, gy);
    if (l < 1e-3) break;
    const nx = x + (gx / l) * st, ny = y + (gy / l) * st;
    if (nx < 0 || ny < 0 || nx > W || ny > H) break;
    const dn = bilinear(D, W, H, nx, ny);
    if (dn < d + 0.4 * st) break;
    x = nx; y = ny; d = dn;
  }
  return d;
}

// Row spacing at a point: nominal tile width, snapped so that a whole number of rows fills the
// half-gap. Rows from both guides then end exactly on the medial axis, and the seam between
// them becomes one continuous grout line instead of a band of wedge-shaped leftovers.
// The row count keeps its previous value (last iteration, or last frame in video) until the
// gap has clearly changed. Without this the rounding flips back and forth as the site moves,
// tile widths jump and Lloyd never settles (it kept moving ~0.45 px per iteration).
let lastRowCount = 0;
function rowSpacing(x, y, wBase, prevM = 0) {
  if (P.seamAlign <= 0) { lastRowCount = 0; return wBase; }
  const hg = halfGap(x, y), raw = hg / wBase;
  let m = Math.max(1, Math.round(raw));
  if (prevM >= 1 && Math.abs(raw - prevM) < 0.85) m = prevM;
  lastRowCount = m;
  return wBase + P.seamAlign * (hg / m - wBase);
}

// Significant silhouettes: contour components that are both long and high-contrast.
// Short or soft contours (grass texture, folds) stay out of the outline.
function computeOutlineField() {
  const N = W * H;
  const keep = new Uint8Array(A.compLen.length);
  let comps = 0;
  for (let c = 1; c < keep.length; c++) {
    if (A.compLen[c] >= P.outlineMinLen && A.compMag[c] >= P.outlineContrast) { keep[c] = 1; comps++; }
  }
  const mask = new Uint8Array(N);
  let count = 0;
  for (let i = 0; i < N; i++) if (keep[A.compId[i]]) { mask[i] = 1; count++; }
  O = { keep, mask, count, comps, dist: count ? edt(mask, W, H) : null };
}

// Outline rows: tesserae in the first rows along a significant silhouette, optionally only on
// its lighter or darker side (decided by comparing with the luminance mirrored across it).
function outlineWeight(i) {
  if (P.outlineRows <= 0 || P.outlineStrength <= 0 || !O.count) return 0;
  const x = S.x[i], y = S.y[i];
  const w = S.s[i] / Math.sqrt(P.aspect);
  const D = O.dist;
  const d = bilinear(D, W, H, x, y);
  if (d >= P.outlineRows * w) return 0;
  if (P.outlineSide === 0) return 1;
  const gx = bilinear(D, W, H, x + 1, y) - bilinear(D, W, H, x - 1, y);
  const gy = bilinear(D, W, H, x, y + 1) - bilinear(D, W, H, x, y - 1);
  const l = Math.hypot(gx, gy);
  if (l < 1e-6) return 1;
  const off = d + Math.max(3, w);
  const here = bilinear(A.lum, W, H, x, y);
  const there = bilinear(A.lum, W, H, x - (gx / l) * off, y - (gy / l) * off);
  return (here >= there) === (P.outlineSide === 1) ? 1 : 0;
}

// Per-tile colour edits in OKLab: random lightness shift, hue rotation and a faint tint
// (so near-neutral tiles vary in hue too, as real smalti do), then outline darkening that
// lowers lightness only, so the outline tessera stays a deeper shade of its own colour.
const srgb2lin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const hashR = (r, k) => { const x = Math.sin(r * 12.9898 * k + k * 78.233) * 43758.5453; return x - Math.floor(x); };

function adjustOklab(r, g, b, i, outline, out) {
  r = srgb2lin(r); g = srgb2lin(g); b = srgb2lin(b);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  let L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  let A_ = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  let B_ = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const rr = S.rnd[i];
  L += P.litVar * (hashR(rr, 1) * 2 - 1);
  if (P.hueVar > 0) {
    const ang = ((P.hueVar * Math.PI) / 180) * (hashR(rr, 2) * 2 - 1);
    const ca = Math.cos(ang), sn = Math.sin(ang);
    [A_, B_] = [A_ * ca - B_ * sn, A_ * sn + B_ * ca];
    const tAng = hashR(rr, 3) * Math.PI * 2, tMag = (P.hueVar / 45) * 0.025 * hashR(rr, 4);
    A_ += Math.cos(tAng) * tMag; B_ += Math.sin(tAng) * tMag;
  }
  L *= 1 - 0.75 * outline;
  L = Math.min(Math.max(L, 0), 1);
  const l2 = (L + 0.3963377774 * A_ + 0.2158037573 * B_) ** 3;
  const m2 = (L - 0.1055613458 * A_ - 0.0638541728 * B_) ** 3;
  const s2 = (L - 0.0894841775 * A_ - 1.291485548 * B_) ** 3;
  const cl = (v) => lin2srgb(Math.min(Math.max(v, 0), 1));
  out[0] = cl(4.0767416621 * l2 - 3.3077115913 * m2 + 0.2309699292 * s2);
  out[1] = cl(-1.2684380046 * l2 + 2.6097574011 * m2 - 0.3413193965 * s2);
  out[2] = cl(-0.0041960863 * l2 - 0.7034186147 * m2 + 1.707614701 * s2);
}

function uploadColors() {
  const c = [0, 0, 0];
  for (let i = 0; i < S.n; i++) {
    adjustOklab(baseCol[3 * i], baseCol[3 * i + 1], baseCol[3 * i + 2], i, outlineWeight(i) * P.outlineStrength, c);
    colData[4 * i] = c[0]; colData[4 * i + 1] = c[1]; colData[4 * i + 2] = c[2]; colData[4 * i + 3] = S.rnd[i];
  }
  gl.bindTexture(gl.TEXTURE_2D, colTex);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, COL_W, COL_H, gl.RGBA, gl.FLOAT, colData);
}

// One Lloyd iteration: rasterise the weighted Voronoi at image resolution, read it back,
// average position + colour per cell, then (optionally) move sites to centroids and
// pull sites near contours onto offset rows ("opus vermiculatum").
const prof = { inst: 0, gpu: 0, cpu: 0 };
function lloydStep(move) {
  let t = performance.now();
  updateInstances();
  prof.inst = performance.now() - t; t = performance.now();
  renderSites(layoutT);
  gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, idBuf);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  prof.gpu = performance.now() - t; t = performance.now();

  const n = S.n;
  if (acc.length < n * 6) acc = new Float64Array(n * 6);
  acc.fill(0, 0, n * 6);
  const src = img.data;
  for (let y = 0, p = 0; y < H; y++) {
    for (let x = 0; x < W; x++, p++) {
      const id = idBuf[4 * p] | (idBuf[4 * p + 1] << 8) | (idBuf[4 * p + 2] << 16);
      if (!id) continue;
      const o = (id - 1) * 6;
      acc[o] += x + 0.5; acc[o + 1] += y + 0.5; acc[o + 2] += 1;
      acc[o + 3] += SRGB2LIN[src[4 * p]]; acc[o + 4] += SRGB2LIN[src[4 * p + 1]]; acc[o + 5] += SRGB2LIN[src[4 * p + 2]];
    }
  }

  const sa = Math.sqrt(P.aspect);
  let j = 0;
  for (let i = 0; i < n; i++) {
    const o = i * 6, cnt = acc[o + 2];
    if (!cnt) { if (!move) { baseCol.fill(0, i * 3, i * 3 + 3); j = i + 1; } continue; }
    const k = move ? j : i;
    for (let c = 0; c < 3; c++) baseCol[k * 3 + c] = lin2srgb(acc[o + 3 + c] / cnt);
    if (move) {
      let x = acc[o] / cnt, y = acc[o + 1] / cnt;
      let wk = 1, m = 0;
      if (P.rowsReach > 0 && P.attract > 0 && R.count) {
        const wBase = S.sb[i] / sa;
        const wpx = rowSpacing(x, y, wBase, S.m[i]);
        m = lastRowCount;
        wk = wpx / wBase;
        const d = bilinear(R.rowDist, W, H, x, y);
        if (d < P.rowsReach * wpx) {
          const target = (Math.floor(d / wpx) + 0.5) * wpx;
          const gx = bilinear(R.rowDist, W, H, x + 1, y) - bilinear(R.rowDist, W, H, x - 1, y);
          const gy = bilinear(R.rowDist, W, H, x, y + 1) - bilinear(R.rowDist, W, H, x, y - 1);
          const gl2 = Math.hypot(gx, gy);
          if (gl2 > 1e-6) {
            x += (P.attract * (target - d) * gx) / gl2;
            y += (P.attract * (target - d) * gy) / gl2;
          }
        }
      }
      S.x[j] = Math.min(Math.max(x, 0.5), W - 0.5);
      S.y[j] = Math.min(Math.max(y, 0.5), H - 0.5);
      S.rnd[j] = S.rnd[i];
      S.wk[j] = wk;
      S.m[j] = m;
      j++;
    } else {
      j = i + 1;
    }
  }
  if (move) S.n = j;
  uploadColors();
  prof.cpu = performance.now() - t;
}

// ============================================================================
// Output rendering
// ============================================================================

// Camera: the canvas fills the stage and only the visible window of the image is rendered,
// at screen resolution, so deep zoom stays sharp. k = screen (CSS) px per image px.
const cam = { fit: true, k: 1, cx: 0, cy: 0 };
let viewRect = [0, 0, 1, 1];

// "Fit" centres the image in the whole window; the menu floats over it.
const fitK = () => Math.max(0.01, Math.min((stage.clientWidth - 32) / W, (stage.clientHeight - 32) / H));
function camWindow() {
  const cw = stage.clientWidth, ch = stage.clientHeight;
  if (cam.fit) { cam.k = fitK(); cam.cx = W / 2; cam.cy = H / 2; }
  return [cam.cx - cw / 2 / cam.k, cam.cy - ch / 2 / cam.k, cw / cam.k, ch / cam.k];
}

function setTargets(ow, oh) {
  if (ow === outW && oh === outH) return;
  if (!ow || !oh) { freeTarget(outId); freeTarget(jfaA); freeTarget(jfaB); outId = jfaA = jfaB = null; outW = outH = 0; return; }
  outW = ow; outH = oh;
  freeTarget(outId); freeTarget(jfaA); freeTarget(jfaB);
  outId = makeTarget(ow, oh, true, false);
  jfaA = makeTarget(ow, oh, false, true);
  jfaB = makeTarget(ow, oh, false, true);
}

function resizeOutput() {
  const dpr = window.devicePixelRatio || 1;
  const cw = stage.clientWidth, ch = stage.clientHeight;
  const ow = Math.max(1, Math.round(cw * dpr)), oh = Math.max(1, Math.round(ch * dpr));
  viewRect = camWindow();
  Object.assign(canvas.style, { left: '0px', top: '0px', width: `${cw}px`, height: `${ch}px` });
  if (canvas.width !== ow || canvas.height !== oh) { canvas.width = ow; canvas.height = oh; }
  setTargets(ow, oh);
}

function fullscreen(t, prog) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, t ? t.fb : null);
  gl.viewport(0, 0, outW, outH);
  gl.useProgram(prog.p);
  gl.bindVertexArray(emptyVAO);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

// Renders the camera view to the canvas, or (exp) the whole image into an offscreen target.
function renderOutput(exp = null) {
  if (exp) { setTargets(exp.w, exp.h); viewRect = [0, 0, W, H]; } else resizeOutput();
  const scale = outW / viewRect[2];          // output px per image px
  let jfaOut = jfaA;
  if (view <= 1) {
    renderSites(outId, viewRect);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, outId.tex);
    gl.useProgram(progSeed.p); gl.uniform1i(progSeed.u.uId, 0);
    fullscreen(jfaA, progSeed);
    const maxD = view === 1 ? 2 : (P.grout * 0.5 + P.bevel) * scale + 2;
    let step = 1;
    while (step < maxD) step *= 2;
    let a = jfaA, b = jfaB;
    gl.useProgram(progJfa.p); gl.uniform1i(progJfa.u.uSrc, 0);
    const steps = [];
    for (let s = step; s >= 1; s >>= 1) steps.push(s);
    steps.push(1);
    for (const s of steps) {
      gl.bindTexture(gl.TEXTURE_2D, a.tex);
      gl.uniform1i(progJfa.u.uStep, s);
      fullscreen(b, progJfa);
      [a, b] = [b, a];
    }
    jfaOut = a;
  }
  const { p, u } = progComp;
  gl.useProgram(p);
  const bind = (unit, tex, name) => {
    gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(u[name], unit);
  };
  bind(0, outId.tex, 'uId');
  bind(1, jfaOut.tex, 'uJfa');
  bind(2, srcTex, 'uSrc');
  bind(3, dbgTex || srcTex, 'uDbg');
  bind(4, colTex, 'uCol');
  gl.uniform2f(u.uOut, outW, outH);
  gl.uniform2f(u.uImg, W, H);
  gl.uniform4f(u.uWin, viewRect[0], viewRect[1], viewRect[2], viewRect[3]);
  gl.uniform3f(u.uBg, 0, 0, 0);
  gl.uniform1f(u.uScale, scale);
  gl.uniform1f(u.uGrout, P.grout);
  gl.uniform1f(u.uBevel, P.bevel);
  gl.uniform1f(u.uLight, P.light);
  gl.uniform1f(u.uColorVar, P.colorVar);
  gl.uniform1f(u.uGroutVar, P.groutVar);
  const gc = P.groutColor;
  gl.uniform3f(u.uGroutCol, parseInt(gc.slice(1, 3), 16) / 255, parseInt(gc.slice(3, 5), 16) / 255, parseInt(gc.slice(5, 7), 16) / 255);
  gl.uniform1i(u.uView, view);
  fullscreen(exp ? exp.target : null, progComp);
  gl.activeTexture(gl.TEXTURE0);
  if (!exp) zoomUI();
}

// Full-image PNG, long side 4096 px, rendered offscreen so the screen does not change.
let exporting = false;
async function exportPNG() {
  if (!img || exporting) return null;
  exporting = true;
  const maxDim = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE), 4096);
  const k = maxDim / Math.max(W, H);
  const ow = Math.round(W * k), oh = Math.round(H * k);
  const target = makeTarget(ow, oh, false, false);
  renderOutput({ w: ow, h: oh, target });
  const px = new Uint8Array(ow * oh * 4);
  gl.bindFramebuffer(gl.FRAMEBUFFER, target.fb);
  gl.readPixels(0, 0, ow, oh, gl.RGBA, gl.UNSIGNED_BYTE, px);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  freeTarget(target);
  setTargets(0, 0);           // screen targets get re-made at screen size on the next frame
  needRender = true;
  const c = document.createElement('canvas');
  c.width = ow; c.height = oh;
  const ctx = c.getContext('2d');
  const out = ctx.createImageData(ow, oh), row = ow * 4;
  for (let y = 0; y < oh; y++) out.data.set(px.subarray((oh - 1 - y) * row, (oh - y) * row), y * row); // GL rows are bottom-up
  ctx.putImageData(out, 0, 0);
  const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
  exporting = false;
  return blob;
}

// ============================================================================
// Debug maps
// ============================================================================

const dbgCanvas = document.createElement('canvas');

function buildDebug() {
  debugDirty = false;
  if (view < 3) return;
  dbgCanvas.width = W; dbgCanvas.height = H;
  const ctx = dbgCanvas.getContext('2d');
  const out = ctx.createImageData(W, H);
  const o = out.data, src = img.data;
  const lo = Math.min(P.minSize, P.maxSize), hi = Math.max(P.minSize, P.maxSize);
  const sa = Math.sqrt(P.aspect);
  const G = 4, gw = Math.ceil(W / G), gh = Math.ceil(H / G);
  let spacing = null;
  if (view === 4) {
    spacing = new Float32Array(gw * gh);
    for (let gy = 0; gy < gh; gy++) {
      for (let gx = 0; gx < gw; gx++) {
        const x = Math.min(gx * G + G / 2, W - 0.5), y = Math.min(gy * G + G / 2, H - 0.5);
        spacing[gy * gw + gx] = R.count ? rowSpacing(x, y, sizeAt(x, y) / sa) : sizeAt(x, y) / sa;
      }
    }
  }
  for (let y = 0, i = 0; y < H; y++) {
    for (let x = 0; x < W; x++, i++) {
      let r, g, b;
      const lum = (src[4 * i] * 0.3 + src[4 * i + 1] * 0.59 + src[4 * i + 2] * 0.11) / 255;
      if (view === 3) {
        const t = hi > lo ? (sizeAt(x + 0.5, y + 0.5) - lo) / (hi - lo) : 0;
        r = 255 * (1 - t) ** 1.5; g = 200 * (1 - t) ** 3 + 40 * t; b = 60 + 120 * t;
      } else if (view === 4) {
        const wpx = spacing[((y / G) | 0) * gw + ((x / G) | 0)];
        const k = Math.floor(R.rowDist[i] / wpx);
        if (k < P.rowsReach) { const v = (k % 2 ? 0.45 : 0.75) * (0.6 + 0.4 * lum); r = 230 * v; g = 160 * v; b = 80 * v; }
        else { r = g = b = 60 * lum; }
        if (R.guide[i] === 2) { r = 90; g = 200; b = 255; }
      } else {
        r = g = b = 70 * lum + 10;
      }
      if (A.edges[i] && view !== 5) {
        if (view === 3) { r = 255; g = 30; b = 30; }
        else if (O.mask[i]) { r = 255; g = 110; b = 30; }
        else { r = g = b = 255; }
      }
      o[4 * i] = r; o[4 * i + 1] = g; o[4 * i + 2] = b; o[4 * i + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
  if (view === 5) {
    const step = 9;
    ctx.lineWidth = 1.2;
    for (let y = step / 2; y < H; y += step) {
      for (let x = step / 2; x < W; x += step) {
        const th = flowAngle(x, y);
        const dx = Math.cos(th) * 3.6, dy = Math.sin(th) * 3.6;
        const hue = ((th / Math.PI) * 180 + 360) % 180 * 2;
        ctx.strokeStyle = `hsl(${hue} 70% 62%)`;
        ctx.beginPath(); ctx.moveTo(x - dx, y - dy); ctx.lineTo(x + dx, y + dy); ctx.stroke();
      }
    }
  }
  if (dbgTex) gl.deleteTexture(dbgTex);
  dbgTex = makeTex(W, H, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, dbgCanvas);
}

// ============================================================================
// Pipeline control
// ============================================================================

function runAnalysis() {
  A = analyze(img, P);
  if (edtTex) gl.deleteTexture(edtTex);
  const D = A.dist, fld = new Float32Array(W * H * 4);
  for (let y = 0, i = 0; y < H; y++) {
    for (let x = 0; x < W; x++, i++) {
      fld[4 * i] = D[i];
      fld[4 * i + 1] = 0.5 * (D[i + (x < W - 1 ? 1 : 0)] - D[i - (x > 0 ? 1 : 0)]);
      fld[4 * i + 2] = 0.5 * (D[i + (y < H - 1 ? W : 0)] - D[i - (y > 0 ? W : 0)]);
    }
  }
  edtTex = makeTex(W, H, gl.RGBA16F, gl.RGBA, gl.FLOAT, gl.LINEAR, fld);
}

function startJob() { job = { iter: 0, total: P.iterations }; }

let pendingKind = -1, pendingTimer = 0, outlineDirty = false;
function schedule(kind) {
  pendingKind = Math.max(pendingKind, kind);
  clearTimeout(pendingTimer);
  pendingTimer = setTimeout(applyPending, kind === RENDER ? 0 : 40);
}
function applyPending() {
  const k = pendingKind;
  pendingKind = -1;
  if (!img) return;
  if (k >= ANALYSIS) runAnalysis();
  if (k >= ANALYSIS || outlineDirty) { computeOutlineField(); outlineDirty = false; debugDirty = true; }
  if (k >= FLOW) computeRows();
  if (k >= COLD) seedSites();
  if (k >= WARM) { startJob(); debugDirty = true; }
  else uploadColors();
  needRender = true;
}

function tick(now) {
  if (img) {
    stepCam(now ?? performance.now());
    if (job) {
      lloydStep(job.iter < job.total);
      job.iter++;
      if (job.iter > job.total) job = null;
      needRender = true;
    }
    if (debugDirty && view >= 3) buildDebug();
    if (needRender) { renderOutput(); needRender = false; }
  }
  requestAnimationFrame(tick);
}


function setImage(id) {
  const resized = id.width !== layoutT?.w || id.height !== layoutT?.h;
  W = id.width; H = id.height; img = id;
  if (resized) {
    if (srcTex) gl.deleteTexture(srcTex);
    srcTex = makeTex(W, H, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR, new Uint8Array(img.data.buffer));
    freeTarget(layoutT);
    layoutT = makeTarget(W, H, true, false);
    idBuf = new Uint8Array(W * H * 4);
    outW = outH = 0;
  } else {
    gl.bindTexture(gl.TEXTURE_2D, srcTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(img.data.buffer));
  }
}

let imgName = 'runner';
async function loadImage(url, name = 'runner') {
  const im = new Image();
  await new Promise((res, rej) => { im.onload = res; im.onerror = () => rej(new Error('Could not load the image')); im.src = url; });
  const k = Math.min(1, 1400 / Math.max(im.naturalWidth, im.naturalHeight));
  W = Math.round(im.naturalWidth * k); H = Math.round(im.naturalHeight * k);
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(im, 0, 0, W, H);
  setImage(ctx.getImageData(0, 0, W, H));
  imgName = name.replace(/\.[^.]+$/, '');
  cam.fit = true;
  outW = outH = 0;
  runAnalysis();
  computeOutlineField();
  computeRows();
  seedSites();
  startJob();
  debugDirty = true;
  needRender = true;
}

// ============================================================================
// UI
// ============================================================================

const VIEW_KEYS = [0, 2, 1, 3, 4, 5]; // keys 1-6: mosaic, source, cells, then the debug maps

function buildUI() {
  // top: open; bottom (sticky card): download
  const bOpen = button('Open image', () => $('file').click());
  bOpen.id = 'open';
  bOpen.classList.add('wide');
  const bSave = button('Download PNG', async () => {
    bSave.disabled = true; bSave.textContent = 'Rendering…';
    try {
      const blob = await exportPNG();
      if (blob) {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `mosaic-${imgName}.png`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 10000);
      }
    } finally { bSave.disabled = false; bSave.textContent = 'Download PNG'; }
  }, { primary: true, title: 'Whole image, long side 4096 px' });
  bSave.id = 'save';
  bSave.classList.add('wide');
  const aside = document.querySelector('aside');
  aside.prepend(bOpen);                    // first item of the menu
  aside.insertBefore(bSave, $('file'));    // last item, sticky (see CSS)

  // settings
  const root = $('controls');
  for (const grp of SCHEMA) {
    const sec = section(grp.group, grp.id);
    for (const it of grp.items) {
      if (it.type === 'button') {
        const b = button(it.label, it.action, { title: it.title });
        b.classList.add('wide');
        sec.body.append(b);
        continue;
      }
      if (it.type === 'color') {
        sec.body.append(colorRow(it.label, P[it.k], (v) => { P[it.k] = v; schedule(it.kind); }).el);
        continue;
      }
      const to = it.to || ((x) => x), from = it.from || ((x) => x);
      const apply = (v) => { P[it.k] = +from(v).toFixed(6); };
      const s = slider({
        label: it.label, min: it.min, max: it.max, step: it.step, unit: it.unit, format: it.format, title: it.title,
        value: to(P[it.k]),
        onInput: (v) => { apply(v); if (!it.release) schedule(it.kind); },
        onChange: (v) => { apply(v); if (it.release) schedule(it.kind); },
      });
      sec.body.append(s.el);
    }
    root.append(sec.el);
  }

  // bottom-left bar: view (mosaic / original) and zoom
  const zb = $('zoombar');
  const ICON_MOSAIC = '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect x="1.5" y="1.5" width="5.6" height="5.6" rx="1.6"/><rect x="8.9" y="1.5" width="5.6" height="5.6" rx="1.6"/><rect x="1.5" y="8.9" width="5.6" height="5.6" rx="1.6"/><rect x="8.9" y="8.9" width="5.6" height="5.6" rx="1.6"/></svg>';
  const ICON_ORIGINAL = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="1.7" y="2.7" width="12.6" height="10.6" rx="2.4"/><path d="M2.6 11.6l3.4-3.4 2.6 2.6 1.8-1.8 3 3"/><circle cx="10.6" cy="5.9" r="1.1"/></svg>';
  // one toggle: shows the current view, click flips mosaic <-> original
  const vt = button('', () => setView(view === 2 ? 0 : 2));
  vt.classList.add('vt');
  vt.innerHTML = `<span class="ico" data-v="0">${ICON_MOSAIC}</span><span class="ico" data-v="2">${ICON_ORIGINAL}</span>`;
  const syncView = () => {
    const shown = view === 2 ? '2' : '0';
    for (const ico of vt.querySelectorAll('.ico')) ico.classList.toggle('off', ico.dataset.v !== shown);
    vt.classList.toggle('on', view === 2);
    vt.title = view === 2 ? 'Showing original — click for mosaic (1)' : 'Showing mosaic — click for original (2)';
  };
  const setView = (v) => { view = v; syncView(); debugDirty = true; needRender = true; };
  syncView();
  const sep = document.createElement('div');
  sep.className = 'zsep';
  const pctBtn = button('100%', () => zoomTo(1), { title: 'Actual size' });
  pctBtn.classList.add('pct');
  const fitBtn = button('Fit', () => animateFit(), { title: 'Fit (double-click, 0)' });
  zb.append(
    vt, sep,
    button('−', () => zoomTo(cam.k / 1.25), { title: 'Zoom out (Option + wheel)' }),
    pctBtn,
    button('+', () => zoomTo(cam.k * 1.25), { title: 'Zoom in (Option + wheel)' }),
    fitBtn,
  );
  zoomUI = () => { pctBtn.textContent = `${Math.round(cam.k * 100)}%`; fitBtn.classList.toggle('on', cam.fit); };

  window.addEventListener('keydown', (e) => {
    if (e.target.closest?.('input, .sl') || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === '0') { camAnim = null; cam.fit = true; needRender = true; return; }
    const i = '123456'.indexOf(e.key);
    if (i < 0) return;
    setView(VIEW_KEYS[i]);   // 3 = cells, 4–6 = internal maps (no buttons for those)
  });
  $('file').addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (f) loadImage(URL.createObjectURL(f), f.name);
  });
  stage.addEventListener('dragover', (e) => { e.preventDefault(); stage.classList.add('dragging'); });
  stage.addEventListener('dragleave', () => stage.classList.remove('dragging'));
  stage.addEventListener('drop', (e) => {
    e.preventDefault(); stage.classList.remove('dragging');
    const f = e.dataTransfer.files[0];
    if (f && f.type.startsWith('image/')) loadImage(URL.createObjectURL(f), f.name);
  });
  window.addEventListener('resize', () => { needRender = true; });
  initCameraControls();
}

let zoomUI = () => {};

// Camera moves started by buttons / double-click ease (220ms strong ease-out, zoom interpolated
// in log space); wheel, drag and keys stay immediate and cancel a running move.
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let camAnim = null;
function animateCam(to, fitAfter = false) {
  camWindow();                                   // resolve the current fit values first
  if (reduceMotion.matches) { Object.assign(cam, to); cam.fit = fitAfter; camAnim = null; needRender = true; return; }
  camAnim = { from: { k: cam.k, cx: cam.cx, cy: cam.cy }, to, t0: performance.now(), dur: 220, fitAfter };
  cam.fit = false;
  needRender = true;
}
function stepCam(now) {
  if (!camAnim) return;
  const { from, to, t0, dur, fitAfter } = camAnim;
  const t = Math.min(1, (now - t0) / dur), e = 1 - (1 - t) ** 4;   // close to cubic-bezier(.23,1,.32,1)
  cam.k = Math.exp(Math.log(from.k) + (Math.log(to.k) - Math.log(from.k)) * e);
  cam.cx = from.cx + (to.cx - from.cx) * e;
  cam.cy = from.cy + (to.cy - from.cy) * e;
  if (t >= 1) { cam.fit = fitAfter; camAnim = null; }
  needRender = true;
}
const animateFit = () => { if (img) animateCam({ k: fitK(), cx: W / 2, cy: H / 2 }, true); };

// Zoom keeping the image point under (mx, my) — screen px in the stage — in place.
function zoomAt(mx, my, k) {
  const [x0, y0] = camWindow();
  const px = x0 + mx / cam.k, py = y0 + my / cam.k;
  cam.k = Math.min(Math.max(k, fitK() * 0.5), 40);
  cam.cx = px - (mx - stage.clientWidth / 2) / cam.k;
  cam.cy = py - (my - stage.clientHeight / 2) / cam.k;
  cam.fit = false;
  needRender = true;
}
// Buttons zoom around the centre of the window (the centre stays, so only k changes).
const zoomTo = (k) => {
  if (!img) return;
  camWindow();
  animateCam({ k: Math.min(Math.max(k, fitK() * 0.5), 40), cx: cam.cx, cy: cam.cy });
};

// Option/Alt + wheel (or trackpad pinch, which arrives as ctrl + wheel) zooms around the cursor;
// plain wheel / two-finger scroll and dragging pan; double-click fits the image again.
function initCameraControls() {
  const clampCam = () => {
    cam.cx = Math.min(Math.max(cam.cx, 0), W);
    cam.cy = Math.min(Math.max(cam.cy, 0), H);
  };
  const custom = () => { cam.fit = false; needRender = true; };
  const locked = () => !img;
  stage.addEventListener('wheel', (e) => {
    if (locked()) return;
    e.preventDefault();
    camAnim = null;
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? stage.clientHeight : 1;
    const dx = e.deltaX * unit, dy = e.deltaY * unit;
    camWindow();
    if (e.altKey || e.ctrlKey) {
      const r = stage.getBoundingClientRect();
      zoomAt(e.clientX - r.left, e.clientY - r.top, cam.k * Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.002)));
    } else {
      cam.cx += dx / cam.k; cam.cy += dy / cam.k;
    }
    clampCam(); custom();
  }, { passive: false });

  let drag = null;
  stage.addEventListener('pointerdown', (e) => {
    if (locked() || (e.button !== 0 && e.button !== 1)) return;
    camAnim = null;
    camWindow();
    drag = { x: e.clientX, y: e.clientY, moved: false };
    stage.setPointerCapture(e.pointerId);
  });
  stage.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 3) return;
    drag.moved = true;
    stage.classList.add('panning');
    cam.cx -= dx / cam.k; cam.cy -= dy / cam.k;
    drag.x = e.clientX; drag.y = e.clientY;
    clampCam(); custom();
  });
  const end = () => { drag = null; stage.classList.remove('panning'); };
  stage.addEventListener('pointerup', end);
  stage.addEventListener('pointercancel', end);
  stage.addEventListener('dblclick', () => { if (!locked()) animateFit(); });
}

// exposed for debugging from the console
window.mosaic = { P, S, prof, exportPNG, get A() { return A; }, get R() { return R; }, get O() { return O; }, schedule };

buildUI();
requestAnimationFrame(tick);
loadImage('assets/runner.webp').catch((e) => fail(e.message));

