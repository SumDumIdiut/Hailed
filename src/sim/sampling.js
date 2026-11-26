// Orbital scan sweep + tether-probe sampling. Pure, deterministic logic (no DOM, no wall clock).
// The UI drives time: scanProgress(dCoverage) per frame, sampleStep({depthDelta, dt}) per frame.
import { createRng, mixSeed, hashStr } from './rng.js';
import { findPlanet } from './stars.js';
import { tick } from './astrophage.js';
import { addLog, spend } from './util.js';
import { COSTS } from './ship.js';
import { closeFindings, collectSample } from './lab.js';
import { isPrologue } from './prologue.js';
import { ensurePrologueSampleStrain } from './genetics.js';
import { petrovaTarget } from './harvest.js';

const TAU = Math.PI * 2;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const orbiting = (state, id) => (state.ship.planetId ?? null) === id;

export const SCAN = {
  fullAt: 0.6,                      // coverage at which the sweep counts as a full scan (scanLevel 2)
  years: 0.004, fuelKg: 4,          // charged once when a sweep starts
  w: 72, h: 36,                     // spectrometer map size (equirectangular, lon -pi..pi, lat +90..-90 top to bottom)
  LAYERS: ['thermal', 'atmo', 'astro', 'life'],
};
export const PROBE = {
  lowerSpeed: 0.16, reelSpeed: 0.34,   // depth units per second (UI multiplies by dt)
  bandHalf: 0.07,                      // half width of the target band (depth units)
  holdSec: 4,                          // seconds inside the band to fill the sample meter
  decay: 0.08,                         // meter loss per second outside the band
  hullSnap: 0.04, hullBurn: 0.06, failYears: 0.003,   // penalties (about 1 day)
  layers: [['exosphere', 0, 0.22], ['stratosphere', 0.22, 0.46], ['cloud deck', 0.46, 0.72], ['deep haze', 0.72, 1]],
};

// ---- planet scan state (lazy; lives on the planet so it saves with the game) ----
function scanOf(p) {
  if (!p.scan) p.scan = { coverage: 0, lon0: +(((p.seed >>> 0) % 6283) / 1000).toFixed(3), active: false, sweeps: 0 };
  return p.scan;
}

export function scanBegin(state, planetId) {
  const f = findPlanet(state, planetId);
  if (!f) return { ok: false, text: 'No such planet.' };
  const p = f.planet;
  if (state.status !== 'playing') return { ok: false, text: 'The mission is over.' };
  if (f.star.id !== state.ship.starId) return { ok: false, text: `${p.name} is not in this system.` };
  if (!orbiting(state, planetId)) return { ok: false, text: `Fly to orbit around ${p.name} first: a sweep needs the scanner footprint to cross the surface.` };
  const sc = scanOf(p);
  if (sc.coverage >= 1) return { ok: false, text: `${p.name} is fully mapped.`, coverage: 1 };
  let cost = { fuelKg: 0, shipDays: 0 };
  if (!sc.active) { cost = spend(state, SCAN, tick); sc.active = true; sc.sweeps += 1; }
  return { ok: true, text: `Scan sweep over ${p.name} started.`, coverage: sc.coverage, cost };
}

// Advance the sweep. Crossing SCAN.fullAt makes it a full scan (findings, scanLevel 2).
export function scanProgress(state, planetId, dCoverage) {
  const f = findPlanet(state, planetId);
  if (!f) return { ok: false, text: 'No such planet.' };
  const p = f.planet, sc = scanOf(p);
  if (!sc.active || !orbiting(state, planetId)) return { ok: false, coverage: sc.coverage, text: 'No sweep in progress.' };
  const before = sc.coverage;
  // The prologue sweep is 3x faster: a short tutorial scan, not the full map crawl.
  const rate = isPrologue(state) ? 3 : 1;
  sc.coverage = +clamp(sc.coverage + Math.max(0, dCoverage) * rate, 0, 1).toFixed(4);
  let crossed = false, text = '';
  if (before < SCAN.fullAt && sc.coverage >= SCAN.fullAt) {
    crossed = true;
    const fi = closeFindings(p);
    p.scanned = true; p.scanLevel = 2;
    text = `Scan of ${p.name}: ${fi.join('; ')}.`;
    addLog(state, text);
  }
  const done = sc.coverage >= 1;
  if (done) sc.active = false;
  return { ok: true, coverage: sc.coverage, crossed, done, text };
}
export function scanCoverage(state, planetId) {
  const f = findPlanet(state, planetId);
  return f && f.planet.scan ? f.planet.scan.coverage : 0;
}

