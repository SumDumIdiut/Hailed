// Hailed WebGL2 renderer. Plain ES module, no extensions, no float render targets
// (safe for WebKitGTK). See CONTRACTS.md for the API.
import { QUAD_VS, BG_VS, BG_FS, ORBIT_VS, ORBIT_FS, BODY_FS, RIB_VS, RIB_FS, PART_VS, PART_FS, PART_PER, TRI_VS, TRI_FS } from './shaders.js';
import { SHIP_TRIS, SHIP_TRIS_LO, PIVOT_Z, STERN_Z, SHIP_LEN, NAV, NOZZLES, INTAKE,
  BLIP_TRIS, BLIP_TRIS_LO, TUNNEL_TRIS, TUNNEL_TRIS_LO, BLIP_LEN, BLIP_DOCK } from './ship.js';

const FOV = 45 * Math.PI / 180;
const TAN_H = Math.tan(FOV / 2);
const TYPES = { rocky: 0, ocean: 1, ice: 2, lava: 3, gas: 4, desert: 5 };
const SPECIALS = { earth: 1, erid: 2, adrian: 3 };

const DEFAULT_PAL = {
  rocky:  [[.22,.20,.19],[.40,.35,.30],[.55,.50,.42],[.70,.66,.60],[.85,.82,.80]],
  ocean:  [[.02,.08,.25],[.05,.35,.50],[.55,.50,.30],[.25,.42,.17],[.50,.45,.40]],
  ice:    [[.82,.90,.98],[.05,.25,.60],[.60,.75,.92],[.9,.95,1],[1,1,1]],
  lava:   [[.07,.05,.045],[.20,.11,.08],[1.0,.28,.04],[1,.6,.1],[1,.9,.5]],
  gas:    [[.80,.60,.40],[.90,.80,.60],[.60,.40,.30],[.95,.90,.80],[.70,.30,.20]],
  desert: [[.55,.32,.15],[.75,.50,.25],[.85,.65,.40],[.60,.35,.20],[.35,.20,.12]],
};

// ---- small math (column-major mat3) ----
const mul3 = (a, b) => {
  const o = new Array(9);
  for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++)
    o[c * 3 + r] = a[r] * b[c * 3] + a[3 + r] * b[c * 3 + 1] + a[6 + r] * b[c * 3 + 2];
  return o;
};
const rotY = a => { const c = Math.cos(a), s = Math.sin(a); return [c,0,-s, 0,1,0, s,0,c]; };
const rotZ = a => { const c = Math.cos(a), s = Math.sin(a); return [c,s,0, -s,c,0, 0,0,1]; };
const mulv = (m, v) => [
  m[0]*v[0]+m[3]*v[1]+m[6]*v[2], m[1]*v[0]+m[4]*v[1]+m[7]*v[2], m[2]*v[0]+m[5]*v[1]+m[8]*v[2]];
const norm = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0]/l, v[1]/l, v[2]/l]; };
const transpose3 = m => [m[0],m[3],m[6], m[1],m[4],m[7], m[2],m[5],m[8]];
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/** Atmosphere actually rendered: Erid is murky ammonia-amber and thick, Adrian is thick and slightly green. */
function effAtmo(pl) {
  const at = pl.atmo || { color: [.5, .7, 1], density: 0 };
  let col = at.color || [.5, .7, 1], den = clamp(at.density || 0, 0, 1);
  const mx = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  if (pl.special === 'erid') { den = Math.max(den, .95); col = mx(col, [.74, .54, .27], .65); }
  else if (pl.special === 'adrian') { den = Math.max(den, .82); col = mx(col, [.5, .86, .5], .5); }
  return { color: col, density: den };
}
const planetPos = (pl, timeSec) => {
  const R = orbitRadius(pl.orbit);
  const ang = (pl.phase || 0) + 2 * Math.PI * timeSec * (365 / (pl.periodDays || 365)) / 60;
  return [R * Math.cos(ang), 0, R * Math.sin(ang)];
};
/** The planet Astrophage breeds at: Adrian if present, else the first rocky/desert/ocean planet with an atmosphere. */
export function petrovaTarget(planets) {
  if (!planets || !planets.length) return null;
  return planets.find(p => p.special === 'adrian')
    || planets.find(p => (p.type === 'desert' || p.type === 'rocky') && (p.atmo?.density || 0) > .1)
    || planets.find(p => p.type === 'ocean' && (p.atmo?.density || 0) > .1) || null;
}
const MOON_PAL = [[.2,.19,.18],[.38,.36,.33],[.52,.5,.46],[.68,.66,.62],[.85,.83,.8]];
const moonCache = new Map();
function moonsFor(pl) {
  const key = (pl.id || '') + ':' + pl.seed;
  let m = moonCache.get(key); if (m) return m;
  const r = rng(((pl.seed | 0) || 1) ^ 0x5bd1e995);
  let n = 0;
  if (pl.special === 'earth') n = 1; else if (pl.type === 'gas') n = 1 + Math.floor(r() * 3);
  else if (pl.type === 'ice') n = r() < .6 ? 1 : 0; else if (pl.special) n = 1; else n = r() < .3 ? 1 : 0;
  m = []; let orb = pl.rings ? pl.rings.outer * 1.12 : 1.9;
  for (let i = 0; i < n; i++) {
    orb += .5 + .5 * r();
    const ice = r() < .3;
    m.push({ orb, rad: .13 + .1 * r(), period: 12 + r() * 28, phase: r() * 6.28, incl: (r() - .5) * .6,
      pl: { id: key + 'm' + i, seed: (((pl.seed | 0) * 31 + i * 977 + 7) | 0) || 3, type: ice ? 'ice' : 'rocky', radius: .3,
        atmo: { color: [.5, .5, .5], density: 0 }, palette: ice ? null : MOON_PAL, rings: null, phase: 0 } });
  }
  moonCache.set(key, m); return m;
}

// ---- surface activity config (seeded): kind 1 volcanoes (lava + some rocky), 2 cryo-geysers (ice), 3 dust devils (desert) ----
const volcCache = new Map();
function volcCfg(pl) {
  const key = (pl.id || '') + ':' + pl.seed + ':' + pl.type;
  if (volcCache.has(key)) return volcCache.get(key);
  let kind = 0, n = 0;
  const big = (pl.radius || 1) > .35;
  if (pl.type === 'lava') { kind = 1; n = 5; }
  else if (pl.type === 'rocky' && !pl.special && big && rng((pl.seed | 0) ^ 0x77aa)() < .3) { kind = 1; n = 3; }
  else if (pl.type === 'ice' && big) { kind = 2; n = 3; }
  else if (pl.type === 'desert' && big) { kind = 3; n = 4; }
  let cfg = null;
  if (kind) {
    const r = rng(((pl.seed | 0) || 1) ^ 0x51ed);
    const vents = new Float32Array(15), p = new Float32Array(10), vs = [];
    const crackV = kind === 2 ? crackVents(pl, n) : [];
    for (let i = 0; i < n; i++) {
      let v = null;
      for (let tr = 0; tr < 10; tr++) {
        const y = (r() * 1.6 - .8), a = r() * 6.2832, c = Math.sqrt(1 - y * y);
        v = [c * Math.cos(a), y, c * Math.sin(a)];
        if (vs.every(o => v[0]*o[0] + v[1]*o[1] + v[2]*o[2] < .88)) break;
      }
      if (kind === 2 && crackV[i]) v = crackV[i];
      vs.push(v); vents.set(v, i * 3);
      const P = kind === 1 ? 22 + r() * 12 : kind === 2 ? 14 + r() * 8 : 18 + r() * 8;
      p[i * 2] = P; p[i * 2 + 1] = r() * P;
    }
    cfg = { kind, n, vents, p, wind: norm([r() - .5, r() - .5, r() - .5]) };
  }
  volcCache.set(key, cfg); return cfg;
}

// ---- JS mirror of the shader noise, used to place ice geysers exactly on the crack network (surfIce c1 field) ----
const fr1 = x => x - Math.floor(x);
function hash13(x, y, z) {
  x = fr1(x * .1031); y = fr1(y * .1031); z = fr1(z * .1031);
  const d = x * (z + 31.32) + y * (y + 31.32) + z * (x + 31.32);
  x += d; y += d; z += d;
  return fr1((x + y) * z);
}
function vn3(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  let fx = x - ix, fy = y - iy, fz = z - iz;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
  const h = (a, b, c) => hash13(ix + a, iy + b, iz + c), m = (a, b, t) => a + (b - a) * t;
  return m(m(m(h(0,0,0), h(1,0,0), fx), m(h(0,1,0), h(1,1,0), fx), fy), m(m(h(0,0,1), h(1,0,1), fx), m(h(0,1,1), h(1,1,1), fx), fy), fz);
}
function fbm3(x, y, z, o) {
  let a = .5, s = 0;
  for (let i = 0; i < o; i++) {
    s += a * vn3(x, y, z);
    const nx = 0 * x + .8 * y + .6 * z, ny = -.8 * x + .36 * y - .48 * z, nz = -.6 * x - .48 * y + .64 * z;   // NM * p (column-major)
    x = nx * 2.03 + 17; y = ny * 2.03 + 17; z = nz * 2.03 + 17; a *= .5;
  }
  return s / (1 - Math.pow(.5, o));
}
/** surfIce crack distance field (0 on a crack centre line) at unit direction q for the planet offset off. */
function iceCrack(q, off) {
  const px = q[0] * 3 + off[0], py = q[1] * 3 + off[1], pz = q[2] * 3 + off[2];
  const wx = vn3(px * 2, py * 2, pz * 2) - .5, wy = vn3(px * 2 + 5, py * 2 + 5, pz * 2 + 5) - .5, wz = vn3(px * 2 + 9, py * 2 + 9, pz * 2 + 9) - .5;
  return Math.abs(fbm3(px + wx * 1.4, py + wy * 1.4, pz + wz * 1.4, 3) * 2 - 1);
}
/** Seeded points on the crack network: `n` well-separated candidates, hill-climbed onto c1 ~ 0. */
function crackVents(pl, n) {
  const r0 = rng(pl.seed | 0 || 1), off = [r0() * 60, r0() * 60, r0() * 60], r = rng(((pl.seed | 0) || 1) ^ 0x3c6ef3);
  const pts = [];
  const rnd = () => { const y = r() * 1.5 - .75, a = r() * 6.2832, c = Math.sqrt(1 - y * y); return [c * Math.cos(a), y, c * Math.sin(a)]; };
  for (let tries = 0; pts.length < n && tries < 40; tries++) {
    let best = rnd(), bc = iceCrack(best, off);
    for (let i = 0; i < 160; i++) { const c = rnd(), d = iceCrack(c, off); if (d < bc) { best = c; bc = d; } }
    for (let st = .05, k = 0; k < 90; k++) {
      const c = norm([best[0] + (r() - .5) * st, best[1] + (r() - .5) * st, best[2] + (r() - .5) * st]), d = iceCrack(c, off);
      if (d < bc) { best = c; bc = d; } if (k % 30 == 29) st *= .4;
    }
    if (bc < .012 && Math.abs(best[1]) < .8 && pts.every(o => best[0]*o[0] + best[1]*o[1] + best[2]*o[2] < .9)) pts.push(best);
  }
  return pts;
}

