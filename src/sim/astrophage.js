import { stateRng } from './rng.js';
import { starDistance, findStar } from './stars.js';
import { addLog } from './util.js';
import { advanceAct, completePrologue } from './campaign.js';
import { isPrologue } from './prologue.js';

export const DIM_K = 0.5;          // lum = lum0 * (1 - DIM_K * infection)
export const EXTINCT_FRAC = 0.85;  // world dies when lum < 0.85 * lum0  (infection > 0.3)
export const INFECTION_LIMIT = (1 - EXTINCT_FRAC) / DIM_K;
const GROWTH = { A: 0.08, F: 0.07, G: 0.052, K: 0.058, M: 0.045 };
// Act I keeps the original Petrova-line numbers exactly. Later acts slow the star-to-star
// spread (otherwise every procedural world goes dark in a century) and set a gentler
// growth curve, so a star detected along the lanes has years of runway instead of weeks.
const SPREAD_RATE = 0.6, SPREAD_SEED = 0.01, SPREAD_LEN = 6;
const LATE_SPREAD_RATE = 0.002, LATE_SPREAD_SEED = 0.0005, LATE_SPREAD_LEN = 4;
const LATE_GROWTH_MUL = 0.6;
const STEP = 0.25;

const RATE_OVERRIDE = { sol: 0.046 };
export function growthRate(star) { return RATE_OVERRIDE[star.id] ?? GROWTH[star.spectral[0]] ?? 0.05; }
// Net logistic parameters: dI/dt = a*I - r*I^2
export function dynamics(state, star) {
  const rate = growthRate(star);
  let m = 0;
  if (star.id === 'tauceti') m = 0.85 * rate;              // natural Taumoeba predator -> equilibrium I = 0.15
  if (state.delivered[star.id] || star.saved) m = 2.5 * rate; // delivered Taumoeba hunt Astrophage
  const mul = (state.campaign?.act ?? 1) >= 2 ? LATE_GROWTH_MUL : 1;
  // Newly detected lane stars take far longer to mature than the original targets.
  const detected = star.extra ? 0.2 : 1;
  return { r: rate * mul * detected, a: (rate - m) * mul * detected };
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
  // Act I keeps the exact old spread stream: procedural stars only draw RNG once act II opens.
  const stars = state.campaign?.act === 1 ? state.stars.filter((s) => !s.procedural) : state.stars;
  for (const s of stars) {
    const { r, a: net } = dynamics(state, s);
    const a = state.campaign?.mode === 'endless' ? net * (state.campaign.difficulty ?? 1) : net;
    s.infection = advance(s.infection, a, r, h);
  }
  // Petrova-line spread: infected stars seed others, probability falls off with distance.
  const late = (state.campaign?.act ?? 1) >= 2;
  const spreadRate = late ? LATE_SPREAD_RATE : SPREAD_RATE;
  const spreadSeed = late ? LATE_SPREAD_SEED : SPREAD_SEED;
  const spreadLen = late ? LATE_SPREAD_LEN : SPREAD_LEN;
  for (const src of stars) {
    if (src.infection < 0.02 || src.saved) continue;
    for (const dst of stars) {
      if (dst === src) continue;
      const w = Math.exp(-starDistance(src, dst) / spreadLen);
      if (rng.next() < h * spreadRate * w * src.infection) {
        dst.infection = Math.min(1, dst.infection + spreadSeed * (0.5 + w));
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
  if (state.campaign?.mode === 'endless') return;  // endless win/lose is handled by campaignTick
  for (const id of ['sol', 'eri40']) {
    const s = findStar(state, id);
    if (s.lum < EXTINCT_FRAC * s.lum0) {
      if (state.campaign && !s.dark) {
        s.dark = true;
        if (!Array.isArray(state.campaign.dark)) state.campaign.dark = [];
        state.campaign.dark.push(s.id);
        addLog(state, `${s.name} has gone dark. The Astrophage has taken another world.`);
      }
      state.status = 'lost';
      state.statusText = `${s.name} has dimmed past the point of no return. ${WORLD_NAME[id]} will not survive. The Taumoeba arrived too late.`;
      addLog(state, state.statusText);
      return;
    }
  }
  if (state.delivered.sol && state.delivered.eri40) {
    // Saves without the campaign still win here; a campaign moves on to act II.
    if (state.campaign) {
      // A prologue that reaches both flags by another route still closes properly.
      if (isPrologue(state)) completePrologue(state);
      else advanceAct(state);
      return;
    }
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
