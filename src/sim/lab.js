import { stateRng } from './rng.js';
import { findPlanet, findStar } from './stars.js';
import { tick, checkEnd } from './astrophage.js';
import { addLog, spend } from './util.js';
import { COSTS, orbitDistanceAu } from './ship.js';
import { drawEvent } from './events.js';
import { relayInRange } from './galaxy.js';

export const TOLERANT = 0.9;
export const STEP_YEARS = COSTS.breed.years;
const SIGMA = 0.06, SLOPE = 4, POP_CAP = 1000;
const clamp01 = (x) => Math.max(0, Math.min(1, x));

function refresh(state) {
  const l = state.lab;
  l.bestTolerance = l.strains.reduce((m, s) => Math.max(m, s.nTolerance), 0);
  l.escapeRisk = l.strains.length && !state.ship.upgrades.includes('xenonite-lab') ? +(0.6 * l.bestTolerance ** 2).toFixed(4) : 0;
}
export { refresh as refreshLab };

export const CLOSE_AU = 0.6;   // within this many AU (while at a planet's orbit) counts as "close" for scans
const orbiting = (state, id) => (state.ship.planetId ?? null) === id;

// Findings of a full (close) scan; shared by the instant scan and the orbital sweep.
export function closeFindings(p) {
  const fi = [];
  fi.push(`${p.type} world, ${p.radius} Earth radii, orbit ${p.orbit} AU, year ${Math.round(p.periodDays)} days`);
  fi.push(p.atmo.density > 0.7 ? 'dense atmosphere' : p.atmo.density > 0.25 ? 'moderate atmosphere' : 'thin atmosphere');
  if (p.rings) fi.push('ring system');
  if (p.special === 'earth') fi.push('liquid water, a biosphere, and a dimming sun');
  if (p.special === 'erid') fi.push('crushing gravity and a hot ammonia-laced atmosphere: home of the Eridians');
  if (p.hasTaumoeba) fi.push('Taumoeba signature in the upper atmosphere: they feed on Astrophage');
  return fi;
}

// Scan works from anywhere in the system. Level 2 (full): in orbit, or in orbit of a planet within CLOSE_AU.
// Level 1 (remote, from parking orbit or farther): coarse bulk properties only, no biosignatures.
export function scanPlanet(state, planetId) {
  const f = findPlanet(state, planetId);
  if (!f) return { ok: false, text: 'No such planet.', findings: [] };
  if (f.star.id !== state.ship.starId) {
    // A Cartographer relay within range can resolve a distant world's atmosphere.
    if (!relayInRange(state, f.star.id)) return { ok: false, text: `${f.planet.name} is not in this system.`, findings: [] };
    const p = f.planet;
    p.scanned = true;
    p.scanLevel = Math.max(p.scanLevel || 0, 1);
    const cost = spend(state, COSTS.scanRemote, tick);
    state.research = (state.research ?? 0) + 2;
    if ((state.campaign?.act ?? 1) >= 2) drawEvent(state, 'survey', { chance: 0.75, planetId });
    return { ok: true, text: `Relay scan of ${p.name}: ${p.type} world, orbit ${p.orbit} AU; coarse biosphere data only.`, findings: [], level: 1, cost };
  }
  const p = f.planet, fi = [];
  const inOrbit = orbiting(state, planetId);
  const close = inOrbit || ((state.ship.planetId ?? null) !== null && orbitDistanceAu(state, p) <= CLOSE_AU);
  if (close) {
    fi.push(...closeFindings(p));
    p.scanLevel = 2;
  } else {
    fi.push(`${p.type} world, about ${p.radius < 1.5 ? 'Earth-sized' : p.radius < 4 ? 'a few Earth radii' : 'giant'}, orbit ${p.orbit} AU`);
    fi.push(p.atmo.density > 0.25 ? 'atmosphere present' : 'little or no atmosphere');
    if (p.rings) fi.push('ring system');
    fi.push('too far to resolve the upper atmosphere: no biosignature data (fly closer for a full scan)');
    p.scanLevel = Math.max(p.scanLevel || 0, 1);
  }
  p.scanned = true;
  const cost = spend(state, close ? COSTS.scan : COSTS.scanRemote, tick);
  state.research = (state.research ?? 0) + 2;
  drawEvent(state, 'survey', { chance: (state.campaign?.act ?? 1) >= 2 ? 0.75 : 0.25, planetId });
  return { ok: true, text: `${close ? 'Scan' : 'Remote scan'} of ${p.name}: ${fi.join('; ')}.`, findings: fi, level: p.scanLevel, cost };
}

export function samplePlanet(state, planetId) {
  const f = findPlanet(state, planetId);
  if (!f) return { ok: false, text: 'No such planet.' };
  const p = f.planet;
  if (f.star.id !== state.ship.starId) return { ok: false, text: `${p.name} is not in this system.` };
  if (!orbiting(state, planetId)) return { ok: false, text: `You must be in orbit around ${p.name} to sample it. Fly to orbit first.` };
  if (!p.scanned || (p.scanLevel || 0) < 2) return { ok: false, text: 'Scan the planet first.' };
  if (!p.hasTaumoeba) return { ok: false, text: `Nothing of interest to sample on ${p.name}.` };
  return collectSample(state, planetId, 'instant');
}

