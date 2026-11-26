import { mixSeed } from './rng.js';
import { createStars, findStar, starDistance } from './stars.js';
import { addLog } from './util.js';
import { tick as worldTick, updateLum } from './astrophage.js';
import { rockyTick } from './rocky.js';
import { registerPack, content } from './content.js';
import { loadContent } from '../../content/index.js';
import { extendGalaxy, genPois, initKnowledge, spreadTick } from './galaxy.js';
import { ensureEvents } from './events.js';
import { beetleTick } from './beetles.js';
import { campaignTick, completePrologue } from './campaign.js';

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
export * from './prologue.js';

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

export function createGame(seed = 1, opts = {}) {
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
  const adrian = stars.find((s) => s.id === 'tauceti').planets.find((p) => p.special === 'adrian');
  // legacyActI keeps the original tutorial for old saves/tests; skipPrologue opens Act II
  // with the same state a completed prologue leaves behind.
  const legacy = !!opts.legacyActI;
  const newActI = !legacy;
  const playingPrologue = newActI && !opts.skipPrologue;
  const state = {
    seed, status: 'playing', statusText: '',
    time: { worldYears: 0, shipYears: 0 },
    ship: { starId: 'tauceti', planetId: newActI ? adrian.id : null, fuelKg: 60000, fuelMaxKg: 60000,
      hull: 1, upgrades: newActI ? ['xenonite-lab'] : [], samples: 0 },
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
  // Rocky built the xenonite lab on the way in: the prologue has no escape risk and no
  // material detour. A legacy start keeps the original untouched inventory.
  state.rocky = { docked: true, starId: state.ship.starId, planetId: state.ship.planetId, mission: null,
    materials: newActI ? { minerals: 0, volatiles: 1, gas: 0, silicates: 0 } : { minerals: 2, volatiles: 1, gas: 0, silicates: 1 },
    built: newActI ? ['xenonite-lab'] : [], says: null };
  initKnowledge(state);
  ensureEvents(state);
  state.campaign = { act: 1, mode: 'campaign', board: [], saved: [], dark: [], score: 0,
    cycle: 0, difficulty: 1, targets: [], pendingCard: null };
  if (newActI) state.campaign.prologue = playingPrologue;
  addLog(state, playingPrologue
    ? 'PROLOGUE: the Hail Mary is already in orbit of Adrian. Scan, sample, breed a Taumoeba strain, send a Beetle to Sol, then deliver at Erid.'
    : 'The Hail Mary hangs at Tau Ceti. Sol and 40 Eridani are dimming. Tau Ceti is not.');
  if (newActI && opts.skipPrologue) {
    // Same shape as a finished run: the ship is at Erid after the delivery, and the free
    // Sol courier has already arrived (credited, so Act II will not pay it twice).
    state.ship.starId = 'eri40';
    state.ship.planetId = 'eri40-2';
    state.rocky.starId = 'eri40';
    state.rocky.planetId = 'eri40-2';
    completePrologue(state);
    const strain = state.genetics.strains.find((s) => s.name === 'Taumoeba-1');
    const from = findStar(state, 'tauceti'), to = findStar(state, 'sol');
    const d = from && to ? starDistance(from, to) : 0;
    state.beetles.push({
      id: `b${state.beetles.length + 1}`, strainId: strain.id, from: 'tauceti', to: 'sol',
      strainData: { id: strain.id, name: strain.name, traits: { ...strain.traits }, population: strain.population },
      departWorldYears: 0, arriveWorldYears: +(d / 0.99).toFixed(4), status: 'arrived', credited: true, prologue: true,
    });
  }
  return state;
}