function hashStr(s) { let h = 2166136261; s = String(s); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed) { let a = (seed >>> 0) || 1; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** View rotation (world->view) for an orbit camera looking at the origin. */
function viewRot(yaw, pitch) {
  const cp = Math.cos(pitch);
  const eyeDir = [cp * Math.sin(yaw), Math.sin(pitch), cp * Math.cos(yaw)];
  const f = [-eyeDir[0], -eyeDir[1], -eyeDir[2]];
  const r = norm(cross(f, [0, 1, 0]));
  const u = cross(r, f);
  return { R: [r[0],u[0],-f[0], r[1],u[1],-f[1], r[2],u[2],-f[2]], eyeDir };
}

// ---- layout helpers (exported for UI use) ----
/** Seeded surface-activity vents of a planet ({kind,n,vents,p}) or null. */
export const surfaceVents = volcCfg;
function camFor(pl, t, v) {
  const r = rng((pl.seed | 0 || 1) ^ 0x9e3779b9);
  const tilt = (pl.rings ? 0.35 + 0.25 * r() : 0.08 + 0.4 * r()) * (r() < 0.5 ? -1 : 1);
  const spin = t * 0.15 + r() * 6.28;
  const w = mulv(mul3(rotZ(tilt), rotY(spin)), v);
  return { yaw: Math.atan2(w[0], w[2]), pitch: Math.asin(clamp(w[1], -1, 1)) };
}
/** Camera {yaw,pitch} that faces vent i of the planet at time t (for tests/UI). */
export function ventCamera(pl, t, i = 0) {
  const c = volcCfg(pl); if (!c) return null;
  return camFor(pl, t, [c.vents[i*3], c.vents[i*3+1], c.vents[i*3+2]]);
}
/** Camera facing ocean cyclone j (0|1) of an ocean planet at time t. */
export function cycloneCamera(pl, t, j = 0) {
  const r = rng(pl.seed | 0 || 1), ox = r() * 60, oy = r() * 60;
  const fr = x => x - Math.floor(x);
  const y = (.32 + .26 * fr(ox * .37 + j * .41)) * (j === 0 ? 1 : -1), lo = 6.28318 * fr(oy * .29 + j * .53), c = Math.sqrt(1 - y * y);
  return camFor(pl, t, [c * Math.cos(lo), y, c * Math.sin(lo)]);
}
/** Orbit radius (planet radii) of the Hail Mary around a planet in the close-up; clears rings and atmosphere. */
export const shipOrbitRadius = pl => Math.max(1.5, pl && pl.rings ? pl.rings.outer * 1.14 : 0);
/** World radius (planet radii) the probe head reaches at sampling depth 0..1, for a ship at orbit radius R. */
export const probeRadius = (R, depth) => 1.02 + (R - 1.02) * Math.pow(1 - clamp(depth, 0, 1), 1.5);
export const orbitRadius = au => 2.6 + 3.0 * Math.sqrt(Math.max(au, 0));
export const starDisplayRadius = star => clamp(1.4 * Math.sqrt(star.radius || 1), 0.8, 2.6);
export const planetDisplayRadius = p => clamp(0.32 + 0.16 * Math.sqrt(p.radius || 1), 0.32, 1.1);
/** Camera distance (world units) that frames the whole system. */
export function fitDist(star) {
  let m = 6;
  for (const p of star.planets || []) m = Math.max(m, orbitRadius(p.orbit) + 1);
  return m * 2.6;
}

function compile(gl, type, src, label) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
    throw new Error(`Shader ${label} failed: ${gl.getShaderInfoLog(s)}`);
  return s;
}
function program(gl, vs, fs, label) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs, label + '.vs'));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs, label + '.fs'));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`Link ${label}: ${gl.getProgramInfoLog(p)}`);
  const locs = {};
  const loc = n => (n in locs) ? locs[n] : (locs[n] = gl.getUniformLocation(p, n));
  return { p, loc };
}

