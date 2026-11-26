#!/usr/bin/env node
// Headless balance autoplayer (plan §6, step 6).
//
// The greedy bot behind the balance runs: seeded games played through the public sim
// API with no UI. Act I runs the tuned Hail Mary route (sample Adrian, breed the
// tolerance, deliver to Erid and Sol); Acts II/III follow the mission board, refuel by
// harvesting, breed toward the most threatened star's biosphere, deliver, buy tech and
// follow the Cartographers toward the Source.
//
// Run: node tools/autoplay.mjs [seeds=5] [--endless]

import { pathToFileURL } from 'node:url';
import * as S from '../src/sim/index.js';

export const ACTION_SECONDS = 20;    // one player click, roughly, at 1x speed
export const JUMP_SECONDS = 15;      // the jump cinematic
export const DEFAULT_MAX_ACTIONS = 20000;
export const DEFAULT_MAX_WORLD_YEARS = 3000;
export const STUCK_THRESHOLD = 50;   // same state signature this many times in a row = stuck

const LOW_FUEL_KG = 20000;           // refuel once the tanks run this low
const SOURCE_PROFILE = Object.fromEntries(S.BIOSPHERE.map((t) => [t, 0.95]));  // the Source wants a full-coverage strain
const BEETLE_DISTANCE_LY = 0.1;     // send couriers instead of flying whenever there is a gap
const MIN_BREEDS_PER_SAVE = 10;     // a world needs a real breeding campaign, not one lucky strain

const starOf = (g, id) => (g.stars || []).find((s) => s.id === id) || null;
const planetOf = (g, id) => {
  for (const s of g.stars || []) {
    const p = (s.planets || []).find((x) => x.id === id);
    if (p) return { star: s, planet: p };
  }
  return null;
};

// A compact fingerprint of everything the bot's decisions depend on.
function signature(g) {
  const s = g.ship || {}, c = g.campaign || {};
  const threats = (c.targets || []).filter((id) => { const st = starOf(g, id); return st && !st.saved; }).join(',');
  return JSON.stringify([
    g.status, c.act, c.mode, +(g.time?.worldYears ?? 0).toFixed(3),
    s.starId, s.planetId, Math.round(s.fuelKg ?? 0), Math.round((s.hull ?? 1) * 100),
    !!g.delivered?.sol, !!g.delivered?.eri40,
    (c.saved || []).length, (c.dark || []).length,
    g.events?.pending?.id ?? null,
    (c.board || []).map((b) => `${b.id}:${b.done ? 1 : 0}`).join(','),
    threats,
    Math.floor(g.research ?? 0),
    (g.tech?.owned || []).join(','),
  ]);
}

// Sweep + probe the first revealed hotspot on the given planet (the scripted-controller path).
function sampleAd(g, st) {
  const ad = planetOf(g, 'tauceti-3');
  if (!ad) return { ok: false, text: 'No such planet.' };
  const p = ad.planet;
  if (!p.scanned || (p.scanLevel || 0) < 2) {
    st.scans += 1; st.actions += 1;
    const b = S.scanBegin(g, 'tauceti-3');
    if (!b.ok) return b;
    S.scanProgress(g, 'tauceti-3', 1);
  }
  const m = S.scanMap(g, 'tauceti-3');
  const hs = m?.hotspots?.find((q) => q.revealed);
  if (!hs) return { ok: false, text: 'No hotspot to sample.' };
  st.samples += 1; st.actions += 1;
  const bs = S.beginSample(g, 'tauceti-3', hs.id);
  if (!bs.ok) return bs;
  const dt = 1 / 30;
  for (let i = 0; i < 4000; i++) {
    const s = g.sampling;
    const c = S.bandAt(s, s.t + dt);
    const want = Math.max(-S.PROBE.lowerSpeed * dt, Math.min(S.PROBE.reelSpeed * dt, c - s.depth));
    const r = S.sampleStep(g, { depthDelta: want, dt });
    if (r.status === 'success') { S.endSample(g); return { ok: true }; }
    if (r.status !== 'active') { S.endSample(g); return r; }
  }
  S.endSample(g);
  return { ok: false, text: 'Sampling timed out.' };
}

