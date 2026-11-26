// Acts, the mission board and endless mode (plan S7). Pure logic, no DOM.
// All randomness comes from state.rng or a seed derived from state.seed.
import { createRng, mixSeed, hashStr } from './rng.js';
import { addLog } from './util.js';
import { findStar, starDistance } from './stars.js';
import { revealAround, extendGalaxy, extendLanes, genPois, initKnowledge } from './galaxy.js';
import { BIOSPHERE, biosphereProfile, canSave, coverage, geneticsOf } from './genetics.js';
import { extinctionYears, updateLum } from './astrophage.js';
import { createGame } from './index.js';

const TARGETS = 12;
const DARK_LUM = 0.3;
const CYCLE_SAVES = 6;
const SOURCE_PROFILE = Object.fromEntries(BIOSPHERE.map((t) => [t, 0.9]));
const FRONTIER_WORK = 6;         // expand when fewer than this many reachable worlds are left to save
const FRONTIER_SHELL = 16;       // stars per new shell
const STAR_CAP = 400;            // live stars in the lane graph; older dark ones are recycled
const CORE_IDS = new Set(['sol', 'tauceti', 'eri40']);

const radiusOf = (s) => (s && s.pos ? Math.hypot(s.pos[0], s.pos[1], s.pos[2]) : 0);
const distanceOf = (a, b) => (a && b && a.pos && b.pos
  ? Math.hypot(a.pos[0] - b.pos[0], a.pos[1] - b.pos[1], a.pos[2] - b.pos[2]) : Infinity);

// Old saves and hand-built states get the same shape as createGame.
export function ensureCampaign(state) {
  if (!state.campaign || typeof state.campaign !== 'object' || Array.isArray(state.campaign)) {
    state.campaign = { act: 1, mode: 'campaign', board: [], saved: [], dark: [], score: 0 };
  }
  const c = state.campaign;
  if (!Number.isFinite(c.act)) c.act = 1;
  if (c.mode !== 'endless') c.mode = 'campaign';
  for (const k of ['board', 'saved', 'dark']) if (!Array.isArray(c[k])) c[k] = [];
  if (!Number.isFinite(c.score)) c.score = 0;
  if (!Number.isFinite(c.cycle)) c.cycle = 0;
  if (!Number.isFinite(c.difficulty)) c.difficulty = 1;
  if (c.pendingCard === undefined) c.pendingCard = null;
  if (c.targets === undefined) c.targets = [];
  if (!Array.isArray(c.extraTargets)) c.extraTargets = [];
  if (!Array.isArray(c.act3Dark)) c.act3Dark = [];
  return c;
}

const nearestStarId = (state, pos) => {
  let best = null, bd = Infinity;
  for (const s of state.stars || []) {
    if (!s.pos) continue;
    const d = Math.hypot(s.pos[0] - pos[0], s.pos[1] - pos[1], s.pos[2] - pos[2]);
    if (d < bd) { bd = d; best = s.id; }
  }
  return best;
};

// Act II: twelve known-or-near stars around Sol carry a small, deterministic infection.
function seedAct2(state, c) {
  const sol = findStar(state, 'sol');
  const skip = new Set(['sol', 'eri40', 'tauceti']);
  const pool = (state.stars || []).filter((s) => !skip.has(s.id));
  const dist = (s) => (sol ? starDistance(s, sol) : 0);
  const known = pool.filter((s) => state.galaxy?.known?.[s.id] || dist(s) <= 15);
  const cands = known.length >= TARGETS ? known : pool;
  const chosen = cands.slice().sort((a, b) => dist(a) - dist(b) || String(a.id).localeCompare(String(b.id))).slice(0, TARGETS);
  const rng = createRng(mixSeed(state.seed ?? 1, hashStr('act2-spread')));
  for (const s of chosen) {
    s.infection = +(0.05 + rng.next() * 0.15).toFixed(4);
    updateLum(s);
    if (state.galaxy) state.galaxy.known[s.id] = true;
    else revealAround(state, s.id, 0);
  }
  c.targets = chosen.map((s) => s.id);
  addLog(state, `ACT II — THE SPREAD: Astrophage signatures at ${chosen.length} stars near Sol, including ${chosen[0] ? chosen[0].name : 'the inner lanes'}.`);
  return chosen;
}

