// Multi-trait Taumoeba genetics (plan S3): strains carry six trait levels instead of one tolerance.
// Every star has a deterministic biosphere profile of what its atmosphere demands, and a delivery works
// when a strain covers that profile. Pure logic, no DOM, deterministic randomness from state.rng.
import { stateRng } from './rng.js';
import { tick } from './astrophage.js';
import { addLog, spendTime } from './util.js';
import { COSTS } from './ship.js';
import { effectMul } from './tech.js';
import { drawEvent } from './events.js';
import { isPrologue, prologueProfile, prologueBreedPush } from './prologue.js';

export const TRAITS = ['nitrogen', 'co2', 'cold', 'heat', 'radiation', 'vigor'];
export const BIOSPHERE = ['nitrogen', 'co2', 'cold', 'heat', 'radiation'];   // the atmospheric traits a strain must cover
export const MAX_STRAINS = 8;
export const REQUIREMENT_MAX = 0.95;    // no biosphere ever demands more than this

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

export function geneticsOf(state) {
  if (!state.genetics) state.genetics = { strains: [], nextId: 1, best: null };
  return state.genetics;
}

// Deterministic biosphere requirements for a star (0..1, capped at 0.95): from its spectral class, its
// planets' atmospheres, and the world's own flavour (Erid's ammonia-rich air, Sol's nitrogen).
export function biosphereProfile(star, state) {
  // The prologue simplifies only the two teaching targets; pass state from delivery
  // and beetle paths so they check the same requirement the UI shows.
  if (state && isPrologue(state)) {
    const pro = prologueProfile(star);
    if (pro) return pro;
  }
  const types = new Set((star.planets || []).map((p) => p.type));
  const scorching = (star.planets || []).some((p) => (p.type === 'lava' || p.type === 'desert') && (p.atmo?.density || 0) > 0.85);
  const icy = types.has('ice');
  const m = (star.spectral || '').charAt(0) === 'M';
  const req = {
    nitrogen: star.id === 'eri40' ? 0.6 : star.id === 'sol' ? 0.5 : 0.3,
    co2: scorching ? 0.75 : 0.05,
    cold: icy ? 0.8 : 0.1,
    heat: scorching ? 0.7 : 0.12,
    radiation: m ? 0.85 : 0.1,
  };
  const out = {};
  for (const t of BIOSPHERE) out[t] = +clamp(REQUIREMENT_MAX, 0, req[t]).toFixed(3);
  return out;
}

// How well a strain covers a biosphere: 1 when every trait is at or above the requirement, 0..1 otherwise.
export function coverage(strain, profile) {
  if (!strain || !profile) return 0;
  let cov = 1;
  for (const t of BIOSPHERE) {
    const need = profile[t] ?? 0;
    const have = clamp01(strain.traits?.[t] ?? 0);
    if (need > 0) cov = Math.min(cov, have / need);
  }
  return +Math.min(1, cov).toFixed(4);
}

export function canSave(strain, profile) { return coverage(strain, profile) >= 1; }

function score(strain) {
  let m = 1;
  for (const t of BIOSPHERE) m = Math.min(m, strain.traits?.[t] ?? 0);
  return m;
}

function bestId(strains) {
  if (!strains.length) return null;
  return strains.reduce((b, s) => (score(s) > score(b) ? s : b)).id;
}

// A fresh strain, or a child of a parent: children keep their parent's traits and bump the generation.
export function newStrain(state, parent) {
  const g = geneticsOf(state);
  const rng = stateRng(state);
  const traits = {};
  for (const t of TRAITS) {
    const base = parent && parent.traits ? parent.traits[t] : 0.05 + rng.next() * 0.03;
    traits[t] = +clamp01(base).toFixed(4);
  }
  const strain = { id: `g${g.nextId++}`, name: '', traits, gen: parent ? (parent.gen ?? 0) + 1 : 0, population: parent ? (parent.population ?? 200) : 200 };
  g.strains.push(strain);
  if (g.strains.length > MAX_STRAINS) g.strains.splice(0, g.strains.length - MAX_STRAINS);
  if (!g.best || !g.strains.some((s) => s.id === g.best)) g.best = bestId(g.strains);
  return strain;
}