// Act I: the tuned winning route. Crafts the xenonite lab, samples Adrian, breeds the
// tolerance up, then delivers to 40 Eridani and Sol (the order the old win path used).
function stepActOne(g, st) {
  // Resolve cards as they arrive, including the Cartographer chain: an overwritten
  // pending card would be marked seen but never answered.
  const view = S.pendingEvent(g);
  if (view) {
    const idx = view.choices.findIndex((ch) => ch.ok);
    if (idx >= 0) { st.actions += 1; st.events += 1; S.resolveChoice(g, idx); return true; }
  }
  const delivered = g.delivered ?? {};
  const eridDone = !!delivered.eri40;   // delivered.eri40: the Erid flag, keyed by star id
  const solDone = !!delivered.sol;
  if (eridDone && solDone) return false;                 // both worlds saved: the act has opened into act II
  if (!g.ship.upgrades?.includes('xenonite-lab')) {
    st.actions += 1; st.crafts += 1;
    S.craft(g, 'xenonite-lab');
    return true;
  }
  // Phase 1: until the Erid delivery is due, run the Hail Mary route out of Tau Ceti.
  if (!eridDone) {
    const ready = (g.lab.strains?.length || 0) > 0 && (g.lab.bestTolerance ?? 0) >= 0.9;
    if (!ready) {
      const atAdrian = g.ship.starId === 'tauceti' && g.ship.planetId === 'tauceti-3';
      if (!atAdrian) {
        if (g.ship.starId !== 'tauceti') { st.actions += 1; st.jumps += 1; S.travel(g, 'tauceti'); return true; }
        st.actions += 1; S.travelToPlanet(g, 'tauceti-3'); return true;
      }
      const ad = planetOf(g, 'tauceti-3');
      if (!ad.planet.sampled || !g.lab.strains?.length) { sampleAd(g, st); return true; }
      if ((g.lab.bestTolerance ?? 0) < 0.9) {
        st.actions += 1; st.breeds += 1;
        S.breedStep(g, { nitrogenPct: Math.min(100, (g.lab.bestTolerance ?? 0) * 100 + 10) });
        return true;
      }
    }
  }
  // Phase 2: deliver the next unwatched world (Erid first, then Sol).
  const target = eridDone ? 'sol' : 'eri40';
  const planetId = target === 'eri40' ? 'eri40-2' : 'sol-3';
  if (g.ship.starId !== target) { st.actions += 1; st.jumps += 1; S.travel(g, target); return true; }
  if (g.ship.planetId !== planetId) { st.actions += 1; S.travelToPlanet(g, planetId); return true; }
  st.actions += 1; st.delivers += 1;
  S.deliver(g);
  return true;
}

// The threatened star the bot is currently hunting: unsaved, highest infection.
function mostThreatened(g) {
  const c = g.campaign;
  const pool = [];
  const seen = new Set();
  const here = starOf(g, g.ship.starId);
  let maxLy = 26;
  for (let i = 0; i < 4; i++) maxLy = (g.ship.fuelMaxKg ?? 60000) / (1500 * (1 + 0.02 * maxLy));
  const add = (id) => {
    if (seen.has(id)) return;
    const s = starOf(g, id);
    if (!s || s.saved || s.dark) return;
    if (c.act === 3 && id === c.sourceStarId && !c.sourceDelivered) return;  // saved for the final answer
    if ((g.beetles || []).some((b) => b.to === id && b.status === 'flying')) return;
    if (here) {
      const d = Math.hypot(s.pos[0] - here.pos[0], s.pos[1] - here.pos[1], s.pos[2] - here.pos[2]);
      if (d > maxLy && !S.relayInRange(g, id)) return;   // this jump is beyond even a full tank
    }
    seen.add(id); pool.push({ id, star: s });
  };
  const skip = (id) => id === 'tauceti' || id === 'sol' || id === 'eri40';
  if (c.mode === 'endless' || (c.act ?? 1) >= 2) {
    for (const id of c.targets || []) add(id);
    for (const id of Object.keys(g.galaxy?.known || {})) { if (!skip(id)) add(id); }
  }
  pool.sort((a, b) => b.star.infection - a.star.infection);
  return pool[0] || null;
}

