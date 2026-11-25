import { $ } from './util.js';

// Mapping of planet id -> display name for the star
const NAME = { eri40: '40 Eridani', sol: 'Sol' };
const WORLD = { eri40: 'Erid', sol: 'Earth' };
const PLANET = { eri40: 'eri40-2', sol: 'sol-3' };

// Helper: find a rocky/lava planet in the star's system for mineral gathering
function mineralPlanet(star) {
  for (const p of star.planets) {
    if (p.type === 'rocky' || p.type === 'lava') return p;
  }
  return null;
}

// True when a living strain has reached 90% N₂ tolerance.
const tolerant = (st) => st.lab.strains.some((s) => s.nTolerance >= 0.9 && s.population > 0);

// Which world to save next: the undelivered one ('eri40' or 'sol') whose countdown is smaller; null when both are done.
export function nextTarget(sim, st) {
  const left = ['eri40', 'sol'].filter((id) => !st.delivered[id]);
  if (!left.length) return null;
  const years = (id) => sim.extinctionYears(st, id === 'eri40' ? 'erid' : 'earth');
  return left.sort((a, b) => years(a) - years(b))[0];
}

// -> { stage: 'n/4', goal, act }
export function objectiveFor(sim, st) {
  const sh = st.ship, star = st.stars.find((s) => s.id === sh.starId);
  if (!star) return null;

  // ---- won / lost ----
  if (st.status === 'won') return { stage: '4/4', goal: 'Both worlds saved', act: 'Astrophage is receding. You won.' };
  if (st.status === 'lost') return { stage: '-', goal: 'Mission failed', act: 'Start a new game from the title screen.' };

  // ---- Rocky directives ----
  const r = st.rocky;

  // Low fuel: Gather at Petrova planet for Astrophage fuel, or HARVEST
  if (sh.fuelKg / sh.fuelMaxKg < 0.3) {
    const petrova = sim.petrovaTarget(star.planets);
    if (petrova) {
      return { stage: '!', goal: 'Low fuel', act: `BLIP-A (4) → GATHER at ${petrova.name} for Astrophage fuel, or HARVEST` };
    }
    return { stage: '!', goal: 'Low fuel', act: 'BLIP-A (4) → GATHER at a planet for minerals, or HARVEST' };
  }

  // Rocky not docked or has a mission running, and next step is interstellar jump
  if (sh.planetId === null && r && (!r.docked || r.mission)) {
    return { stage: '!', goal: 'Rocky away', act: 'BLIP-A (4) → WAIT FOR ROCKY' };
  }

  // Lab escape risk rising and xenonite-lab not built
  if (!r || !r.built.includes('xenonite-lab')) {
    if (st.lab.escapeRisk > 0.25) {
      // Check if we have materials for xenonite lab
      const haveMinerals = sh.upgrades && sh.materials && (sh.materials.minerals || 0) >= 2;
      const haveSilicates = sh.materials && (sh.materials.silicates || 0) >= 1;
      if (!haveMinerals || !haveSilicates) {
        const p = mineralPlanet(star);
        const planetName = p ? p.name : 'a rocky/lava planet';
        return { stage: '2/4', goal: 'Escape risk is high', act: `BLIP-A (4) → GATHER at ${planetName} for minerals` };
      }
      return { stage: '2/4', goal: 'Escape risk is high: contain it', act: 'BLIP-A (4) → BUILD Xenonite lab' };
    }
  }

  // ---- Stage 1: get Taumoeba ----
  const haveStrain = st.lab.strains.length > 0, tol = tolerant(st);
  if (!haveStrain && sh.samples === 0 && !tol) {
    const goal = 'Get Taumoeba, the Astrophage eater';
    if (star.id !== 'tauceti') return { stage: '1/4', goal, act: 'NAV (1) → click Tau Ceti → ENGAGE' };
    const ad = star.planets.find((p) => p.special === 'adrian');
    if (sh.planetId !== ad.id) return { stage: '1/4', goal, act: `SYSTEM (2) → click ${ad.name} → FLY TO ORBIT` };
    const cov = ad.scan ? ad.scan.coverage : 0;
    if ((ad.scanLevel || 0) < 2) return { stage: '1/4', goal, act: `Press SCAN: sweep ${ad.name} to 60%+ (now ${Math.round(cov * 100)}%). Press F to follow the ship` };
    if (st.sampling && st.sampling.status === 'active') return { stage: '1/4', goal, act: 'Hold SPACE to lower the chain into the green band; release to hold, R to reel in' };
    return { stage: '1/4', goal, act: `Open the LIFE layer → click a hotspot → SAMPLE → hold SPACE to lower the chain into the green band until the sample meter fills` };
  }
  if (!haveStrain && !tol) {
    return { stage: '1/4', goal: 'Strains lost: get another sample', act: star.id === 'tauceti' ? 'SYSTEM (2) → Adrian → FLY TO ORBIT → SAMPLE' : 'NAV (1) → Tau Ceti → ENGAGE, then sample Adrian again' };
  }

  // ---- Stage 2: breed ----
  if (!tol) {
    const best = st.lab.bestTolerance, n = Math.min(100, Math.round(best * 100 + 10));
    if (!sh.upgrades.includes('xenonite-lab') && st.lab.escapeRisk > 0.25) {
      const haveMinerals = sh.materials && (sh.materials.minerals || 0) >= 2;
      const haveSilicates = sh.materials && (sh.materials.silicates || 0) >= 1;
      if (!haveMinerals || !haveSilicates) {
        const p = mineralPlanet(star);
        const planetName = p ? p.name : 'a rocky/lava planet';
        return { stage: '2/4', goal: 'Escape risk is high', act: `Need 1 spare sample to offer Rocky: SYSTEM (2) → ${planetName} → SAMPLE` };
      }
      // Materials OK - show BLIP-A build directive instead of trade path
      return { stage: '2/4', goal: 'Escape risk is high: contain it', act: 'BLIP-A (4) → BUILD Xenonite lab' };
    }
    return { stage: '2/4', goal: 'Breed Taumoeba to 90% tolerance',
      act: `LAB (3) → set N₂ to ~${n}% → BREED GENERATION (tolerance now ${Math.round(best * 100)}% / need 90%)` };
  }

  // ---- Stages 3 and 4: deliver ----
  const tid = nextTarget(sim, st), stage = st.delivered.eri40 || st.delivered.sol ? '4/4' : '3/4';
  const goal = `Release Taumoeba at ${WORLD[tid]}`;
  if (star.id !== tid) {
    const plan = sim.travelPlan(st, tid);
    if (plan.fuelKg > sh.fuelKg) {
      return { stage, goal: 'Not enough fuel for the trip',
        act: `BLIP-A (4) → GATHER at ${sim.petrovaTarget(star.planets) ? sim.petrovaTarget(star.planets).name : 'a planet'} for Astrophage fuel, or HARVEST` };
    }
    return { stage, goal, act: `NAV (1) → click ${NAME[tid]} → ENGAGE` };
  }
  if (sh.planetId !== PLANET[tid]) return { stage, goal, act: `SYSTEM (2) → click ${WORLD[tid]} → FLY TO ORBIT` };
  return { stage, goal, act: 'SYSTEM (2) → RELEASE TAUMOEBA' };
}

export function createObjective(sim) {
  let last = '';
  return {
    update(state) {
      const o = objectiveFor(sim, state), key = o.stage + o.goal + o.act;
      if (key === last) return;
      last = key;
      $('obj-stage').textContent = o.stage === '!' ? 'ALERT' : o.stage === '-' ? '' : 'Stage ' + o.stage;
      $('objective').classList.toggle('alert', o.stage === '!');
      $('obj-goal').textContent = o.goal;
      $('obj-act').textContent = o.act;
    },
  };
}