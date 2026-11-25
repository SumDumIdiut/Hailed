import { stateRng } from './rng.js';
import { starDistance, findStar } from './stars.js';
import { addLog } from './util.js';

export const DIM_K = 0.5;          // lum = lum0 * (1 - DIM_K * infection)
export const EXTINCT_FRAC = 0.85;  // world dies when lum < 0.85 * lum0  (infection > 0.3)
export const INFECTION_LIMIT = (1 - EXTINCT_FRAC) / DIM_K;
const GROWTH = { A: 0.08, F: 0.07, G: 0.052, K: 0.058, M: 0.045 };
const SPREAD_RATE = 0.6, SPREAD_SEED = 0.01, SPREAD_LEN = 6;
const STEP = 0.25;

const RATE_OVERRIDE = { sol: 0.046 };
export function growthRate(star) { return RATE_OVERRIDE[star.id] ?? GROWTH[star.spectral[0]] ?? 0.05; }
// Net logistic parameters: dI/dt = a*I - r*I^2
export function dynamics(state, star) {
  const r = growthRate(star);
  let m = 0;
  if (star.id === 'tauceti') m = 0.85 * r;                 // natural Taumoeba predator -> equilibrium I = 0.15
  if (state.delivered[star.id]) m = 2.5 * r;                // delivered Taumoeba hunt Astrophage
  return { r, a: r - m };
}
function advance(I, a, r, h) {
  if (I <= 0) return 0;
  if (Math.abs(a) < 1e-9) return I / (1 + r * I * h);
  const e = Math.exp(a * h);
  return Math.min(1, (a * I * e) / (a + r * I * (e - 1)));
}
export function updateLum(star) { star.lum = star.lum0 * (1 - DIM_K * star.infection); }

function step(state, h) {
  const rng = stateRng(state);
  const stars = state.stars;
  for (const s of stars) {
    const { r, a } = dynamics(state, s);
    s.infection = advance(s.infection, a, r, h);
  }
  // Petrova-line spread: infected stars seed others, probability falls off with distance.
  for (const src of stars) {
    if (src.infection < 0.02) continue;
    for (const dst of stars) {
      if (dst === src) continue;
      const w = Math.exp(-starDistance(src, dst) / SPREAD_LEN);
      if (rng.next() < h * SPREAD_RATE * w * src.infection) {
        dst.infection = Math.min(1, dst.infection + SPREAD_SEED * (0.5 + w));
      }
    }
  }
  for (const s of stars) updateLum(s);
}

export function tick(state, dtYears) {
  let left = dtYears;
  while (left > 1e-12 && state.status === 'playing') {
    const h = Math.min(STEP, left);
    step(state, h);
    state.time.worldYears += h;
    left -= h;
    checkEnd(state);
  }
  return state;
}

const WORLDS = { earth: 'sol', erid: 'eri40' };
const WORLD_NAME = { sol: 'Earth', eri40: 'Erid' };
export function checkEnd(state) {
  if (state.status !== 'playing') return;
  for (const id of ['sol', 'eri40']) {
    const s = findStar(state, id);
    if (s.lum < EXTINCT_FRAC * s.lum0) {
      state.status = 'lost';
      state.statusText = `${s.name} has dimmed past the point of no return. ${WORLD_NAME[id]} will not survive. The Taumoeba arrived too late.`;
      addLog(state, state.statusText);
      return;
    }
  }
  if (state.delivered.sol && state.delivered.eri40) {
    state.status = 'won';
    state.statusText = 'Taumoeba are hunting Astrophage at both Sol and 40 Eridani. Earth and Erid are saved.';
    addLog(state, state.statusText);
  }
}

// Years until the world's star drops below the extinction threshold at the current trend (no future spread).
export function extinctionYears(state, which) {
  const star = findStar(state, WORLDS[which] || which);
  if (!star) return Infinity;
  if (star.lum < EXTINCT_FRAC * star.lum0) return 0;
  const { r, a } = dynamics(state, star);
  const I0 = star.infection;
  if (a <= 0 || I0 <= 0) return Infinity;
  const K = a / r;
  if (INFECTION_LIMIT >= K) return Infinity;
  const t = -Math.log((K / INFECTION_LIMIT - 1) / (K / I0 - 1)) / a;
  return Math.max(0, t);
}
