import { createRng, mixSeed, hashStr, stateRng } from './rng.js';
import { starDistance } from './stars.js';
import { addLog } from './util.js';

const CLASS_COLOR = {
  A: [0.78, 0.85, 1.0], F: [0.98, 0.96, 0.9], G: [1.0, 0.93, 0.74],
  K: [1.0, 0.8, 0.55], M: [1.0, 0.6, 0.4],
};
const CLASS_WEIGHTS = [
  { c: 'M', w: 0.62 }, { c: 'K', w: 0.20 }, { c: 'G', w: 0.10 },
  { c: 'F', w: 0.05 }, { c: 'A', w: 0.03 },
];
const CLASS_DATA = {
  M: { lum: [0.001, 0.08], radius: [0.1, 0.6], mass: [0.08, 0.6] },
  K: { lum: [0.1, 0.6], radius: [0.6, 0.9], mass: [0.6, 0.9] },
  G: { lum: [0.6, 1.5], radius: [0.9, 1.2], mass: [0.8, 1.2] },
  F: { lum: [1.5, 6.0], radius: [1.2, 1.8], mass: [1.2, 1.6] },
  A: { lum: [6.0, 25.0], radius: [1.7, 2.5], mass: [1.7, 2.5] },
};
const PAL = {
  rocky: [[0.45, 0.4, 0.35], [0.35, 0.3, 0.27], [0.6, 0.55, 0.48], [0.25, 0.22, 0.2]],
  ocean: [[0.04, 0.18, 0.5], [0.1, 0.4, 0.3], [0.55, 0.5, 0.35], [0.9, 0.92, 0.95]],
  ice: [[0.85, 0.9, 0.95], [0.6, 0.75, 0.88], [0.45, 0.55, 0.7]],
  lava: [[0.12, 0.06, 0.05], [0.9, 0.3, 0.05], [0.35, 0.12, 0.06], [1.0, 0.6, 0.1]],
  desert: [[0.8, 0.6, 0.35], [0.65, 0.42, 0.22], [0.9, 0.75, 0.5], [0.5, 0.3, 0.18]],
};
const GAS_PALS = [
  [[0.85, 0.7, 0.5], [0.7, 0.5, 0.35], [0.92, 0.85, 0.7], [0.55, 0.38, 0.28]],
  [[0.55, 0.7, 0.85], [0.35, 0.5, 0.75], [0.8, 0.88, 0.95], [0.25, 0.35, 0.6]],
  [[0.8, 0.75, 0.55], [0.9, 0.85, 0.7], [0.65, 0.55, 0.4]],
  [[0.5, 0.75, 0.7], [0.3, 0.55, 0.55], [0.75, 0.9, 0.85]],
];
const ATMO = {
  rocky: [[0.6, 0.65, 0.75], 0.1, 0.5], ocean: [[0.35, 0.55, 1.0], 0.5, 0.8],
  ice: [[0.7, 0.82, 1.0], 0.1, 0.4], lava: [[1.0, 0.55, 0.3], 0.3, 0.7],
  gas: [[0.8, 0.75, 0.6], 0.8, 1.0], desert: [[0.9, 0.7, 0.5], 0.2, 0.6],
};
const ROMAN = ['b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'];

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const jit = (rng, c, a = 0.06) => c.map((v) => clamp01(v + rng.range(-a, a)));

function pickClass(rng) {
  const r = rng.next();
  let acc = 0;
  for (const { c, w } of CLASS_WEIGHTS) { acc += w; if (r < acc) return c; }
  return 'M';
}

