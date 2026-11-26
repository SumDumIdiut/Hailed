// Beetle courier probes (plan S4): a probe carries a strain to an infected star across the galaxy, then
// reports whether the strain covers that star's biosphere. Pure logic, no DOM, deterministic.
import { findStar, starDistance } from './stars.js';
import { addLog } from './util.js';
import { canSave, coverage, biosphereProfile, geneticsOf } from './genetics.js';
import { effectMul } from './tech.js';
import { drawEvent } from './events.js';

export const BEETLE_COST = { fuelKg: 600, materials: { minerals: 2, silicates: 1 } };
export const BEETLE_SPEED = 0.9;                   // ly per world year before probe techs

// Probe cost after owned techs: cheaper frames use less fuel and fewer xenonite parts.
export function beetleCost(state) {
  const mul = effectMul(state, 'beetleCostMul');
  return {
    fuelKg: Math.round(BEETLE_COST.fuelKg * mul),
    materials: {
      minerals: Math.floor(BEETLE_COST.materials.minerals * mul),
      silicates: Math.floor(BEETLE_COST.materials.silicates * mul),
    },
  };
}

// Launch a courier probe with a strain. Charges the beetle cost out of the ship fuel and Rocky's xenonite.
export function launchBeetle(state, strainId, toStarId) {
  const bad = (why) => ({ ok: false, why, beetle: null, distanceLy: 0, travelYears: 0 });
  if (state.status !== 'playing') return bad('The mission is over.');
  const g = geneticsOf(state);
  const strain = g.strains.find((s) => s.id === strainId);
  if (!strain) return bad(`No strain with id ${strainId} in the lab.`);
  const to = findStar(state, toStarId);
  if (!to) return bad('Unknown star.');
  const have = state.rocky ? state.rocky.materials : null;
  const cost = beetleCost(state);
  const need = cost.materials;
  const fuelCost = cost.fuelKg;
  const speed = BEETLE_SPEED * Math.max(1, effectMul(state, 'beetleSpeedMul'));
  if ((state.ship.fuelKg ?? 0) < fuelCost) return bad(`Not enough Astrophage fuel: the probe burns ${fuelCost} kg to leave.`);
  if (!have || (have.minerals || 0) < need.minerals || (have.silicates || 0) < need.silicates) {
    return bad(`Rocky must bring the xenonite parts: the probe needs ${need.minerals} minerals and ${need.silicates} silicates.`);
  }
  const from = findStar(state, state.ship.starId);
  const d = from ? starDistance(from, to) : 0;
  const beetle = {
    id: `b${(state.beetles?.length || 0) + 1}`,
    strainId, from: from ? from.id : state.ship.starId, to: toStarId,
    departWorldYears: +state.time.worldYears.toFixed(4), arriveWorldYears: +(state.time.worldYears + d / speed).toFixed(4),
    status: 'flying',
  };
  state.beetles = state.beetles || [];
  state.beetles.push(beetle);
  state.ship.fuelKg -= fuelCost;
  if (have) { have.minerals -= need.minerals; have.silicates -= need.silicates; }
  addLog(state, `Beetle probe ${beetle.id} launched to ${to.name} with strain ${strainId}.`);
  if ((state.campaign?.act ?? 1) >= 2 && !state.events?.pending) drawEvent(state, 'random', { chance: 0.4 });
  return { ok: true, why: '', beetle, distanceLy: d, travelYears: d / speed };
}

// Resolve the probes whose relativistic flight has elapsed: save the star or log the trait that fell short.
export function beetleTick(state) {
  const g = geneticsOf(state);
  const arrivals = [];
  if (state.status !== 'playing') return arrivals;
  for (const b of state.beetles || []) {
    if (b.status !== 'flying') continue;
    if (state.time.worldYears < b.arriveWorldYears) continue;
    b.status = 'arrived';
    const star = findStar(state, b.to);
    const strain = (g.strains || []).find((s) => s.id === b.strainId);
    const profile = star ? biosphereProfile(star) : null;
    const cov = strain && profile ? coverage(strain, profile) : 0;
    const ok = canSave(strain, profile);
    let short = null;
    if (ok) {
      star.saved = true;
      star.infection = Math.max(0, star.infection - 0.5);
      state.research = (state.research ?? 0) + 3;
      addLog(state, `Beetle probe ${b.id} delivered strain ${strain.name || strain.id} to ${star.name}: the strain covers the biosphere. Astrophage recedes.`);
    } else if (strain && profile) {
      short = ['nitrogen', 'co2', 'cold', 'heat', 'radiation']
        .filter((t) => (strain.traits?.[t] ?? 0) < (profile[t] ?? 0))
        .sort((a, b2) => (profile[a] ?? 0) - (profile[b2] ?? 0))[0] || null;
      addLog(state, `Beetle probe ${b.id} delivered strain ${strain.name || strain.id} to ${star.name}, but it failed: the ${short} requirement was not met.`);
    }
    arrivals.push({ ok, beetle: b, strain, star, short });
  }
  return arrivals;
}