// Act III: reveal the Cartographer POI chain and pick the Source (the farthest buoy from Sol).
function seedAct3(state, c) {
  const pois = state.pois || [];
  for (const p of pois) { p.known = true; p.revealed = true; }
  const buoys = pois.filter((p) => p.kind === 'buoy' && p.pos);
  let source = null, far = -1;
  for (const p of buoys) {
    const d = Math.hypot(p.pos[0], p.pos[1], p.pos[2]);
    if (d > far) { far = d; source = p; }
  }
  c.poiChain = pois.map((p) => p.id);
  // The buoy chain is a deterministic way to finish the Cartographer story: visiting
  // these five buoys in order grants carto1..carto5, then carto6, without relying on
  // the event deck ever drawing all six cards.
  c.buoyChain = buoys.map((p) => p.id);
  c.buoyStep = 0;
  // Act III opens a fresh wave of lane detections. Without new work the bot can save
  // every known world before the Source, then sit idle with nothing reachable.
  for (let i = 0; i < 10; i++) seedNextStar(state, c);
  if (source) {
    source.source = true;
    c.sourcePoiId = source.id;
    c.sourceStarId = nearestStarId(state, source.pos);
  }
  addLog(state, `ACT III — THE LANES: the Cartographer chain is charted. The lanes lead to ${source ? source.name : 'the far buoy'}.`);
}

// Later acts keep revealing new infections along the lanes. These worlds are not part of
// the six-target loss rule; they are the work that makes the acts long.
const EXTRA_INTERVAL = { 2: 14, 3: 8 };
function seedNextStar(state, c) {
  const act = c.act >= 3 ? 3 : 2;
  const n = (c.extraTargets || []).length;
  if (n >= 30) return false;   // a bounded wave, not an endless avalanche
  const rng = createRng(mixSeed(state.seed ?? 1, hashStr(`lane-detection-${n}`)));
  const skip = new Set(['sol', 'eri40', 'tauceti', ...(c.targets || []), ...(c.extraTargets || [])]);
  const pool = (state.stars || []).filter((s) => !skip.has(s.id) && !s.saved && !s.dark && (s.infection ?? 0) < 0.03);
  if (!pool.length) return false;
  const s = pool[rng.int(0, pool.length - 1)];
  s.extra = true;
  s.infection = +(act === 3 ? 0.06 + rng.next() * 0.08 : 0.04 + rng.next() * 0.06).toFixed(4);
  updateLum(s);
  if (state.galaxy) state.galaxy.known[s.id] = true;
  if (!Array.isArray(c.extraTargets)) c.extraTargets = [];
  c.extraTargets.push(s.id);
  addLog(state, `New Astrophage signature along the lanes at ${s.name}.`);
  return true;
}

function detectNextStars(state, c) {
  const interval = EXTRA_INTERVAL[c.act >= 3 ? 3 : 2];
  if (!Number.isFinite(c.nextDetectionYears)) c.nextDetectionYears = state.time.worldYears + interval;
  let guard = 0;
  while (state.time.worldYears >= c.nextDetectionYears && guard++ < 6) {
    seedNextStar(state, c);
    c.nextDetectionYears += interval;
  }
}

// Deliver the act card (the UI consumes and clears campaign.pendingCard).
export function advanceAct(state) {
  const c = ensureCampaign(state);
  if (state.status !== 'playing' || c.mode === 'endless') return false;
  if (c.act === 1) {
    c.act = 2;
    // Act I's deliveries already host Taumoeba: they count as saved (immune to spread and event spores).
    for (const id of ['sol', 'eri40']) { const s = (state.stars || []).find((x) => x.id === id); if (s && state.delivered?.[id]) s.saved = true; }
    seedAct2(state, c);
    c.pendingCard = { kicker: 'ACT II', title: 'THE SPREAD', subtitle: 'Astrophage has found a hundred more worlds. Save what you can.' };
    refreshBoard(state);
    return true;
  }
  if (c.act === 2) {
    if (c.saved.length < 8) return false;
    c.act = 3;
    seedAct3(state, c);
    c.pendingCard = { kicker: 'ACT III', title: 'THE LANES', subtitle: 'Follow the Cartographers outward to the Source.' };
    refreshBoard(state);
    return true;
  }
  return false;
}

