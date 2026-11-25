import test from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../src/sim/index.js';
import { createStars } from '../src/sim/stars.js';
import { mixSeed } from '../src/sim/rng.js';
import { checkEnd } from '../src/sim/astrophage.js';
import { BIOSPHERE, newStrain, biosphereProfile } from '../src/sim/genetics.js';
import { collectSample } from '../src/sim/lab.js';
import { resetContent, registerPack } from '../src/sim/content.js';
import { loadContent } from '../content/index.js';

const perfect = (g) => {
  const s = newStrain(g);
  for (const t of BIOSPHERE) s.traits[t] = 0.99;
  return s;
};
const star = (g, id) => g.stars.find((s) => s.id === id);
const toAct2 = (g) => { g.delivered.sol = true; g.delivered.eri40 = true; checkEnd(g); return g; };

test('createGame integrates the expansion state', () => {
  const g = S.createGame(7);
  assert.equal(g.stars.length, 60);
  assert.equal(g.stars.filter((s) => s.id.startsWith('g-')).length, 48);
  for (const s of g.stars.filter((x) => x.id.startsWith('g-'))) assert.ok(s.infection <= 0.01, s.id + ' ' + s.infection);
  assert.equal(g.research, 0);
  assert.deepEqual(g.tech, { owned: [] });
  assert.deepEqual(g.genetics, { strains: [], nextId: 1, best: 0 });
  assert.deepEqual(g.beetles, []);
  assert.ok(g.events && g.events.flags && g.events.seen && g.events.pending === null);
  assert.deepEqual(g.campaign, {
    act: 1, mode: 'campaign', board: [], saved: [], dark: [], score: 0,
    cycle: 0, difficulty: 1, targets: [], pendingCard: null,
  });
  S.tick(g, 0.25);
  assert.deepEqual(g.campaign.board.map((b) => b.starId), ['sol', 'eri40']);
  assert.ok(g.pois.length >= 20 && g.pois.every((p) => p.id && p.pos));
  assert.ok(g.galaxy.lanes.length && g.galaxy.known.sol && g.galaxy.known.tauceti);
  assert.deepEqual(S.techDefs().map((t) => t.id).includes('drive-1'), true);
});

test('act I extinction clocks match the old twelve-star game', () => {
  const seed = 7;
  const old = {
    seed, status: 'playing', time: { worldYears: 0, shipYears: 0 },
    ship: { starId: 'tauceti' }, stars: createStars(seed),
    delivered: { sol: false, eri40: false }, rng: { s: mixSeed(seed, 0xA57A) },
  };
  const g = S.createGame(seed);
  assert.equal(S.extinctionYears(old, 'sol'), S.extinctionYears(g, 'sol'));
  assert.equal(S.extinctionYears(old, 'eri40'), S.extinctionYears(g, 'eri40'));
  // The old clocks do not drift while act I is running.
  const old2 = JSON.parse(JSON.stringify(old));
  for (let i = 0; i < 8; i++) {
    S.tick(old2, 0.25);
    S.tick(g, 0.25);
  }
  assert.ok(Math.abs(S.extinctionYears(old2, 'sol') - S.extinctionYears(g, 'sol')) < 1e-9);
  assert.ok(Math.abs(S.extinctionYears(old2, 'eri40') - S.extinctionYears(g, 'eri40')) < 1e-9);
});

test('double delivery advances to act II, seeds twelve stars and shows a card', () => {
  const g = toAct2(S.createGame(3));
  assert.equal(g.status, 'playing');                       // no classic 'won'
  assert.equal(g.campaign.act, 2);
  assert.equal(g.campaign.targets.length, 12);
  const sol = star(g, 'sol');
  for (const id of ['sol', 'eri40', 'tauceti']) assert.ok(!g.campaign.targets.includes(id));
  for (const id of g.campaign.targets) {
    const s = star(g, id);
    assert.ok(s.infection >= 0.05 && s.infection <= 0.2, id + ' ' + s.infection);
    assert.equal(g.galaxy.known[id], true);
  }
  assert.deepEqual(g.campaign.pendingCard, {
    kicker: 'ACT II', title: 'THE SPREAD',
    subtitle: 'Astrophage has found a hundred more worlds. Save what you can.',
  });
  assert.ok(g.log.some((l) => /ACT II/.test(l.text)));
  assert.ok(g.campaign.board.length >= 3 && g.campaign.board.length <= 4);
});

