import { starDistance, findStar, findPlanet } from './stars.js';
import { tick } from './astrophage.js';
import { addLog } from './util.js';
import { drawEvent } from './events.js';
import { revealAround, visitPoi } from './galaxy.js';
import { effectMul } from './tech.js';

const G_LY_YR2 = 1.0323;            // 1 g in ly/yr^2 (c = 1)
export const ACCEL = 1.5 * G_LY_YR2; // 1.5 g spin drive
export const FUEL_BASE = 1500, FUEL_CURVE = 0.02, NAV_DISCOUNT = 0.7;

// Constant 1.5g accelerate-to-midpoint, flip, decelerate. Proper relativistic formulas.
export function relativisticTrip(d, a = ACCEL) {
  const x = a * d / 2;
  const tauHalf = Math.acosh(1 + x) / a;
  const tHalf = Math.sqrt((1 + x) ** 2 - 1) / a;
  return { shipYears: 2 * tauHalf, worldYears: 2 * tHalf };
}
export function fuelCost(state, d) {
  let f = FUEL_BASE * d * (1 + FUEL_CURVE * d);
  if (state.ship.upgrades.includes('eridian-nav')) f *= NAV_DISCOUNT;
  f *= effectMul(state, 'jumpFuelMul');
  return Math.round(f);
}

// Rocky is aboard or away: the Blip-A cannot ride a jump while he is out on his own.
function rockyAway(state) { return !!state.rocky && (state.rocky.mission || !state.rocky.docked); }

export function travelPlan(state, starId) {
  const from = findStar(state, state.ship.starId), to = findStar(state, starId);
  const bad = (reason, extra = {}) => ({ ok: false, reason, distanceLy: 0, fuelKg: 0, shipYears: 0, worldYears: 0, ...extra });
  if (!to) return bad('Unknown star.');
  if (state.status !== 'playing') return bad('The mission is over.');
  if (rockyAway(state)) return bad('Rocky is away on the Blip-A. Wait for him to dock.');
  if (to.id === from.id) return bad('Already in this system.');
  const d = starDistance(from, to);
  const fuelKg = fuelCost(state, d);
  const t = relativisticTrip(d);
  const plan = { ok: true, reason: '', distanceLy: d, fuelKg, shipYears: t.shipYears, worldYears: t.worldYears };
  if (state.ship.hull < 0.2) return { ...plan, ok: false, reason: 'Hull too damaged to sustain 1.5 g. Repair it first.' };
  if (fuelKg > state.ship.fuelKg) {
    return { ...plan, ok: false, reason: `Not enough Astrophage fuel: need ${fuelKg} kg, have ${Math.floor(state.ship.fuelKg)} kg.` };
  }
  return plan;
}

export function travel(state, starId) {
  const plan = travelPlan(state, starId);
  if (!plan.ok) return plan;
  const to = findStar(state, starId), from = findStar(state, state.ship.starId);
  state.ship.fuelKg -= plan.fuelKg;
  state.ship.starId = starId;
  state.ship.planetId = null;   // arrive near the star, in a high parking orbit
  if (state.rocky) { state.rocky.starId = starId; state.rocky.planetId = null; }   // the docked Blip-A rides along
  state.time.shipYears += plan.shipYears;
  addLog(state, `Left ${from.name} for ${to.name}: ${plan.distanceLy.toFixed(1)} ly, ${plan.shipYears.toFixed(1)} years aboard, ${plan.worldYears.toFixed(1)} years at home.`);
  tick(state, plan.worldYears);
  if (state.status === 'playing') {
    // First visit: chart the system and open the map around it.
    if (state.galaxy && !state.galaxy.surveyed[starId]) {
      state.galaxy.surveyed[starId] = true;
      state.research = (state.research ?? 0) + 5;
    }
    revealAround(state, starId, 5);
    for (const poi of state.pois || []) {
      if (!poi.pos) continue;
      const d = Math.hypot(to.pos[0] - poi.pos[0], to.pos[1] - poi.pos[1], to.pos[2] - poi.pos[2]);
      if (d <= 2) visitPoi(state, poi.id);
    }
    // Flight cards first; an arrival card is only drawn when nothing is already pending.
    const late = (state.campaign?.act ?? 1) >= 2;
    drawEvent(state, 'flight', { chance: late ? 0.7 : 0.35, from: from.id, to: starId });
    if (!state.events?.pending) drawEvent(state, 'arrive', { chance: late ? 0.55 : 0.3, starId });
  }
  return { ...plan, status: state.status };
}

