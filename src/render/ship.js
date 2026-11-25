// Procedural Hail Mary mesh: pure data, no GL. Model space: +Z is forward (bow), +Y is "up", length about 1.0.
// Triangles are { a, b, c, n, col, emis, grp } with outward normals computed at build time. grp 0 = static hull,
// 1 = rotating crew centrifuge (spins about the Z axis at PIVOT_Z), 2 = engine nozzle interior (glows when burning).
// Two levels of detail: SHIP_TRIS (full, about 1.5k triangles) and SHIP_TRIS_LO (silhouette, about 0.4k) for small on-screen sizes.
//   long truss spine . bow crew module + docking cone . "Beetle" probe under the module . rotating centrifuge wheel (hub, spokes, ring, pods)
//   Astrophage fuel-tank ring (central tank + 6 outer tanks + clamp rings) . radiator wings . spin-drive cluster (5 bells).
export const PIVOT_Z = 0.2;
const TAU = Math.PI * 2;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

/** Shared procedural mesh helpers, used by both the Hail Mary and the Blip-A. Returns the triangle list and the
 *  primitives that fill it: tri / prism / obox / box / strut. `hi` selects full or silhouette detail. */
function makeBuilder(detail) {
  const hi = detail > 0, tris = [];
  // Push a triangle, orienting its normal away from `center` (the primitive's interior point).
  const tri = (a, b, c, col, emis, grp, center) => {
    let n = norm(cross(sub(b, a), sub(c, a)));
    const m = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
    if (dot(n, sub(m, center)) < 0) { const t = b; b = c; c = t; n = [-n[0], -n[1], -n[2]]; }
    tris.push({ a, b, c, n, col, emis, grp });
  };
  const shade = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
  const segsFor = (s) => hi ? s : Math.max(5, Math.round(s * 0.55));
  // Frustum along Z centred on (cx, cy), radii r0 (at z0) to r1 (at z1).
  const prism = (cx, cy, r0, r1, z0, z1, segs0, col, o = {}) => {
    const segs = segsFor(segs0), grp = o.grp || 0, emis = o.emis || 0, cz = (z0 + z1) / 2, C = [cx, cy, cz];
    const ring = (r, z, i) => [cx + Math.cos(i / segs * TAU) * r, cy + Math.sin(i / segs * TAU) * r, z];
    for (let i = 0; i < segs; i++) {
      const k = 0.86 + 0.14 * ((i % 2) ? 1 : 0.8);
      const a0 = ring(r0, z0, i), a1 = ring(r0, z0, i + 1), b0 = ring(r1, z1, i), b1 = ring(r1, z1, i + 1);
      tri(a0, a1, b1, shade(col, k), emis, grp, C); tri(a0, b1, b0, shade(col, k), emis, grp, C);
      if (o.capEnd !== false && r1 > 0.001) tri([cx, cy, z1], b0, b1, shade(col, 0.9), emis, grp, C);
      if (o.capStart !== false && r0 > 0.001) tri([cx, cy, z0], a1, a0, shade(col, 0.7), emis, grp, C);
    }
  };
  // Oriented box: centre c, local axes ax/ay/az (unit), full sizes sx/sy/sz.
  const obox = (c, ax, ay, az, sx, sy, sz, col, o = {}) => {
    const grp = o.grp || 0, emis = o.emis || 0;
    const P = (i, j, k) => [c[0] + ax[0] * (i ? sx : -sx) / 2 + ay[0] * (j ? sy : -sy) / 2 + az[0] * (k ? sz : -sz) / 2,
      c[1] + ax[1] * (i ? sx : -sx) / 2 + ay[1] * (j ? sy : -sy) / 2 + az[1] * (k ? sz : -sz) / 2,
      c[2] + ax[2] * (i ? sx : -sx) / 2 + ay[2] * (j ? sy : -sy) / 2 + az[2] * (k ? sz : -sz) / 2];
    const faces = [[[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]], [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]],
      [[0, 0, 0], [0, 1, 0], [0, 1, 1], [0, 0, 1]], [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]],
      [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], [[0, 1, 0], [1, 1, 0], [1, 1, 1], [0, 1, 1]]];
    faces.forEach((f, n) => {
      const q = f.map((v) => P(...v)), k = [0.8, 1, 0.85, 0.9, 0.7, 1.05][n];
      tri(q[0], q[1], q[2], shade(col, k), emis, grp, c); tri(q[0], q[2], q[3], shade(col, k), emis, grp, c);
    });
  };
  const X = [1, 0, 0], Y = [0, 1, 0], Z = [0, 0, 1];
  const box = (cx, cy, cz, sx, sy, sz, col, o = {}) => obox([cx, cy, cz], X, Y, Z, sx, sy, sz, col, o);
  // a strut between two points with square cross-section w
  const strut = (p, q, w, col, o = {}) => {
    const d = sub(q, p), L = Math.hypot(d[0], d[1], d[2]), az = norm(d);
    let ax = cross(Math.abs(az[1]) < 0.9 ? Y : X, az); ax = norm(ax); const ay = cross(az, ax);
    obox([(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2], ax, ay, az, w, w, L, col, o);
  };
  return { hi, tris, tri, shade, prism, obox, box, strut, X, Y, Z };
}