// Harvest at the local Petrova line when the tanks cannot pay for the next jump.
function refuel(g, st) {
  const star = starOf(g, g.ship.starId);
  const tgt = star ? S.petrovaTarget(star.planets) : null;
  if (!star || !(star.infection > S.HARVEST.minInfection) || !tgt) return false;
  if ((g.ship.planetId ?? null) !== tgt.id && S.travelToPlanet(g, tgt.id).ok) { st.actions += 1; return true; }
  st.harvests += 1; st.actions += 1;
  if (S.harvest(g, 'collector')?.ok) return true;
  return !!S.harvest(g, 'skim')?.ok;
}

// Jump to a system, stopping to refuel first if the tank cannot cover the trip.
function travelTo(g, st, id) {
  const plan = S.travelPlan(g, id);
  if (!plan.ok) {
    if (/fuel/i.test(plan.reason)) {
      if ((g.ship.fuelKg ?? 0) < (g.ship.fuelMaxKg ?? 60000) - 1000 && refuel(g, st)) {
        return true;
      }
      // Too far for one tank: hop to a star closer to the destination.
      const here = starOf(g, g.ship.starId), target = starOf(g, id);
      if (here && target) {
        const maxLy = plan.distanceLy || 26;
        const dTo = (s) => Math.hypot(s.pos[0] - target.pos[0], s.pos[1] - target.pos[1], s.pos[2] - target.pos[2]);
        const hops = (g.stars || []).filter((s) => s.id !== here.id && s.id !== target.id
          && Math.hypot(s.pos[0] - here.pos[0], s.pos[1] - here.pos[1], s.pos[2] - here.pos[2]) < maxLy)
          .sort((a, b) => dTo(a) - dTo(b));
        if (hops[0] && dTo(hops[0]) < dTo(here)) {
          const r = S.travel(g, hops[0].id);
          if (r.ok) { st.actions += 1; st.jumps += 1; return true; }
        }
      }
    }
    st.blocked = plan.reason;
    return false;
  }
  // Never leave the tanks nearly empty if this system can still feed them.
  if (g.ship.fuelKg - plan.fuelKg < 2000 && refuel(g, st)) return true;
  st.actions += 1; st.jumps += 1;
  S.travel(g, id);
  return true;
}

// Survey a target's biosphere: one scan in its system is enough to know what it needs.
function surveyTarget(g, st, id) {
  const star = starOf(g, id);
  if (!star || star.planets.some((p) => p.scanned)) return false;
  if (g.ship.starId !== id) {
    if (!S.relayInRange(g, id) && S.buildRelay(g, g.ship.starId)) { st.actions += 1; st.crafts += 1; }
    const r = S.scanPlanet(g, star.planets[0].id);
    if (r.ok) { st.actions += 1; st.scans += 1; return true; }
    return travelTo(g, st, id);
  }
  st.actions += 1; st.scans += 1;
  S.scanPlanet(g, star.planets[0].id);
  return true;
}

// Advance the working strain one generation toward the profile's weakest-covered trait.
// The work record keeps the same culture across steps, so a save takes several breeds.
function breedToward(g, st, key, profile) {
  let work = st.work && st.work.key === key ? st.work : null;
  let strain = work && S.geneticsOf(g).strains.find((s) => s.id === work.strainId);
  if (!strain) {
    strain = S.newStrain(g);
    strain.population = 200;
    work = { key, strainId: strain.id, gens: 0 };
    st.work = work;
  }
  const short = S.BIOSPHERE.filter((t) => (profile[t] ?? 0) > 0)
    .map((t) => ({ t, ratio: (strain.traits[t] ?? 0) / profile[t] }))
    .sort((a, b) => a.ratio - b.ratio);
  const focus = short.length ? short[0].t : 'vigor';
  st.actions += 1; st.breeds += 1;
  const b = S.breed(g, { focus, pressure: 0.5, strainId: strain.id }, S.tick);
  if (b.ok) { work.strainId = b.strain.id; work.gens += 1; }
  return true;
}

