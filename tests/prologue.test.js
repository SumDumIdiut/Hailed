import test from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../src/sim/index.js';

const AD = 'tauceti-3';
const star = (g, id) => g.stars.find((s) => s.id === id);
const dist = (a, b) => Math.hypot(a.pos[0] - b.pos[0], a.pos[1] - b.pos[1], a.pos[2] - b.pos[2]);
const coversBoth = (g) => g.genetics.strains.find((s) =>
  S.canSave(s, S.biosphereProfile(star(g, 'sol'), g)) && S.canSave(s, S.biosphereProfile(star(g, 'eri40'), g)));

// Four default-pressure generations are meant to be enough; this guard catches drift.
function breedToCover(g, countCalls) {
  let n = 0;
  while (!coversBoth(g) && n++ < 12) {
    const parent = g.genetics.strains.slice().sort((a, b) => b.traits.nitrogen - a.traits.nitrogen)[0];
    const r = S.breed(g, { focus: 'nitrogen', pressure: 0.5, strainId: parent.id });
    if (countCalls) countCalls();
    assert.ok(r.ok, r.text);
  }
  assert.ok(n <= 5, `prologue needed ${n} breeds`);
  return coversBoth(g);
}

function scanAndSample(g, countCalls) {
  assert.ok(S.scanBegin(g, AD).ok);
  if (countCalls) countCalls();
  assert.ok(S.scanProgress(g, AD, 1).crossed);
  if (countCalls) countCalls();
  assert.ok(S.autoSample(g, AD).ok);
  if (countCalls) countCalls();
}

test('new games start in orbit of Adrian with the prologue flag and a free xenonite lab', () => {
  const g = S.createGame(3);
  assert.equal(g.ship.starId, 'tauceti');
  assert.equal(g.ship.planetId, AD);
  assert.ok(g.rocky.docked && g.rocky.starId === 'tauceti' && g.rocky.planetId === AD);
  assert.equal(g.campaign.act, 1);
  assert.equal(g.campaign.prologue, true);
  assert.deepEqual(g.ship.upgrades, ['xenonite-lab']);
  assert.ok(g.rocky.built.includes('xenonite-lab'));
  assert.equal(g.lab.escapeRisk, 0);
  assert.deepEqual(g.genetics.strains, []);
  assert.equal(S.prologueStep(g), 'scan');
  // The old-style start has no prologue flag at all and keeps the original inventory.
  const old = S.createGame(3, { legacyActI: true });
  assert.equal(old.campaign.prologue, undefined);
  assert.equal(old.ship.planetId, null);
  assert.deepEqual(old.ship.upgrades, []);
  assert.deepEqual(old.rocky.materials, { minerals: 2, volatiles: 1, gas: 0, silicates: 1 });
  assert.equal(S.prologueStep(old), 'done');
});

test('scripted prologue finishes in at most 40 sim calls and opens Act II', () => {
  const g = S.createGame(1);
  let calls = 0;
  const call = () => { calls += 1; };
  const step = () => { const s = S.prologueStep(g); call(); return s; };

  assert.equal(step(), 'scan');
  assert.ok(S.scanBegin(g, AD).ok); call();
  assert.ok(S.scanProgress(g, AD, 1).crossed); call();
  assert.equal(step(), 'sample');
  assert.ok(S.autoSample(g, AD).ok); call();
  assert.equal(step(), 'breed');
  breedToCover(g, call);
  assert.equal(step(), 'beetle');
  const strain = coversBoth(g);
  assert.ok(S.launchBeetle(g, strain.id, 'sol').ok); call();
  assert.equal(step(), 'jump');
  assert.ok(S.travel(g, 'eri40').ok); call();
  assert.equal(step(), 'deliver');
  assert.ok(S.travelToPlanet(g, 'eri40-2').ok); call();
  assert.ok(S.deliverStrain(g, strain.id).ok); call();
  assert.equal(g.delivered.eri40, true);
  assert.equal(step(), 'done');

  assert.ok(calls <= 40, `used ${calls} sim calls`);
  assert.equal(g.status, 'playing');
  assert.equal(g.campaign.act, 2);
  assert.equal(g.campaign.prologue, false);
  assert.deepEqual(g.campaign.pendingCard, {
    kicker: 'ACT II', title: 'THE SPREAD',
    subtitle: 'Astrophage has found a hundred more worlds. Save what you can.',
  });
  assert.equal(g.campaign.targets.length, 12);
  assert.ok(g.campaign.board.length >= 3);
  assert.equal(S.prologueStep(g), 'done');
});

test('prologueStep walks every transition in order', () => {
  const g = S.createGame(2);
  assert.equal(S.prologueStep(g), 'scan');
  assert.ok(S.scanBegin(g, AD).ok);
  assert.equal(S.prologueStep(g), 'scan');            // not full yet
  assert.ok(S.scanProgress(g, AD, 0.6).crossed);
  assert.equal(S.prologueStep(g), 'sample');
  assert.ok(S.autoSample(g, AD).ok);
  assert.equal(S.prologueStep(g), 'breed');
  breedToCover(g);
  assert.equal(S.prologueStep(g), 'beetle');
  const strain = coversBoth(g);
  assert.ok(S.launchBeetle(g, strain.id, 'sol').ok);
  assert.equal(S.prologueStep(g), 'jump');
  assert.ok(S.travel(g, 'eri40').ok);
  assert.equal(S.prologueStep(g), 'deliver');
  assert.ok(S.deliverStrain(g, strain.id).ok);         // delivery works without an orbital detour
  assert.equal(S.prologueStep(g), 'done');
  assert.equal(g.campaign.act, 2);
});