// Shared by the legacy instant sample and the tether-probe mini-game: add the sample and a wild strain, charge the cost.
export function collectSample(state, planetId, how = 'instant') {
  const f = findPlanet(state, planetId), p = f.planet;
  const rng = stateRng(state);
  state.ship.samples += 1;
  p.sampled = true;
  const l = state.lab;
  if (l.strains.length < 4) {
    l.nextId = (l.nextId || 1);
    l.strains.push({ id: `s${l.nextId++}`, nTolerance: +(0.05 + rng.next() * 0.03).toFixed(4), population: 200, generation: 0 });
  }
  refresh(state);
  state.research = (state.research ?? 0) + 3;
  if ((state.campaign?.act ?? 1) >= 2 && !state.events?.pending) drawEvent(state, 'survey', { chance: 0.2, planetId });
  const cost = spend(state, COSTS.sample, tick);
  addLog(state, `Collected a Taumoeba sample from ${p.name}${how === 'tether' ? ' with the tether probe' : ''}.`);
  return { ok: true, text: `Taumoeba sample collected from ${p.name}. Samples aboard: ${state.ship.samples}.`, cost };
}

export function breedStep(state, { nitrogenPct } = {}) {
  const l = state.lab;
  if (state.status !== 'playing') return { ok: false, text: 'The mission is over.', strains: l.strains };
  if (!l.strains.length) return { ok: false, text: 'No Taumoeba strains to breed. Sample Adrian first.', strains: l.strains };
  const n = clamp01((Number.isFinite(nitrogenPct) ? nitrogenPct : 0) / 100);
  const rng = stateRng(state);
  const lost = [], notes = [];
  const next = [];
  for (const s of l.strains) {
    let sumP = 0, sumPC = 0;
    for (let i = 0; i < 8; i++) {
      const c = clamp01(s.nTolerance + rng.gauss() * SIGMA + 0.003);
      const p = clamp01(1 - Math.max(0, n - c) * SLOPE);
      sumP += p; sumPC += p * c;
    }
    const surv = sumP / 8;
    const pop = Math.min(POP_CAP, s.population * 2 * surv);
    if (pop < 20) { lost.push(s.id); continue; }
    next.push({ ...s, nTolerance: +clamp01(sumPC / sumP).toFixed(4), population: Math.round(pop), generation: s.generation + 1 });
  }
  l.strains = next;
  l.generations += 1;
  let text;
  if (!next.length) {
    text = `${nitrogenPct}% nitrogen was lethal. Every Taumoeba culture died.`;
    addLog(state, 'Lab: every Taumoeba culture died from nitrogen shock.');
  } else {
    if (lost.length) notes.push(`${lost.length} culture(s) died`);
    const best = Math.max(...next.map((s) => s.nTolerance));
    text = `Generation ${l.generations} at ${nitrogenPct}% N2: best tolerance ${(best * 100).toFixed(1)}%.${notes.length ? ' ' + notes.join(', ') + '.' : ''}`;
  }
  refresh(state);
  // escape check
  if (next.length && rng.next() < l.escapeRisk * 0.1) {
    const dmg = 0.15 + rng.next() * 0.15;
    state.ship.hull = Math.max(0, state.ship.hull - dmg);
    l.strains = [];
    refresh(state);
    text += ' BREACH: Taumoeba ate through the containment. The hull is damaged and the strains are gone.';
    addLog(state, `Lab breach! Hull at ${(state.ship.hull * 100).toFixed(0)}%, all strains lost.`);
    if (state.ship.hull <= 0) {
      state.status = 'lost';
      state.statusText = 'The Taumoeba ate through the hull. The Hail Mary is lost.';
      addLog(state, state.statusText);
    }
  }
  const cost = spend(state, COSTS.breed, tick);
  return { ok: true, text, strains: l.strains, cost };
}

export function deliver(state) {
  const star = findStar(state, state.ship.starId);
  if (state.status !== 'playing') return { ok: false, text: 'The mission is over.' };
  if (star.id !== 'sol' && star.id !== 'eri40') return { ok: false, text: 'There is nothing to save here. Deliver at Sol or 40 Eridani.' };
  if (state.delivered[star.id]) return { ok: false, text: `${star.name} already has Taumoeba.` };
  const here = state.ship.planetId && findPlanet(state, state.ship.planetId);
  if (!here || (here.planet.special !== 'earth' && here.planet.special !== 'erid')) {
    return { ok: false, text: `Fly to orbit around ${star.id === 'sol' ? 'Earth' : 'Erid'} first: Taumoeba must be released from its orbit.` };
  }
  const good = state.lab.strains.find((s) => s.nTolerance >= TOLERANT && s.population > 0);
  if (!good) return { ok: false, text: `No strain tolerates enough nitrogen (need ${TOLERANT * 100}%).` };
  state.delivered[star.id] = true;
  addLog(state, `Released tolerant Taumoeba at ${star.name}. The Astrophage will begin to decline.`);
  checkEnd(state);
  return { ok: true, text: `Taumoeba released at ${star.name}. The infection will recede.` };
}