// Rocky brings back xenonite parts when the beetle shop is empty.
function gatherBeetleParts(g, st) {
  const m = g.rocky?.materials || {};
  const need = S.beetleCost(g).materials;
  if ((m.minerals ?? 0) >= need.minerals && (m.silicates ?? 0) >= need.silicates) return false;
  if (!g.rocky?.docked || g.rocky.mission) return false;
  const star = starOf(g, g.ship.starId);
  const planets = star?.planets || [];
  const needSil = (m.silicates ?? 0) < need.silicates;
  const planet = needSil ? planets.find((p) => p.type === 'desert')
    : planets.find((p) => p.type === 'rocky' || p.type === 'lava');
  if (!planet) return false;
  const plan = S.missionPlan(g, 'gather', planet.id);
  if (!plan.ok || (!(plan.yield.minerals > 0) && !(plan.yield.silicates > 0))) return false;
  st.actions += 1; st.crafts += 1;
  S.startMission(g, 'gather', planet.id);
  st.actions += 1;
  S.waitForRocky(g);
  return true;
}

// Deliver (or beetle-deliver) at the most threatened star; breed toward its profile when no strain fits yet.
// In act III the real prize is the Cartographer Source: answer it with a full-coverage strain.
function deliverThreat(g, st) {
  const c = g.campaign || {};
  // The Source only answers once the Cartographer chain is complete, and only after
  // the bot has spent a good while working the lanes.
  const sourceRun = (c.act ?? 1) === 3 && !!c.sourceStarId && !c.sourceDelivered
    && !!g.events?.flags?.carto6
    && (st.act3Start != null ? st.actions - st.act3Start >= 820 : false);
  if (sourceRun) {
    const sourceId = c.sourceStarId;
    const profile = SOURCE_PROFILE;
    if (surveyTarget(g, st, sourceId)) return true;
    const strains = S.geneticsOf(g).strains || [];
    const ready = (st.work?.key === 'source' && st.work.gens >= MIN_BREEDS_PER_SAVE);
    const good = ready && strains.find((s) => (s.population ?? 0) > 0 && S.canSave(s, profile));
    if (!good) return breedToward(g, st, 'source', profile);
    if ((g.beetles || []).some((b) => b.to === sourceId && b.status === 'flying')) return false;
    // The final answer can fly by courier; only fly the ship when a probe cannot be built.
    if (g.ship.starId !== sourceId) {
      if (gatherBeetleParts(g, st)) return true;
      const launch = S.launchBeetle(g, good.id, sourceId);
      if (launch.ok) { st.actions += 1; st.launches += 1; st.beetles.push(launch.beetle?.id); st.work = null; return true; }
      return travelTo(g, st, sourceId);
    }
    st.actions += 1; st.delivers += 1;
    S.deliverStrain(g, good.id);
    st.work = null;
    return true;
  }
  let threat = mostThreatened(g);
  if (!threat) return false;
  // Finish the culture already in the lab before switching to a new world.
  if (st.work && st.work.key !== 'source') {
    const w = starOf(g, st.work.key);
    const inFlight = (g.beetles || []).some((b) => b.to === w?.id && b.status === 'flying');
    if (w && !w.saved && !w.dark && !inFlight && st.work.gens < 30) threat = { id: w.id, star: w };
  }
  // Claim the target before surveying it: travel to a system must not be abandoned
  // halfway just because another star's infection ticked higher.
  if (!st.work || st.work.key !== threat.id) st.work = { key: threat.id, strainId: null, gens: 0 };
  if (surveyTarget(g, st, threat.id)) return true;
  const profile = S.biosphereProfile(threat.star);
  const strains = S.geneticsOf(g).strains || [];
  const ready = st.work?.key === threat.id && st.work.gens >= MIN_BREEDS_PER_SAVE;
  const good = ready && strains.find((s) => (s.population ?? 0) > 0 && S.canSave(s, profile));
  if (good) {
    if (g.ship.starId === threat.id) {
      st.actions += 1; st.delivers += 1;
      S.deliverStrain(g, good.id);
      st.work = null;
      return true;
    }
    // A courier is cheaper than a jump for a distant world — if Rocky has parts.
    const here = starOf(g, g.ship.starId);
    const d = here ? Math.hypot(here.pos[0] - threat.star.pos[0], here.pos[1] - threat.star.pos[1], here.pos[2] - threat.star.pos[2]) : 0;
    if (d > BEETLE_DISTANCE_LY && !gatherBeetleParts(g, st)) {
      const launch = S.launchBeetle(g, good.id, threat.id);
      if (launch.ok) { st.actions += 1; st.launches += 1; st.beetles.push(launch.beetle?.id); st.work = null; return true; }
    }
    if (g.ship.starId !== threat.id) return travelTo(g, st, threat.id);
    st.actions += 1; st.delivers += 1;
    S.deliverStrain(g, good.id);
    st.work = null;
    return true;
  }
  return breedToward(g, st, threat.id, profile);
}