test('skipPrologue is byte-for-byte the shape of a finished prologue', () => {
  const g = S.createGame(11, { skipPrologue: true });
  assert.equal(g.campaign.act, 2);
  assert.equal(g.campaign.prologue, false);
  assert.equal(g.delivered.sol, true);
  assert.equal(g.delivered.eri40, true);
  assert.ok(star(g, 'sol').saved && star(g, 'eri40').saved);
  assert.deepEqual(new Set(g.campaign.saved), new Set(['sol', 'eri40']));
  const strain = g.genetics.strains.find((s) => s.name === 'Taumoeba-1');
  assert.ok(strain, 'a named starter strain exists');
  assert.ok(S.canSave(strain, S.biosphereProfile(star(g, 'sol'), g)));
  assert.ok(S.canSave(strain, S.biosphereProfile(star(g, 'eri40'), g)));
  assert.equal(g.campaign.targets.length, 12);
  assert.ok(g.campaign.pendingCard?.title === 'THE SPREAD');
  assert.ok(g.beetles.some((b) => b.to === 'sol' && b.status === 'arrived' && b.credited));
  assert.equal(g.ship.starId, 'eri40');
  assert.equal(S.prologueStep(g), 'done');
});

test('the prologue Beetle is free, flies at 0.99c, and saves Sol on arrival', () => {
  const g = S.createGame(5);
  scanAndSample(g);
  breedToCover(g);
  const strain = coversBoth(g);
  const fuel0 = g.ship.fuelKg, mats0 = { ...g.rocky.materials };
  const launch = S.launchBeetle(g, strain.id, 'sol');
  assert.ok(launch.ok, launch.why);
  assert.equal(g.ship.fuelKg, fuel0);
  assert.deepEqual(g.rocky.materials, mats0);
  const d = dist(star(g, 'tauceti'), star(g, 'sol'));
  assert.ok(Math.abs(launch.travelYears - d / 0.99) < 1e-9);
  assert.equal(g.delivered.sol, false);
  g.time.worldYears = launch.beetle.arriveWorldYears;
  S.tick(g, 0.25);
  assert.equal(g.beetles[0].status, 'arrived');
  assert.equal(star(g, 'sol').saved, true);
  assert.equal(g.delivered.sol, true);
});

test('prologue saves round-trip mid-prologue and finish identically', () => {
  const g = S.createGame(7);
  scanAndSample(g);
  breedToCover(g);
  const strain = coversBoth(g);
  assert.ok(S.launchBeetle(g, strain.id, 'sol').ok);
  const h = S.deserialize(S.serialize(g));
  assert.deepEqual(h, g);
  assert.equal(S.prologueStep(h), S.prologueStep(g));
  for (const s of [g, h]) {
    assert.ok(S.travel(s, 'eri40').ok);
    assert.ok(S.deliverStrain(s, strain.id).ok);
    assert.equal(S.prologueStep(s), 'done');
  }
  assert.deepEqual(h, g);
});

test('a prologue that reaches both delivery flags by another route still closes properly', () => {
  const g = S.createGame(8);
  g.delivered.sol = true;
  g.delivered.eri40 = true;
  S.tick(g, 0.25);
  assert.equal(g.campaign.act, 2);
  assert.equal(g.campaign.prologue, false);
  assert.ok(g.genetics.strains.some((s) => s.name === 'Taumoeba-1'));
  assert.equal(S.prologueStep(g), 'done');
});

test('every sampling path names the first Adrian strain Taumoeba; scans are 3x faster', () => {
  const instant = S.createGame(6);
  assert.ok(S.scanPlanet(instant, AD).ok);            // already in orbit: a full close scan
  assert.ok(S.samplePlanet(instant, AD).ok);
  assert.ok(instant.genetics.strains.some((s) => s.name === 'Taumoeba'));

  const swept = S.createGame(6);
  scanAndSample(swept);
  assert.equal(swept.genetics.strains.filter((s) => s.name === 'Taumoeba').length, 1);
  S.endSample(swept);                                  // cleanup path is idempotent
  assert.equal(swept.genetics.strains.filter((s) => s.name === 'Taumoeba').length, 1);

  const legacy = S.createGame(6, { legacyActI: true });
  for (const g of [instant, legacy]) {
    assert.ok(S.travelToPlanet(g, AD).ok || g.ship.planetId === AD);
    assert.ok(S.scanBegin(g, AD).ok);
    S.scanProgress(g, AD, 0.2);
  }
  assert.equal(S.scanCoverage(instant, AD), 0.6);
  assert.equal(S.scanCoverage(legacy, AD), 0.2);
});
