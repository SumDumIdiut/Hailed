import { createRng, mixSeed, hashStr } from './rng.js';

const H = (h) => h * 15 * Math.PI / 180, D = (d) => d * Math.PI / 180;
function xyz(raH, decDeg, dist) {
  const ra = H(raH), de = D(decDeg);
  return [dist * Math.cos(de) * Math.cos(ra), dist * Math.cos(de) * Math.sin(ra), dist * Math.sin(de)];
}
const CLASS_COLOR = {
  A: [0.78, 0.85, 1.0], F: [0.98, 0.96, 0.9], G: [1.0, 0.93, 0.74],
  K: [1.0, 0.8, 0.55], M: [1.0, 0.6, 0.4],
};
// raH, decDeg, dist(ly), lum (solar), radius (solar), mass (solar)
const CATALOG = [
  { id: 'sol', name: 'Sol', ra: 0, dec: 0, dist: 0, spectral: 'G2V', lum: 1.0, radius: 1.0, mass: 1.0 },
  { id: 'tauceti', name: 'Tau Ceti', ra: 1.734, dec: -15.94, dist: 11.9, spectral: 'G8V', lum: 0.52, radius: 0.79, mass: 0.78 },
  { id: 'eri40', name: '40 Eridani', ra: 4.2, dec: -7.65, dist: 16.3, spectral: 'K1V', lum: 0.44, radius: 0.81, mass: 0.84 },
  { id: 'alphacen', name: 'Alpha Centauri A', ra: 14.66, dec: -60.83, dist: 4.37, spectral: 'G2V', lum: 1.52, radius: 1.22, mass: 1.1 },
  { id: 'epseri', name: 'Epsilon Eridani', ra: 3.55, dec: -9.46, dist: 10.5, spectral: 'K2V', lum: 0.34, radius: 0.74, mass: 0.82 },
  { id: 'barnard', name: "Barnard's Star", ra: 17.96, dec: 4.69, dist: 5.96, spectral: 'M4V', lum: 0.0035, radius: 0.19, mass: 0.16 },
  { id: 'sirius', name: 'Sirius A', ra: 6.75, dec: -16.72, dist: 8.6, spectral: 'A1V', lum: 25.4, radius: 1.71, mass: 2.06 },
  { id: 'procyon', name: 'Procyon A', ra: 7.655, dec: 5.22, dist: 11.46, spectral: 'F5IV', lum: 6.9, radius: 2.05, mass: 1.48 },
  { id: 'cyg61', name: '61 Cygni A', ra: 21.115, dec: 38.75, dist: 11.4, spectral: 'K5V', lum: 0.15, radius: 0.67, mass: 0.7 },
  { id: 'wolf359', name: 'Wolf 359', ra: 10.94, dec: 7.01, dist: 7.86, spectral: 'M6V', lum: 0.001, radius: 0.16, mass: 0.11 },
  { id: 'luyten', name: "Luyten's Star", ra: 7.45, dec: 5.23, dist: 12.35, spectral: 'M3V', lum: 0.0088, radius: 0.29, mass: 0.26 },
  { id: 'ross128', name: 'Ross 128', ra: 11.79, dec: 0.8, dist: 11.0, spectral: 'M4V', lum: 0.0036, radius: 0.2, mass: 0.17 },
];
// Fixed orbits (AU) for stars with story planets.
const FIXED_ORBITS = {
  tauceti: [0.28, 0.5, 0.85, 1.9, 4.4, 9.5],
  eri40: [0.16, 0.42, 0.95, 1.9, 5.2],
};
const START_INFECTION = { sol: 0.05, tauceti: 0.15, eri40: 0.07 };

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const jit = (rng, c, a = 0.06) => c.map((v) => clamp01(v + rng.range(-a, a)));
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