test('eight saves advance to act III and mark the Source buoy', () => {
  const g = toAct2(S.createGame(4));
  g.campaign.saved = g.campaign.targets.slice(0, 8);
  S.tick(g, 0.25);
  assert.equal(g.campaign.act, 3);
  assert.equal(g.campaign.pendingCard.title, 'THE LANES');
  for (const p of g.pois) assert.ok(p.known && p.revealed);
  const sources = g.pois.filter((p) => p.source);
  assert.equal(sources.length, 1);
  assert.equal(sources[0].kind, 'buoy');
  const far = Math.max(...g.pois.filter((p) => p.kind === 'buoy').map((p) => Math.hypot(...p.pos)));
  assert.ok(Math.abs(Math.hypot(...sources[0].pos) - far) < 1e-9);
  assert.ok(g.stars.some((s) => s.id === g.campaign.sourceStarId));
});

test('act II: six dark target stars lose; sol going dark loses too', () => {
  const g = toAct2(S.createGame(5));
  for (const id of g.campaign.targets.slice(0, 6)) star(g, id).infection = 0.95;
  S.tick(g, 0.25);
  assert.equal(g.status, 'lost');
  assert.ok(g.campaign.dark.length >= 6);
  assert.ok(g.log.some((l) => /gone dark/.test(l.text)));

  const h = toAct2(S.createGame(5));
  const sol = star(h, 'sol'); sol.infection = 0.95;
  S.tick(h, 0.25);
  assert.equal(h.status, 'lost');
  assert.ok(sol.dark && h.campaign.dark.includes('sol'));
});

test('deliverStrain credits a save and reports failing traits', () => {
  const g = toAct2(S.createGame(6));
  const id = g.campaign.targets[0];
  g.ship.starId = id;
  const s = perfect(g);
  const before = g.research;
  const ok = S.deliverStrain(g, s.id);
  assert.equal(ok.ok, true, ok.text);
  assert.equal(star(g, id).saved, true);
  assert.ok(g.campaign.saved.includes(id));
  assert.equal(g.research, before + 10);
  assert.ok(g.campaign.score > 0);
  assert.ok(g.log.some((l) => /saved/.test(l.text)));

  const h = toAct2(S.createGame(6));
  const tid = h.campaign.targets[1];
  h.ship.starId = tid;
  const badStrain = newStrain(h);
  for (const t of BIOSPHERE) badStrain.traits[t] = 0;
  const need = biosphereProfile(star(h, tid));
  const r = S.deliverStrain(h, badStrain.id);
  assert.equal(r.ok, false);
  assert.deepEqual(new Set(r.short), new Set(BIOSPHERE.filter((t) => need[t] > 0)));
  assert.ok(BIOSPHERE.some((t) => r.text.includes(t)));
  assert.equal(h.campaign.saved.length, 0);
});

test('board contracts complete and pay their reward once', () => {
  const g = S.startEndless(8);
  const save = g.campaign.board.find((b) => b.kind === 'save');
  assert.ok(save, 'a save contract is on the board');
  const before = g.research;
  star(g, save.starId).saved = true;
  S.campaignTick(g);
  assert.ok(g.research >= before + save.reward.research);
  const paid = g.research;
  S.campaignTick(g);
  assert.equal(g.research, paid, 'no second payout');

  const h = S.startEndless(8);
  const survey = h.campaign.board.find((b) => b.kind === 'survey');
  assert.ok(survey);
  for (const p of star(h, survey.starId).planets.slice(0, survey.count)) p.scanned = true;
  const r0 = h.research;
  S.campaignTick(h);
  assert.ok(h.research >= r0 + survey.reward.research);
});

test('beetle arrivals are credited to the campaign', () => {
  const g = toAct2(S.createGame(9));
  g.rocky.materials = { minerals: 10, volatiles: 10, gas: 10, silicates: 10 };
  const s = perfect(g);
  const target = g.campaign.targets[0];
  const r = S.launchBeetle(g, s.id, target);
  assert.equal(r.ok, true, r.why);
  g.time.worldYears = r.beetle.arriveWorldYears;
  S.tick(g, 0.25);
  assert.ok(g.campaign.saved.includes(target));
  assert.equal(star(g, target).saved, true);
});

