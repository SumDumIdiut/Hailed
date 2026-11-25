// Rocky's ship, the Blip-A: docking, gather missions, and xenonite crafting.
// Pure logic, no DOM, deterministic. Rocky's spoken lines land in state.rocky.says ({ text, mood, worldYears })
// for the UI to speak. Missions resolve in rockyTick, which the UI's world tick calls (see sim/index.js).
import { findPlanet } from './stars.js';
import { addLog, spendTime } from './util.js';
import { tick } from './astrophage.js';
import { shipOrbit } from './ship.js';
import { petrovaTarget } from './harvest.js';
import { refreshLab } from './lab.js';

const DAY_YEARS = 1 / 365.25;
const PETROVA_FUEL_KG = 8000;      // the Petrova planet also pays Astrophage: the old fuel-refill trade

// Materials Rocky gathers and crafts with.
export const MATERIALS = ['minerals', 'volatiles', 'gas', 'silicates'];

// What a gather mission brings back, by planet type.
const GATHER = {
  rocky: { minerals: 4 }, lava: { minerals: 5 }, desert: { silicates: 4 },
  ice: { volatiles: 4 }, ocean: { volatiles: 3 }, gas: { gas: 4 },
};

// What Rocky builds out of xenonite. No trust gates: materials and days only.
export const RECIPES = [
  { id: 'xenonite-lab', title: 'Xenonite lab', desc: 'A xenonite containment lab: Taumoeba can no longer escape.', cost: { minerals: 2, silicates: 1 }, days: 3, upgrade: 'xenonite-lab' },
  { id: 'xeno-tanks', title: 'Xenonite tanks', desc: 'Bigger xenonite fuel tanks: 50% more capacity.', cost: { minerals: 5, volatiles: 2 }, days: 5, upgrade: 'xenonite-tanks' },
  { id: 'hull-plating', title: 'Hull plating', desc: 'Xenonite patching restores the hull. Repeatable.', cost: { minerals: 3 }, days: 3, repeatable: true },
  { id: 'scoop', title: 'Methane scoop', desc: 'A scoop for the collector: harvest yield x1.6.', cost: { gas: 3, minerals: 2 }, days: 5, upgrade: 'scoop' },
  { id: 'nav-link', title: 'Eridian nav link', desc: 'Rocky shares better courses: trips burn 30% less fuel.', cost: { silicates: 2, volatiles: 2 }, days: 5, upgrade: 'eridian-nav' },
];
const recipeById = (id) => RECIPES.find((r) => r.id === id);

// Rocky says something. The UI speaks state.rocky.says.
function says(state, text, mood) { state.rocky.says = { text, mood, worldYears: state.time.worldYears }; }

const inShipSystem = (state) => state.rocky.starId === state.ship.starId;
const sameOrbit = (state) => (state.rocky.planetId ?? null) === (state.ship.planetId ?? null);
const short = (cost, have) => MATERIALS.filter((m) => (cost[m] || 0) > (have[m] || 0))
  .map((m) => `${cost[m]} ${m} (have ${have[m] || 0})`).join(', ');

// ---- docking ---------------------------------------------------------------
// Same system, same orbit, no mission running. Half a day of world time either way.
export function dock(state) {
  const r = state.rocky;
  if (!r) return { ok: false, text: 'Rocky is not aboard.' };
  if (r.mission) return { ok: false, text: 'Rocky is away on the Blip-A. Wait for him to dock.' };
  if (r.docked) return { ok: false, text: 'The Blip-A is already docked.' };
  if (!inShipSystem(state)) return { ok: false, text: 'Rocky is not in this system.' };
  if (!sameOrbit(state)) return { ok: false, text: 'Rocky must be at the same orbit to dock.' };
  spendTime(state, 0.5 * DAY_YEARS, tick);
  r.docked = true;
  r.planetId = state.ship.planetId ?? null;
  addLog(state, 'Rocky docks the Blip-A to the Hail Mary.');
  return { ok: true, text: 'Rocky docks the Blip-A to the Hail Mary.' };
}