export function createRenderer(canvas) {
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'high-performance' });
  if (!gl) throw new Error('WebGL2 is not available');

  const bg = program(gl, BG_VS, BG_FS, 'bg');
  const body = program(gl, QUAD_VS, BODY_FS, 'body');
  const orbit = program(gl, ORBIT_VS, ORBIT_FS, 'orbit');
  const rib = program(gl, RIB_VS, RIB_FS, 'ribbon');
  const part = program(gl, PART_VS, PART_FS, 'part');
  const tri = program(gl, TRI_VS, TRI_FS, 'tri');
  const TRI_MAX = 24000, TF = 9;
  const triBuf = gl.createBuffer(), triVao = gl.createVertexArray(), triData = new Float32Array(TRI_MAX * TF);
  let triN = 0;
  gl.bindVertexArray(triVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, triBuf);
  gl.bufferData(gl.ARRAY_BUFFER, triData.byteLength, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, TF * 4, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, TF * 4, 8);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, TF * 4, 20);
  gl.bindVertexArray(null);
  const emptyVao = gl.createVertexArray();
  const maxPt = Math.min(((gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE) || [1, 64])[1]) || 64, 512);
  const RIBN = 48;
  const ribVao = gl.createVertexArray();
  const ribBuf = gl.createBuffer();
  gl.bindVertexArray(ribVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, ribBuf);
  gl.bufferData(gl.ARRAY_BUFFER, RIBN * 2 * 4 * 4, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);
  gl.bindVertexArray(null);

  const quadVao = gl.createVertexArray();
  const quadBuf = gl.createBuffer();
  gl.bindVertexArray(quadVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const SEG = 192;
  const circ = new Float32Array((SEG + 1) * 2);
  for (let i = 0; i <= SEG; i++) { const a = i / SEG * Math.PI * 2; circ[i*2] = Math.cos(a); circ[i*2+1] = Math.sin(a); }
  const orbVao = gl.createVertexArray();
  const orbBuf = gl.createBuffer();
  gl.bindVertexArray(orbVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, orbBuf);
  gl.bufferData(gl.ARRAY_BUFFER, circ, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  let W = 1, H = 1, dpr = 1;
  let screen = [];   // {id, x, y, r, depth} CSS px
  let shipScr = null; // CSS px position of the Hail Mary in the last renderSystem frame
  let blipScr = null; // CSS px position of the Blip-A in the last renderSystem / renderPlanet frame

  // Backing-store resolution: devicePixelRatio capped at MAX_DPR (1.5: 2x costs 78% more pixels for little visible gain on ray-marched
  // planets), times an adaptive scale (setScale) that main.js lowers when frames run long. `dpr` below is the effective device-px per CSS px.
  const MAX_DPR = 1.5;
  let scale = 1, sizeDirty = true, sizeAt = 0, devDpr = 0;
  const effDpr = () => Math.min(window.devicePixelRatio || 1, MAX_DPR) * scale;
  function resize() {
    dpr = effDpr(); devDpr = window.devicePixelRatio || 1;
    const cw = canvas.clientWidth || canvas.width / dpr || 300;
    const ch = canvas.clientHeight || canvas.height / dpr || 150;
    const w = Math.max(1, Math.round(cw * dpr)), h = Math.max(1, Math.round(ch * dpr));
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    W = w; H = h; sizeDirty = false; sizeAt = performance.now();
    gl.viewport(0, 0, W, H);
  }
  // clientWidth is a layout read: only re-check it when asked (resize event / scale change) or twice a second, not every frame.
  function ensureSize() {
    const n = performance.now();
    if (!sizeDirty && n - sizeAt < 500) return;
    sizeAt = n;
    const d = effDpr();
    const w = Math.max(1, Math.round((canvas.clientWidth || W / d) * d));
    const h = Math.max(1, Math.round((canvas.clientHeight || H / d) * d));
    if (sizeDirty || w !== W || h !== H || d !== dpr) resize();
  }
  function setScale(v) { v = Math.max(0.5, Math.min(1, v)); if (v !== scale) { scale = v; sizeDirty = true; } }

  function drawBackground(Rv, time, seedStr) {
    const r = rng(hashStr(seedStr));
    gl.disable(gl.BLEND);
    gl.useProgram(bg.p);
    gl.bindVertexArray(quadVao);
    gl.uniformMatrix3fv(bg.loc('uViewToWorld'), false, new Float32Array(transpose3(Rv)));
    gl.uniform1f(bg.loc('uAspect'), W / H);
    gl.uniform1f(bg.loc('uTanH'), TAN_H);
    gl.uniform1f(bg.loc('uTime'), time);
    gl.uniform3f(bg.loc('uSeed'), r() * 20, r() * 20, r() * 20);
    gl.uniform3f(bg.loc('uTint'), r(), r(), r());
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  }

  function drawOrbit(Rv, eye, R, alpha, color) {
    gl.useProgram(orbit.p);
    gl.bindVertexArray(orbVao);
    gl.uniformMatrix3fv(orbit.loc('uRv'), false, new Float32Array(Rv));
    gl.uniform3f(orbit.loc('uEye'), eye[0], eye[1], eye[2]);
    gl.uniform1f(orbit.loc('uR'), R);
    gl.uniform1f(orbit.loc('uTanH'), TAN_H);
    gl.uniform1f(orbit.loc('uAspect'), W / H);
    gl.uniform4f(orbit.loc('uColor'), color[0], color[1], color[2], alpha);
    gl.drawArrays(gl.LINE_STRIP, 0, SEG + 1);
  }

  /** Project a view-space point to device px; returns null if behind camera. */
  function project(v, worldR) {
    const depth = -v[2];
    if (depth < 0.1) return null;
    const k = (H / 2) / (depth * TAN_H);
    return { x: W / 2 + v[0] * k, y: H / 2 - v[1] * k, px: worldR * k, depth };
  }

  function bodyCommon(b, time) {
    const u = body.loc;
    gl.useProgram(body.p);
    gl.bindVertexArray(quadVao);
    const halfPx = b.halfPx;
    gl.uniform2f(u('uCenter'), b.x / W * 2 - 1, 1 - b.y / H * 2);
    gl.uniform2f(u('uHalfNdc'), halfPx / W * 2, halfPx / H * 2);
    gl.uniform1f(u('uHalfPx'), halfPx);
    gl.uniform1f(u('uUnit'), b.unit);
    gl.uniform1f(u('uTime'), time);
    gl.uniform1i(u('uMode'), b.mode);
    gl.uniform1f(u('uQuad'), b.quad || 1);
  }

  function drawPlanetBody(b, time) {
    const pl = b.planet, u = body.loc;
    bodyCommon(b, time);
    const r = rng(pl.seed | 0 || 1);
    gl.uniform3f(u('uOff'), r() * 60, r() * 60, r() * 60);
    const type = TYPES[pl.type] ?? 0;
    gl.uniform1i(u('uType'), type);
    gl.uniform1f(u('uCamD'), b.camD || 1000);
    gl.uniform1f(u('uDbg'), (typeof location !== 'undefined' && /[?&]flash=1/.test(location.search)) ? 1 : 0);   // debug: hold every lightning site on
    gl.uniform1i(u('uSpecial'), SPECIALS[pl.special] || 0);
    gl.uniformMatrix3fv(u('uRot'), false, new Float32Array(b.rot));
    gl.uniform3fv(u('uL'), b.L);
    gl.uniform3fv(u('uLightCol'), b.lightCol);
    let pal = (pl.palette && pl.palette.length >= 3) ? pl.palette.slice(0, 5) : DEFAULT_PAL[pl.type] || DEFAULT_PAL.rocky;
    const n = pal.length;
    const flat = new Float32Array(15);
    for (let i = 0; i < 5; i++) { const c = pal[Math.min(i, n - 1)]; flat.set(c, i * 3); }
    gl.uniform3fv(u('uPal[0]'), flat);
    gl.uniform1i(u('uNPal'), Math.max(2, Math.min(5, n)));
    const at = effAtmo(pl);
    gl.uniform1f(u('uInfect'), clamp(b.infect || 0, 0, 1));
    const vc0 = (typeof location !== 'undefined' && /novolc/.test(location.search)) ? null : volcCfg(pl);
    const vc = vc0 && b.unit >= (vc0.kind === 1 ? 14 : 26) ? vc0 : null;   // gate surface activity by on-screen size
    if (vc && true) {
      gl.uniform1i(u('uVolcN'), vc.n); gl.uniform1i(u('uVolcKind'), vc.kind);
      gl.uniform3fv(u('uVent[0]'), vc.vents); gl.uniform2fv(u('uVentP[0]'), vc.p);
    } else gl.uniform1i(u('uVolcKind'), 0);
    const ov = b.ov;
    if (ov && ov.scan) { gl.uniform4f(u('uScan'), 1, ov.scan[0], ov.scan[1], ov.scan[2]); gl.uniform3fv(u('uScanSub'), ov.sub); gl.uniform3fv(u('uScanCol'), ov.col); }
    else gl.uniform4f(u('uScan'), 0, 0, 0, 0.1);
    if (ov && ov.mark) gl.uniform4f(u('uMark'), ov.mark[0], ov.mark[1], ov.mark[2], ov.mark[3]); else gl.uniform4f(u('uMark'), 0, 1, 0, 0);
    gl.uniform3fv(u('uAtmoCol'), at.color);
    gl.uniform1f(u('uAtmoDen'), at.density);
    const rg = pl.rings;
    if (rg) {
      gl.uniform4f(u('uRing'), rg.inner, rg.outer, rg.opacity ?? 0.8, 1);
      gl.uniform3fv(u('uRingCol'), rg.color || [.8, .7, .55]);
    } else gl.uniform4f(u('uRing'), 1, 2, 0, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    if (vc && true) drawParticles(b, vc, time);
  }

  /** Ejecta, ash plumes, geyser vapour and dust devils: analytic point sprites in planet-local space (<= 5 vents x 400 = 2000). */
  function drawParticles(b, vc, time) {
    const u = part.loc;
    gl.useProgram(part.p);
    gl.bindVertexArray(emptyVao);
    gl.uniform1f(u('uTime'), time); gl.uniform1f(u('uUnit'), b.unit); gl.uniform1f(u('uMaxPt'), maxPt);
    gl.uniform1f(u('uExag'), clamp(20 / b.unit, 1, 3));
    gl.uniform1i(u('uKind'), vc.kind);
    gl.uniform3fv(u('uVent[0]'), vc.vents); gl.uniform2fv(u('uVentP[0]'), vc.p);
    gl.uniform3fv(u('uWind'), vc.wind);
    gl.uniformMatrix3fv(u('uRot'), false, new Float32Array(b.rot));
    gl.uniform2f(u('uCenter'), b.x / W * 2 - 1, 1 - b.y / H * 2);
    gl.uniform2f(u('uScale'), 2 * b.unit / W, 2 * b.unit / H);
    gl.uniform3fv(u('uL'), b.L); gl.uniform3fv(u('uLightCol'), b.lightCol);
    gl.drawArrays(gl.POINTS, 0, vc.n * PART_PER);
  }

  function drawStarBody(b, time) {
    const u = body.loc;
    bodyCommon(b, time);
    const r = rng(hashStr(b.star.id || b.star.name || 'star'));
    gl.uniform3f(u('uOff'), r() * 60, r() * 60, r() * 60);
    gl.uniformMatrix3fv(u('uRot'), false, new Float32Array(b.rot));
    gl.uniform3fv(u('uStarCol'), b.star.color || [1, .9, .7]);
    gl.uniform1f(u('uInfect'), clamp(b.star.infection || 0, 0, 1));
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  function drawSelect(x, y, rpx, time) {
    const half = rpx + 20;
    bodyCommon({ x, y, halfPx: half, unit: rpx + 9, mode: 2 }, time);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  function lightColor(star) {
    const c = star.color || [1, .95, .85];
    const m = Math.max(c[0], c[1], c[2], .001);
    const inf = clamp(star.infection || 0, 0, 1);
    const k = (1 - 0.5 * inf) * 1.1;
    const n = c.map(v => Math.pow(v / m, 1.25));      // starlight keeps the star's colour
    return [n[0] * k, n[1] * k, n[2] * k];
  }

  function planetRot(pl, Rv, time) {
    const r = rng((pl.seed | 0 || 1) ^ 0x9e3779b9);
    const tilt = (pl.rings ? 0.35 + 0.25 * r() : 0.08 + 0.4 * r()) * (r() < 0.5 ? -1 : 1);
    const spin = time * 0.15 + r() * 6.28;
    return mul3(Rv, mul3(rotZ(tilt), rotY(spin)));
  }

  function planetQuad(pl) { return Math.max(1.35 + effAtmo(pl).density * .2, (pl.rings ? pl.rings.outer * 1.06 : 1) + effAtmo(pl).density * .25 + 0.05); }

  function setupFrame(camera, defDist, minD, maxD) {
    ensureSize();
    const yaw = camera?.yaw ?? 0.6;
    const pitch = clamp(camera?.pitch ?? 0.5, -1.45, 1.45);
    const dist = clamp((camera && camera.dist > 0) ? camera.dist : defDist, minD, maxD);
    const { R, eyeDir } = viewRot(yaw, pitch);
    return { Rv: R, eye: eyeDir.map(v => v * dist), eyeDir, dist };
  }

  function addMoons(list, pl, ppos, scale, Rv, eye, timeSec, lightCol, Lfn) {
    for (const mo of moonsFor(pl)) {
      const a = mo.phase + 2 * Math.PI * timeSec / mo.period;
      const rel = [Math.cos(a) * mo.orb * scale, Math.sin(a) * Math.sin(mo.incl) * mo.orb * scale, Math.sin(a) * mo.orb * scale];
      const mp = [ppos[0] + rel[0], ppos[1] + rel[1], ppos[2] + rel[2]];
      const v = mulv(Rv, [mp[0] - eye[0], mp[1] - eye[1], mp[2] - eye[2]]);
      const pr = project(v, mo.rad * scale);
      if (!pr) continue;
      list.push({ kind: 'planet', planet: mo.pl, depth: pr.depth, x: pr.x, y: pr.y, unit: Math.max(pr.px, 2.5), mode: 0,
        quad: 1.35, rot: planetRot(mo.pl, Rv, timeSec), L: Lfn(mp), lightCol });
    }
  }

  function drawFlare(x, y, rpx, star, str) {
    if (str < .01) return;
    const u = body.loc, c = star.color || [1, .95, .85], m = Math.max(c[0], c[1], c[2], .001);
    gl.useProgram(body.p); gl.bindVertexArray(quadVao);
    gl.uniform2f(u('uCenter'), 0, 0); gl.uniform2f(u('uHalfNdc'), 1, 1); gl.uniform1f(u('uHalfPx'), 1);
    gl.uniform1f(u('uUnit'), 1); gl.uniform1f(u('uTime'), 0); gl.uniform1i(u('uMode'), 3); gl.uniform1f(u('uQuad'), 1);
    gl.uniform2f(u('uFlarePos'), x, H - y); gl.uniform2f(u('uRes'), W, H);
    gl.uniform3f(u('uFlareCol'), c[0] / m, c[1] / m, c[2] / m);
    gl.uniform1f(u('uFlareR'), rpx); gl.uniform1f(u('uFlareStr'), str);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /** Petrova line: a soft red ribbon from the star's surface to the Astrophage-breeding planet. boost > 0 brightens it (harvesting). */
  function drawPetrova(star, planets, Rv, eye, timeSec, sr, boost = 0) {
    const inf = clamp(star.infection || 0, 0, 1);
    if (inf < .03) return;
    const tgt = petrovaTarget(planets); if (!tgt) return;
    const pos = planetPos(tgt, timeSec), len = Math.hypot(pos[0], pos[1], pos[2]) || 1;
    const dir = pos.map(v => v / len), pr = planetDisplayRadius(tgt);
    const P0 = dir.map(v => v * sr * .9), P2 = pos.map((v, i) => v - dir[i] * pr * 1.15);
    const C = [(P0[0] + P2[0]) / 2, (P0[1] + P2[1]) / 2 + len * .22, (P0[2] + P2[2]) / 2];
    ribbon(P0, C, P2, Rv, eye, timeSec, star, boost);
  }
  function ribbon(P0, C, P2, Rv, eye, timeSec, star, boost, minW = 2.5) {
    const inf = clamp(star.infection || 0, 0, 1);
    const pts = [];
    for (let i = 0; i < RIBN; i++) {
      const u = i / (RIBN - 1), a = 1 - u;
      const w = [0, 1, 2].map(k => a * a * P0[k] + 2 * a * u * C[k] + u * u * P2[k]);
      const v = mulv(Rv, [w[0] - eye[0], w[1] - eye[1], w[2] - eye[2]]);
      const p = project(v, 1);
      if (!p) return;
      pts.push({ u, x: p.x, y: p.y, k: p.px });
    }
    const data = new Float32Array(RIBN * 2 * 4);
    for (let i = 0; i < RIBN; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(RIBN - 1, i + 1)], p = pts[i];
      let tx = b.x - a.x, ty = b.y - a.y; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
      const hw = Math.max(minW, p.k * .34 * (.4 + .6 * Math.sin(Math.PI * p.u))) * (1 + .6 * boost);
      for (let s = 0; s < 2; s++) {
        const sg = s ? 1 : -1, o = (i * 2 + s) * 4;
        const px = p.x - ty * hw * sg, py = p.y + tx * hw * sg;
        data[o] = px / W * 2 - 1; data[o + 1] = 1 - py / H * 2; data[o + 2] = p.u; data[o + 3] = sg;
      }
    }
    gl.useProgram(rib.p);
    gl.bindVertexArray(ribVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, ribBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);
    const strength = ((smooth(.03, .5, inf) * .7 + inf * .5) * (.9 + .1 * Math.sin(timeSec * 1.7))) * (1 + 2.2 * boost);
    gl.uniform1f(rib.loc('uTime'), timeSec); gl.uniform1f(rib.loc('uInf'), strength);
    gl.uniform1f(rib.loc('uLen'), Math.hypot(P2[0] - P0[0], P2[1] - P0[1], P2[2] - P0[2]) * 1.4);
    gl.uniform1f(rib.loc('uSeed'), (hashStr(star.id || 'x') % 1000) / 10);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, RIBN * 2);
  }

  // ---- Hail Mary: screen-space triangle batches (mesh, trails, tether, glows), see TRI_FS ----
  let VW = { Rv: null, eye: [0, 0, 0] };            // current world->view transform for the helpers below
  const toScr = (w) => {
    const v = mulv(VW.Rv, [w[0] - VW.eye[0], w[1] - VW.eye[1], w[2] - VW.eye[2]]);
    const p = project(v, 0);
    return p ? { x: p.x, y: p.y, d: p.depth, k: (H / 2) / (p.depth * TAN_H) } : null;
  };
  function tv(x, y, u, v, k, c, a, add) {
    if (triN >= TRI_MAX) return;
    const o = triN++ * TF;
    triData[o] = x / W * 2 - 1; triData[o + 1] = 1 - y / H * 2; triData[o + 2] = u; triData[o + 3] = v; triData[o + 4] = k;
    triData[o + 5] = c[0] * a; triData[o + 6] = c[1] * a; triData[o + 7] = c[2] * a; triData[o + 8] = add ? 0 : a;
  }
  function lineSeg(x0, y0, x1, y1, w, c, a0, a1, add = true) {
    const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1, nx = -dy / l * w / 2, ny = dx / l * w / 2;
    tv(x0 + nx, y0 + ny, 0, 1, 2, c, a0, add); tv(x0 - nx, y0 - ny, 0, -1, 2, c, a0, add); tv(x1 + nx, y1 + ny, 0, 1, 2, c, a1, add);
    tv(x0 - nx, y0 - ny, 0, -1, 2, c, a0, add); tv(x1 - nx, y1 - ny, 0, -1, 2, c, a1, add); tv(x1 + nx, y1 + ny, 0, 1, 2, c, a1, add);
  }
  function glowSpr(x, y, r, c, a, add = true) {
    tv(x - r, y - r, -1, -1, 1, c, a, add); tv(x + r, y - r, 1, -1, 1, c, a, add); tv(x - r, y + r, -1, 1, 1, c, a, add);
    tv(x + r, y - r, 1, -1, 1, c, a, add); tv(x + r, y + r, 1, 1, 1, c, a, add); tv(x - r, y + r, -1, 1, 1, c, a, add);
  }
  function flushTri() {
    if (!triN) return;
    gl.useProgram(tri.p); gl.bindVertexArray(triVao); gl.bindBuffer(gl.ARRAY_BUFFER, triBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, triData, 0, triN * TF);
    gl.drawArrays(gl.TRIANGLES, 0, triN); triN = 0;
  }
  const aces3 = (c) => c.map(x => { x = Math.max(0, x); return Math.pow(clamp((x * (2.51 * x + .03)) / (x * (2.43 * x + .59) + .14), 0, 1), 1 / 2.2); });
  const addv = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
  const dotv = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

  /** Polyline of world points -> soft lines. fn(i) gives {w:[x,y,z], a}. Segments whose midpoint passes `keep(depth)` only. */
  function polyline(pts, widthPx, col, keep) {
    let prev = null;
    for (const q of pts) {
      const s = toScr(q.w);
      if (prev && s && (!keep || keep((s.d + prev.d) / 2))) lineSeg(prev.x, prev.y, s.x, s.y, widthPx, col, prev.a, q.a);
      prev = s ? { x: s.x, y: s.y, d: s.d, a: q.a } : null;
    }
  }

  /** Small glowing chevron + halo that marks the ship when it is tiny on screen (or always, as a locator, via c.marker). */
  function shipIcon(ps, c, Lpx, a) {
    const Ri = 11 * dpr, s2 = toScr([c.pos[0] + c.fwd[0] * c.scale, c.pos[1] + c.fwd[1] * c.scale, c.pos[2] + c.fwd[2] * c.scale]);
    let dx = s2 ? s2.x - ps.x : 1, dy = s2 ? s2.y - ps.y : 0; const dl = Math.hypot(dx, dy); if (dl < 1e-3) { dx = 1; dy = 0; } else { dx /= dl; dy /= dl; }
    const px = -dy, py = dx, col = [1, 0.82, 0.42];
    glowSpr(ps.x, ps.y, Ri * 2.8, [1, 0.7, 0.3], 0.3 * a);
    const tip = [ps.x + dx * Ri * 1.5, ps.y + dy * Ri * 1.5], l = [ps.x - dx * Ri * 0.9 + px * Ri * 0.95, ps.y - dy * Ri * 0.9 + py * Ri * 0.95],
      r = [ps.x - dx * Ri * 0.9 - px * Ri * 0.95, ps.y - dy * Ri * 0.9 - py * Ri * 0.95], n = [ps.x - dx * Ri * 0.35, ps.y - dy * Ri * 0.35];
    const w = 2.4 * dpr;
    lineSeg(tip[0], tip[1], l[0], l[1], w, col, a, a); lineSeg(l[0], l[1], n[0], n[1], w, col, a, a);
    lineSeg(n[0], n[1], r[0], r[1], w, col, a, a); lineSeg(r[0], r[1], tip[0], tip[1], w, col, a, a);
    const pulse = 0.55 + 0.45 * Math.sin(c.time * 3.2), ring = [];
    for (let i = 0; i <= 28; i++) { const q = i / 28 * TAU2; ring.push([ps.x + Math.cos(q) * Ri * 2.0, ps.y + Math.sin(q) * Ri * 2.0]); }
    for (let i = 0; i < 28; i++) lineSeg(ring[i][0], ring[i][1], ring[i + 1][0], ring[i + 1][1], 1.4 * dpr, [0.6, 0.85, 1], 0.5 * a * pulse, 0.5 * a * pulse);
  }

  /** Engine plume: layered additive flame from each bell, shock diamonds, a long soft halo. Always at least ~46 px long so it reads from afar. */
  function shipPlume(c, at, k, Lpx) {
    const pxU = Math.max(k, 1e-3), flick = 0.88 + 0.12 * Math.sin(c.time * 41) * Math.sin(c.time * 17 + 1);
    const Lw = Math.max(1.3, (46 * dpr) / pxU) * flick;                    // model units
    const full = Lpx >= 40 * dpr, noz = full ? NOZZLES : [NOZZLES[0]];
    for (const nz of noz) {
      const main = nz === NOZZLES[0], len = Lw * (main ? 1 : 0.5), so = toScr(at(nz)); if (!so) continue;
      const N = 8; let prev = so;
      for (let i = 1; i <= N; i++) {
        const u = i / N, wob = Math.sin(c.time * 31 + u * 9 + nz[0] * 40) * 0.012 * u;
        const q = toScr(at([nz[0] + wob, nz[1] + wob * 0.6, nz[2] - len * u])); if (!q) break;
        const w = Math.max(2.2 * dpr, pxU * (main ? 0.17 : 0.075) * (1 - u * 0.8)), a0 = Math.pow(1 - (i - 1) / N, 1.25), a1 = Math.pow(1 - i / N, 1.25);
        lineSeg(prev.x, prev.y, q.x, q.y, w * 2.6, [1, 0.3, 0.07], 0.5 * a0, 0.5 * a1);
        lineSeg(prev.x, prev.y, q.x, q.y, w * 1.5, [1, 0.58, 0.2], 0.8 * a0, 0.8 * a1);
        lineSeg(prev.x, prev.y, q.x, q.y, w * 0.65, [1, 0.93, 0.72], a0, a1);
        if (main && (i === 2 || i === 4)) glowSpr(q.x, q.y, Math.max(3 * dpr, pxU * 0.055 * (1 - u * 0.5)), [1, 0.95, 0.8], 0.85 * flick);   // shock diamonds
        prev = q;
      }
      glowSpr(so.x, so.y, Math.max(7 * dpr, pxU * (main ? 0.3 : 0.14)), [1, 0.55, 0.2], 0.9 * flick);
      glowSpr(so.x, so.y, Math.max(4 * dpr, pxU * (main ? 0.15 : 0.07)), [1, 0.95, 0.75], flick);
    }
    const hq = toScr(at([0, 0, STERN_Z - Lw * 0.35]));
    if (hq) glowSpr(hq.x, hq.y, Math.max(14 * dpr, pxU * Lw * 0.42), [1, 0.4, 0.12], 0.28 * flick);
  }

  /** Generic lit mesh renderer for the screen-space triangle batch. c: {pos,fwd,up,scale,L,lightCol,time,shadow,bounce,burning}.
   *  opts: {mesh:{hi,lo}, len, spin, burnable, alpha, detailPx, minPx}. Returns {k,W3,at,Lpx,ps} for extra effects. */
  function drawMesh(c, opts = {}) {
    const mesh = opts.mesh, len = opts.len ?? SHIP_LEN, alpha = opts.alpha ?? 1;
    const z = norm(c.fwd); let x = cross(norm(c.up), z); if (Math.hypot(...x) < 1e-4) x = [1, 0, 0]; x = norm(x);
    const y = cross(z, x), sc = c.scale;
    const ang = opts.spin ? c.time * 0.9 : 0, ca = Math.cos(ang), sa = Math.sin(ang);
    const W3 = (m) => [x[0] * m[0] + y[0] * m[1] + z[0] * m[2], x[1] * m[0] + y[1] * m[1] + z[1] * m[2], x[2] * m[0] + y[2] * m[1] + z[2] * m[2]];
    const ps = toScr(c.pos), k = ps ? ps.k * sc : 0, Lpx = k * len;
    const at = (m) => { const w = W3(m); return [c.pos[0] + w[0] * sc, c.pos[1] + w[1] * sc, c.pos[2] + w[2] * sc]; };
    let sh = 1;
    if (c.shadow) {
      const rel = [c.pos[0] - c.shadow.c[0], c.pos[1] - c.shadow.c[1], c.pos[2] - c.shadow.c[2]], al = dotv(rel, c.L);
      if (al < 0) { const d = Math.hypot(rel[0] - c.L[0] * al, rel[1] - c.L[1] * al, rel[2] - c.L[2] * al); sh = smooth(c.shadow.R * 0.97, c.shadow.R * 1.05, d); }
    }
    c.lit = sh;
    const out = [];
    const rotM = (m) => [m[0] * ca - m[1] * sa, m[0] * sa + m[1] * ca, m[2]];
    const tris = Lpx >= (opts.detailPx ?? 56 * dpr) ? mesh.hi : mesh.lo;  // gate detail by on-screen size
    if (Lpx >= (opts.minPx ?? 5)) for (const t of tris) {
      let A = t.a, B = t.b, C = t.c, N = t.n;
      if (t.grp === 1) { A = rotM(A); B = rotM(B); C = rotM(C); N = rotM(N); }
      const wa = W3(A), wb = W3(B), wc = W3(C), nw = W3(N);
      const pa = [c.pos[0] + wa[0] * sc, c.pos[1] + wa[1] * sc, c.pos[2] + wa[2] * sc];
      const pb = [c.pos[0] + wb[0] * sc, c.pos[1] + wb[1] * sc, c.pos[2] + wb[2] * sc];
      const pc = [c.pos[0] + wc[0] * sc, c.pos[1] + wc[1] * sc, c.pos[2] + wc[2] * sc];
      const mid = [(pa[0] + pb[0] + pc[0]) / 3, (pa[1] + pb[1] + pc[1]) / 3, (pa[2] + pb[2] + pc[2]) / 3];
      const ve = norm([VW.eye[0] - mid[0], VW.eye[1] - mid[1], VW.eye[2] - mid[2]]);
      const facing = dotv(nw, ve);
      if (facing <= 0) continue;
      const sa_ = toScr(pa), sb_ = toScr(pb), sc_ = toScr(pc);
      if (!sa_ || !sb_ || !sc_ || sa_.d < .08 || sb_.d < .08 || sc_.d < .08) continue;
      const diff = Math.max(0, dotv(nw, c.L)) * sh;
      const toPl = c.shadow ? norm([c.shadow.c[0] - mid[0], c.shadow.c[1] - mid[1], c.shadow.c[2] - mid[2]]) : [0, 0, 0];
      const pl = Math.max(0, dotv(nw, toPl)) * 0.14;
      const rim = Math.pow(1 - facing, 3) * 0.3 * (0.35 + 0.65 * Math.max(0, dotv(nw, c.L) + 0.35));
      // blinn-ish glint on the white/steel plating
      const hv = norm([c.L[0] + ve[0], c.L[1] + ve[1], c.L[2] + ve[2]]), spec = Math.pow(Math.max(0, dotv(nw, hv)), 24) * 0.35 * sh;
      let col = [0, 1, 2].map(i => t.col[i] * ((0.11 + 1.05 * diff) * c.lightCol[i] + pl * (c.bounce ? c.bounce[i] : 0.6)) + rim * [0.5, 0.7, 1][i] * (0.4 + 0.6 * sh) + spec * c.lightCol[i]);
      let em = t.emis;
      if (t.grp === 2 && opts.burnable) em = c.burning ? 1.6 : 0.05;
      if (em) col = col.map((v, i) => v + t.col[i] * em);
      out.push({ d: (sa_.d + sb_.d + sc_.d) / 3, p: [sa_, sb_, sc_], col: aces3(col) });
    }
    out.sort((a, b) => b.d - a.d);
    for (const o of out) for (const p of o.p) tv(p.x, p.y, 0, 0, 0, o.col, alpha, false);
    flushTri();
    return { k, W3, at, Lpx, ps };
  }

  /** The Hail Mary mesh, lit by a star at world direction L. c: { pos, fwd, up, scale, L, lightCol, time, burning, shadow:{c,R}|null, bounce, marker }. */
  function drawShipModel(c) {
    const sm = drawMesh(c, { mesh: { hi: SHIP_TRIS, lo: SHIP_TRIS_LO }, spin: true, burnable: true });
    const { k, W3, at, Lpx, ps } = sm;
    const ang = c.time * 0.9, ca = Math.cos(ang), sa = Math.sin(ang);
    const rotM = (m) => [m[0] * ca - m[1] * sa, m[0] * sa + m[1] * ca, m[2]];
    // nav lights, engine plume, strobe
    for (const key in NAV) {
      const n = NAV[key];
      if (n.strobe && (c.time % 1.7) > 0.13) continue;
      const q = toScr(at(n.rot ? rotM(n.p) : n.p));
      if (!q) continue;
      const hid = key === 'bow' ? 0.5 : 1;
      glowSpr(q.x, q.y, Math.max(3 * dpr, q.k * c.scale * (n.strobe ? 0.07 : 0.045)), n.col, hid * (n.strobe ? 1 : 0.85));
    }
    if (c.burning && ps) shipPlume(c, at, k, Lpx);
    if (ps) {
      if (Lpx < 30 * dpr) shipIcon(ps, c, Lpx, c.marker ? 1 : smooth(30 * dpr, 14 * dpr, Lpx));
      else if (c.marker) {                                              // thin locator ring around the ship in the system view
        const R0 = Math.max(Lpx * 0.62, 20 * dpr), pulse = 0.5 + 0.5 * Math.sin(c.time * 2.4); let pr = null;
        for (let i = 0; i <= 32; i++) { const q = i / 32 * TAU2, p = [ps.x + Math.cos(q) * R0, ps.y + Math.sin(q) * R0]; if (pr && (i & 1)) lineSeg(pr[0], pr[1], p[0], p[1], 1.4 * dpr, [1, 0.82, 0.45], 0.4 + 0.2 * pulse, 0.4 + 0.2 * pulse); pr = p; }
      }
    }
    flushTri();
    return sm;
  }

  const blipMesh = { hi: BLIP_TRIS, lo: BLIP_TRIS_LO };
  const tunnelMesh = { hi: TUNNEL_TRIS, lo: TUNNEL_TRIS_LO };

  /** Small amber locator ring + halo marking the Blip-A when it is far away (or away at a planet). */
  function blipLocator(ps, time, a = 1) {
    const R = 8 * dpr, pulse = 0.5 + 0.5 * Math.sin(time * 3.1), al = (0.35 + 0.22 * pulse) * a;
    glowSpr(ps.x, ps.y, R * 2.1, [1, 0.62, 0.18], 0.24 * a);
    let pr = null;
    for (let i = 0; i <= 20; i++) {
      const q = i / 20 * TAU2, p = [ps.x + Math.cos(q) * R, ps.y + Math.sin(q) * R];
      if (pr && (i & 1) === 0) lineSeg(pr[0], pr[1], p[0], p[1], 1.3 * dpr, [1, 0.72, 0.3], al, al);
      pr = p;
    }
  }

  /** Draw the Blip-A docked to the Hail Mary. `sm` is the transform returned by drawShipModel; `c` its render config. */
  function drawDockedBlip(sm, c) {
    const { at, W3 } = sm, sc = c.scale;
    const up = norm(W3(BLIP_DOCK.up));
    const tFrom = BLIP_DOCK.from, tTo = BLIP_DOCK.to;
    const tFwd = norm(W3([tTo[0] - tFrom[0], tTo[1] - tFrom[1], tTo[2] - tFrom[2]]));
    drawMesh({ pos: at(tFrom), fwd: tFwd, up, scale: sc, L: c.L, lightCol: c.lightCol, time: c.time, shadow: c.shadow, bounce: c.bounce },
      { mesh: tunnelMesh, len: BLIP_LEN, alpha: 0.55, detailPx: 0, minPx: 0 });   // translucent xenonite sleeve + ribs
    drawMesh({ pos: at(BLIP_DOCK.pos), fwd: norm(W3(BLIP_DOCK.fwd)), up, scale: sc, L: c.L, lightCol: c.lightCol, time: c.time, shadow: c.shadow, bounce: c.bounce },
      { mesh: blipMesh, len: BLIP_LEN });
    const q = toScr(at(BLIP_DOCK.pos));
    if (q) { blipScr = { x: q.x / dpr, y: q.y / dpr }; blipLocator(q, c.time, 0.5); }
    flushTri();
  }

  /** Thin chain from the ship down to the probe head. tt: {depth, tension, heat, broken}. */
  function drawTether(pos, up, T, R, tt, time, scale) {
    const radial = norm(pos), N = 28;
    const start = addv(pos, up, -0.055 * scale);
    const endR = probeRadius(R, tt.depth);
    const end = radial.map(v => v * endR);
    const sway = (0.012 + 0.06 * tt.tension) * (1 + Math.sin(time * 3.1) * 0.5), hot = clamp(tt.heat, 0, 1);
    const col = [0.75 + 0.25 * hot, 0.88 - 0.4 * hot, 1 - 0.8 * hot];
    const last = tt.broken ? Math.floor(N * 0.45) : N;
    const pts = [];
    for (let i = 0; i <= last; i++) {
      const u = i / N, bow = Math.sin(Math.PI * u) * sway * (0.5 + u);
      const wob = Math.sin(time * 2.4 + u * 7) * 0.006 * u;
      pts.push({ w: [start[0] + (end[0] - start[0]) * u - T[0] * bow + radial[0] * wob, start[1] + (end[1] - start[1]) * u - T[1] * bow + radial[1] * wob,
        start[2] + (end[2] - start[2]) * u - T[2] * bow + radial[2] * wob], a: tt.broken ? 0.6 * (1 - i / (last + 1)) : 0.9 });
    }
    polyline(pts, 2.3, tt.broken ? [1, 0.4, 0.3] : col);
    if (!tt.broken) {
      const e = toScr(pts[pts.length - 1].w);
      if (e) {
        glowSpr(e.x, e.y, Math.max(6, e.k * 0.05), hot > 0.3 ? [1, 0.45, 0.15] : [0.5, 0.9, 1], 0.9);
        glowSpr(e.x, e.y, Math.max(3, e.k * 0.02), [1, 1, 1], 1);
      }
    }
    flushTri();
  }

  /** Collector scoop: a glowing funnel from the cloud tops up to the ship's intake, with Astrophage motes streaming in (comet streaks that turn white-hot).
   *  pos: ship position, apex: intake point on the ship, c/pr: planet centre + radius in world units, prog 0..1. */
  function drawScoop(pos, apex, c, pr, prog, time, minMouth = 0) {
    const rel = [pos[0] - c[0], pos[1] - c[1], pos[2] - c[2]], rS = Math.hypot(rel[0], rel[1], rel[2]) || 1, radial = rel.map(v => v / rS);
    const ref = Math.abs(radial[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0], e1 = norm(cross(radial, ref)), e2 = cross(radial, e1);
    const str = 0.5 + 0.5 * prog, baseR = pr * 1.05 + (rS - pr * 1.05) * 0.18, mouth = Math.max(pr * 0.2, minMouth);
    const ringAt = (rad, rr, i, n) => { const a = i / n * TAU2; return [0, 1, 2].map(j => c[j] + radial[j] * rr + (e1[j] * Math.cos(a) + e2[j] * Math.sin(a)) * rad); };
    const NS = 28, A = toScr(apex);
    if (A) {
      for (let i = 0; i < NS; i++) {                                       // translucent glowing cone
        const p = toScr(ringAt(mouth, baseR, i, NS)), q = toScr(ringAt(mouth, baseR, i + 1, NS));
        if (!p || !q) continue;
        const sh = 0.06 + 0.05 * (0.5 + 0.5 * Math.sin(i * 1.3 - time * 3));
        tv(A.x, A.y, 0, 0, 0, [1, 0.4, 0.12], sh * str, true); tv(p.x, p.y, 0, 0, 0, [1, 0.35, 0.1], sh * 0.4 * str, true); tv(q.x, q.y, 0, 0, 0, [1, 0.35, 0.1], sh * 0.4 * str, true);
      }
    }
    for (const f of [0.35, 0.62, 1]) {                                     // rings climbing the funnel
      const rr = baseR + (rS - baseR) * (1 - f) * 0.9 - (1 - f) * 0.0, ring = [];
      for (let i = 0; i <= NS; i++) ring.push({ w: ringAt(mouth * f, baseR + (rS - 0.05 * pr - baseR) * (1 - f), i, NS), a: (0.25 + 0.55 * f) * str });
      polyline(ring, (1 + f) * 1.1 * dpr, [1, 0.5, 0.2]);
    }
    for (let i = 0; i < 12; i++) polyline([{ w: apex, a: 0.55 * str }, { w: ringAt(mouth, baseR, i, 12), a: 0.12 * str }], 1.2 * dpr, [1, 0.55, 0.25]);
    // motes lifted from the cloud tops into the intake
    const M = 150;
    for (let i = 0; i < M; i++) {
      const h1 = ((i * 2654435761) >>> 0) / 4294967296, h2 = (((i * 40503 + 7) >>> 0) & 0xffff) / 65535, ph = (time * (0.32 + 0.28 * h1) + h2 + i * 0.137) % 1;
      const a = h1 * TAU2 * 7 % TAU2, sp = mouth * (0.3 + 1.7 * h2);
      const from = [0, 1, 2].map(j => c[j] + radial[j] * (pr * 1.02) + (e1[j] * Math.cos(a) + e2[j] * Math.sin(a)) * sp);
      const pt = (u) => { const g = Math.pow(u, 1.5), wob = Math.sin(u * 10 + i) * 0.04 * pr * (1 - g); return [0, 1, 2].map(j => from[j] + (apex[j] - from[j]) * g + (e1[j] * Math.cos(a + 1.6) + e2[j] * Math.sin(a + 1.6)) * wob); };
      const q = toScr(pt(ph)), q0 = toScr(pt(Math.max(0, ph - 0.07)));
      if (!q) continue;
      const hot = Math.pow(ph, 1.4), col = [1, 0.28 + 0.6 * hot, 0.1 + 0.55 * hot], al = str * smooth(0, 0.06, ph) * (1 - smooth(0.93, 1, ph)) * (0.55 + 0.45 * hot);
      if (q0) lineSeg(q0.x, q0.y, q.x, q.y, Math.max(2.2 * dpr, q.k * 0.012 * pr * (0.6 + ph)), col, 0, al);
      glowSpr(q.x, q.y, Math.max(3 * dpr, q.k * 0.016 * pr * (0.6 + hot)), col, al);
    }
    if (A) { glowSpr(A.x, A.y, Math.max(9 * dpr, A.k * 0.05 * pr), [1, 0.6, 0.25], 0.55 * str * (0.8 + 0.2 * Math.sin(time * 9))); glowSpr(A.x, A.y, Math.max(4 * dpr, A.k * 0.022 * pr), [1, 0.95, 0.8], 0.8 * str); }
    flushTri();
  }
  const TAU2 = Math.PI * 2;

  /** Cone of the scanner from the ship to the footprint on the surface. */
  function drawScanBeam(pos, w, col, time) {
    const radial = norm(pos), ref = Math.abs(radial[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const e1 = norm(cross(radial, ref)), e2 = cross(radial, e1);
    const rr = Math.sin(w) * 1.0;
    const foot = (a) => radial.map((v, j) => v * Math.cos(w) + (e1[j] * Math.cos(a) + e2[j] * Math.sin(a)) * rr);
    for (let i = 0; i < 6; i++) polyline([{ w: pos.map((v, j) => v - radial[j] * 0.03), a: 0.35 }, { w: foot(i / 6 * TAU2 + time), a: 0.05 }], 1.3, col);
    flushTri();
  }

  // Ship orbit helper: a circle of radius R in a plane tilted by inc about X, centred at c; angle a.
  const ringPos = (c, R, inc, a) => [c[0] + R * Math.cos(a), c[1] + R * Math.sin(a) * Math.sin(inc), c[2] + R * Math.sin(a) * Math.cos(inc)];
  /** Faint full ring + a fading trail behind angle a; depth test against the planet centre depth cd: side 'back' or 'front'. */
  function drawOrbitTrail(posAt, a, side, cd, strong = 1) {
    const keep = side === 'back' ? (d => d > cd) : (d => d <= cd);
    const ring = [], trail = [], span = 1.5;
    for (let i = 0; i <= 72; i++) { const aa = a + (i / 72) * TAU2; ring.push({ w: posAt(aa), a: 0.13 * strong }); }
    for (let i = 0; i <= 40; i++) { const f = i / 40; trail.push({ w: posAt(a - span * (1 - f)), a: 0.75 * f * f * strong }); }
    polyline(ring, 1.1, [0.55, 0.8, 1], keep);
    polyline(trail, 1.8, [0.7, 0.9, 1], keep);
    flushTri();
  }

  function renderSystem(star, timeSec = 0, camera = {}, opts = {}) {
    const planets = star.planets || [];
    const cam = setupFrame(camera, fitDist(star), 3, 600);
    const { Rv, eye } = cam;
    VW = { Rv, eye };
    drawBackground(Rv, timeSec, star.id || star.name);
    const showOrbits = opts.showOrbits !== false;

    screen = [];
    const list = [];
    const lightCol = lightColor(star);
    const bp = opts.blip;
    const byId = (id) => planets.find(p => p.id === id);
    const pxLen = 64 * dpr;   // the Hail Mary is drawn about this long on screen in the system view, never below 70% of it
    const scaleAt = (w, cap) => { const q = toScr(w); if (!q) return 0.05; return Math.max(Math.min(pxLen / (q.k * SHIP_LEN), cap), pxLen * 0.7 / (q.k * SHIP_LEN)); };
    const INC = 0.5;
    // where a ship sits when orbiting planet pl (also the transfer end point); shared with the Blip-A
    const orbitState = (pl, ph) => {
      const c = planetPos(pl, timeSec), pr = planetDisplayRadius(pl), sc = scaleAt(c, pr * 1.6 / SHIP_LEN);
      const R = pr * 1.5 + 0.7 * sc * SHIP_LEN, at = (a) => ringPos(c, R, INC, a);
      return { c, pr, sc, R, at, pos: at(ph) };
    };
    const parkPos = (au, ph) => { const R = orbitRadius(au); return [R * Math.cos(ph), 0, R * Math.sin(ph)]; };

    // star
    const sr = starDisplayRadius(star);
    {
      const v = mulv(Rv, [-eye[0], -eye[1], -eye[2]]);
      const pr = project(v, sr);
      if (pr) list.push({ kind: 'star', star, depth: pr.depth, x: pr.x, y: pr.y, unit: Math.max(pr.px, 4), mode: 1, quad: 9,
        rot: mul3(Rv, rotY(timeSec * 0.03)) });
    }
    // planets
    for (const pl of planets) {
      const pos = planetPos(pl, timeSec);
      const rel = [pos[0] - eye[0], pos[1] - eye[1], pos[2] - eye[2]];
      const v = mulv(Rv, rel);
      const pr = project(v, planetDisplayRadius(pl));
      if (!pr) continue;
      const unit = Math.max(pr.px, 3.5);
      const quad = planetQuad(pl);
      const L = norm(mulv(Rv, [-pos[0], -pos[1], -pos[2]]));
      list.push({ kind: 'planet', planet: pl, depth: pr.depth, x: pr.x, y: pr.y, unit, mode: 0, quad, camD: Math.hypot(rel[0], rel[1], rel[2]) / planetDisplayRadius(pl),
        rot: planetRot(pl, Rv, timeSec), L, lightCol, infect: star.infection });
      screen.push({ id: pl.id, x: pr.x / dpr, y: pr.y / dpr, r: unit / dpr, depth: pr.depth });
      addMoons(list, pl, pos, planetDisplayRadius(pl), Rv, eye, timeSec, lightCol, mp => norm(mulv(Rv, [-mp[0], -mp[1], -mp[2]])));
    }

    if (showOrbits) {
      for (const pl of planets) {
        const sel = pl.id === opts.selectedId;
        drawOrbit(Rv, eye, orbitRadius(pl.orbit), sel ? 0.55 : 0.2, sel ? [0.5, 0.9, 1] : [0.6, 0.7, 0.9]);
      }
    }

    drawPetrova(star, planets, Rv, eye, timeSec, sr, opts.harvest ? clamp(opts.harvest.boost ?? 1, 0, 1) : 0);

    // ---- the Hail Mary: at its orbit, at a parking spot, or flying a transfer arc ----
    const sh = opts.ship;
    shipScr = null;
    blipScr = null;
    if (sh) {
      const phase = sh.phase ?? timeSec * 0.9;
      const parkAng = sh.phase != null ? sh.phase * 0.12 + 0.9 : 0.9 + timeSec * 0.12;
      let pos, fwd, burning = !!sh.burning, shadow = null, L, orbitInfo = null;
      const tr = sh.transfer;
      const fromPl = tr && tr.fromId ? byId(tr.fromId) : null, toPl = tr ? byId(tr.toId) : null;
      if (tr && toPl) {
        const A = fromPl ? orbitState(fromPl, phase).pos : parkPos(tr.fromAu ?? sh.parkAu ?? 3, parkAng);
        const Bs = orbitState(toPl, phase), B = Bs.pos;
        const rA = Math.hypot(A[0], A[2]), rB = Math.hypot(B[0], B[2]), tA = Math.atan2(A[2], A[0]);
        let dth = Math.atan2(B[2], B[0]) - tA; dth = Math.atan2(Math.sin(dth), Math.cos(dth));
        const at = (u) => {
          const e = smooth(0, 1, u), r = rA + (rB - rA) * e + Math.sin(Math.PI * u) * 0.056 * Math.max(rA, rB);   // eased spiral with a Hohmann-style bulge
          const th = tA + dth * e;
          return [r * Math.cos(th), A[1] + (B[1] - A[1]) * e, r * Math.sin(th)];
        };
        const u = clamp(tr.progress ?? 0, 0, 1);
        pos = at(u); const nx = at(Math.min(1, u + 0.02)), pv = at(Math.max(0, u - 0.02));
        fwd = norm([nx[0] - pv[0], nx[1] - pv[1], nx[2] - pv[2]]);
        burning = u > 0.01 && u < 0.99 && !(u > 0.47 && u < 0.53);
        L = norm([-pos[0], -pos[1], -pos[2]]);
        {   // Hohmann-style transfer: faint dashed path ahead, bright glowing swept path behind the ship, burn flares at both ends
          const n = 72, burnOn = burning;
          for (let i = 0; i < n; i++) {
            const f0 = i / n, f1 = (i + 1) / n, p0 = at(f0), p1 = at(f1);
            if (f1 <= u) { const g = Math.pow(f1, 0.6); polyline([{ w: p0, a: 0.25 + 0.5 * g }, { w: p1, a: 0.25 + 0.5 * g }], 3 * dpr, [1, 0.62, 0.25]); polyline([{ w: p0, a: 0.3 + 0.5 * g }, { w: p1, a: 0.3 + 0.5 * g }], 1.4 * dpr, [1, 0.95, 0.75]); }
            else if (showOrbits && (i & 1) === 0) polyline([{ w: p0, a: 0.4 }, { w: p1, a: 0.4 }], 1.4 * dpr, [0.7, 0.85, 1]);
          }
          flushTri();
          if (burnOn) for (let i = 0; i < 14; i++) {         // engine glow smeared along the arc just behind the ship
            const uu = u - i * 0.012; if (uu < 0) break; const q = toScr(at(uu)); if (!q) continue;
            glowSpr(q.x, q.y, Math.max(7 * dpr, 24 * dpr * (1 - i / 16)), [1, 0.5 + 0.02 * i, 0.18], 0.4 * (1 - i / 14));
          }
          for (const e of [0, 1]) { const q = toScr(at(e)); if (q) glowSpr(q.x, q.y, 9 * dpr, e ? [0.5, 0.9, 1] : [1, 0.7, 0.3], 0.55); }
          flushTri();
        }
      } else if (sh.orbitPlanetId && byId(sh.orbitPlanetId)) {
        const pl = byId(sh.orbitPlanetId), os = orbitState(pl, phase);
        pos = os.pos; const nx = os.at(phase + 0.03);
        fwd = norm([nx[0] - pos[0], nx[1] - pos[1], nx[2] - pos[2]]);
        L = norm([-os.c[0], -os.c[1], -os.c[2]]);
        shadow = { c: os.c, R: os.pr };
        orbitInfo = { os, cd: toScr(os.c) ? toScr(os.c).d : 0 };
      } else {
        const au = sh.parkAu ?? 3;
        pos = sh.position || parkPos(au, parkAng);
        const nx = sh.position ? [pos[0] - pos[2] * 0.01, pos[1], pos[2] + pos[0] * 0.01] : parkPos(au, parkAng + 0.03);
        fwd = norm([nx[0] - pos[0], nx[1] - pos[1], nx[2] - pos[2]]);
        L = norm([-pos[0], -pos[1], -pos[2]]);
      }
      if (!orbitInfo && !(tr && toPl) && showOrbits && !sh.position) {   // faint dashed parking-orbit ring
        const Rp = orbitRadius(sh.parkAu ?? 3), dash = [];
        for (let i = 0; i < 120; i += 2) dash.push([{ w: [Rp * Math.cos(i / 120 * TAU2), 0, Rp * Math.sin(i / 120 * TAU2)], a: 0.4 }, { w: [Rp * Math.cos((i + 1) / 120 * TAU2), 0, Rp * Math.sin((i + 1) / 120 * TAU2)], a: 0.4 }]);
        for (const d of dash) polyline(d, 1.2, [1, 0.8, 0.45]);
        flushTri();
      }
      const q = toScr(pos);
      shipScr = q ? { x: q.x / dpr, y: q.y / dpr } : null;
      const scale = orbitInfo ? orbitInfo.os.sc : scaleAt(pos, 1e9);
      const planetShineCol = shadow ? effAtmo(byId(sh.orbitPlanetId)).color : null;
      if (q) {
        const item = { kind: 'fn', depth: q.d, draw: () => {
          const cfg = { pos, fwd, up: [0, 1, 0], scale, L, lightCol, time: timeSec, burning, shadow, bounce: planetShineCol, marker: true };
          const sm = drawShipModel(cfg);
          if (opts.harvest && orbitInfo) drawScoop(pos, sm.at(INTAKE), orbitInfo.os.c, orbitInfo.os.pr, opts.harvest.progress ?? opts.harvest.boost ?? 1, timeSec, scale * 0.3);
          if (bp && bp.docked) drawDockedBlip(sm, cfg);
        } };
        list.push(item);
      }
      if (orbitInfo && showOrbits) {
        const { os, cd } = orbitInfo;
        list.push({ kind: 'fn', depth: 1e9, draw: () => drawOrbitTrail(os.at, phase, 'back', cd, 0.8) });
        list.push({ kind: 'fn', depth: -1e9, draw: () => drawOrbitTrail(os.at, phase, 'front', cd, 0.8) });
      }
    }

    // ---- Rocky's Blip-A: away at a planet in a small orbit (the Hail Mary's orbitState helper + a different phase). ----
    if (bp && !bp.docked && bp.planetId && byId(bp.planetId)) {
      const pl = byId(bp.planetId);
      const ph = (sh ? (sh.phase ?? timeSec * 0.9) : timeSec * 0.9) + 2.3;
      const os = orbitState(pl, ph), pos = os.pos, nx = os.at(ph + 0.03);
      const fwd = norm([nx[0] - pos[0], nx[1] - pos[1], nx[2] - pos[2]]);
      const L = norm([-os.c[0], -os.c[1], -os.c[2]]);
      const q = toScr(pos);
      if (q) {
        blipScr = { x: q.x / dpr, y: q.y / dpr };
        list.push({ kind: 'fn', depth: q.d, draw: () => {
          drawMesh({ pos, fwd, up: [0, 1, 0], scale: os.sc, L, lightCol, time: timeSec,
            shadow: { c: os.c, R: os.pr }, bounce: effAtmo(pl).color }, { mesh: blipMesh, len: BLIP_LEN });
          blipLocator(q, timeSec, 1);
          flushTri();
        } });
      }
      if (showOrbits) {
        const cd = toScr(os.c) ? toScr(os.c).d : 0;
        list.push({ kind: 'fn', depth: 1e9, draw: () => drawOrbitTrail(os.at, ph, 'back', cd, 0.4) });
        list.push({ kind: 'fn', depth: -1e9, draw: () => drawOrbitTrail(os.at, ph, 'front', cd, 0.4) });
      }
    }

    list.sort((a, b) => b.depth - a.depth);
    for (const b of list) {
      if (b.kind === 'fn') { b.draw(); continue; }
      b.halfPx = b.unit * (b.quad);
      if (b.x + b.halfPx < 0 || b.x - b.halfPx > W || b.y + b.halfPx < 0 || b.y - b.halfPx > H) continue;
      if (b.kind === 'star') drawStarBody(b, timeSec); else drawPlanetBody(b, timeSec);
    }
    {
      const sb = list.find(b => b.kind === 'star');
      if (sb) flareFor(sb, list, star);
    }
    if (opts.selectedId) {
      const s = screen.find(q => q.id === opts.selectedId);
      if (s) drawSelect(s.x * dpr, s.y * dpr, s.r * dpr, timeSec);
    }
  }

  function flareFor(sb, list, star) {
    const edge = Math.min(sb.x, W - sb.x, sb.y, H - sb.y);
    let str = clamp(sb.unit / 14, .3, 1.1) * (1 - .4 * clamp(star.infection || 0, 0, 1)) * smooth(-sb.unit * 2, sb.unit, edge);
    for (const b of list) if (b.kind === 'planet' && b.depth < sb.depth && Math.hypot(b.x - sb.x, b.y - sb.y) < b.unit * .9) str *= .15;
    drawFlare(sb.x, sb.y, sb.unit, star, str);
  }

  const planetMW = (pl, time) => {
    const r = rng((pl.seed | 0 || 1) ^ 0x9e3779b9);
    const tilt = (pl.rings ? 0.35 + 0.25 * r() : 0.08 + 0.4 * r()) * (r() < 0.5 ? -1 : 1);
    return mul3(rotZ(tilt), rotY(time * 0.15 + r() * 6.28));
  };
  const sphDir = (lat, lon) => [Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon)];

  /**
   * Close-up of one planet. opts: {
   *   ship: { orbitRadius?, inclination?, phase, burning?, tether?: {depth,tension,heat,broken?}, scale? },
   *   scan: { active, lon0, coverage, color?, lock? },      // sweep overlay; lock (0..1) pulls the ship into the sweep's meridian plane
   *   mark: { lat, lon },                                    // hotspot marker on the surface
   *   harvest: { progress },                                 // collector scoop + brighter Petrova ribbon
   *   follow: { yaw, pitch, dist } }                         // chase camera on the ship (offsets from the default behind/above view)
   */
  function renderPlanet(planet, star, timeSec = 0, camera = {}, opts = {}) {
    const ringF = planet.rings ? Math.max(1, planet.rings.outer / 1.5) : 1;
    const ph = planet.phase || 0;
    const Lw = norm([Math.cos(ph + 0.8), 0.22, Math.sin(ph + 0.8)]);
    const sh = opts.ship || null, scan = opts.scan && opts.scan.active ? opts.scan : null;
    const bp = opts.blip;
    blipScr = null;
    const bounce = effAtmo(planet).color;
    const MW = planetMW(planet, timeSec);
    ensureSize();
    // ---- ship placement ----
    let S = null, T = null, Rship = 1.5, posAt = null;
    if (sh) {
      Rship = sh.orbitRadius ?? shipOrbitRadius(planet);
      const inc = sh.inclination ?? 0.9, lock = scan ? clamp(scan.lock ?? 1, 0, 1) : 0;
      const lonS = scan ? scan.lon0 + scan.coverage * TAU2 : 0;
      const mh = mulv(MW, [Math.cos(lonS), 0, Math.sin(lonS)]), yh = mulv(MW, [0, 1, 0]);
      posAt = (a) => {
        const pn = [Math.cos(a), Math.sin(a) * Math.sin(inc), Math.sin(a) * Math.cos(inc)];
        const pl = [mh[0] * Math.cos(a) + yh[0] * Math.sin(a), mh[1] * Math.cos(a) + yh[1] * Math.sin(a), mh[2] * Math.cos(a) + yh[2] * Math.sin(a)];
        const m = norm([pn[0] + (pl[0] - pn[0]) * lock, pn[1] + (pl[1] - pn[1]) * lock, pn[2] + (pl[2] - pn[2]) * lock]);
        return m.map(v => v * Rship);
      };
      const a = sh.phase ?? 0;
      S = posAt(a); const n2 = posAt(a + 0.03);
      T = norm([n2[0] - S[0], n2[1] - S[1], n2[2] - S[2]]);
    }
    // ---- camera ----
    let Rv, eye;
    if (opts.follow && S) {
      const f = opts.follow, U = norm(S), yaw = f.yaw || 0, pit = clamp(0.4 + (f.pitch || 0), -0.2, 1.35), d = clamp(f.dist > 0 ? f.dist : 0.85, 0.3, 4);
      const back = T.map(v => -v), side = cross(U, back);
      const bk = [0, 1, 2].map(i => back[i] * Math.cos(yaw) + side[i] * Math.sin(yaw));
      eye = [0, 1, 2].map(i => S[i] + (bk[i] * Math.cos(pit) + U[i] * Math.sin(pit)) * d);
      const tgt = [0, 1, 2].map(i => S[i] + T[i] * 0.2 * d - U[i] * 0.16 * d);
      const fw = norm([tgt[0] - eye[0], tgt[1] - eye[1], tgt[2] - eye[2]]);
      let r = cross(fw, U); if (Math.hypot(...r) < 1e-3) r = cross(fw, [0, 0, 1]);
      r = norm(r); const u = cross(r, fw);
      Rv = [r[0], u[0], -fw[0], r[1], u[1], -fw[1], r[2], u[2], -fw[2]];
    } else {
      const cam = setupFrame(camera, 3.4 * ringF, 1.5, 60);
      Rv = cam.Rv;
      const dist = cam.dist * (camera && camera.dist > 0 ? ringF : 1);
      eye = cam.eyeDir.map(v => v * dist);
    }
    VW = { Rv, eye };
    drawBackground(Rv, timeSec, 'p' + planet.seed);
    screen = [];
    const list = [];
    const lightCol = lightColor(star || {});
    // distant star, visible when looking toward it
    if (star) {
      const SD = 80, srad = 3.2;
      const v = mulv(Rv, [Lw[0] * SD - eye[0], Lw[1] * SD - eye[1], Lw[2] * SD - eye[2]]);
      const pr = project(v, srad);
      if (pr) list.push({ kind: 'star', star, depth: pr.depth, x: pr.x, y: pr.y, unit: Math.max(pr.px, 4), mode: 1, quad: 9, rot: mul3(Rv, rotY(timeSec * 0.03)) });
    }
    const Lv = norm(mulv(Rv, Lw));
    let cd = 0;
    {
      const v = mulv(Rv, [-eye[0], -eye[1], -eye[2]]);
      const dEye = Math.hypot(eye[0], eye[1], eye[2]);
      const pr = project(v, 1);
      if (pr) {
        cd = pr.depth;
        // silhouette radius from the tangent cone, so the limb stays right when the camera is close
        const unit = Math.max(dEye > 1.01 ? (H / 2) / TAN_H / Math.sqrt(dEye * dEye - 1) : pr.px, 4);
        const ov = {};
        if (scan && S) { ov.scan = [scan.lon0, scan.coverage, 0.2]; ov.sub = norm(mulv(Rv, norm(S))); ov.col = scan.color || [0.2, 0.85, 1]; }
        if (opts.mark) ov.mark = [...sphDir(opts.mark.lat, opts.mark.lon), 0.17];
        list.push({ kind: 'planet', planet, depth: pr.depth, x: pr.x, y: pr.y, unit, mode: 0, quad: planetQuad(planet), camD: dEye,
          rot: planetRot(planet, Rv, timeSec), L: Lv, lightCol, infect: star ? star.infection : 0, ov });
        screen.push({ id: planet.id, x: pr.x / dpr, y: pr.y / dpr, r: unit / dpr, depth: pr.depth });
      }
      addMoons(list, planet, [0, 0, 0], 1, Rv, eye, timeSec, lightCol, () => Lv);
    }
    // Petrova line: a faint red ribbon from the star down to the breeding planet; flares up while harvesting
    if (star && (star.infection || 0) > 0.03 && petrovaTarget([planet]) === planet) {
      const hb = opts.harvest ? clamp(0.5 + 0.5 * (opts.harvest.progress || 0), 0, 1) : 0;
      const P0 = Lw.map(v => v * 9), P2 = Lw.map(v => v * 1.13), side = norm(cross(Lw, [0, 1, 0]));
      const C = [0, 1, 2].map(i => (P0[i] + P2[i]) / 2 + side[i] * 1.6 + (i === 1 ? 0.8 : 0));
      ribbon(P0, C, P2, Rv, eye, timeSec, star, hb, 3);
    }
    // ship + trail + tether + effects
    if (sh && S) {
      const q = toScr(S);
      const scale = sh.scale ?? 0.27;
      const a = sh.phase ?? 0;
      if (q) {
        list.push({ kind: 'fn', depth: q.d, draw: () => {
          const cfg = { pos: S, fwd: T, up: norm(S), scale, L: Lw, lightCol, time: timeSec, burning: !!sh.burning, shadow: { c: [0, 0, 0], R: 1 }, bounce };
          const sm = drawShipModel(cfg);
          if (scan) drawScanBeam(S, 0.2, scan.color || [0.2, 0.85, 1], timeSec);
          if (opts.harvest) drawScoop(S, sm.at(INTAKE), [0, 0, 0], 1, opts.harvest.progress || 0, timeSec);
          if (sh.tether) drawTether(S, norm(S), T, Rship, sh.tether, timeSec, scale);
          if (bp && bp.docked) drawDockedBlip(sm, cfg);
        } });
      }
      list.push({ kind: 'fn', depth: 1e9, draw: () => drawOrbitTrail(posAt, a, 'back', cd) });
      list.push({ kind: 'fn', depth: -1e9, draw: () => drawOrbitTrail(posAt, a, 'front', cd) });
    }
    // ---- Blip-A away at this planet: a small orbit with a different phase, amber locator. ----
    if (bp && !bp.docked && bp.planetId === planet.id) {
      const R = (sh ? Rship : shipOrbitRadius(planet)) * 1.22, inc = 1.2;
      const aB = (sh ? (sh.phase ?? 0) : timeSec * 0.35) + 2.3;
      const bposAt = (a) => [Math.cos(a) * R, Math.sin(a) * Math.sin(inc) * R, Math.sin(a) * Math.cos(inc) * R];
      const B = bposAt(aB), B2 = bposAt(aB + 0.03);
      const bT = norm([B2[0] - B[0], B2[1] - B[1], B2[2] - B[2]]);
      const qb = toScr(B);
      if (qb) {
        blipScr = { x: qb.x / dpr, y: qb.y / dpr };
        list.push({ kind: 'fn', depth: qb.d, draw: () => {
          drawMesh({ pos: B, fwd: bT, up: norm(B), scale: (sh ? (sh.scale ?? 0.27) : 0.27) * 0.92,
            L: Lw, lightCol, time: timeSec, shadow: { c: [0, 0, 0], R: 1 }, bounce }, { mesh: blipMesh, len: BLIP_LEN });
          blipLocator(qb, timeSec, 1);
          flushTri();
        } });
      }
      list.push({ kind: 'fn', depth: 1e9, draw: () => drawOrbitTrail(bposAt, aB, 'back', cd, 0.4) });
      list.push({ kind: 'fn', depth: -1e9, draw: () => drawOrbitTrail(bposAt, aB, 'front', cd, 0.4) });
    }
    list.sort((a, b) => b.depth - a.depth);
    for (const b of list) {
      if (b.kind === 'fn') { b.draw(); continue; }
      b.halfPx = b.unit * b.quad;
      if (b.kind === 'star') drawStarBody(b, timeSec); else drawPlanetBody(b, timeSec);
    }
    if (star) { const sb = list.find(b => b.kind === 'star'); if (sb) flareFor(sb, list, star); }
  }

  function pick(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left, y = clientY - rect.top;
    let best = null, bd = Infinity;
    for (const s of screen) {
      const d = Math.hypot(s.x - x, s.y - y);
      const reach = Math.max(s.r + 5, 14);
      if (d <= reach && (s.depth < bd)) { best = s.id; bd = s.depth; }
    }
    return best;
  }
  function shipScreenPos() { return shipScr; }
  function blipScreenPos() { return blipScr; }
  function planetScreenPos(id) {
    const s = screen.find(q => q.id === id);
    return s ? { x: s.x, y: s.y, r: s.r } : null;
  }
  function dispose() {
    gl.deleteProgram(bg.p); gl.deleteProgram(body.p); gl.deleteProgram(orbit.p); gl.deleteProgram(rib.p); gl.deleteProgram(part.p); gl.deleteProgram(tri.p); gl.deleteBuffer(triBuf); gl.deleteVertexArray(triVao); gl.deleteVertexArray(emptyVao); gl.deleteBuffer(ribBuf); gl.deleteVertexArray(ribVao);
    gl.deleteBuffer(quadBuf); gl.deleteBuffer(orbBuf);
    gl.deleteVertexArray(quadVao); gl.deleteVertexArray(orbVao);
  }

  resize();
  return { resize: () => { sizeDirty = true; }, setScale, get scale() { return scale; }, renderSystem, renderPlanet, pick, planetScreenPos, shipScreenPos, blipScreenPos, dispose, fitDist, shipOrbitRadius };
}