// Keep the Cartographer chain moving: flight, arrival and survey draws are the only
// way to finish it, so fly between systems and scan worlds while there is time.
function loreHunt(g, st) {
  const c = g.campaign || {};
  if ((c.act ?? 1) < 3 || c.mode === 'endless' || g.events?.flags?.carto6) return false;
  const here = starOf(g, g.ship.starId);
  const planet = here?.planets.find((p) => !p.scanned);
  if (planet && g.ship.starId === g.ship.starId) {
    st.actions += 1; st.scans += 1;
    S.scanPlanet(g, planet.id);
    return true;
  }
  const candidates = (g.stars || []).filter((s) => s.id !== g.ship.starId);
  candidates.sort((a, b) => Math.hypot(a.pos[0] - here.pos[0], a.pos[1] - here.pos[1], a.pos[2] - here.pos[2])
    - Math.hypot(b.pos[0] - here.pos[0], b.pos[1] - here.pos[1], b.pos[2] - here.pos[2]));
  if (candidates[0]) return travelTo(g, st, candidates[0].id);
  return false;
}

// Cheapest-first tech purchase. tech.js wants a defs object ({ techs: [...] }); S.techDefs()
// hands back the bare array, so wrap it the way the UI modules do.
function buyAffordable(g, st) {
  const defs = { techs: S.techDefs() };
  const candidates = S.available(g, defs)
    .map((id) => defs.techs.find((t) => t.id === id))
    .filter(Boolean)
    .sort((a, b) => (a.cost?.research ?? 0) - (b.cost?.research ?? 0));
  for (const t of candidates) {
    if ((g.research ?? 0) < (t.cost?.research ?? 0)) break;   // cheapest first: nothing later is affordable
    const r = S.buy(g, defs, t.id);
    if (r.ok) { st.actions += 1; st.buys += 1; st.tech.push(t.id); return true; }
  }
  return false;
}