export function undock(state) {
  const r = state.rocky;
  if (!r) return { ok: false, text: 'Rocky is not aboard.' };
  if (r.mission) return { ok: false, text: 'Rocky is away on the Blip-A. Wait for him to dock.' };
  if (!r.docked) return { ok: false, text: 'The Blip-A is already away.' };
  if (!inShipSystem(state)) return { ok: false, text: 'Rocky is not in this system.' };
  if (!sameOrbit(state)) return { ok: false, text: 'Rocky must be at the same orbit to undock.' };
  spendTime(state, 0.5 * DAY_YEARS, tick);
  r.docked = false;
  addLog(state, 'Rocky undocks the Blip-A and holds the same orbit.');
  return { ok: true, text: 'Rocky undocks the Blip-A and holds the same orbit.' };
}

// ---- gather missions -------------------------------------------------------
// Round trip: 2 + 3*sqrt(|planet orbit - current orbit AU|) days, plus 6 days mining.
export function missionPlan(state, kind, planetId) {
  const bad = (reason) => ({ ok: false, reason, days: 0, yield: null });
  if (kind !== 'gather') return bad('Unknown mission kind.');
  const r = state.rocky;
  if (!r) return bad('Rocky is not aboard.');
  if (state.status !== 'playing') return bad('The mission is over.');
  if (r.mission) return bad('Rocky is already out on the Blip-A.');
  if (!inShipSystem(state)) return bad('Rocky is not in this system.');
  const f = findPlanet(state, planetId);
  if (!f) return bad('Unknown planet.');
  if (f.star.id !== state.ship.starId) return bad(`${f.planet.name} is not in this system.`);
  const days = 2 + 3 * Math.sqrt(Math.abs(f.planet.orbit - shipOrbit(state))) + 6;
  const y = { ...(GATHER[f.planet.type] || {}) };
  const petrova = petrovaTarget(f.star.planets);
  if (petrova && petrova.id === planetId) y.astrophageKg = PETROVA_FUEL_KG;
  return { ok: true, reason: '', days, yield: y };
}

export function startMission(state, kind, planetId) {
  const plan = missionPlan(state, kind, planetId);
  if (!plan.ok) return { ok: false, text: plan.reason };
  const r = state.rocky, p = findPlanet(state, planetId).planet;
  r.docked = false;                       // he undocks the Blip-A and goes
  r.planetId = planetId;
  r.mission = { kind, planetId, startYears: state.time.worldYears,
    endYears: state.time.worldYears + plan.days * DAY_YEARS, yield: plan.yield };
  addLog(state, `Rocky takes the Blip-A to ${p.name}: ${plan.days.toFixed(1)} days out and back.`);
  says(state, 'Me go get rocks. You wait. Question?', 'excited');
  return { ok: true, text: `Rocky heads for ${p.name}. Back in ${plan.days.toFixed(1)} days.` };
}

// Called after world time advances: pay the mission out and dock the Blip-A.
export function rockyTick(state) {
  const r = state.rocky;
  if (!r || !r.mission || state.time.worldYears < r.mission.endYears) return null;
  const m = r.mission, f = findPlanet(state, m.planetId), got = [];
  for (const k of MATERIALS) {
    const n = m.yield[k] || 0;
    if (n) { r.materials[k] = (r.materials[k] || 0) + n; got.push(`+${n} ${k}`); }
  }
  if (m.yield.astrophageKg) {
    const before = state.ship.fuelKg;
    state.ship.fuelKg = Math.min(state.ship.fuelMaxKg, state.ship.fuelKg + m.yield.astrophageKg);
    got.push(`+${Math.round(state.ship.fuelKg - before)} kg Astrophage`);
  }
  r.starId = state.ship.starId;           // the Blip-A comes home to wherever the Hail Mary is now
  r.planetId = state.ship.planetId ?? null;
  r.docked = true;
  r.mission = null;
  const text = `Rocky is back from ${f ? f.planet.name : 'his run'}: ${got.join(', ')}.`;
  addLog(state, text);
  says(state, 'Amaze! Good rocks!', 'excited');
  return { ok: true, text };
}