function build(detail) {
  const { hi, tris, tri, shade, prism, obox, box, strut, X, Y, Z } = makeBuilder(detail);
  const HULL = [0.78, 0.8, 0.83], DARK = [0.26, 0.28, 0.32], GOLD = [0.74, 0.56, 0.28], TEAL = [0.25, 0.5, 0.52], WHITE = [0.92, 0.92, 0.94],
    STEEL = [0.55, 0.57, 0.62], BELL = [0.36, 0.34, 0.33], PANEL = [0.2, 0.26, 0.42], WIN = [0.4, 0.75, 0.9];

  // ---- long truss spine: core tube + framing rings with four diagonal-braced struts ----
  prism(0, 0, 0.026, 0.026, -0.30, 0.30, 10, DARK);
  if (hi) {
    for (let z = -0.28; z <= 0.14; z += 0.07) {
      if (z > -0.12 && z < 0.0) continue;                         // leave room for the tank ring clamp
      const r = 0.05;
      for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + Math.PI / 4, b = (i + 1) / 4 * TAU + Math.PI / 4; strut([Math.cos(a) * r, Math.sin(a) * r, z], [Math.cos(b) * r, Math.sin(b) * r, z], 0.006, STEEL); }
      if (z + 0.07 <= 0.15) for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + Math.PI / 4; strut([Math.cos(a) * r, Math.sin(a) * r, z], [Math.cos(a + 0.6) * r, Math.sin(a + 0.6) * r, z + 0.07], 0.005, STEEL); }
    }
  }
  prism(0, 0, 0.03, 0.03, 0.05, 0.14, 10, HULL);                   // utility collar below the crew deck
  // ---- bow crew module: pressure hull, window band, docking cone, antenna dish ----
  prism(0, 0, 0.056, 0.056, 0.30, 0.47, 12, WHITE);
  prism(0, 0, 0.060, 0.060, 0.34, 0.36, 12, DARK);
  prism(0, 0, 0.0585, 0.0585, 0.385, 0.415, 12, WIN, { emis: 0.45 });   // window band
  prism(0, 0, 0.056, 0.02, 0.47, 0.56, 12, HULL);
  prism(0, 0, 0.02, 0.02, 0.56, 0.585, 8, DARK);
  prism(0, 0, 0.022, 0.012, 0.585, 0.6, 8, [0.95, 0.8, 0.45], { emis: 0.35 });
  if (hi) {
    box(0.052, 0.045, 0.43, 0.004, 0.05, 0.05, STEEL);               // antenna mast + dish
    prism(0.062, 0.075, 0.03, 0.005, 0.425, 0.44, 8, STEEL, { capEnd: false });
  }
  // ---- "Beetle" probe docked under the module, in a cradle ----
  box(0, -0.075, 0.38, 0.05, 0.032, 0.13, TEAL);
  box(0, -0.058, 0.38, 0.016, 0.03, 0.08, DARK);
  box(0.03, -0.062, 0.38, 0.006, 0.026, 0.1, STEEL); box(-0.03, -0.062, 0.38, 0.006, 0.026, 0.1, STEEL);
  prism(0, -0.075, 0.013, 0.013, 0.44, 0.47, 6, [0.9, 0.85, 0.6], { emis: 0.4 });
  // ---- rotating centrifuge: hub, 4 spokes, ring, crew pods with windows ----
  prism(0, 0, 0.05, 0.05, PIVOT_Z - 0.03, PIVOT_Z + 0.03, 12, WHITE);          // static hub on the spine
  prism(0, 0, 0.034, 0.034, PIVOT_Z - 0.04, PIVOT_Z + 0.04, 10, STEEL, { grp: 1 });
  const RR = 0.2, nSeg = hi ? 20 : 10;
  for (let i = 0; i < 4; i++) {                                                   // spokes
    const a = i / 4 * TAU, c = Math.cos(a), s = Math.sin(a);
    obox([c * RR / 2, s * RR / 2, PIVOT_Z], [c, s, 0], [-s, c, 0], Z, RR - 0.02, 0.011, 0.011, [0.7, 0.72, 0.76], { grp: 1 });
    if (hi) obox([c * RR / 2, s * RR / 2, PIVOT_Z], [c, s, 0], [-s, c, 0], Z, RR * 0.9, 0.006, 0.03, DARK, { grp: 1 });
  }
  for (let i = 0; i < nSeg; i++) {                                                // the wheel
    const a = (i + 0.5) / nSeg * TAU, c = Math.cos(a), s = Math.sin(a), len = TAU * RR / nSeg * 1.06;
    obox([c * RR, s * RR, PIVOT_Z], [-s, c, 0], [c, s, 0], Z, len, 0.018, 0.034, (i % 2) ? HULL : shade(HULL, 0.88), { grp: 1 });
  }
  for (let sgn = -1; sgn <= 1; sgn += 2) {                                        // pods
    box(sgn * RR, 0, PIVOT_Z, 0.06, 0.06, 0.07, WHITE, { grp: 1 });
    box(sgn * (RR + 0.032), 0, PIVOT_Z, 0.004, 0.04, 0.05, WIN, { grp: 1, emis: 0.55 });
    box(sgn * RR, 0.034, PIVOT_Z, 0.04, 0.004, 0.05, WIN, { grp: 1, emis: 0.5 });
  }
  // ---- Astrophage fuel-tank ring: fat central tank, six outer tanks between clamp rings ----
  prism(0, 0, 0.06, 0.06, -0.30, -0.02, 12, GOLD);
  prism(0, 0, 0.066, 0.066, -0.30, -0.275, 12, DARK);
  prism(0, 0, 0.066, 0.066, -0.05, -0.02, 12, DARK);
  prism(0, 0, 0.07, 0.07, -0.165, -0.145, 12, STEEL);
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * TAU, cx = Math.cos(a) * 0.12, cy = Math.sin(a) * 0.12;
    prism(cx, cy, 0.036, 0.036, -0.27, -0.055, 8, shade(GOLD, 0.92));
    prism(cx, cy, 0.036, 0.02, -0.055, -0.035, 8, shade(GOLD, 0.8), { capEnd: true });
    prism(cx, cy, 0.0385, 0.0385, -0.158, -0.152, 8, DARK);
    if (hi) strut([Math.cos(a) * 0.066, Math.sin(a) * 0.066, -0.155], [cx, cy, -0.155], 0.008, STEEL);
  }
  if (hi) for (let i = 0; i < 6; i++) {                                           // clamp ring between neighbouring tanks
    const a = (i + 0.5) / 6 * TAU;
    strut([Math.cos(a - 0.52) * 0.12, Math.sin(a - 0.52) * 0.12, -0.255], [Math.cos(a + 0.52) * 0.12, Math.sin(a + 0.52) * 0.12, -0.255], 0.006, STEEL);
    strut([Math.cos(a - 0.52) * 0.12, Math.sin(a - 0.52) * 0.12, -0.075], [Math.cos(a + 0.52) * 0.12, Math.sin(a + 0.52) * 0.12, -0.075], 0.006, STEEL);
  }
  // ---- radiator wings (up and down), paneled with ribs, on booms ----
  for (let s = -1; s <= 1; s += 2) {
    box(0, s * 0.14, -0.1, 0.005, 0.2, 0.26, PANEL);
    box(0, s * 0.14, -0.1, 0.007, 0.205, 0.014, STEEL);
    box(0, s * 0.245, -0.1, 0.008, 0.01, 0.27, STEEL);
    if (hi) for (let r = 0; r < 4; r++) box(0.0, s * 0.14, -0.215 + (r + 1) * 0.045, 0.008, 0.2, 0.004, STEEL);
    if (hi) box(0, s * 0.075, -0.1, 0.014, 0.03, 0.06, DARK);
  }
  if (hi) {                                                                         // smaller side radiators
    for (let s = -1; s <= 1; s += 2) { box(s * 0.12, 0, -0.34, 0.1, 0.004, 0.1, PANEL); strut([s * 0.03, 0, -0.34], [s * 0.07, 0, -0.34], 0.008, STEEL); }
  }
  // ---- spin-drive cluster at the stern: collar, central bell + four outer bells ----
  prism(0, 0, 0.07, 0.07, -0.37, -0.30, 12, DARK);
  prism(0, 0, 0.03, 0.062, -0.46, -0.37, 10, BELL, { capEnd: false });
  prism(0, 0, 0.025, 0.05, -0.455, -0.375, 10, [1, 0.6, 0.25], { grp: 2, capStart: false, capEnd: false });
  for (let i = 0; i < 4; i++) {
    const a = i / 4 * TAU + Math.PI / 4;
    const cx = Math.cos(a) * 0.085, cy = Math.sin(a) * 0.085;
    prism(cx, cy, 0.018, 0.036, -0.435, -0.35, 8, BELL, { capEnd: false });
    prism(cx, cy, 0.014, 0.03, -0.43, -0.355, 8, [1, 0.6, 0.25], { grp: 2, capStart: false, capEnd: false });
    if (hi) strut([Math.cos(a) * 0.04, Math.sin(a) * 0.04, -0.345], [cx, cy, -0.345], 0.01, DARK);
  }
  return tris;
}