// Act II survey sweep: resolve every known system's atmosphere through relays before
// moving on to the next delivery. This is the slow, methodical half of the act.
function galacticSurvey(g, st) {
  if ((g.campaign?.act ?? 1) !== 2) return false;
  for (const id of Object.keys(g.galaxy?.known || {})) {
    const s = starOf(g, id);
    const p = s?.planets.find((x) => !x.scanned);
    if (!s || s.id === 'tauceti') continue;
    if (!(g.galaxy?.relays || []).includes(id) && S.buildRelay(g, id)) {
      st.actions += 1; st.crafts += 1; return true;   // complete the Cartographer network
    }
    if (!p) {
      // One confirmation scan per known world: fresh data, once, not an endless loop.
      const passes = st.reswept?.get(id) ?? 0;
      if (passes < 2 && S.scanPlanet(g, s.planets[0].id).ok) {
        if (!st.reswept) st.reswept = new Map();
        st.reswept.set(id, passes + 1);
        st.actions += 1; st.scans += 1; return true;
      }
      continue;
    }
    if (g.ship.starId !== id) {
      if (!S.relayInRange(g, id) && S.buildRelay(g, g.ship.starId)) { st.actions += 1; st.crafts += 1; return true; }
      const r = S.scanPlanet(g, p.id);
      if (r.ok) { st.actions += 1; st.scans += 1; return true; }
      continue;   // do not spend a decade flying to a remote system just to scan it
    }
    st.actions += 1; st.scans += 1;
    S.scanPlanet(g, p.id);
    return true;
  }
  return false;
}

// Work the mission board: relays reveal lanes, surveys reveal biospheres, POIs pay research.
function doContract(g, st) {
  const contract = (g.campaign.board || []).find((b) => !b.done);
  if (!contract) return false;
  if (contract.kind === 'relay') {
    if (!(g.galaxy?.relays || []).includes(contract.starId) && S.buildRelay(g, contract.starId)) {
      st.actions += 1; st.crafts += 1; return true;
    }
    return false;
  }
  if (contract.kind === 'survey') {
    const star = starOf(g, contract.starId);
    const planets = star?.planets || [];
    const target = planets.find((p) => !p.scanned) || planets[0];
    if (!target) return false;
    if (g.ship.starId !== star.id) return travelTo(g, st, star.id);
    if (g.ship.planetId !== target.id && S.travelToPlanet(g, target.id).ok) { st.actions += 1; return true; }
    st.scans += 1; st.actions += 1;
    const r = S.scanPlanet(g, target.id);
    if (r.ok) return true;
    st.actions -= 1;
    return false;
  }
  if (contract.kind === 'poi') {
    const poi = (g.pois || []).find((p) => p.id === contract.poiId);
    if (!poi?.pos) return false;
    const here = starOf(g, g.ship.starId);
    let best = null, bd = Infinity;
    for (const s of g.stars || []) {
      const d = Math.hypot(s.pos[0] - poi.pos[0], s.pos[1] - poi.pos[1], s.pos[2] - poi.pos[2]);
      if (d < bd && here && Math.hypot(s.pos[0] - here.pos[0], s.pos[1] - here.pos[1], s.pos[2] - here.pos[2]) < 26) { bd = d; best = s; }
    }
    if (!best) return false;
    if (g.ship.starId !== best.id) return travelTo(g, st, best.id);
    return false;
  }
  return false;
}