const starYears = (state, id) => {
  const y = extinctionYears(state, id);
  return Number.isFinite(y) ? +Math.min(200, Math.max(0, y)).toFixed(4) : 0;
};

// Work the player can still reach along the current lane graph. Redundant with travel
// range (the ship can jump anywhere a tank allows), but it keeps dark backwaters from
// counting as a reason to postpone the next shell.
function reachableWork(state) {
  const neighbors = new Map();
  for (const l of state.galaxy?.lanes || []) {
    if (!neighbors.has(l.a)) neighbors.set(l.a, []);
    if (!neighbors.has(l.b)) neighbors.set(l.b, []);
    neighbors.get(l.a).push(l.b);
    neighbors.get(l.b).push(l.a);
  }
  const queue = [state.ship?.starId].filter(Boolean);
  const seen = new Set(queue);
  for (let i = 0; i < queue.length; i++) {
    for (const next of neighbors.get(queue[i]) || []) {
      if (!seen.has(next)) { seen.add(next); queue.push(next); }
    }
  }
  let n = 0;
  for (const id of seen) {
    if (!state.galaxy?.known?.[id]) continue;
    const s = findStar(state, id);
    if (s && !s.saved && !s.dark && !s.recycled) n++;
  }
  return n;
}

// Over the cap, retire the least useful stars from the *active* galaxy. They stay in
// state.stars (and in the score/history arrays), but leave lanes, knowledge and relays
// so the bot and the mission board only see the moving frontier. Dark inner stars go first.
function recycleBackwaters(state) {
  const all = state.stars || [];
  let overflow = all.filter((s) => !s.recycled).length + FRONTIER_SHELL - STAR_CAP;
  if (overflow <= 0) return all.filter((s) => !s.recycled);
  const candidates = all.filter((s) => !s.recycled && !CORE_IDS.has(s.id) && s.id !== state.ship?.starId);
  candidates.sort((a, b) => (Number(!!b.dark) - Number(!!a.dark))
    || (radiusOf(a) - radiusOf(b)) || String(a.id).localeCompare(String(b.id)));
  const retired = new Set();
  for (const s of candidates) {
    if (overflow <= 0) break;
    s.recycled = true;
    retired.add(s.id);
    overflow--;
  }
  const gal = state.galaxy;
  if (gal) {
    if (Array.isArray(gal.lanes)) gal.lanes = gal.lanes.filter((l) => !retired.has(l.a) && !retired.has(l.b));
    if (gal.known) for (const id of retired) delete gal.known[id];
    if (gal.surveyed) for (const id of retired) delete gal.surveyed[id];
    if (Array.isArray(gal.relays)) gal.relays = gal.relays.filter((id) => !retired.has(id));
  }
  return all.filter((s) => !s.recycled);
}