function makePlanet(star, idx, orbit, type, rng, name) {
  const gas = type === 'gas';
  const radius = gas ? rng.range(3, 11) : type === 'ice' ? rng.range(0.4, 1.6) : rng.range(0.4, 1.8);
  const [ac, dlo, dhi] = ATMO[type];
  const pal = gas ? rng.pick(GAS_PALS) : PAL[type];
  const letter = ROMAN[idx] || (idx + 1);
  const p = {
    id: `${star.id}-${letter}`, name: name || `${star.name} ${letter}`,
    seed: rng.int(1, 2147483646), type,
    radius: +radius.toFixed(2), orbit: +orbit.toFixed(3), phase: +rng.range(0, Math.PI * 2).toFixed(3),
    periodDays: +(365.25 * Math.sqrt(orbit ** 3 / star.mass)).toFixed(1),
    atmo: { color: jit(rng, ac, 0.05), density: +rng.range(dlo, dhi).toFixed(2) },
    palette: pal.map((c) => jit(rng, c)),
    rings: null, hasTaumoeba: false, scanned: false, scanLevel: 0, sampled: false, special: null,
  };
  if ((gas && rng.chance(0.4)) || (type === 'ice' && radius > 1.2 && rng.chance(0.1))) {
    p.rings = {
      inner: +rng.range(1.3, 1.6).toFixed(2), outer: +rng.range(1.9, 2.6).toFixed(2),
      color: jit(rng, [0.8, 0.72, 0.6], 0.08), opacity: +rng.range(0.4, 0.85).toFixed(2),
    };
  }
  return p;
}

function genPlanets(star, seed) {
  const rng = createRng(mixSeed(seed, hashStr(star.id)));
  const hz = Math.sqrt(star.lum0);
  const M = star.spectral[0] === 'M';
  const count = M ? rng.int(1, 4) : rng.int(3, 7);
  let a = Math.max(0.03, hz * rng.range(0.15, 0.4));
  const out = [];
  for (let i = 0; i < count; i++) {
    const orbit = a;
    a *= rng.range(1.45, 2.0);
    const x = orbit / hz, r = rng.next();
    let type;
    if (x < 0.5) type = r < 0.6 ? 'lava' : 'rocky';
    else if (x < 0.8) type = r < 0.5 ? 'desert' : 'rocky';
    else if (x < 1.5) type = r < 0.35 ? 'ocean' : r < 0.65 ? 'rocky' : 'desert';
    else if (x < 3) type = r < 0.35 ? 'gas' : r < 0.7 ? 'ice' : 'rocky';
    else type = r < 0.6 ? 'gas' : 'ice';
    if (M && type === 'gas') type = 'ice';
    out.push(makePlanet(star, i, orbit, type, rng));
  }
  return out;
}