// One greedy decision step of the current act.
function step(g, st) {
  if (g.status !== 'playing') return false;
  const act = g.campaign?.act ?? 1;
  if (act === 1) return stepActOne(g, st);

  // resolve any pending event: first affordable choice
  const view = S.pendingEvent(g);
  if (view) {
    let idx = view.choices.findIndex((ch) => ch.ok);
    const mats = g.rocky?.materials || {};
    if ((mats.silicates ?? 0) < 1 || (mats.minerals ?? 0) < 2) {
      const supplier = view.choices.findIndex((ch, i) => ch.ok && (view.def.choices[i].effects || [])
        .some((fx) => (fx.material === 'silicates' || fx.material === 'minerals') && (fx.n ?? 0) > 0));
      if (supplier >= 0) idx = supplier;
    }
    if ((g.ship.fuelKg ?? 0) < 5000) {
      const fueler = view.choices.findIndex((ch, i) => ch.ok && (view.def.choices[i].effects || [])
        .some((fx) => (fx.fuel ?? 0) > 0));
      if (fueler >= 0) idx = fueler;
    }
    if (idx >= 0) {
      st.actions += 1; st.events += 1;
      const res = S.resolveChoice(g, idx);
      if (Array.isArray(res) && typeof res[0] === 'string' && res[0].startsWith('Need')) st.blocked = res[0];
      return true;
    }
    st.blocked = `event ${view.def?.id} has no affordable choice`;
  }

  if (act >= 2 && g.ship.hull < 0.45 && (g.rocky?.materials?.minerals ?? 0) >= 3
      && g.rocky?.docked && !g.rocky?.mission) {
    st.actions += 1; st.crafts += 1;
    S.craft(g, 'hull-plating');
    return true;
  }

  // craft the xenonite lab early: it removes the Taumoeba escape risk
  if (!g.ship.upgrades?.includes('xenonite-lab')) {
    st.actions += 1; st.crafts += 1;
    S.craft(g, 'xenonite-lab');
    return true;
  }

  // refuel by harvesting when low
  if ((g.ship.fuelKg ?? 0) < LOW_FUEL_KG) {
    const star = starOf(g, g.ship.starId);
    const tgt = star ? S.petrovaTarget(star.planets) : null;
    if (star && (star.infection ?? 0) > S.HARVEST.minInfection && tgt) {
      if ((g.ship.planetId ?? null) !== tgt.id && S.travelToPlanet(g, tgt.id).ok) { st.actions += 1; return true; }
      st.harvests += 1; st.actions += 1;
      const r = S.harvest(g, 'collector');
      if (r?.ok) return true;
      const sk = S.harvest(g, 'skim');
      if (sk?.ok) return true;
      st.actions -= 1;
    }
  }

  // spend research as it arrives, so the lab and probe techs speed up the later acts
  if (buyAffordable(g, st)) return true;

  // chartered survey work comes before the next delivery in acts II and III
  if (act >= 2 && doContract(g, st)) return true;
  if (galacticSurvey(g, st)) return true;

  // The Cartographer chain only draws on flights, arrivals and surveys, so keep jumping.
  if (act === 3 && !g.events?.flags?.carto6 && st.actions % 8 === 0) {
    const here = starOf(g, g.ship.starId);
    const near = (g.stars || []).filter((s) => s.id !== g.ship.starId && s.pos && here)
      .sort((a, b) => Math.hypot(a.pos[0] - here.pos[0], a.pos[1] - here.pos[1], a.pos[2] - here.pos[2])
        - Math.hypot(b.pos[0] - here.pos[0], b.pos[1] - here.pos[1], b.pos[2] - here.pos[2]));
    if (near[0] && travelTo(g, st, near[0].id)) return true;
  }

  if (deliverThreat(g, st)) return true;

  if (loreHunt(g, st)) return true;

  return false;
}