export const SHIP_TRIS = build(1);
export const SHIP_TRIS_LO = build(0);
export const SHIP_LEN = 1.06;          // model units, nose to nozzle exit (z -0.46 .. 0.6)
export const STERN_Z = -0.46;
// Nav light anchors in model space (rotating ones move with the centrifuge wheel).
export const NAV = {
  armPort: { p: [-0.24, 0.0, PIVOT_Z + 0.04], col: [1, 0.15, 0.1], rot: true },
  armStar: { p: [0.24, 0.0, PIVOT_Z + 0.04], col: [0.2, 1, 0.3], rot: true },
  stern: { p: [0, 0.092, -0.28], col: [1, 1, 1], strobe: true },
  bow: { p: [0, 0.0, 0.6], col: [1, 0.75, 0.35] },
};
// Engine nozzle exits (model space) for the plume: the centre bell and four outer bells.
export const NOZZLES = [[0, 0, -0.46], ...[0, 1, 2, 3].map(i => { const a = i / 4 * TAU + Math.PI / 4; return [Math.cos(a) * 0.085, Math.sin(a) * 0.085, -0.435]; })];
// Collector intake: a point under the tank ring where harvested Astrophage motes enter the ship.
export const INTAKE = [0, -0.07, -0.16];

// ---- Rocky's ship, the Blip-A ----
// Eridian construction: lumpy hand-worked xenonite, warm amber trim. Model space matches the Hail Mary (+Z bow,
// +Y up), but it is only ~0.65 long (about 60% of the Hail Mary's 1.06). Under ~800 triangles in full detail.
const XENO = [0.47, 0.43, 0.37], XENO_HI = [0.60, 0.55, 0.48], XENO_LO = [0.29, 0.27, 0.24],
  BELL = [0.33, 0.31, 0.29], AMBER = [1.0, 0.60, 0.20], GLASS = [0.62, 0.80, 0.82];