export function extendGalaxy(stars, seed, { count = 48, radiusLy = 25 } = {}) {
  const out = [];
  const existing = stars.slice();
  for (let i = 0; i < count; i++) {
    const rng = createRng(mixSeed(seed, hashStr(`galaxy-star-${i}`)));
    const cls = pickClass(rng);
    const data = CLASS_DATA[cls];
    // position with spacing
    let pos = null;
    for (let attempt = 0; attempt < 5000; attempt++) {
      const r = radiusLy * Math.cbrt(rng.next());
      const theta = Math.acos(2 * rng.next() - 1);
      const phi = rng.next() * Math.PI * 2;
      const cand = [
        +(r * Math.sin(theta) * Math.cos(phi)).toFixed(3),
        +(r * Math.sin(theta) * Math.sin(phi)).toFixed(3),
        +(r * Math.cos(theta)).toFixed(3),
      ];
      let ok = true;
      for (const s of existing) {
        if (starDistance({ pos: cand }, s) < 1.2) { ok = false; break; }
      }
      if (ok) { pos = cand; break; }
    }
    if (!pos) {
      const r = radiusLy * Math.cbrt(rng.next());
      const theta = Math.acos(2 * rng.next() - 1);
      const phi = rng.next() * Math.PI * 2;
      pos = [
        +(r * Math.sin(theta) * Math.cos(phi)).toFixed(3),
        +(r * Math.sin(theta) * Math.sin(phi)).toFixed(3),
        +(r * Math.cos(theta)).toFixed(3),
      ];
    }
    const id = `g-${i}`;
    const spectral = `${cls}${rng.int(0, 9)}V`;
    const lum0 = +rng.range(data.lum[0], data.lum[1]).toFixed(4);
    const radius = +rng.range(data.radius[0], data.radius[1]).toFixed(2);
    const mass = +rng.range(data.mass[0], data.mass[1]).toFixed(2);
    const nameRoll = rng.int(0, 2);
    let name;
    if (nameRoll === 0) name = `HD ${rng.int(40000, 49999)}`;
    else if (nameRoll === 1) name = `Gliese ${rng.int(800, 899)}`;
    else name = `LHS ${rng.int(2000, 2999)}`;
    const infRng = createRng(mixSeed(seed, hashStr(id)));
    const infection = +(0.01 + infRng.next() * 0.03).toFixed(4);
    const star = {
      id, name, spectral, pos: pos.slice(), color: CLASS_COLOR[cls].slice(),
      lum0, lum: lum0 * (1 - 0.5 * infection), infection, radius, mass, planets: [],
    };
    star.planets = genPlanets(star, seed);
    existing.push(star);
    out.push(star);
  }
  // Repair pass: relocate any star that ended up isolated (>9 ly from every other)
  // so the lane graph can connect it, while preserving min spacing.
  const repairRng = createRng(mixSeed(seed, 0x9999));
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < out.length; i++) {
      const s = out[i];
      const others = [...stars, ...out.filter((_, idx) => idx !== i)];
      const nearest = Math.min(...others.map((o) => starDistance(s, o)));
      if (nearest <= 9) continue;
      for (let attempt = 0; attempt < 2000; attempt++) {
        const anchor = others[Math.floor(repairRng.next() * others.length)];
        const r = 3 + repairRng.next() * 6;
        const theta = Math.acos(2 * repairRng.next() - 1);
        const phi = repairRng.next() * Math.PI * 2;
        const cand = [
          +(anchor.pos[0] + r * Math.sin(theta) * Math.cos(phi)).toFixed(3),
          +(anchor.pos[1] + r * Math.sin(theta) * Math.sin(phi)).toFixed(3),
          +(anchor.pos[2] + r * Math.cos(theta)).toFixed(3),
        ];
        const d0 = Math.hypot(cand[0], cand[1], cand[2]);
        if (d0 > radiusLy) continue;
        let ok = true;
        for (const o of others) if (starDistance({ pos: cand }, o) < 1.2) { ok = false; break; }
        if (!ok) continue;
        s.pos = cand;
        break;
      }
    }
  }
  return out;
}

export function buildLanes(stars, seed) {
  const sortedStars = stars.slice().sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const edgeSet = new Set();
  for (const s of sortedStars) {
    const cands = sortedStars
      .filter((o) => o.id !== s.id)
      .map((o) => ({ id: o.id, d: starDistance(s, o) }))
      .sort((a, b) => (a.d !== b.d ? a.d - b.d : String(a.id).localeCompare(String(b.id))));
    const within = cands.filter((c) => c.d <= 9);
    let pick = within.slice(0, 3);
    if (pick.length === 0 && cands.length) pick = [cands[0]];
    for (const c of pick) {
      edgeSet.add([s.id, c.id].sort().join('|'));
    }
  }
  const lanes = [...edgeSet].map((k) => {
    const [a, b] = k.split('|');
    return { a, b };
  });
  lanes.sort((x, y) => (x.a + x.b).localeCompare(y.a + y.b));
  return lanes;
}

export function initKnowledge(state) {
  const seed = (state && state.seed) != null ? state.seed : 1;
  const lanes = buildLanes(state.stars, seed);
  const known = {};
  const tauceti = (state.stars || []).find((s) => s.id === 'tauceti');
  for (const s of state.stars || []) {
    if (s.id === 'sol' || s.id === 'tauceti' || s.id === 'eri40') known[s.id] = true;
    else if (tauceti && starDistance(s, tauceti) <= 6) known[s.id] = true;
  }
  state.galaxy = { lanes, known, surveyed: {}, relays: [] };
  return state.galaxy;
}

export function revealAround(state, starId, radiusLy) {
  if (!state.galaxy) initKnowledge(state);
  const center = (state.stars || []).find((s) => s.id === starId);
  if (!center) return 0;
  let added = 0;
  for (const s of state.stars || []) {
    if (starDistance(s, center) <= radiusLy) {
      if (!state.galaxy.known[s.id]) added++;
      state.galaxy.known[s.id] = true;
    }
  }
  return added;
}