export function playSeed(seed, opts = {}) {
  const endless = !!opts.endless;
  const maxActions = opts.maxActions ?? DEFAULT_MAX_ACTIONS;
  const maxWorldYears = opts.maxWorldYears ?? DEFAULT_MAX_WORLD_YEARS;
  const g = endless ? S.startEndless(seed) : S.createGame(seed);
  const st = { actions: 0, scans: 0, samples: 0, breeds: 0, delivers: 0, launches: 0, buys: 0, events: 0, harvests: 0, crafts: 0, jumps: 0, tech: [], beetles: [], blocked: '', work: null };
  const sigs = [];
  const actEntered = { 2: null, 3: null };
  let stuck = false, stuckReason = '';

  while (g.status === 'playing' && st.actions < maxActions && (g.time?.worldYears ?? 0) < maxWorldYears) {
    const act = g.campaign?.act ?? 1;
    if (actEntered[act] === null && act >= 2) {
      actEntered[act] = { actions: st.actions, years: g.time.worldYears };
      if (act === 3) st.act3Start = st.actions;
    }
    const sig = signature(g);
    sigs.push(sig);
    if (sigs.length > STUCK_THRESHOLD) sigs.shift();
    if (sigs.length >= STUCK_THRESHOLD && sigs.every((s) => s === sig)) {
      stuck = true;
      stuckReason = st.blocked || 'the same state signature repeated without progress';
      break;
    }
    const acted = step(g, st);
    // Long acts are punctuated by shipboard incidents: a fresh draw on each action.
    if (acted && (g.campaign?.act ?? 1) >= 2 && !g.events?.pending) S.drawEvent(g, 'random', { chance: 0.32 });
    // Game actions use the astrophage tick internally; the composite tick still has to
    // run for the mission board, beetle arrivals and act transitions.
    S.tick(g, acted ? 0 : 0.25);
  }

  const c = g.campaign || {};
  const realSeconds = st.actions * ACTION_SECONDS + st.jumps * JUMP_SECONDS;
  const uniqueEvents = new Set();
  for (const id of Object.keys(g.events?.seen || {})) uniqueEvents.add(id);
  return {
    seed, endless,
    outcome: g.status, statusText: g.statusText,
    act: c.act, mode: c.mode,
    starsSaved: (c.saved || []).length, starsDark: (c.dark || []).length,
    worldYears: g.time?.worldYears ?? 0,
    actions: st.actions, scans: st.scans, samples: st.samples, breeds: st.breeds,
    act2Actions: actEntered[3] ? actEntered[3].actions - (actEntered[2]?.actions ?? 0) : null,
    act3Actions: actEntered[3] ? st.actions - actEntered[3].actions : null,
    act2Years: actEntered[3] ? actEntered[3].years - (actEntered[2]?.years ?? 0) : null,
    act3Years: actEntered[3] ? g.time.worldYears - actEntered[3].years : null,
    delivers: st.delivers, launches: st.launches, buys: st.buys, events: st.events,
    eventsSeen: { unique: uniqueEvents.size, resolved: st.events },
    techsBought: st.tech.length, beetlesLaunched: st.launches, beetles: [...(g.beetles || [])].map((b) => b.id),
    techs: [...st.tech],
    stuck, stuckReason,
    realSeconds, hours: realSeconds / 3600,
    state: g,
  };
}

export function runSeeds(seedCount, opts = {}) {
  const reports = [];
  for (let s = 1; s <= seedCount; s++) reports.push(playSeed(s, opts));
  return reports;
}

function main() {
  const argv = process.argv.slice(2);
  let seeds = 5, endless = false;
  for (const a of argv) {
    if (a === '--endless') endless = true;
    else { const n = Number(a); if (Number.isFinite(n) && n > 0) seeds = Math.floor(n); }
  }
  const reports = runSeeds(seeds, { endless });
  for (const r of reports) {
    console.log(
      `seed ${String(r.seed).padStart(3, '0')} [${r.mode}]: outcome=${r.outcome} act=${r.act} saved=${r.starsSaved} dark=${r.starsDark}` +
      ` worldYears=${r.worldYears.toFixed(1)} actions=${r.actions} real=${r.hours.toFixed(2)}h` +
      ` events=${r.eventsSeen.unique}/${r.eventsSeen.resolved} techs=${r.techsBought} beetles=${r.launches}` +
      ` act2=${r.act2Actions ?? '-' } act3=${r.act3Actions ?? '-'}` +
      ` stuck=${r.stuck ? `YES ${r.stuckReason}` : 'no'}` + (r.outcome === 'lost' ? `\n    lost: ${r.statusText}` : '')
    );
  }
  const wins = reports.filter((r) => r.outcome === 'won').length;
  const losses = reports.filter((r) => r.outcome === 'lost').length;
  const avg = (f) => reports.reduce((a, r) => a + f(r), 0) / reports.length;
  console.log(`summary over ${reports.length} seeds: won ${wins}, lost ${losses}, still playing ${reports.filter((r) => r.outcome === 'playing').length}`);
  console.log(`avg actions=${avg((r) => r.actions).toFixed(0)} avg hours=${avg((r) => r.hours).toFixed(2)} avg saved=${avg((r) => r.starsSaved).toFixed(1)}`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) main();