function buildBlip(detail) {
  const { tris, tri, shade, prism, box } = makeBuilder(detail);
  // Main hull: stacked, slightly offset rings so the silhouette reads as soft and irregular rather than machined.
  const rings = [
    [-0.30, 0.055, 0.004, -0.006], [-0.25, 0.090, -0.008, 0.004], [-0.18, 0.112, 0.006, 0.007],
    [-0.09, 0.122, 0.004, -0.005], [0.00, 0.126, -0.006, 0.004], [0.09, 0.118, 0.006, 0.002],
    [0.17, 0.103, -0.004, -0.006], [0.23, 0.082, 0.004, 0.004],
  ];
  for (let i = 0; i < rings.length - 1; i++) {
    const [z0, r0, x0, y0] = rings[i], [z1, r1, x1, y1] = rings[i + 1];
    prism((x0 + x1) / 2, (y0 + y1) / 2, r0, r1, z0, z1, 10, i % 2 ? XENO : XENO_HI,
      { capStart: i === 0, capEnd: i === rings.length - 2 });
  }
  // irregular xenonite lumps welded to the hull
  for (const [z, a, r, s] of [[-0.20, 0.7, 0.108, 0.05], [-0.11, 2.6, 0.122, 0.045], [-0.02, 4.3, 0.124, 0.055],
    [0.06, 1.7, 0.120, 0.04], [0.13, 3.5, 0.110, 0.042], [0.20, 5.4, 0.092, 0.036]]) {
    box(Math.cos(a) * r, Math.sin(a) * r, z, s, s * 0.7, s * 0.9, XENO_LO);
  }
  // equatorial amber trim posts
  for (let i = 0; i < 4; i++) {
    const a = i / 4 * TAU + 0.4;
    box(Math.cos(a) * 0.116, Math.sin(a) * 0.116, 0.01, 0.014, 0.014, 0.030, AMBER, { emis: 1.1 });
  }
  prism(0, 0, 0.105, 0.105, 0.035, 0.050, 10, XENO_LO, { capStart: false, capEnd: false });   // trim band

  // small spherical crew pod, bolted on top with a window band
  const pod = [0, 0.128, 0.10], pr = 0.046, segs = 8, rows = 4;
  const P = (i, j) => { const th = Math.PI * j / rows, ph = TAU * i / segs;
    return [pod[0] + pr * Math.sin(th) * Math.cos(ph), pod[1] + pr * Math.sin(th) * Math.sin(ph), pod[2] + pr * Math.cos(th)]; };
  for (let j = 0; j < rows; j++) for (let i = 0; i < segs; i++) {
    const a = P(i, j), b = P(i + 1, j), c = P(i + 1, j + 1), d = P(i, j + 1);
    tri(a, b, c, shade(XENO, 0.9 + 0.1 * (j % 2)), 0, 0, pod);
    tri(a, c, d, shade(XENO, 0.9 + 0.1 * (j % 2)), 0, 0, pod);
  }
  prism(pod[0], pod[1], pr * 0.86, pr * 0.86, pod[2] - 0.010, pod[2] + 0.010, 8, GLASS,
    { emis: 0.45, capStart: false, capEnd: false });
  prism(pod[0], pod[1], 0.012, 0.008, pod[2] + pr, pod[2] + pr + 0.018, 6, XENO_LO);   // pod antenna

  // three stubby engine bells at the stern; group 2 glows amber when lit
  for (let i = 0; i < 3; i++) {
    const a = i / 3 * TAU + Math.PI / 2, cx = Math.cos(a) * 0.052, cy = Math.sin(a) * 0.052;
    prism(cx, cy, 0.031, 0.018, -0.33, -0.29, 8, BELL, { capStart: false, capEnd: false });
    prism(cx, cy, 0.025, 0.013, -0.325, -0.30, 8, AMBER, { grp: 2, emis: 0.35, capStart: false, capEnd: false });
  }
  prism(0, 0, 0.062, 0.045, -0.31, -0.28, 10, XENO_LO);                                  // engine collar

  // bow docking collar: the tunnel meets the ship here (+Z)
  prism(0, 0, 0.082, 0.062, 0.23, 0.305, 10, XENO_LO);
  prism(0, 0, 0.052, 0.052, 0.305, 0.322, 8, AMBER, { emis: 0.85 });
  return tris;
}