// ---- spectrometer map ----
const hash3 = (x, y, z, s) => {
  let h = (Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(z | 0, 0x9e3779b1) ^ Math.imul(s | 0, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0; h = Math.imul(h ^ (h >>> 12), 0x297a2d39) >>> 0;
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
};
function vnoise(x, y, z, s) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const fx = x - xi, fy = y - yi, fz = z - zi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
  const L = (a, b, t) => a + (b - a) * t;
  const c = (dx, dy, dz) => hash3(xi + dx, yi + dy, zi + dz, s);
  return L(L(L(c(0, 0, 0), c(1, 0, 0), u), L(c(0, 1, 0), c(1, 1, 0), u), v), L(L(c(0, 0, 1), c(1, 0, 1), u), L(c(0, 1, 1), c(1, 1, 1), u), v), w);
}
const fbm = (x, y, z, s) => 0.55 * vnoise(x, y, z, s) + 0.3 * vnoise(x * 2.1, y * 2.1, z * 2.1, s + 7) + 0.15 * vnoise(x * 4.3, y * 4.3, z * 4.3, s + 13);
const lonOfCol = (i, w) => -Math.PI + ((i + 0.5) / w) * TAU;

const TEMP = { lava: 0.85, desert: 0.65, rocky: 0.5, ocean: 0.45, gas: 0.4, ice: 0.15 };
const mapCache = new Map();

// Deterministic hotspot list of a planet with Taumoeba; null band otherwise. Longitudes are chosen relative to the sweep start so
// the first hotspot is always inside the first 60% of the sweep.
export function hotspotsOf(p) {
  if (!p.hasTaumoeba) return [];
  const sc = p.scan || { lon0: 0 };
  const r = createRng(mixSeed(p.seed >>> 0, hashStr('hotspots')));
  const out = [];
  for (let i = 0; i < 4; i++) {
    const frac = 0.2 + i * 0.25 + r.range(-0.03, 0.03);
    let lon = sc.lon0 + frac * TAU; lon = ((lon + Math.PI) % TAU + TAU) % TAU - Math.PI;
    out.push({
      id: `h${i + 1}`, lon: +lon.toFixed(3), lat: +r.range(-0.9, 0.9).toFixed(3), radius: +r.range(0.28, 0.4).toFixed(3),
      richness: +r.range(0.72, 1).toFixed(2), bandCenter: +(0.54 + r.range(-0.05, 0.05)).toFixed(3), frac,
    });
  }
  return out;
}

export function scanMap(state, planetId) {
  const f = findPlanet(state, planetId);
  if (!f) return null;
  const p = f.planet, st = f.star, sc = scanOf(p), { w, h } = SCAN;
  const key = `${p.id}:${p.seed}:${sc.lon0}:${Math.round(st.infection * 200)}`;
  let base = mapCache.get(key);
  if (!base) {
    const s = p.seed | 0, target = petrovaTarget(st.planets);
    const hz = Math.sqrt(st.lum0) / Math.max(0.03, p.orbit);
    const warm = 0.15 * clamp(Math.log2(hz), -1.5, 1.5) / 1.5;
    const spots = hotspotsOf(p);
    const L = { thermal: new Array(w * h), atmo: new Array(w * h), astro: new Array(w * h), life: new Array(w * h) };
    for (let y = 0; y < h; y++) {
      const lat = Math.PI / 2 - ((y + 0.5) / h) * Math.PI;
      for (let x = 0; x < w; x++) {
        const lon = lonOfCol(x, w), i = y * w + x;
        const cx = Math.cos(lat) * Math.cos(lon), cy = Math.sin(lat), cz = Math.cos(lat) * Math.sin(lon);
        const n1 = fbm(cx * 3 + 11, cy * 3, cz * 3, s), n2 = fbm(cx * 4, cy * 4 + 5, cz * 4 + 9, s + 3), n3 = fbm(cx * 5 + 3, cy * 5 + 2, cz * 5, s + 5);
        L.thermal[i] = clamp((TEMP[p.type] ?? 0.45) + warm + 0.28 * Math.cos(lat) ** 2 - 0.14 + 0.34 * (n1 - 0.5), 0, 1);
        L.atmo[i] = clamp((p.atmo?.density ?? 0) * (0.5 + 0.7 * n2) , 0, 1);
        const sig = target && target.id === p.id ? clamp(st.infection * 3.2, 0.15, 1) * (0.35 + 0.9 * n3) : clamp(st.infection * 1.1, 0, 0.35) * n3;
        L.astro[i] = clamp(sig, 0, 1);
        let life = 0;
        for (const hs of spots) {
          const hx = Math.cos(hs.lat) * Math.cos(hs.lon), hy = Math.sin(hs.lat), hz2 = Math.cos(hs.lat) * Math.sin(hs.lon);
          const ang = Math.acos(clamp(cx * hx + cy * hy + cz * hz2, -1, 1));
          life = Math.max(life, hs.richness * Math.exp(-((ang / hs.radius) ** 2)));
        }
        L.life[i] = clamp(life + (p.hasTaumoeba ? 0.05 * n3 : 0), 0, 1);
      }
    }
    base = L; mapCache.set(key, base);
    if (mapCache.size > 40) mapCache.delete(mapCache.keys().next().value);
  }
  const revealed = new Array(w);
  let cols = 0;
  for (let x = 0; x < w; x++) {
    const rel = ((((lonOfCol(x, w) - sc.lon0) % TAU) + TAU) % TAU) / TAU;
    revealed[x] = rel < sc.coverage ? 1 : 0; cols += revealed[x];
  }
  const full = sc.coverage >= SCAN.fullAt;
  const hotspots = hotspotsOf(p).map((hs) => {
    const col = clamp(Math.floor(((hs.lon + Math.PI) / TAU) * w), 0, w - 1);
    return { ...hs, x: (hs.lon + Math.PI) / TAU, y: (Math.PI / 2 - hs.lat) / Math.PI, revealed: !!(full && revealed[col]) };
  });
  const seen = hotspots.filter((q) => q.revealed);
  const band = seen.length ? { lo: Math.min(...seen.map((q) => q.bandCenter)) - PROBE.bandHalf, hi: Math.max(...seen.map((q) => q.bandCenter)) + PROBE.bandHalf } : null;
  return { planetId: p.id, w, h, coverage: sc.coverage, lon0: sc.lon0, active: sc.active, full, cols, revealed, layers: base,
    hasLife: !!p.hasTaumoeba, hotspots, band };
}

// ---- tether probe sampling ----
// Depth is 0 at the ship (top of the atmosphere) to 1 at the deepest point we can reach. The Taumoeba live in a band around
// hotspot.bandCenter that drifts with turbulence. Tension rises with depth and gusts, heat rises fast below the band.
export function gustAt(seed, t) {
  const a = (seed % 997) / 997 * TAU, b = (seed % 313) / 313 * TAU;
  return 0.55 * Math.sin(1.31 * t + a) + 0.45 * Math.sin(2.87 * t + b);          // -1..1
}
export function bandAt(sess, t) {
  const a = (sess.seed % 211) / 211 * TAU, b = (sess.seed % 71) / 71 * TAU;
  return sess.bandBase + 0.045 * Math.sin(0.55 * t + a) + 0.02 * Math.sin(1.4 * t + b);
}

function snapshot(s, extra = {}) {
  const c = bandAt(s, s.t);
  return { ok: true, status: s.status, depth: s.depth, tension: s.tension, heat: s.heat, progress: s.progress, t: s.t,
    bandCenter: c, bandLo: c - PROBE.bandHalf, bandHi: c + PROBE.bandHalf, inBand: Math.abs(s.depth - c) <= PROBE.bandHalf,
    gust: gustAt(s.seed, s.t), attempts: s.attempts, ...extra };
}

export function beginSample(state, planetId, hotspotId) {
  const f = findPlanet(state, planetId);
  if (!f) return { ok: false, text: 'No such planet.' };
  const p = f.planet;
  if (state.status !== 'playing') return { ok: false, text: 'The mission is over.' };
  if (f.star.id !== state.ship.starId) return { ok: false, text: `${p.name} is not in this system.` };
  if (!orbiting(state, planetId)) return { ok: false, text: `You must be in orbit around ${p.name} to lower the probe.` };
  const sc = scanOf(p);
  if (sc.coverage < SCAN.fullAt) return { ok: false, text: `Sweep ${p.name} to ${Math.round(SCAN.fullAt * 100)}% first (now ${Math.round(sc.coverage * 100)}%).` };
  if (!p.hasTaumoeba) return { ok: false, text: `No life signs on ${p.name}: nothing to sample.` };
  const m = scanMap(state, planetId), hs = m.hotspots.find((q) => q.id === hotspotId);
  if (!hs) return { ok: false, text: 'Pick a hotspot on the scan map.' };
  if (!hs.revealed) return { ok: false, text: 'That hotspot has not been swept yet.' };
  const prev = state.sampling && state.sampling.planetId === planetId && state.sampling.hotspotId === hotspotId ? state.sampling.attempts : 0;
  state.sampling = { planetId, hotspotId, depth: 0, tension: 0.05, heat: 0, progress: 0, t: 0, status: 'active', richness: hs.richness,
    bandBase: hs.bandCenter, seed: mixSeed(p.seed >>> 0, hashStr(hotspotId)) % 100000, attempts: prev + 1, lastDepth: 0 };
  return { ok: true, text: `Lowering the chain over hotspot ${hotspotId.toUpperCase()}.`, session: snapshot(state.sampling) };
}

const SUB = 0.05;
export function sampleStep(state, { depthDelta = 0, dt = 1 / 60 } = {}) {
  const s = state.sampling;
  if (!s) return { ok: false, status: 'none', text: 'No sampling in progress.' };
  if (s.status !== 'active') return snapshot(s);
  dt = clamp(dt, 0, 0.25);
  const n = Math.max(1, Math.ceil(dt / SUB)), h = dt / n, dd = depthDelta / n;
  for (let i = 0; i < n && s.status === 'active'; i++) {
    s.depth = clamp(s.depth + dd, 0, 1);
    s.t += h;
    const c = bandAt(s, s.t), speed = h > 0 ? Math.abs(dd) / h : 0, g = gustAt(s.seed, s.t), gp = Math.max(0, g) ** 2;
    // tension: lags toward a target that grows with depth, gusts and how fast the chain is paid out
    const tt = 0.07 + 0.5 * s.depth + 0.32 * gp * (0.3 + s.depth) + 0.3 * speed * Math.min(1, s.depth * 2);
    s.tension += (tt - s.tension) * Math.min(1, 3.5 * h);
    // heat: fast below the band, a trickle inside it, cools above
    const lo = c - PROBE.bandHalf, hi = c + PROBE.bandHalf;
    if (s.depth > hi) s.heat += (0.45 + 2.2 * (s.depth - hi)) * h;
    else if (s.depth >= lo) s.heat += 0.03 * h;
    else s.heat -= 0.3 * h;
    s.heat = clamp(s.heat, 0, 1);
    if (s.depth >= lo && s.depth <= hi) s.progress += (h / PROBE.holdSec) * s.richness;
    else s.progress -= PROBE.decay * h;
    s.progress = clamp(s.progress, 0, 1);
    if (s.tension >= 1) { s.tension = 1; s.status = 'snapped'; }
    else if (s.heat >= 1) { s.status = 'burned'; }
    else if (s.progress >= 1) s.status = 'success';
  }
  const f = findPlanet(state, s.planetId), name = f ? f.planet.name : 'the planet';
  if (s.status === 'success') {
    const r = collectSample(state, s.planetId, 'tether');
    return snapshot(s, { text: r.text, cost: r.cost });
  }
  if (s.status === 'snapped' || s.status === 'burned') {
    const snapped = s.status === 'snapped';
    state.ship.hull = Math.max(0.05, state.ship.hull - (snapped ? PROBE.hullSnap : PROBE.hullBurn));
    state.ship.chainLost = (state.ship.chainLost || 0) + 1;
    const cost = spend(state, { years: PROBE.failYears }, tick);
    const text = snapped ? `The chain snapped under tension at ${name}. Probe segment lost, hull scraped, a day gone.`
      : `The probe burned up below the band at ${name}. Probe segment lost, hull scorched, a day gone.`;
    addLog(state, text);
    return snapshot(s, { text, cost });
  }
  return snapshot(s);
}
export function endSample(state) {
  const success = state.sampling?.status === 'success';
  state.sampling = null;
  if (success) ensurePrologueSampleStrain(state);
  return { ok: true };
}

// ---- helper path for tests / scripted runs: sweep, pick the first hotspot and fly the probe with a perfect controller ----
export function autoSample(state, planetId, { maxSteps = 4000 } = {}) {
  const b = scanBegin(state, planetId);
  const sc = state.stars.flatMap((s) => s.planets).find((x) => x.id === planetId)?.scan;
  if (!b.ok && !(sc && sc.coverage >= SCAN.fullAt)) return b;
  if (sc && sc.active) scanProgress(state, planetId, 1);
  const m = scanMap(state, planetId), hs = m && m.hotspots.find((q) => q.revealed);
  if (!hs) return { ok: false, text: 'No hotspot to sample.' };
  const bs = beginSample(state, planetId, hs.id);
  if (!bs.ok) return bs;
  const dt = 1 / 30;
  for (let i = 0; i < maxSteps; i++) {
    const s = state.sampling, c = bandAt(s, s.t + dt);
    const want = clamp(c - s.depth, -PROBE.reelSpeed * dt, PROBE.lowerSpeed * dt);
    const r = sampleStep(state, { depthDelta: want, dt });
    if (r.status === 'success') { endSample(state); return { ok: true, text: r.text, cost: r.cost }; }
    if (r.status !== 'active') { endSample(state); return { ok: false, text: r.text || r.status }; }
  }
  return { ok: false, text: 'Sampling timed out.' };
}
