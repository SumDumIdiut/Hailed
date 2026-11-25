import { createRng, mixSeed } from './rng.js';
import { createStars } from './stars.js';
import { addLog } from './util.js';
import { tick as worldTick } from './astrophage.js';
import { rockyTick } from './rocky.js';

export { extinctionYears } from './astrophage.js';
export { travelPlan, travel, travelToPlanetPlan, travelToPlanet, shipOrbit, orbitDistanceAu, relativisticTrip, ACCEL, PARK_AU, COSTS } from './ship.js';
export { scanPlanet, samplePlanet, breedStep, deliver } from './lab.js';
export { SCAN, PROBE, scanBegin, scanProgress, scanCoverage, scanMap, hotspotsOf, beginSample, sampleStep, endSample, autoSample, gustAt, bandAt } from './sampling.js';
export { HARVEST, petrovaTarget, harvestPlan, harvest, harvestRate } from './harvest.js';
export { MATERIALS, RECIPES, rockyTick, dock, undock, missionPlan, startMission, recipes, craft, waitForRocky } from './rocky.js';
export { serialize, deserialize } from './save.js';

// The world tick: advance the infection, then resolve Rocky's mission if it is due.
// (rocky.js cannot import tick from astrophage.js for this: that would be circular.)
export function tick(state, dtYears) {
  worldTick(state, dtYears);
  rockyTick(state);
}

export function createGame(seed = 1) {
  const state = {
    seed, status: 'playing', statusText: '',
    time: { worldYears: 0, shipYears: 0 },
    ship: { starId: 'tauceti', planetId: null, fuelKg: 60000, fuelMaxKg: 60000, hull: 1, upgrades: [], samples: 0 },
    stars: createStars(seed),
    lab: { strains: [], bestTolerance: 0, escapeRisk: 0, generations: 0, nextId: 1 },
    delivered: { sol: false, eri40: false },
    log: [],
    rng: { s: mixSeed(seed, 0xA57A) },
  };
  state.rocky = { docked: true, starId: state.ship.starId, planetId: state.ship.planetId, mission: null,
    materials: { minerals: 2, volatiles: 1, gas: 0, silicates: 1 }, built: [], says: null };
  addLog(state, 'The Hail Mary hangs at Tau Ceti. Sol and 40 Eridani are dimming. Tau Ceti is not.');
  return state;
}