// One outward shell of the Petrova Front. Every call derives a fresh seed and radial
// band from the cycle, so old saves replay identically and ids stay unique forever.
export function moveFrontier(state) {
  const c = ensureCampaign(state);
  if (state.status !== 'playing' || c.mode !== 'endless') return 0;
  const cycle = Math.max(1, c.cycle || 1);
  const seed = mixSeed(state.seed ?? 1, hashStr(`petrova-frontier-${cycle}`));
  const rng = createRng(seed);
  let maxR = 0;
  for (const s of state.stars || []) if (!s.recycled) maxR = Math.max(maxR, radiusOf(s));
  const living = recycleBackwaters(state);
  const count = Math.min(FRONTIER_SHELL, Math.max(0, STAR_CAP - living.length));
  if (!count) return 0;
  if (!state.galaxy) initKnowledge(state);
  const shell = extendGalaxy(living, seed, {
    count, radiusLy: maxR + 10, innerRadiusLy: maxR + 4, idPrefix: `g${cycle}`,
  });
  for (const s of shell) { s.procedural = true; s.frontierCycle = cycle; }
  // Difficulty raises both the number of new detections and their bite, but a fresh
  // world must have time to be saved before it goes dark.
  const infected = Math.min(shell.length, Math.max(FRONTIER_WORK,
    Math.round(shell.length * Math.min(0.65, 0.35 + 0.05 * c.difficulty))));
  const slots = shell.map((_, i) => i);
  for (let i = 0; i < infected; i++) {
    const j = i + rng.int(0, slots.length - 1 - i);
    const tmp = slots[i]; slots[i] = slots[j]; slots[j] = tmp;
  }
  for (const idx of slots.slice(0, infected)) {
    const s = shell[idx];
    s.infection = +Math.min(0.45, (0.05 + rng.next() * 0.08) * Math.min(3, c.difficulty)).toFixed(4);
    updateLum(s);
  }
  state.stars.push(...shell);
  extendLanes(state, shell);
  // Reveal the closest arrivals and every new Astrophage signature along the way.
  const here = findStar(state, state.ship.starId);
  const near = shell.slice().sort((a, b) => distanceOf(a, here) - distanceOf(b, here)
    || String(a.id).localeCompare(String(b.id)));
  const reveal = new Set(near.slice(0, FRONTIER_WORK).map((s) => s.id));
  for (const s of shell) if (s.infection > 0.02) reveal.add(s.id);
  for (const id of reveal) state.galaxy.known[id] = true;
  if (near[0]) revealAround(state, near[0].id, 2);
  const pois = genPois(shell, mixSeed(seed, 0x501), {
    count: 4, buoys: 1, idPrefix: `poi-c${cycle}`, startIndex: (state.pois || []).length,
  });
  for (const p of pois) { p.known = false; p.revealed = false; }
  state.pois = (state.pois || []).concat(pois);
  if (near[0]) {
    const closest = pois.slice().sort((a, b) => distanceOf({ pos: a.pos }, near[0]) - distanceOf({ pos: b.pos }, near[0]));
    for (const p of closest.slice(0, 2)) { p.known = true; p.revealed = true; }
  }
  c.frontierCycle = cycle;
  addLog(state, `The frontier moves out: ${shell.length} new stars.`);
  return shell.length;
}

// Shared credit path for ship and beetle deliveries. years is the pre-delivery extinction estimate.
function creditSave(state, star, strain, via, years) {
  const c = ensureCampaign(state);
  if (!star || c.saved.includes(star.id)) return false;
  c.saved.push(star.id);
  const estimate = years ?? starYears(state, star.id);
  c.score = +(c.score + estimate).toFixed(4);
  state.research = (state.research ?? 0) + 10;
  star.saved = true;
  addLog(state, `${via} saved ${star.name} with strain ${strain ? (strain.name || strain.id) : 'unknown'}: +10 research, ${estimate.toFixed(1)} star-years.`);
  if (c.mode === 'endless') {
    while (c.saved.length >= (c.cycle + 1) * CYCLE_SAVES) {
      c.cycle++;
      c.difficulty = +(c.difficulty * 1.15).toFixed(4);
      for (const s of state.stars || []) {
        if (!s.saved && s.id !== 'tauceti' && s.id !== 'sol') {
          s.infection = Math.min(1, s.infection * 1.15);
          updateLum(s);
        }
      }
      addLog(state, `Petrova Front cycle ${c.cycle}: the spread grows 15% faster (difficulty ${c.difficulty}).`);
      // Each cycle is a fresh wave of work, even if the old shell is not exhausted yet.
      moveFrontier(state);
    }
  }
  checkFinal(state);
  return true;
}

function checkFinal(state) {
  const c = ensureCampaign(state);
  if (state.status !== 'playing' || c.mode !== 'campaign' || c.act !== 3) return;
  if (!state.events?.flags?.carto6 || !c.sourceDelivered) return;
  state.status = 'won';
  state.statusText = 'The Cartographer Source is answered. The lanes fall silent at last.';
  addLog(state, state.statusText);
}