// Wait for Rocky: tick world time to the mission end (plus 0.01 day), then resolve it.
export function waitForRocky(state) {
  const r = state.rocky;
  if (!r || !r.mission) return { ok: false, text: 'Rocky is not away on the Blip-A.' };
  const target = r.mission.endYears + 0.01 * DAY_YEARS;
  if (state.time.worldYears < target) tick(state, target - state.time.worldYears);
  const done = rockyTick(state);
  return { ok: true, text: done ? done.text : 'You wait for the Blip-A.' };
}

// ---- crafting --------------------------------------------------------------
export function recipes(state) {
  const r = state.rocky;
  return RECIPES.map((rc) => {
    const built = !rc.repeatable && !!r && r.built.includes(rc.id);
    let can = true, why = '';
    if (!r) { can = false; why = 'Rocky is not aboard.'; }
    else if (!r.docked || r.mission) { can = false; why = 'Rocky must be docked.'; }
    else if (built) { can = false; why = 'Already built.'; }
    else if (MATERIALS.some((m) => (rc.cost[m] || 0) > (r.materials[m] || 0))) {
      can = false; why = `Need ${short(rc.cost, r.materials)}.`;
    }
    return { id: rc.id, title: rc.title, desc: rc.desc, cost: { ...rc.cost }, days: rc.days, built, can, why };
  });
}

export function craft(state, id) {
  const rc = recipeById(id);
  if (!rc) return { ok: false, text: 'Unknown recipe.' };
  const r = state.rocky;
  if (!r) return { ok: false, text: 'Rocky is not aboard.' };
  if (state.status !== 'playing') return { ok: false, text: 'The mission is over.' };
  if (!r.docked || r.mission) return { ok: false, text: 'Rocky must be docked to craft.' };
  if (!rc.repeatable && r.built.includes(id)) return { ok: false, text: `${rc.title} is already built.` };
  if (MATERIALS.some((m) => (rc.cost[m] || 0) > (r.materials[m] || 0))) {
    says(state, 'No no no. Need more stuff.', 'slumped');
    return { ok: false, text: `No no no. Need more stuff. Need ${short(rc.cost, r.materials)}.` };
  }
  for (const m of MATERIALS) r.materials[m] -= rc.cost[m] || 0;
  if (!rc.repeatable) r.built.push(id);
  spendTime(state, rc.days * DAY_YEARS, tick);
  const s = state.ship;
  let text;
  switch (id) {
    case 'xenonite-lab':
      if (!s.upgrades.includes('xenonite-lab')) s.upgrades.push('xenonite-lab');
      refreshLab(state);
      text = 'Taumoeba can no longer escape the lab.';
      break;
    case 'xeno-tanks':
      s.fuelMaxKg = Math.round(s.fuelMaxKg * 1.5);
      if (!s.upgrades.includes('xenonite-tanks')) s.upgrades.push('xenonite-tanks');
      text = `Fuel capacity now ${s.fuelMaxKg} kg.`;
      break;
    case 'hull-plating':
      s.hull = 1;
      text = 'Hull patched with xenonite: restored.';
      break;
    case 'scoop':
      if (!s.upgrades.includes('scoop')) s.upgrades.push('scoop');
      text = 'The scoop lifts 60% more Astrophage per day.';
      break;
    case 'nav-link':
      if (!s.upgrades.includes('eridian-nav')) s.upgrades.push('eridian-nav');
      text = 'Trips now burn 30% less fuel.';
      break;
    default:
      text = `${rc.title} is done.`;
  }
  addLog(state, `Rocky crafted ${rc.title}.`);
  says(state, 'Fist my bump. Is done.', 'excited');
  return { ok: true, text };
}