function makePlanet(star, idx, orbit, type, rng, name) {
  const gas = type === 'gas';
  const radius = gas ? rng.range(3, 11) : type === 'ice' ? rng.range(0.4, 1.6) : rng.range(0.4, 1.8);
  const [ac, dlo, dhi] = ATMO[type];
  const pal = gas ? rng.pick(GAS_PALS) : PAL[type];
  const p = {
    id: `${star.id}-${idx + 1}`, name: name || `${star.name} ${ROMAN[idx] || idx + 1}`,
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

function solPlanets(star) {
  const mk = (i, name, type, radius, orbit, extra = {}) => {
    const rng = createRng(mixSeed(hashStr('sol'), i));
    const p = makePlanet(star, i, orbit, type, rng, name);
    p.radius = radius; p.periodDays = +(365.25 * Math.sqrt(orbit ** 3)).toFixed(1);
    p.rings = null;
    return Object.assign(p, extra);
  };
  const earth = mk(2, 'Earth', 'ocean', 1.0, 1.0, {
    special: 'earth', atmo: { color: [0.3, 0.55, 1.0], density: 0.55 },
    palette: [[0.04, 0.2, 0.5], [0.15, 0.4, 0.2], [0.55, 0.5, 0.35], [0.95, 0.96, 1.0]], periodDays: 365.25,
  });
  const saturn = mk(5, 'Saturn', 'gas', 9.4, 9.5, {
    palette: [[0.88, 0.8, 0.6], [0.75, 0.66, 0.46], [0.93, 0.88, 0.72], [0.6, 0.5, 0.36]],
    atmo: { color: [0.85, 0.78, 0.6], density: 0.9 },
    rings: { inner: 1.25, outer: 2.3, color: [0.82, 0.74, 0.6], opacity: 0.8 },
  });
  const jup = mk(4, 'Jupiter', 'gas', 11, 5.2, {
    palette: [[0.85, 0.7, 0.5], [0.7, 0.5, 0.35], [0.92, 0.85, 0.7], [0.55, 0.38, 0.28]],
    atmo: { color: [0.85, 0.75, 0.6], density: 0.9 },
  });
  return [
    mk(0, 'Mercury', 'rocky', 0.38, 0.39, { atmo: { color: [0.5, 0.5, 0.5], density: 0.02 } }),
    mk(1, 'Venus', 'desert', 0.95, 0.72, { atmo: { color: [0.95, 0.8, 0.5], density: 0.95 } }),
    earth,
    mk(3, 'Mars', 'desert', 0.53, 1.52, { atmo: { color: [0.9, 0.6, 0.45], density: 0.08 } }),
    jup, saturn,
  ];
}

function genPlanets(star, seed, specialIdx) {
  const rng = createRng(mixSeed(seed, hashStr(star.id)));
  const hz = Math.sqrt(star.lum0);
  const fixed = FIXED_ORBITS[star.id];
  const M = star.spectral[0] === 'M';
  const count = fixed ? fixed.length : M ? rng.int(1, 4) : rng.int(3, 7);
  let a = Math.max(0.03, hz * rng.range(0.15, 0.4));
  const out = [];
  for (let i = 0; i < count; i++) {
    const orbit = fixed ? fixed[i] : a;
    if (!fixed) a *= rng.range(1.45, 2.0);
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
  const sp = specialIdx[star.id];
  if (sp) {
    const p = out[sp.index];
    Object.assign(p, sp.props(rng));
  }
  return out;
}

const SPECIAL = {
  tauceti: {
    index: 2, props: (rng) => ({
      name: 'Adrian', type: 'rocky', radius: 1.3, special: 'adrian', hasTaumoeba: true, rings: null,
      atmo: { color: [0.85, 0.55, 0.3], density: 0.95 },
      palette: [[0.55, 0.32, 0.2], [0.4, 0.22, 0.15], [0.7, 0.5, 0.3], [0.25, 0.15, 0.1]],
    }),
  },
  eri40: {
    index: 1, props: () => ({
      name: 'Erid', type: 'rocky', radius: 1.7, special: 'erid', rings: null,
      atmo: { color: [0.75, 0.6, 0.35], density: 1.0 },
      palette: [[0.5, 0.38, 0.25], [0.35, 0.26, 0.18], [0.65, 0.5, 0.3], [0.2, 0.15, 0.1]],
    }),
  },
};

export function createStars(seed) {
  return CATALOG.map((c) => {
    const pos = xyz(c.ra, c.dec, c.dist).map((v) => +v.toFixed(3));
    const inf = START_INFECTION[c.id] ?? +(0.01 + createRng(mixSeed(seed, hashStr(c.id))).next() * 0.03).toFixed(4);
    const star = {
      id: c.id, name: c.name, spectral: c.spectral, pos, color: CLASS_COLOR[c.spectral[0]].slice(),
      lum0: c.lum, lum: c.lum, infection: inf, radius: c.radius, mass: c.mass, planets: [],
    };
    star.lum = star.lum0 * (1 - 0.5 * inf);
    star.planets = c.id === 'sol' ? solPlanets(star) : genPlanets(star, seed, SPECIAL);
    return star;
  });
}
export function findStar(state, id) { return state.stars.find((s) => s.id === id) || null; }
export function findPlanet(state, id) {
  for (const s of state.stars) for (const p of s.planets) if (p.id === id) return { star: s, planet: p };
  return null;
}
export function starDistance(a, b) {
  return Math.hypot(a.pos[0] - b.pos[0], a.pos[1] - b.pos[1], a.pos[2] - b.pos[2]);
}