test('final win needs carto6 and a source-grade strain delivered at the Source', () => {
  const g = toAct2(S.createGame(10));
  g.campaign.saved = g.campaign.targets.slice(0, 8);
  S.tick(g, 0.25);
  assert.equal(g.campaign.act, 3);
  g.events.flags.carto6 = true;
  g.ship.starId = g.campaign.sourceStarId;
  const s = perfect(g);
  assert.equal(S.deliverStrain(g, s.id).ok, true);
  assert.equal(g.campaign.sourceDelivered, true);
  assert.equal(g.status, 'won');
  assert.ok(g.pois.find((p) => p.source).used);
});

test('endless mode: act II from the start, cycles, score, and only sol can lose', () => {
  const g = S.startEndless(11);
  assert.equal(g.campaign.mode, 'endless');
  assert.equal(g.campaign.act, 2);
  assert.equal(g.campaign.targets.length, 12);
  const s = perfect(g);
  for (let i = 0; i < 6; i++) {
    g.ship.starId = g.campaign.targets[i];
    assert.equal(S.deliverStrain(g, s.id).ok, true);
  }
  assert.equal(g.campaign.cycle, 1);
  assert.ok(Math.abs(g.campaign.difficulty - 1.15) < 1e-9);
  assert.ok(g.campaign.score > 0);
  g.campaign.saved = g.campaign.targets.slice(0, 8);
  S.tick(g, 0.25);
  assert.equal(g.status, 'playing', 'endless never wins');
  assert.equal(g.campaign.act, 2);
  // Six dark stars do not end an endless run.
  for (const id of g.campaign.targets.slice(6, 12)) star(g, id).infection = 0.95;
  S.tick(g, 0.25);
  assert.equal(g.status, 'playing');
  star(g, 'sol').infection = 0.95;
  S.tick(g, 0.25);
  assert.equal(g.status, 'lost');
});

test('old saves migrate without growing the galaxy', () => {
  const old = {
    seed: 12, status: 'playing', statusText: '',
    time: { worldYears: 3, shipYears: 1 },
    ship: { starId: 'tauceti', fuelKg: 60000, fuelMaxKg: 60000, hull: 1, upgrades: [], samples: 2 },
    stars: createStars(12),
    lab: { strains: [], bestTolerance: 0, escapeRisk: 0, generations: 0, nextId: 1 },
    delivered: { sol: false, eri40: false },
    log: [], rng: { s: mixSeed(12, 0xA57A) },
  };
  const m = S.deserialize(JSON.stringify({ v: 1, state: JSON.parse(JSON.stringify(old)) }));
  assert.equal(m.stars.length, 12);
  assert.equal(m.research, 0);
  assert.deepEqual(m.tech.owned, []);
  assert.deepEqual(m.genetics, { strains: [], nextId: 1, best: 0 });
  assert.deepEqual(m.beetles, []);
  assert.equal(m.pois.length, 25);
  assert.ok(m.galaxy.lanes.length && m.galaxy.known.sol);
  assert.ok(m.events.flags && m.events.pending === null);
  assert.equal(m.campaign.act, 1);
  assert.equal(m.campaign.mode, 'campaign');
  assert.deepEqual(m.campaign.board, []);
  S.tick(m, 0.25);
  assert.deepEqual(m.campaign.board.map((b) => b.starId), ['sol', 'eri40']);
});

test('research: scans, samples and first visits', () => {
  resetContent();
  registerPack({ id: 'no-cards', events: [], techs: [], pois: [] });
  try {
    const g = S.createGame(13);
    assert.equal(S.scanPlanet(g, 'tauceti-3').ok, true);
    assert.equal(g.research, 2);
    assert.equal(collectSample(g, 'tauceti-3').ok, true);
    assert.equal(g.research, 5);
    assert.equal(S.travel(g, 'eri40').ok, true);
    assert.equal(g.research, 10);
    assert.equal(S.travel(g, 'sol').ok, true);
    assert.equal(g.research, 15);        // only the first visit pays
  } finally {
    loadContent(registerPack);
  }
});

test('travel draws flight and arrival events deterministically', () => {
  const run = () => {
    const g = S.createGame(14);
    S.travel(g, 'eri40');
    return g;
  };
  const a = run(), b = run();
  assert.deepEqual(a.events.pending, b.events.pending);
  assert.equal(a.events.pending?.id, b.events.pending?.id);
  assert.equal(a.rng.s, b.rng.s);
  assert.equal(a.galaxy.surveyed.eri40, true);
  assert.equal(a.galaxy.known.eri40, true);
});