// ---- in-system travel -------------------------------------------------------
// Newtonian brachistochrone at 1.5 g: accelerate to the midpoint, flip, decelerate. t = 2*sqrt(d/a).
// Speeds stay around 0.01c, so ship time == world time for our purposes.
export const AU_M = 1.495978707e11, G_MS2 = 9.80665, DAY_S = 86400;
export const PARK_AU = 3;                       // parking orbit radius = PARK_AU * sqrt(star lum0)
export const ORBIT_FUEL_BASE = 60, ORBIT_FUEL_PER_SQRT_AU = 240;
export const COSTS = {                          // small action costs (ship years; fuel kg)
  scan: { years: 0.005, fuelKg: 3 }, scanRemote: { years: 0.002, fuelKg: 1 },
  sample: { years: 0.004, fuelKg: 12 },
  learn: { years: 0.002, fuelKg: 0 }, breed: { years: 0.015, fuelKg: 6 },
};
// Radius (AU) of where the ship currently is in its system.
export function shipOrbit(state) {
  const star = findStar(state, state.ship.starId);
  const pid = state.ship.planetId ?? null;
  const p = pid && star.planets.find((x) => x.id === pid);
  return p ? p.orbit : PARK_AU * Math.sqrt(star.lum0);
}
export function orbitDistanceAu(state, planet) { return Math.abs(shipOrbit(state) - planet.orbit); }

export function travelToPlanetPlan(state, planetId) {
  const bad = (reason, extra = {}) => ({ ok: false, reason, distanceAu: 0, fuelKg: 0, shipDays: 0, worldDays: 0, ...extra });
  const f = findPlanet(state, planetId);
  if (!f) return bad('Unknown planet.');
  if (state.status !== 'playing') return bad('The mission is over.');
  if (f.star.id !== state.ship.starId) return bad(`${f.planet.name} is not in this system.`);
  if ((state.ship.planetId ?? null) === planetId) return bad(`Already in orbit around ${f.planet.name}.`);
  const d = orbitDistanceAu(state, f.planet);
  let fuelKg = ORBIT_FUEL_BASE + ORBIT_FUEL_PER_SQRT_AU * Math.sqrt(d);
  if (state.ship.upgrades.includes('eridian-nav')) fuelKg *= NAV_DISCOUNT;
  fuelKg = Math.round(fuelKg);
  const days = 2 * Math.sqrt(d * AU_M / ACCEL_MS2) / DAY_S;
  const plan = { ok: true, reason: '', distanceAu: d, fuelKg, shipDays: days, worldDays: days };
  if (state.ship.hull < 0.2) return { ...plan, ok: false, reason: 'Hull too damaged to sustain 1.5 g. Repair it first.' };
  if (fuelKg > state.ship.fuelKg) return { ...plan, ok: false, reason: `Not enough Astrophage fuel: need ${fuelKg} kg, have ${Math.floor(state.ship.fuelKg)} kg.` };
  return plan;
}
const ACCEL_MS2 = 1.5 * G_MS2;

export function travelToPlanet(state, planetId) {
  const plan = travelToPlanetPlan(state, planetId);
  if (!plan.ok) return plan;
  const { planet } = findPlanet(state, planetId);
  state.ship.fuelKg -= plan.fuelKg;
  state.ship.planetId = planetId;
  if (state.rocky && state.rocky.docked) state.rocky.planetId = planetId;   // the Blip-A follows while docked
  const years = plan.shipDays / 365.25;
  state.time.shipYears += years;
  addLog(state, `Burned ${plan.distanceAu.toFixed(2)} AU to orbit ${planet.name}: ${plan.shipDays.toFixed(1)} days, ${plan.fuelKg} kg.`);
  tick(state, years);
  return { ...plan, status: state.status };
}
