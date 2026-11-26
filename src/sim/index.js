import { mixSeed } from './rng.js';
import { createStars } from './stars.js';
import { addLog } from './util.js';
import { tick as worldTick, updateLum } from './astrophage.js';
import { rockyTick } from './rocky.js';
import { registerPack, content } from './content.js';
import { loadContent } from '../../content/index.js';
import { extendGalaxy, genPois, initKnowledge, spreadTick } from './galaxy.js';
import { ensureEvents } from './events.js';
import { beetleTick } from './beetles.js';
import { campaignTick } from './campaign.js';

// Content packs are plain data; registering once here keeps the deck and tech tree available to every save.
loadContent(registerPack);

export { extinctionYears } from './astrophage.js';
export { travelPlan, travel, travelToPlanetPlan, travelToPlanet, shipOrbit, orbitDistanceAu, relativisticTrip, ACCEL, PARK_AU, COSTS } from './ship.js';
export { scanPlanet, samplePlanet, breedStep, deliver } from './lab.js';
export { SCAN, PROBE, scanBegin, scanProgress, scanCoverage, scanMap, hotspotsOf, beginSample, sampleStep, endSample, autoSample, gustAt, bandAt } from './sampling.js';
export { HARVEST, petrovaTarget, harvestPlan, harvest, harvestRate } from './harvest.js';
export { MATERIALS, RECIPES, rockyTick, dock, undock, missionPlan, startMission, recipes, craft, waitForRocky } from './rocky.js';
export { serialize, deserialize } from './save.js';
export * from './content.js';
export * from './events.js';
export * from './galaxy.js';
export * from './genetics.js';
export * from './beetles.js';
export * from './tech.js';
export * from './campaign.js';

// The registry's tech definitions, in the shape tech.js expects.
export function techDefs() { return content().techs; }

// The world tick: infection, Rocky's mission, the interstellar lanes, beetles and the mission board.
// (rocky.js cannot import tick from astrophage.js for this: that would be circular.)
export function tick(state, dtYears) {
  worldTick(state, dtYears);
  rockyTick(state);
  if ((state.campaign?.act ?? 0) >= 2) spreadTick(state, dtYears);
  beetleTick(state);
  campaignTick(state);
}

export function createGame(seed = 1) {
  const base = createStars(seed);
  const extra = extendGalaxy(base, seed);
  // Act I must play like the old twelve-star game: the new stars start almost clean and
  // are left out of the old Petrova spread until act II opens the lanes.
  for (const s of extra) {
    s.procedural = true;
    // Clean until the lanes deliver Astrophage: otherwise all 48 procedural stars
    // mature together the moment act II opens and the sky goes dark in a century.
    s.infection = 0;
    updateLum(s);
  }
  const stars = base.concat(extra);
  const state = {
    seed, status: 'playing', statusText: '',
    time: { worldYears: 0, shipYears: 0 },
    ship: { starId: 'tauceti', planetId: null, fuelKg: 60000, fuelMaxKg: 60000, hull: 1, upgrades: [], samples: 0 },
    stars,
    lab: { strains: [], bestTolerance: 0, escapeRisk: 0, generations: 0, nextId: 1 },
    delivered: { sol: false, eri40: false },
    research: 0,
    tech: { owned: [] },
    genetics: { strains: [], nextId: 1, best: 0 },
    beetles: [],
    pois: genPois(stars, seed),
    log: [],
    rng: { s: mixSeed(seed, 0xA57A) },
  };
  state.rocky = { docked: true, starId: state.ship.starId, planetId: state.ship.planetId, mission: null,
    materials: { minerals: 2, volatiles: 1, gas: 0, silicates: 1 }, built: [], says: null };
  initKnowledge(state);
  ensureEvents(state);
  state.campaign = { act: 1, mode: 'campaign', board: [], saved: [], dark: [], score: 0,
    cycle: 0, difficulty: 1, targets: [], pendingCard: null };
  addLog(state, 'The Hail Mary hangs at Tau Ceti. Sol and 40 Eridani are dimming. Tau Ceti is not.');
  return state;
}
