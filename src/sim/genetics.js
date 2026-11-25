// Multi-trait Taumoeba genetics (plan S3): strains carry six trait levels instead of one tolerance.
// Every star has a deterministic biosphere profile of what its atmosphere demands, and a delivery works
// when a strain covers that profile. Pure logic, no DOM, deterministic randomness from state.rng.
import { stateRng } from './rng.js';
import { tick } from './astrophage.js';
import { addLog, spendTime } from './util.js';
import { COSTS } from './ship.js';

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
export function biosphereProfile(star) {
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
  const strain = { id: `g${g.nextId++}`, name: '', traits, gen: parent ? (parent.gen ?? 0) + 1 : 0 };
  g.strains.push(strain);
  if (g.strains.length > MAX_STRAINS) g.strains.splice(0, g.strains.length - MAX_STRAINS);
  g.best = bestId(g.strains);
  return strain;
}

// One generation: push the focus trait up (more with pressure), let the others drift, and pay the cost.
export function breed(state, { focus, pressure } = {}, tickFn = tick) {
  const g = geneticsOf(state);
  const strains = g.strains;
  const fail = (text) => ({ ok: false, text, strain: null, escapeRisk: state.lab.escapeRisk });
  if (state.status !== 'playing') return fail('The mission is over.');
  if (!strains.length) return fail('No Taumoeba strains to breed yet. Sample the world first.');
  const focusT = TRAITS.includes(focus) ? focus : null;
  if (!focusT) return fail(`Unknown trait to breed for: ${focus}.`);
  const p = clamp01(Number(pressure) || 0);
  const parent = strains.find((s) => s.id === g.best) || strains[0];
  const rng = stateRng(state);
  const push = 0.08 + 0.5 * p;
  const traits = { ...parent.traits };
  traits[focusT] = +clamp01((traits[focusT] ?? 0) + push + rng.range(0, 0.02)).toFixed(4);
  for (const t of TRAITS) {
    if (t === focusT) continue;
    traits[t] = +clamp01((traits[t] ?? 0) + (rng.next() - 0.5) * 0.06).toFixed(4);
  }
  if (p > 0.4) traits.vigor = +clamp01((traits.vigor ?? 0) - (0.04 + 0.12 * p)).toFixed(4);   // high pressure burns generation speed
  const strain = { id: `g${g.nextId++}`, name: '', traits, gen: (parent.gen ?? 0) + 1 };
  if (strains.length >= MAX_STRAINS) {
    const keep = strains.slice().sort((a, b) => score(b) - score(a)).slice(0, MAX_STRAINS - 1);
    strains.length = 0; strains.push(...keep);
  }
  strains.push(strain);
  g.best = strain.id;
  state.lab.escapeRisk = state.ship.upgrades.includes('xenonite-lab') ? 0 : +(0.6 * Math.max(...BIOSPHERE.map((t) => strain.traits?.[t] ?? 0)) ** 2).toFixed(4);
  spendTime(state, COSTS.breed.years, tickFn);
  const text = `Breeding generation ${strain.gen} for ${focusT} at ${(p * 100).toFixed(0)}% pressure. Strongest trait ${+(BIOSPHERE.map((t) => strain.traits?.[t] ?? 0).reduce((a, b) => Math.max(a, b), 0)).toFixed(3)}.`;
  addLog(state, text);
  return { ok: true, text, strain, escapeRisk: state.lab.escapeRisk, cost: { years: COSTS.breed.years, fuelKg: COSTS.breed.fuelKg } };
}

export function nameStrain(state, id, name) {
  const g = geneticsOf(state);
  const s = g.strains.find((x) => x.id === id);
  if (!s) return null;
  s.name = String(name ?? '').trim().slice(0, 24);
  return s;
}