// Deliver a multi-trait strain at the ship's current star. Failure names the traits that fall short.
export function deliverStrain(state, strainId) {
  const bad = (text, extra = {}) => ({ ok: false, text, ...extra });
  if (state.status !== 'playing') return bad('The mission is over.');
  const strain = geneticsOf(state).strains.find((s) => s.id === strainId);
  if (!strain) return bad(`No strain with id ${strainId} in the lab.`);
  const star = findStar(state, state.ship.starId);
  if (!star) return bad('Unknown star.');
  const c = ensureCampaign(state);
  const sourceRun = c.act === 3 && c.sourceStarId === star.id && !c.sourceDelivered;
  if (star.saved && !sourceRun) return bad(`${star.name} has already been saved.`);
  const profile = biosphereProfile(star);
  const cov = coverage(strain, profile);
  const label = strain.name || strain.id;
  if (!canSave(strain, profile)) {
    const short = BIOSPHERE.filter((t) => (strain.traits?.[t] ?? 0) < (profile[t] ?? 0))
      .sort((a, b) => (profile[b] ?? 0) - (profile[a] ?? 0));
    return bad(`Strain ${label} falls short at ${star.name}: ${short.join(', ') || 'coverage'} below requirement (coverage ${cov}).`,
      { short, traits: short, coverage: cov, star, strain });
  }
  const years = starYears(state, star.id);
  star.infection = Math.max(0, star.infection - 0.5);
  updateLum(star);
  creditSave(state, star, strain, `Strain ${label}`, years);
  if (sourceRun && canSave(strain, SOURCE_PROFILE)) {
    c.sourceDelivered = true;
    const poi = (state.pois || []).find((p) => p.id === c.sourcePoiId);
    if (poi) poi.used = true;
    addLog(state, `The Source buoy at ${star.name} accepts strain ${label}.`);
    checkFinal(state);
  }
  return { ok: true, text: `Strain ${label} saved ${star.name}. Astrophage recedes; +10 research, ${years.toFixed(1)} star-years.`, star, strain, coverage: cov };
}

function boardMet(state, b) {
  if (b.kind === 'save') {
    if (b.starId === 'sol' || b.starId === 'eri40') return !!state.delivered?.[b.starId];
    return !!findStar(state, b.starId)?.saved;
  }
  if (b.kind === 'survey') {
    const s = findStar(state, b.starId);
    return !!s && s.planets.filter((p) => p.scanned).length >= (b.count || 1);
  }
  if (b.kind === 'relay') return (state.galaxy?.relays || []).includes(b.starId);
  if (b.kind === 'poi') return !!(state.pois || []).find((p) => p.id === b.poiId && (p.visited || p.used));
  return false;
}

const contract = (id, kind, data) => ({ id, kind, ...data, done: false });