/** Short xenonite docking tunnel, along +Z from 0 to BLIP_DOCK.len. Ribs are brighter than the sleeve. */
function buildTunnel(detail) {
  const { tris, prism } = makeBuilder(detail), L = BLIP_DOCK.len;
  prism(0, 0, 0.027, 0.027, 0, L, 10, [0.55, 0.53, 0.48], { capStart: false, capEnd: false });
  for (const z of [0.045, 0.135, 0.225]) prism(0, 0, 0.032, 0.032, z, z + 0.012, 10, [0.72, 0.67, 0.57], { capStart: false, capEnd: false });
  prism(0, 0, 0.034, 0.034, 0, 0.012, 10, [0.50, 0.48, 0.43], { capStart: false, capEnd: false });
  prism(0, 0, 0.034, 0.034, L - 0.012, L, 10, [0.50, 0.48, 0.43], { capStart: false, capEnd: false });
  return tris;
}

export const BLIP_TRIS = buildBlip(1);
export const BLIP_TRIS_LO = buildBlip(0);
export const BLIP_LEN = 0.655;          // model units, bow collar to bell exit (z -0.33 .. 0.322)
export const BLIP_BOW_Z = 0.322;
// Docking layout in the Hail Mary's local frame: the Blip sits alongside the crew module, nose toward its flank,
// joined by a short tube from `from` to `to` (the Blip's bow collar, pos + fwd * BLIP_BOW_Z).
export const BLIP_DOCK = {
  pos: [0.657, 0, 0.50], fwd: [-1, 0, 0], up: [0, 1, 0],
  from: [0.070, 0, 0.50], to: [0.335, 0, 0.50], len: 0.265,
};
export const TUNNEL_TRIS = buildTunnel(1);
export const TUNNEL_TRIS_LO = buildTunnel(0);