export function buildRelay(state, starId) {
  if (!state.galaxy) initKnowledge(state);
  if (state.galaxy.relays.includes(starId)) return false;
  state.galaxy.relays.push(starId);
  revealAround(state, starId, 10);
  return true;
}

export function spreadTick(state, dtYears) {
  if (!state.galaxy) initKnowledge(state);
  const lanes = (state.galaxy && state.galaxy.lanes) || buildLanes(state.stars, state.seed ?? 1);
  if (!state.galaxy) state.galaxy = { lanes, known: {}, surveyed: {}, relays: [] };
  state.galaxy.lanes = lanes;
  const rng = stateRng(state);
  const byId = new Map((state.stars || []).map((s) => [s.id, s]));
  const sortedLanes = lanes.slice().sort((a, b) => (String(a.a) + String(a.b)).localeCompare(String(b.a) + String(b.b)));
  for (const lane of sortedLanes) {
    for (const [srcId, dstId] of [[lane.a, lane.b], [lane.b, lane.a]]) {
      const src = byId.get(srcId);
      const dst = byId.get(dstId);
      if (!src || !dst) continue;
      if (src.saved === true || dst.saved === true) continue;
      if (!(src.infection > 0.25)) continue;
      const prob = 0.04 * (dtYears || 0) * src.infection;
      if (rng.chance(Math.min(1, Math.max(0, prob)))) {
        const wasKnown = !!(state.galaxy.known && state.galaxy.known[dst.id]);
        dst.infection = Math.max(dst.infection || 0, 0.02);
        if (wasKnown) addLog(state, `Astrophage signatures detected at ${dst.name}.`);
      }
    }
  }
  for (const s of state.stars || []) {
    if (typeof s.lum0 === 'number') s.lum = s.lum0 * (1 - 0.5 * (s.infection || 0));
  }
  return state;
}

export function genPois(stars, seed) {
  const rng = createRng(mixSeed((seed == null ? 0 : seed), 0x501));
  const pois = [];
  const pairList = [];
  for (let i = 0; i < stars.length; i++) {
    for (let j = i + 1; j < stars.length; j++) {
      pairList.push({ i, j, d: starDistance(stars[i], stars[j]) });
    }
  }
  pairList.sort((a, b) => a.d - b.d);
  const usedPairs = new Set();
  const buoyCount = 5;
  for (let b = 0; b < buoyCount; b++) {
    let pair = null;
    for (const p of pairList) {
      const key = `${p.i}:${p.j}`;
      if (!usedPairs.has(key)) { usedPairs.add(key); pair = p; break; }
    }
    if (!pair) break;
    const a = stars[pair.i], c = stars[pair.j];
    const mid = [(a.pos[0] + c.pos[0]) / 2, (a.pos[1] + c.pos[1]) / 2, (a.pos[2] + c.pos[2]) / 2];
    const pos = mid.map((v) => +(v + rng.range(-0.5, 0.5)).toFixed(3));
    pois.push({ id: `poi-${pois.length}`, kind: 'buoy', pos, name: `Buoy ${b + 1}`, used: false });
  }
  const kinds = ['derelict', 'rogue', 'cloud', 'nebula', 'wreck'];
  while (pois.length < 25) {
    const kind = rng.pick(kinds);
    const i = rng.int(0, stars.length - 1);
    const j = rng.int(0, stars.length - 1);
    let pos;
    if (i !== j && stars[i] && stars[j]) {
      const a = stars[i], c = stars[j];
      const mid = [(a.pos[0] + c.pos[0]) / 2, (a.pos[1] + c.pos[1]) / 2, (a.pos[2] + c.pos[2]) / 2];
      pos = mid.map((v) => +(v + rng.range(-1.5, 1.5)).toFixed(3));
    } else {
      const s = stars[i];
      pos = (s ? s.pos : [0, 0, 0]).map((v) => +(v + rng.range(-3, 3)).toFixed(3));
    }
    pois.push({ id: `poi-${pois.length}`, kind, pos, name: `${kind[0].toUpperCase()}${kind.slice(1)} ${pois.length + 1}`, used: false });
  }
  return pois;
}