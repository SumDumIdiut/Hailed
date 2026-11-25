// The tech tree. Tech defs come from content packs via techList(defs) — this module
// is registry-free and takes the pack's list as a parameter.
import { addLog } from './util.js';

// Effect keys: multiplied (default 1), added (default 0), or unlocking a feature.
const MUL_KEYS = ['fuelMul', 'jumpFuelMul', 'harvestMul', 'scanSpeedMul',
  'breedPressureMax', 'escapeRiskMul', 'beetleSpeedMul', 'beetleCostMul', 'hullMax'];
const ADD_KEYS = ['relayRadiusAdd'];

export function techList(defs) { return defs.techs; }
const byId = (defs, id) => defs.techs.find((t) => t.id === id);
const ownedIds = (state) => state.tech?.owned ?? [];

// Ids of techs that are buyable right now (requires met, not owned).
export function available(state, defs) {
  const owned = ownedIds(state);
  return defs.techs.filter((t) => !owned.includes(t.id) &&
    (t.requires ?? []).every((r) => owned.includes(r))).map((t) => t.id);
}

// { ok, why } — why explains the refusal when ok is false.
export function canBuy(state, defs, id) {
  const t = byId(defs, id);
  if (!t) return { ok: false, why: 'Unknown tech.' };
  const owned = ownedIds(state);
  if (owned.includes(id)) return { ok: false, why: `${t.name} is already owned.` };
  const missing = (t.requires ?? []).filter((r) => !owned.includes(r));
  if (missing.length) {
    return { ok: false, why: `Needs owned first: ${missing.map((r) => byId(defs, r)?.name ?? r).join(', ')}.` };
  }
  const research = state.research ?? 0;
  if (research < t.cost.research) {
    return { ok: false, why: `Need ${t.cost.research} research, have ${Math.floor(research)}.` };
  }
  const mats = state.rocky?.materials ?? {};
  const needMats = Object.entries(t.cost.materials ?? {}).filter(([m, n]) => n > (mats[m] || 0));
  if (needMats.length) {
    return { ok: false, why: `Need materials: ${needMats.map(([m, n]) => `${n} ${m}`).join(', ')}.` };
  }
  return { ok: true, why: '' };
}

export function buy(state, defs, id) {
  const check = canBuy(state, defs, id);
  if (!check.ok) return check;
  const t = byId(defs, id);
  state.research = (state.research ?? 0) - t.cost.research;
  if (!state.tech || !Array.isArray(state.tech.owned)) state.tech = { owned: [] };
  state.tech.owned.push(id);
  const mats = state.rocky?.materials;
  if (mats) for (const [m, n] of Object.entries(t.cost.materials ?? {})) mats[m] = (mats[m] || 0) - n;
  addLog(state, `Research unlocked ${t.name}.`);
  return { ok: true, why: '' };
}

// One object folding owned effects: muls (each default 1), adds (default 0), unlocks as an array.
export function modifiers(state, defs) {
  const out = { muls: {}, adds: {}, unlocks: [] };
  for (const k of MUL_KEYS) out.muls[k] = 1;
  for (const k of ADD_KEYS) out.adds[k] = 0;
  const unlocks = new Set();
  for (const id of ownedIds(state)) {
    for (const [k, v] of Object.entries(byId(defs, id)?.effects ?? {})) {
      if (k === 'unlock') unlocks.add(v);
      else if (MUL_KEYS.includes(k)) out.muls[k] *= v;
      else if (ADD_KEYS.includes(k)) out.adds[k] += v;
      else out.muls[k] = (out.muls[k] ?? 1) * v;
    }
  }
  out.unlocks = [...unlocks];
  return out;
}
