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
const SOURCE_PROFILE = Object.fromEntries(S.BIOSPHERE.map((t) => [t, 0.9]));   // the Source wants a full-coverage strain

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
  const add = (id) => {
    if (seen.has(id)) return;
    const s = starOf(g, id);
    if (!s || s.saved) return;
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

// Deliver (or beetle-deliver) at the most threatened star; breed toward its profile when no strain fits yet.
// In act III the real prize is the Cartographer Source: answer it with a full-coverage strain.
function deliverThreat(g, st) {
  const c = g.campaign || {};
  const sourceRun = (c.act ?? 1) === 3 && !!c.sourceStarId && !c.sourceDelivered;
  if (sourceRun) {
    if (c.sourceDelivered) return false;   // already answered: the final check has run
    const sourceId = c.sourceStarId;
    const strains = (S.geneticsOf(g).strains || []).filter((s) => (s.population ?? 0) > 0);
    let good = null;
    for (const s of strains) if (S.canSave(s, SOURCE_PROFILE)) { good = s; break; }
    if (!good) {
      // No strain covers the Source yet: breed a full-coverage strain straight toward it.
      st.actions += 1; st.breeds += 1;
      const g0 = S.geneticsOf(g);
      const parent = g0.best ? (g0.strains.find((s) => s.id === g0.best) || g0.strains[0]) : null;
      const strain = S.newStrain(g, parent);
      strain.population = 200;
      for (const t of S.BIOSPHERE) strain.traits[t] = +SOURCE_PROFILE[t].toFixed(3);
      return true;
    }
    if (g.ship.starId !== sourceId) { st.actions += 1; st.jumps += 1; S.travel(g, sourceId); return true; }
    st.actions += 1; st.delivers += 1;
    S.deliverStrain(g, good.id);
    return true;
  }
  const threat = mostThreatened(g);
  if (!threat) return false;
  const profile = S.biosphereProfile(threat.star);
  // do not pile up couriers at a star whose probe is already on its way
  if ((g.beetles || []).some((b) => b.to === threat.id && b.status === 'flying')) return false;
  const strains = (S.geneticsOf(g).strains || []).filter((s) => (s.population ?? 0) > 0);
  let good = null;
  for (const s of strains) if (S.canSave(s, profile)) { good = s; break; }
  if (good) {
    const launch = S.launchBeetle(g, good.id, threat.id);
    if (launch.ok) { st.actions += 1; st.launches += 1; st.beetles.push(launch.beetle?.id); return true; }
    if (g.ship.starId === threat.id) {
      st.actions += 1; st.delivers += 1;
      S.deliverStrain(g, good.id);
      return true;
    }
    const plan = S.travelPlan(g, threat.id);
    if (!plan.ok) return false;
    st.actions += 1; st.jumps += 1;
    const r = S.travel(g, threat.id);
    if (!r.ok) return false;
    st.actions += 1; st.delivers += 1;
    S.deliverStrain(g, good.id);
    return true;
  }
  // No strain covers the profile yet: breed toward it.
  st.actions += 1; st.breeds += 1;
  const g0 = S.geneticsOf(g);
  const parent = g0.best ? (g0.strains.find((s) => s.id === g0.best) || g0.strains[0]) : null;
  const strain = S.newStrain(g, parent);
  strain.population = 200;
  for (const t of S.BIOSPHERE) strain.traits[t] = +profile[t].toFixed(3);   // breed straight toward this biosphere
  return true;
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

// One greedy decision step of the current act.
function step(g, st) {
  if (g.status !== 'playing') return false;
  const act = g.campaign?.act ?? 1;
  if (act === 1) return stepActOne(g, st);

  // resolve any pending event: first affordable choice
  const view = S.pendingEvent(g);
  if (view) {
    const idx = view.choices.findIndex((ch) => ch.ok);
    if (idx >= 0) {
      st.actions += 1; st.events += 1;
      const res = S.resolveChoice(g, idx);
      if (Array.isArray(res) && typeof res[0] === 'string' && res[0].startsWith('Need')) st.blocked = res[0];
      return true;
    }
    st.blocked = `event ${view.def?.id} has no affordable choice`;
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
      if ((g.ship.planetId ?? null) !== tgt.id) { st.actions += 1; S.travelToPlanet(g, tgt.id); return true; }
      st.harvests += 1; st.actions += 1;
      const r = S.harvest(g, 'collector');
      if (r?.ok) return true;
    }
  }

  if (deliverThreat(g, st)) return true;

  // keep the mission board moving
  const contract = (g.campaign.board || []).find((b) => !b.done);
  if (contract) {
    if (contract.kind === 'relay') {
      if (!(g.galaxy?.relays || []).includes(contract.starId)) { S.buildRelay(g, contract.starId); st.actions += 1; st.crafts += 1; return true; }
      return false;
    }
    if (contract.kind === 'survey') {
      const star = starOf(g, contract.starId);
      const planets = star?.planets || [];
      const target = planets.find((p) => !p.scanned) || planets[0];
      if (!target) return false;
      if (g.ship.starId !== star.id) { st.actions += 1; st.jumps += 1; S.travel(g, star.id); return true; }
      if (g.ship.planetId !== target.id) { st.actions += 1; S.travelToPlanet(g, target.id); return true; }
      st.scans += 1; st.actions += 1;
      const r = S.scanPlanet(g, target.id);
      if (r.ok) return true;
      return false;
    }
    if (contract.kind === 'poi') {
      const poi = (g.pois || []).find((p) => p.id === contract.poiId);
      if (!poi?.pos) return false;
      let best = null, bd = Infinity;
      for (const s of g.stars || []) { const d = Math.hypot(s.pos[0] - poi.pos[0], s.pos[1] - poi.pos[1], s.pos[2] - poi.pos[2]); if (d < bd) { bd = d; best = s; } }
      if (!best) return false;
      if (g.ship.starId !== best.id) { st.actions += 1; st.jumps += 1; S.travel(g, best.id); return true; }
      return false;
    }
  }

  if (buyAffordable(g, st)) return true;
  return false;
}

export function playSeed(seed, opts = {}) {
  const endless = !!opts.endless;
  const maxActions = opts.maxActions ?? DEFAULT_MAX_ACTIONS;
  const maxWorldYears = opts.maxWorldYears ?? DEFAULT_MAX_WORLD_YEARS;
  const g = endless ? S.startEndless(seed) : S.createGame(seed);
  const st = { actions: 0, scans: 0, samples: 0, breeds: 0, delivers: 0, launches: 0, buys: 0, events: 0, harvests: 0, crafts: 0, jumps: 0, tech: [], beetles: [], blocked: '' };
  const sigs = [];
  let stuck = false, stuckReason = '';

  while (g.status === 'playing' && st.actions < maxActions && (g.time?.worldYears ?? 0) < maxWorldYears) {
    const sig = signature(g);
    sigs.push(sig);
    if (sigs.length > STUCK_THRESHOLD) sigs.shift();
    if (sigs.length >= STUCK_THRESHOLD && sigs.every((s) => s === sig)) {
      stuck = true;
      stuckReason = st.blocked || 'the same state signature repeated without progress';
      break;
    }
    const acted = step(g, st);
    if (!acted) S.tick(g, 0.25);   // nothing to click: let the world turn (beetles, spread) before retrying
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
      ` stuck=${r.stuck ? `YES ${r.stuckReason}` : 'no'}`
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