// One generation from the selected strain: push the focus trait up, let the others drift,
// and pay the cost. `strainId` lets callers breed a chosen parent even when `best` points
// at a different culture; the UI marks its selection by setting genetics.best.
export function breed(state, { focus, pressure, strainId } = {}, tickFn = tick) {
  const g = geneticsOf(state);
  const strains = g.strains;
  const fail = (text) => ({ ok: false, text, strain: null, escapeRisk: state.lab.escapeRisk });
  if (state.status !== 'playing') return fail('The mission is over.');
  if (!strains.length) return fail('No Taumoeba strains to breed yet. Sample the world first.');
  const focusT = TRAITS.includes(focus) ? focus : null;
  if (!focusT) return fail(`Unknown trait to breed for: ${focus}.`);
  // Lab techs raise the usable pressure ceiling; a sluggish culture pushes less far.
  const p = clamp01(Number(pressure) || 0) * Math.max(1, effectMul(state, 'breedPressureMax'));
  const parent = strains.find((s) => s.id === (strainId || g.best)) || strains.find((s) => s.id === g.best) || strains[strains.length - 1];
  const rng = stateRng(state);
  const vigor = clamp01(parent.traits?.vigor ?? 0.5);
  const push = isPrologue(state) ? prologueBreedPush(p) : (0.025 + 0.1 * p) * (0.7 + 0.3 * vigor);
  const traits = { ...parent.traits };
  traits[focusT] = +clamp01((traits[focusT] ?? 0) + push + rng.range(0, 0.01)).toFixed(4);
  for (const t of TRAITS) {
    if (t === focusT) continue;
    traits[t] = +clamp01((traits[t] ?? 0) + (rng.next() - 0.5) * 0.05).toFixed(4);
  }
  if (p > 0.4) traits.vigor = +clamp01((traits.vigor ?? 0) - (0.01 + 0.04 * p)).toFixed(4);   // high pressure burns generation speed
  const strain = { id: `g${g.nextId++}`, name: '', traits, gen: (parent.gen ?? 0) + 1, population: parent.population ?? 200 };
  if (strains.length >= MAX_STRAINS) {
    // Never cull the culture being bred from: the player is still working on it.
    const keep = strains.filter((s) => s.id === parent.id)
      .concat(strains.filter((s) => s.id !== parent.id).sort((a, b) => score(b) - score(a)).slice(0, MAX_STRAINS - 2));
    strains.length = 0; strains.push(...keep);
  }
  strains.push(strain);
  g.best = strain.id;
  state.lab.escapeRisk = state.ship.upgrades.includes('xenonite-lab') ? 0 : +(0.6 * Math.max(...BIOSPHERE.map((t) => strain.traits?.[t] ?? 0)) ** 2).toFixed(4);
  state.research = (state.research ?? 0) + 2;
  spendTime(state, COSTS.breed.years, tickFn);
  // A long breeding campaign must not resolve a card every other generation: with the
  // expanded deck that made events (and their world-time costs) dominate the acts.
  if ((state.campaign?.act ?? 1) >= 2 && !state.events?.pending) drawEvent(state, 'random', { chance: 0.12 });
  const text = `Breeding generation ${strain.gen} from ${parent.id} for ${focusT} at ${(p * 100).toFixed(0)}% pressure. Strongest trait ${+(BIOSPHERE.map((t) => strain.traits?.[t] ?? 0).reduce((a, b) => Math.max(a, b), 0)).toFixed(3)}.`;
  addLog(state, text);
  return { ok: true, text, strain, parent, escapeRisk: state.lab.escapeRisk, cost: { years: COSTS.breed.years, fuelKg: COSTS.breed.fuelKg } };
}

export function nameStrain(state, id, name) {
  const g = geneticsOf(state);
  const s = g.strains.find((x) => x.id === id);
  if (!s) return null;
  s.name = String(name ?? '').trim().slice(0, 24);
  return s;
}

// The first successful sample of Adrian names a genetics culture, so the prologue can
// teach the modern lab instead of the old single nitrogen tolerance. Idempotent: every
// sampling path (instant, tether, endSample cleanup) can call it safely.
export function ensurePrologueSampleStrain(state) {
  if (!isPrologue(state)) return null;
  const g = geneticsOf(state);
  if (g.strains.some((s) => s.name === 'Taumoeba')) return null;
  const strain = newStrain(state);
  nameStrain(state, strain.id, 'Taumoeba');
  g.best = strain.id;
  addLog(state, `The sample yields a pure Taumoeba culture. The lab names it ${strain.name}.`);
  return strain;
}