// Three or four live contracts, built from the current state; rewards are kept once by id.
export function refreshBoard(state) {
  const c = ensureCampaign(state);
  const old = new Map((c.board || []).map((b) => [b.id, b]));
  const board = [];
  if (c.act === 1 && c.mode === 'campaign') {
    for (const [id, name] of [['sol', 'Earth'], ['eri40', 'Erid']]) {
      board.push(contract(`act1-${id}`, 'save', {
        starId: id, title: `Save ${name}`, detail: `Deliver tolerant Taumoeba to ${name} before its sun dims.`,
        deadline: starYears(state, id), reward: { research: 8 }, done: !!state.delivered?.[id],
      }));
    }
  } else {
    const known = (state.stars || []).filter((s) => state.galaxy?.known?.[s.id]);
    const saves = known.filter((s) => !s.saved && s.id !== 'tauceti' && s.infection > 0.02)
      .sort((a, b) => b.infection - a.infection || String(a.id).localeCompare(String(b.id)));
    const surveys = known.filter((s) => s.planets.some((p) => !p.scanned))
      .sort((a, b) => String(a.id).localeCompare(String(b.id)));
    const relays = known.filter((s) => !(state.galaxy?.relays || []).includes(s.id))
      .sort((a, b) => String(a.id).localeCompare(String(b.id)));
    const pois = (state.pois || []).filter((p) => (p.known || p.revealed) && !p.visited && !p.used);
    if (saves[0]) {
      const s = saves[0];
      board.push(contract(`save-${s.id}`, 'save', {
        starId: s.id, title: `Save ${s.name}`, detail: `Adapt a strain for ${s.name}'s biosphere before the star dims.`,
        deadline: starYears(state, s.id), reward: { research: 10, fuelKg: 500 },
      }));
    }
    if (saves[1]) {
      const s = saves[1];
      board.push(contract(`save-${s.id}`, 'save', {
        starId: s.id, title: `Save ${s.name}`, detail: `A second world on the edge. Deliver or send a Beetle.`,
        deadline: starYears(state, s.id), reward: { research: 8 },
      }));
    }
    const surveyAt = surveys.find((s) => s.id !== saves[0]?.id) || known[0];
    if (surveyAt) {
      const count = Math.min(2, surveyAt.planets.length);
      board.push(contract(`survey-${surveyAt.id}`, 'survey', {
        starId: surveyAt.id, count, title: `Survey ${surveyAt.name}`,
        detail: `Scan ${count} planets in the ${surveyAt.name} system for genes and research.`,
        reward: { research: 6 },
      }));
    }
    const relayAt = relays.find((s) => s.id !== surveyAt?.id) || known[1] || known[0];
    if (relayAt) {
      board.push(contract(`relay-${relayAt.id}`, 'relay', {
        starId: relayAt.id, title: `Relay at ${relayAt.name}`,
        detail: `Build a listening post at ${relayAt.name} to reveal the nearby lanes.`,
        reward: { research: 5, fuelKg: 300 },
      }));
    }
    if (pois[0]) {
      const p = pois[0];
      board.push(contract(`poi-${p.id}`, 'poi', {
        poiId: p.id, title: `Visit ${p.name}`, detail: `Fly to the ${p.kind} point of interest and see what is left there.`,
        reward: { research: 7, fuelKg: 400 },
      }));
    }
    // Fill out the board with system work so there are always three or four choices.
    const fillers = known.filter((s) => !board.some((b) => b.starId === s.id));
    for (const s of fillers) {
      if (board.length >= 3) break;
      board.push(contract(`survey-${s.id}`, 'survey', {
        starId: s.id, count: 1, title: `Survey ${s.name}`, detail: `Scan a planet in the ${s.name} system.`,
        reward: { research: 4 },
      }));
    }
  }
  c.board = board.slice(0, 4).map((b) => {
    const prev = old.get(b.id);
    return { ...b, done: prev ? !!prev.done : !!b.done, rewarded: prev ? !!prev.rewarded : false };
  });
  return c.board;
}

function lose(state, text) {
  if (state.status !== 'playing') return;
  state.status = 'lost';
  state.statusText = text;
  addLog(state, text);
}

