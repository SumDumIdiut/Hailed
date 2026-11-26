// Astrophage harvesting: the way to gain fuel. An infected star is a fuel mine (an irony the tutorial points out).
// Pure logic; the UI animates the run over real seconds and calls harvest() when it finishes.
import { findStar } from './stars.js';
import { tick } from './astrophage.js';
import { addLog, spend } from './util.js';
import { effectMul } from './tech.js';
import { drawEvent } from './events.js';

export const HARVEST = {
  perDay: 14000, exp: 1.5,          // kg per day = perDay * infection^exp  (infection 0.30: 2300, Tau Ceti 0.15: 810, Sol 0.05: 160)
  collector: { days: 14, fuelKg: 40 },                 // breeding-planet collector, needs orbit of the Petrova target
  skim: { days: 3, mult: 3, fuelKg: 120, hullBase: 0.10, hullPerInf: 0.2, minHull: 0.45 },   // Petrova-line skim: faster, hot
  minInfection: 0.005,
};

// Mirror of render/index.js petrovaTarget (kept in sync by a test): the planet Astrophage breeds at.
export function petrovaTarget(planets) {
  if (!planets || !planets.length) return null;
  return planets.find((p) => p.special === 'adrian')
    || planets.find((p) => (p.type === 'desert' || p.type === 'rocky') && (p.atmo?.density || 0) > 0.1)
    || planets.find((p) => p.type === 'ocean' && (p.atmo?.density || 0) > 0.1) || null;
}

export function harvestRate(star) { return HARVEST.perDay * Math.max(0, star.infection) ** HARVEST.exp; }   // kg/day, collector

export function harvestPlan(state, mode = 'collector') {
  const star = findStar(state, state.ship.starId);
  const tgt = petrovaTarget(star.planets);
  const skim = mode === 'skim';
  const cfg = skim ? HARVEST.skim : HARVEST.collector;
  const days = cfg.days;
  let perDay = harvestRate(star) * (skim ? cfg.mult : 1);
  if (state.ship.upgrades.includes('scoop')) perDay *= 1.6;   // Rocky's scoop gathers more per day
  perDay *= effectMul(state, 'harvestMul');
  const space = Math.max(0, state.ship.fuelMaxKg - (state.ship.fuelKg - cfg.fuelKg));
  const kg = Math.round(Math.min(perDay * days, space));
  const hullCost = skim ? +(cfg.hullBase + cfg.hullPerInf * star.infection).toFixed(3) : 0;
  const plan = { ok: true, reason: '', mode, planetId: tgt ? tgt.id : null, targetName: tgt ? tgt.name : null, days, kgPerDay: Math.round(perDay),
    kg, fullKg: Math.round(perDay * days), fuelKg: cfg.fuelKg, hullCost, infection: star.infection };
  const no = (reason) => ({ ...plan, ok: false, reason });
  if (state.status !== 'playing') return no('The mission is over.');
  if (star.infection < HARVEST.minInfection) return no(`${star.name} has almost no Astrophage to harvest.`);
  if (!tgt) return no(`${star.name} has no Astrophage-breeding planet.`);
  if (state.ship.fuelKg < cfg.fuelKg) return no(`Need ${cfg.fuelKg} kg of fuel to deploy.`);
  if (state.ship.fuelKg >= state.ship.fuelMaxKg - 1) return no('The Astrophage tanks are already full.');
  if (!skim && (state.ship.planetId ?? null) !== tgt.id) return no(`Fly to orbit around ${tgt.name} (the Petrova-line planet) to deploy the collector.`);
  if (skim && state.ship.hull < cfg.minHull) return no(`Hull too weak for a Petrova-line skim (need ${Math.round(cfg.minHull * 100)}%, have ${Math.round(state.ship.hull * 100)}%). Repair it first.`);
  return plan;
}

export function harvest(state, mode = 'collector') {
  const plan = harvestPlan(state, mode);
  if (!plan.ok) return plan;
  const star = findStar(state, state.ship.starId);
  const cost = spend(state, { fuelKg: plan.fuelKg, years: plan.days / 365.25 }, tick);
  const before = state.ship.fuelKg;
  state.ship.fuelKg = Math.min(state.ship.fuelMaxKg, state.ship.fuelKg + plan.kg);
  const gained = Math.round(state.ship.fuelKg - before);
  state.research = (state.research ?? 0) + 2;
  if ((state.campaign?.act ?? 1) >= 2 && !state.events?.pending) drawEvent(state, 'random', { chance: 0.08 });
  if (plan.hullCost) state.ship.hull = Math.max(0.05, state.ship.hull - plan.hullCost);
  const text = mode === 'skim'
    ? `Skimmed the Petrova line at ${star.name}: +${gained} kg Astrophage in ${plan.days} days, hull -${Math.round(plan.hullCost * 100)}%.`
    : `Harvested ${gained} kg of Astrophage over ${plan.days} days at ${plan.targetName} (${star.name} infection ${Math.round(star.infection * 100)}%).`;
  addLog(state, text);
  return { ...plan, ok: true, gained, text, cost };
}