// Called from index.tick after the world, Rocky, spread and beetle ticks.
export function campaignTick(state) {
  const c = ensureCampaign(state);
  if (state.status !== 'playing') return state;
  if (c.mode === 'campaign' && c.act >= 2) detectNextStars(state, c);

  // Beetle probes report their own arrival; credit them once here.
  for (const b of state.beetles || []) {
    if (b.status !== 'arrived' || b.credited) continue;
    b.credited = true;
    const star = findStar(state, b.to);
    const strain = b.strainData || geneticsOf(state).strains.find((s) => s.id === b.strainId);
    if (star && star.saved) creditSave(state, star, strain, `Beetle ${b.id}`, 0);
    // A courier can answer the Source too: the final check needs the strain, not the ship.
    if (c.mode === 'campaign' && c.act === 3 && b.to === c.sourceStarId && !c.sourceDelivered
      && strain && canSave(strain, SOURCE_PROFILE)) {
      c.sourceDelivered = true;
      const poi = (state.pois || []).find((p) => p.id === c.sourcePoiId);
      if (poi) poi.used = true;
      addLog(state, `Beetle ${b.id} carries the final strain to the Source.`);
      checkFinal(state);
    }
  }

  if (c.mode === 'campaign' && c.act === 2 && c.saved.length >= 8) advanceAct(state);

  // A star goes dark at 30% of its original luminosity; that is permanent.
  for (const s of state.stars || []) {
    if (s.dark || s.saved || typeof s.lum !== 'number' || typeof s.lum0 !== 'number') continue;
    // With DIM_K = 0.5 a fully infested star bottoms out at half its light; an
    // infestation above 90% is the practical, reachable form of "dark".
    if (s.lum < DARK_LUM * s.lum0 || (s.infection ?? 0) >= 0.9) {
      s.dark = true;
      c.dark.push(s.id);
      if (c.mode === 'campaign' && c.act >= 3 && !c.act3Dark.includes(s.id)) c.act3Dark.push(s.id);
      addLog(state, `${s.name} has gone dark. The Astrophage has taken another world.`);
    }
  }
  // Endless never runs dry: a new cycle opens a shell, and a thin frontier opens one early.
  if (c.mode === 'endless' && state.status === 'playing') {
    if (c.cycle > (c.frontierCycle ?? 0) || reachableWork(state) < FRONTIER_WORK) moveFrontier(state);
  }
  // Act III has an ending of its own: ten lane worlds lost, or twelve centuries of
  // drifting without an answer. Neither the Source nor the bot can soft-lock the act.
  if (c.mode === 'campaign' && c.act >= 3) {
    if (c.act3Dark.length >= 10) lose(state, 'Ten stars along the Lanes have gone dark. The campaign is lost.');
    else if (state.time.worldYears >= 1200) lose(state, 'Twelve centuries pass. The lanes fall silent with the Source unanswered.');
  }
  const sol = findStar(state, 'sol'), erid = findStar(state, 'eri40');
  if (c.mode === 'endless') {
    if (sol?.dark) lose(state, 'Sol has gone dark. The Petrova Front is lost.');
  } else if (c.act >= 2) {
    const lostTargets = (c.targets || []).filter((id) => c.dark.includes(id)).length;
    if (lostTargets >= 6) lose(state, 'Six stars of the Spread have gone dark. The campaign is lost.');
    else if (sol?.dark || erid?.dark) lose(state, 'Earth or Erid has gone dark. The campaign is lost.');
  }

  // Contracts pay out once, then the board is rebuilt from the new state.
  const before = new Map((c.board || []).map((b) => [b.id, b]));
  for (const b of c.board || []) {
    const prev = before.get(b.id);
    if (!b.done && boardMet(state, b)) {
      b.done = true;
      addLog(state, `Contract complete: ${b.title}.`);
    }
    if (b.done && !b.rewarded && !prev?.rewarded) {
      b.rewarded = true;
      state.research = (state.research ?? 0) + (b.reward.research || 0);
      if (b.reward.fuelKg) state.ship.fuelKg = (state.ship.fuelKg ?? 0) + b.reward.fuelKg;
      addLog(state, `${b.title}: +${b.reward.research || 0} research${b.reward.fuelKg ? `, +${b.reward.fuelKg} kg fuel` : ''}.`);
    }
  }
  refreshBoard(state);
  checkFinal(state);
  return state;
}

// The unbounded Petrova Front: act-II rules from the start, harder each cycle.
export function startEndless(seed = 1) {
  const state = createGame(seed);
  const c = ensureCampaign(state);
  c.mode = 'endless';
  c.act = 2;
  c.cycle = 0;
  c.difficulty = 1;
  c.frontierCycle = 0;
  seedAct2(state, c);
  c.pendingCard = { kicker: 'PETROVA FRONT', title: 'ENDLESS', subtitle: 'Save worlds, raise the score, and survive each harder cycle.' };
  addLog(state, 'PETROVA FRONT: endless mode. Every six worlds saved, the spread grows 15% harder.');
  refreshBoard(state);
  return state;
}
