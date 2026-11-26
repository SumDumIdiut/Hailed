import test from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../src/sim/index.js';

const TYPES = ['rocky', 'ocean', 'ice', 'lava', 'gas', 'desert'];
const isRGB = (c) => Array.isArray(c) && c.length === 3 && c.every((v) => v >= 0 && v <= 1);
const orbit = (g, id) => { assert.ok(S.travelToPlanet(g, id).ok, 'orbit ' + id); };
const star = (g, id) => g.stars.find((s) => s.id === id);

// These are the ORIGINAL Act I tests. They build the old-style start (ship parked at
// Tau Ceti, no prologue flag, xenonite lab not yet built) so they keep covering the
// legacy tutorial path; the new prologue is covered in tests/prologue.test.js.
const createGame = (seed, opts = {}) => S.createGame(seed, { legacyActI: true, ...opts });

// Rocky crafts the xenonite lab (the starting materials cover it exactly), then sample Adrian.
function winSetup(g) {
  assert.ok(S.craft(g, 'xenonite-lab').ok, 'craft the xenonite lab');
  assert.ok(g.ship.upgrades.includes('xenonite-lab'));
  assert.ok(S.travelToPlanet(g, 'tauceti-3').ok);
  assert.ok(S.autoSample(g, 'tauceti-3').ok);       // scan sweep + tether probe, scripted controller
  assert.ok(S.autoSample(g, 'tauceti-3').ok);
}
function breedUp(g) {
  let n = 0;
  while (g.lab.bestTolerance < 0.9 && n++ < 400) {
    const b = g.lab.bestTolerance;
    S.breedStep(g, { nitrogenPct: Math.min(100, b * 100 + 10) });
    if (!g.lab.strains.length) { S.travelToPlanet(g, 'tauceti-3'); S.samplePlanet(g, 'tauceti-3'); }
  }
  assert.ok(g.lab.bestTolerance >= 0.9);
}

test('determinism and catalog shape', () => {
  assert.equal(S.serialize(createGame(7)), S.serialize(createGame(7)));
  assert.notEqual(S.serialize(createGame(7)), S.serialize(createGame(8)));
  const g = createGame(3);
  assert.equal(g.stars.length, 60);                       // 12 catalog stars + 48 expansion stars
  assert.equal(g.stars.filter((s) => !s.id.startsWith('g-')).length, 12);
  assert.equal(g.ship.starId, 'tauceti');
  assert.equal('eridian' in g, false);              // the comms system is gone
  assert.ok(g.rocky && g.rocky.docked && g.rocky.starId === g.ship.starId && g.rocky.mission === null);
  assert.deepEqual(g.rocky.materials, { minerals: 2, volatiles: 1, gas: 0, silicates: 1 });
  assert.deepEqual(star(g, 'sol').pos, [0, 0, 0]);
  const ids = new Set();
  for (const s of g.stars) {
    assert.ok(isRGB(s.color) && s.lum0 > 0 && s.radius > 0 && s.pos.length === 3 && s.planets.length >= 1);
    for (const p of s.planets) {
      assert.ok(!ids.has(p.id)); ids.add(p.id);
      assert.ok(TYPES.includes(p.type) && p.radius > 0 && p.orbit > 0 && p.periodDays > 0);
      assert.ok(isRGB(p.atmo.color) && p.atmo.density >= 0 && p.atmo.density <= 1);
      assert.ok(p.palette.length >= 3 && p.palette.length <= 5 && p.palette.every(isRGB));
      assert.ok(p.rings === null || (p.rings.inner > 1 && p.rings.outer > p.rings.inner && isRGB(p.rings.color)));
      assert.ok(Number.isInteger(p.seed));
    }
  }
  const earth = star(g, 'sol').planets.find((p) => p.special === 'earth');
  assert.equal(earth.name, 'Earth');
  assert.ok(star(g, 'sol').planets.some((p) => p.type === 'gas' && p.rings));
  const erid = star(g, 'eri40').planets.find((p) => p.special === 'erid');
  assert.ok(erid && erid.atmo.density > 0.9);
  const ad = star(g, 'tauceti').planets.find((p) => p.special === 'adrian');
  assert.ok(ad.hasTaumoeba && ad.id === 'tauceti-3' && ad.atmo.density > 0.8);
});

test('logistic growth and spread', () => {
  const g = createGame(1);
  const s = star(g, 'eri40'), i0 = s.infection;
  S.tick(g, 5);
  assert.ok(s.infection > i0);
  assert.ok(s.lum < s.lum0);
  assert.equal(g.time.worldYears, 5);
  // spread: an uninfected far star becomes infected eventually
  const g2 = createGame(1);
  const w = star(g2, 'wolf359'); w.infection = 0;
  for (let i = 0; i < 12 && w.infection === 0; i++) S.tick(g2, 2);
  assert.ok(w.infection > 0);
  // Tau Ceti holds steady
  const g3 = createGame(1); const t = star(g3, 'tauceti');
  S.tick(g3, 20);
  assert.ok(t.infection < 0.2 && t.infection > 0.1);
  assert.equal(S.extinctionYears(g3, 'earth') > 0, true);
});

test('extinction years and idle loss', () => {
  const g = createGame(1);
  const e = S.extinctionYears(g, 'erid');
  assert.ok(e > 20 && e < 40);
  assert.ok(S.extinctionYears(g, 'earth') > e);
  for (const seed of [1, 2, 3]) {
    const h = createGame(seed);
    while (h.status === 'playing') S.tick(h, 0.5);
    assert.equal(h.status, 'lost');
    assert.ok(h.time.worldYears > 20 && h.time.worldYears < 42, String(h.time.worldYears));
    assert.ok(h.statusText.length > 0);
  }
});

test('travel fuel and relativity', () => {
  const g = createGame(1);
  const plan = S.travelPlan(g, 'eri40');
  assert.ok(plan.ok && plan.shipYears < plan.worldYears && plan.worldYears > plan.distanceLy);
  const f0 = g.ship.fuelKg;
  const r = S.travel(g, 'eri40');
  assert.ok(r.ok);
  assert.equal(g.ship.starId, 'eri40');
  assert.equal(g.ship.fuelKg, f0 - plan.fuelKg);
  assert.ok(Math.abs(g.time.worldYears - plan.worldYears) < 1e-9);
  assert.ok(g.time.shipYears < g.time.worldYears);
  // refusal: drain fuel
  g.ship.fuelKg = 100;
  const bad = S.travel(g, 'sol');
  assert.equal(bad.ok, false);
  assert.ok(/fuel/i.test(bad.reason));
  assert.equal(g.ship.starId, 'eri40');
  assert.equal(S.travelPlan(g, 'nowhere').ok, false);
  // trips per tank: 2-4 typical trips
  const full = createGame(1);
  const per = 60000 / S.travelPlan(full, 'sol').fuelKg;
  assert.ok(per >= 2 && per <= 4);
});

test('breeding progress and death', () => {
  const g = createGame(1);
  assert.equal(S.breedStep(g, { nitrogenPct: 10 }).ok, false);
  orbit(g, 'tauceti-3'); S.scanPlanet(g, 'tauceti-3');
  assert.equal(S.samplePlanet(g, 'tauceti-3').ok, true);
  assert.equal(g.lab.strains.length, 1);
  const ship0 = g.time.shipYears;
  for (let i = 0; i < 20; i++) S.breedStep(g, { nitrogenPct: g.lab.bestTolerance * 100 + 8 });
  assert.ok(g.lab.bestTolerance > 0.3, String(g.lab.bestTolerance));
  assert.ok(g.time.shipYears > ship0);
  assert.ok(g.lab.escapeRisk > 0);
  // too low: slow
  const h = createGame(1); orbit(h, 'tauceti-3'); S.scanPlanet(h, 'tauceti-3'); S.samplePlanet(h, 'tauceti-3');
  for (let i = 0; i < 20; i++) S.breedStep(h, { nitrogenPct: 0 });
  assert.ok(h.lab.bestTolerance < 0.4, String(h.lab.bestTolerance)); // no selection pressure: random drift only
  // too high: death
  const d = createGame(1); orbit(d, 'tauceti-3'); S.scanPlanet(d, 'tauceti-3'); S.samplePlanet(d, 'tauceti-3');
  const r = S.breedStep(d, { nitrogenPct: 90 });
  assert.equal(d.lab.strains.length, 0);
  assert.ok(/died/i.test(r.text));
});

test('breach without lab, none with xenonite-lab', () => {
  const g = createGame(1); orbit(g, 'tauceti-3'); S.scanPlanet(g, 'tauceti-3'); S.samplePlanet(g, 'tauceti-3');
  let breached = false;
  for (let k = 0; k < 40 && !breached; k++) {
    g.lab.strains = [{ id: 'x', nTolerance: 0.95, population: 500, generation: 0 }];
    S.breedStep(g, { nitrogenPct: 80 });
    breached = g.ship.hull < 1;
  }
  assert.ok(breached && g.lab.strains.length === 0);
  const h = createGame(1); h.ship.upgrades.push('xenonite-lab');
  h.lab.strains = [{ id: 'x', nTolerance: 0.95, population: 500, generation: 0 }];
  S.breedStep(h, { nitrogenPct: 80 });
  assert.equal(h.lab.escapeRisk, 0);
  for (let k = 0; k < 40; k++) S.breedStep(h, { nitrogenPct: 80 });
  assert.equal(h.ship.hull, 1);
});

test('scripted winning run', () => {
  const g = createGame(1);
  winSetup(g); breedUp(g);
  assert.equal(S.deliver(g).ok, false); // not at a target
  assert.ok(S.travel(g, 'eri40').ok);
  assert.equal(g.ship.planetId, null);
  assert.equal(S.deliver(g).ok, false); // not in orbit yet
  orbit(g, 'eri40-2');
  assert.ok(S.deliver(g).ok);
  assert.equal(g.status, 'playing');
  const infBefore = star(g, 'eri40').infection;
  S.tick(g, 1);
  assert.ok(star(g, 'eri40').infection < infBefore);
  assert.ok(S.travel(g, 'sol').ok, 'fuel/time');
  assert.equal(g.status, 'playing', g.statusText);
  orbit(g, 'sol-3');
  assert.ok(S.deliver(g).ok);
  // Act I completion now opens act II instead of ending the game.
  assert.equal(g.status, 'playing');
  assert.equal(g.campaign.act, 2);
  assert.ok(g.time.worldYears < 40);
  assert.ok(g.log.length > 3);
});

test('losing: wrong order is too slow, idle loses', () => {
  const g = createGame(1);
  winSetup(g); breedUp(g);
  while (S.extinctionYears(g, 'erid') > 13) S.tick(g, 0.25);   // dawdle at Tau Ceti until 40 Eridani is nearly gone
  S.travel(g, 'sol');
  if (g.status === 'playing') { orbit(g, 'sol-3'); S.deliver(g); S.travel(g, 'eri40'); }
  assert.equal(g.status, 'lost');
});

test('save round trip', () => {
  const g = createGame(5);
  winSetup(g);
  S.tick(g, 3);
  g.stars[0].infection = Infinity; // exercise non-finite handling
  const s = S.serialize(g);
  const h = S.deserialize(s);
  assert.deepEqual(h, g);
  assert.equal(S.serialize(h), s);
  g.stars[0].infection = 0.05; h.stars[0].infection = 0.05;
  S.tick(g, 7); S.tick(h, 7);
  assert.deepEqual(h, g); // RNG stream reproduced
  assert.throws(() => S.deserialize('{"x":1}'));
});

test('in-system travel: plan, cost, nav discount, refusals', () => {
  const g = createGame(1);
  assert.equal(g.ship.planetId, null);
  const plan = S.travelToPlanetPlan(g, 'tauceti-3');
  assert.ok(plan.ok && plan.fuelKg >= 100 && plan.fuelKg <= 900, String(plan.fuelKg));
  // days, not years, and world time ~ ship time
  assert.ok(plan.shipDays > 0.5 && plan.shipDays < 30 && plan.worldDays === plan.shipDays);
  const f0 = g.ship.fuelKg, w0 = g.time.worldYears, s0 = g.time.shipYears;
  const r = S.travelToPlanet(g, 'tauceti-3');
  assert.ok(r.ok && g.ship.planetId === 'tauceti-3');
  assert.equal(g.ship.fuelKg, f0 - plan.fuelKg);
  assert.ok(Math.abs((g.time.worldYears - w0) * 365.25 - plan.worldDays) < 1e-6);
  assert.ok(Math.abs((g.time.shipYears - s0) * 365.25 - plan.shipDays) < 1e-6);
  assert.equal(S.travelToPlanet(g, 'tauceti-3').ok, false);          // already there
  assert.equal(S.travelToPlanetPlan(g, 'sol-3').ok, false);          // other system
  assert.equal(S.travelToPlanetPlan(g, 'nope').ok, false);
  // farther planet costs more; nav discount cuts fuel
  const far = S.travelToPlanetPlan(g, 'tauceti-6'), near = S.travelToPlanetPlan(g, 'tauceti-2');
  assert.ok(far.fuelKg > near.fuelKg && far.shipDays > near.shipDays);
  g.ship.upgrades.push('eridian-nav');
  assert.ok(S.travelToPlanetPlan(g, 'tauceti-6').fuelKg < far.fuelKg);
  g.ship.fuelKg = 10;
  const bad = S.travelToPlanet(g, 'tauceti-6');
  assert.ok(!bad.ok && /fuel/i.test(bad.reason) && g.ship.planetId === 'tauceti-3');
  // interstellar travel resets the orbit
  g.ship.fuelKg = 60000;
  assert.ok(S.travel(g, 'sol').ok);
  assert.equal(g.ship.planetId, null);
});

test('sampling needs orbit, scan range penalty', () => {
  const g = createGame(1);
  // remote scan from parking orbit: works, but no Taumoeba and not enough for a sample
  const t0 = g.time.shipYears, f0 = g.ship.fuelKg;
  const r = S.scanPlanet(g, 'tauceti-3');
  assert.ok(r.ok && /Remote/.test(r.text) && !/Taumoeba signature/.test(r.text));
  assert.ok(g.time.shipYears > t0 && g.ship.fuelKg < f0 && r.cost.fuelKg > 0);
  const s1 = S.samplePlanet(g, 'tauceti-3');
  assert.ok(!s1.ok && /orbit/i.test(s1.text));
  // orbit a neighbour within range: full scan reveals it, but sampling still needs own orbit
  orbit(g, 'tauceti-2');
  const r2 = S.scanPlanet(g, 'tauceti-3');
  assert.ok(/Taumoeba signature/.test(r2.text));
  const s2 = S.samplePlanet(g, 'tauceti-3');
  assert.ok(!s2.ok && /orbit/i.test(s2.text));
  // far planet from a distant orbit is still remote-only
  orbit(g, 'tauceti-1');
  assert.ok(!/Taumoeba/.test(S.scanPlanet(g, 'tauceti-6').text));
  orbit(g, 'tauceti-3');
  assert.ok(S.samplePlanet(g, 'tauceti-3').ok);
  assert.equal(S.scanPlanet(g, 'sol-3').ok, false); // other system
});

test('deliver requires orbit of Earth or Erid', () => {
  const g = createGame(1);
  winSetup(g); breedUp(g);
  S.travel(g, 'eri40');
  assert.ok(/orbit/i.test(S.deliver(g).text));
  orbit(g, 'eri40-3');                                  // wrong planet
  assert.equal(S.deliver(g).ok, false);
  orbit(g, 'eri40-2');
  assert.ok(S.deliver(g).ok);
});

test('small actions cost ship time and fuel', () => {
  const g = createGame(1);
  orbit(g, 'tauceti-3'); S.scanPlanet(g, 'tauceti-3'); S.samplePlanet(g, 'tauceti-3');
  const t = g.time.shipYears, f = g.ship.fuelKg;
  const b = S.breedStep(g, { nitrogenPct: 10 });
  assert.ok(b.cost.fuelKg > 0 && g.ship.fuelKg < f && g.time.shipYears > t);
  // old save without planetId / scanLevel
  const old = JSON.parse(S.serialize(g)); delete old.state.ship.planetId;
  for (const s of old.state.stars) for (const p of s.planets) delete p.scanLevel;
  const h = S.deserialize(JSON.stringify(old));
  assert.equal(h.ship.planetId, null);
  assert.equal(h.stars.find((x) => x.id === 'tauceti').planets[2].scanLevel, 2);
});

test('old saves migrate: eridian dropped, default rocky added, upgrades kept', () => {
  const g = createGame(2);
  g.ship.upgrades.push('xenonite-lab', 'eridian-nav');
  const old = JSON.parse(S.serialize(g));
  old.state.eridian = { name: 'Rocky', met: true, trust: 0.6, said: { greet: 2 }, vocab: { fuel: { learned: true } },
    beats: { 'first-contact': true }, cur: null, v: 3 };
  delete old.state.rocky;
  const m = S.deserialize(JSON.stringify(old));
  assert.equal('eridian' in m, false);                                  // the comms system is dropped
  assert.deepEqual(m.rocky, createGame(2).rocky);                     // default Rocky: docked at the ship
  assert.deepEqual(m.ship.upgrades, ['xenonite-lab', 'eridian-nav']);   // kept as they were
  // a save that already has Rocky keeps him exactly as he is
  const cur = JSON.parse(S.serialize(createGame(2)));
  cur.state.rocky.docked = false; cur.state.rocky.materials.gas = 7; cur.state.rocky.says = { text: 'Hi', mood: 'still', worldYears: 1 };
  const k = S.deserialize(JSON.stringify(cur));
  assert.equal(k.rocky.docked, false);
  assert.equal(k.rocky.materials.gas, 7);
  assert.deepEqual(k.rocky.says, { text: 'Hi', mood: 'still', worldYears: 1 });
});

// ---- Rocky's ship, the Blip-A ----
const YIELDS = { rocky: { minerals: 4 }, lava: { minerals: 5 }, desert: { silicates: 4 }, ice: { volatiles: 4 }, ocean: { volatiles: 3 }, gas: { gas: 4 } };
const BASE_MATS = { minerals: 2, volatiles: 1, gas: 0, silicates: 1 };

test('dock and undock: same system, same orbit, no mission, half a day each', () => {
  const g = createGame(1);
  assert.ok(g.rocky.docked && g.rocky.starId === g.ship.starId && g.rocky.planetId === null);
  const w0 = g.time.worldYears, s0 = g.time.shipYears;
  assert.ok(S.undock(g).ok);
  assert.ok(!g.rocky.docked);
  assert.ok(Math.abs((g.time.worldYears - w0) * 365.25 - 0.5) < 1e-9, 'half a day of world time');
  assert.ok(Math.abs((g.time.shipYears - s0) * 365.25 - 0.5) < 1e-9, 'half a day of ship time');
  assert.equal(S.undock(g).ok, false);                                   // already away
  // the orbit must match
  g.rocky.planetId = 'tauceti-2';
  let r = S.dock(g);
  assert.equal(r.ok, false); assert.match(r.text, /orbit/);
  g.rocky.planetId = null;
  // the system must match
  g.rocky.starId = 'sol';
  r = S.dock(g);
  assert.equal(r.ok, false); assert.match(r.text, /system/);
  g.rocky.starId = 'tauceti';
  assert.ok(S.dock(g).ok);
  assert.equal(S.dock(g).ok, false);                                     // already docked
  // a running mission blocks both
  assert.ok(S.startMission(g, 'gather', 'tauceti-1').ok);
  assert.equal(S.dock(g).ok, false);
  assert.equal(S.undock(g).ok, false);
  assert.ok(S.waitForRocky(g).ok);
  assert.ok(g.rocky.docked && !g.rocky.mission);
  // while docked the Blip-A follows the ship
  assert.ok(S.travelToPlanet(g, 'tauceti-3').ok);
  assert.equal(g.rocky.planetId, 'tauceti-3');
});

test('gather mission: plan, start, waitForRocky pays out and docks', () => {
  const g = createGame(1);
  const p2 = star(g, 'tauceti').planets.find((p) => p.id === 'tauceti-2');
  const plan = S.missionPlan(g, 'gather', 'tauceti-2');
  assert.ok(plan.ok, plan.reason);
  const d = Math.abs(p2.orbit - S.shipOrbit(g));
  assert.ok(Math.abs(plan.days - (2 + 3 * Math.sqrt(d) + 6)) < 1e-9, 'round trip plus 6 days mining');
  assert.deepEqual(plan.yield, YIELDS[p2.type]);
  assert.equal(S.missionPlan(g, 'raid', 'tauceti-2').ok, false);         // only gather exists
  assert.equal(S.missionPlan(g, 'gather', 'sol-3').ok, false);           // other system
  assert.equal(S.missionPlan(g, 'gather', 'nope').ok, false);
  const w0 = g.time.worldYears;
  const start = S.startMission(g, 'gather', 'tauceti-2');
  assert.ok(start.ok, start.text);
  assert.equal(g.time.worldYears, w0);                                   // starting passes no time
  assert.ok(!g.rocky.docked && g.rocky.mission && g.rocky.mission.planetId === 'tauceti-2');
  assert.equal(g.rocky.says.text, 'Me go get rocks. You wait. Question?');
  assert.equal(S.startMission(g, 'gather', 'tauceti-1').ok, false);      // one mission at a time
  const before = { ...g.rocky.materials };
  assert.ok(S.waitForRocky(g).ok);
  assert.ok(g.time.worldYears > w0);
  assert.equal(g.rocky.mission, null);
  assert.ok(g.rocky.docked && g.rocky.planetId === g.ship.planetId && g.rocky.starId === g.ship.starId);
  for (const k of S.MATERIALS) assert.equal(g.rocky.materials[k], before[k] + (YIELDS[p2.type][k] || 0), k);
  assert.equal(g.rocky.says.text, 'Amaze! Good rocks!');
  assert.ok(g.log.some((l) => /back from/.test(l.text)));
});

test('a gather at the Petrova planet brings Astrophage fuel', () => {
  const g = createGame(1);
  const tgt = S.petrovaTarget(star(g, 'tauceti').planets);
  assert.equal(tgt.id, 'tauceti-3');
  g.ship.fuelKg = 10000;
  const plan = S.missionPlan(g, 'gather', tgt.id);
  assert.equal(plan.yield.astrophageKg, 8000);
  assert.ok(S.startMission(g, 'gather', tgt.id).ok);
  assert.ok(S.waitForRocky(g).ok);
  assert.equal(g.ship.fuelKg, 18000);                                    // 10000 + 8000
  for (const k of S.MATERIALS) assert.equal(g.rocky.materials[k], BASE_MATS[k] + (YIELDS[tgt.type][k] || 0), k);
  // capped by the tanks
  g.ship.fuelKg = g.ship.fuelMaxKg - 1000;
  assert.ok(S.startMission(g, 'gather', tgt.id).ok);
  assert.ok(S.waitForRocky(g).ok);
  assert.equal(g.ship.fuelKg, g.ship.fuelMaxKg);
});

test('interstellar travel waits for Rocky', () => {
  const g = createGame(1);
  S.undock(g);                                                           // away, no mission
  let p = S.travelPlan(g, 'eri40');
  assert.equal(p.ok, false);
  assert.match(p.reason, /Rocky is away on the Blip-A\. Wait for him to dock\./);
  assert.equal(S.travel(g, 'eri40').ok, false);
  assert.equal(g.ship.starId, 'tauceti');
  assert.ok(S.dock(g).ok);
  assert.ok(S.startMission(g, 'gather', 'tauceti-1').ok);                // away on a mission
  p = S.travelPlan(g, 'sol');
  assert.equal(p.ok, false);
  assert.match(p.reason, /Rocky is away/);
  assert.equal(S.travel(g, 'sol').ok, false);
  assert.ok(S.waitForRocky(g).ok);
  assert.ok(S.travelPlan(g, 'eri40').ok);                                 // he is back: the jump works
  assert.ok(S.travel(g, 'eri40').ok);
});

test('the Blip-A rides along on a jump', () => {
  const g = createGame(1);
  assert.ok(S.travel(g, 'eri40').ok);
  assert.equal(g.rocky.starId, 'eri40');
  assert.equal(g.rocky.planetId, null);
  assert.equal(g.rocky.docked, true);
  assert.ok(S.travelToPlanet(g, 'eri40-2').ok);
  assert.equal(g.rocky.planetId, 'eri40-2');                              // follows in-system while docked
  assert.ok(S.startMission(g, 'gather', 'eri40-3').ok);
  assert.ok(S.waitForRocky(g).ok);
  assert.ok(g.rocky.docked && g.rocky.starId === 'eri40' && g.rocky.planetId === 'eri40-2');
});

test('crafting: materials and days spent, effects applied, Rocky must be docked', () => {
  const g = createGame(1);
  const list = S.recipes(g);
  assert.deepEqual(list.map((r) => r.id), ['xenonite-lab', 'xeno-tanks', 'hull-plating', 'scoop', 'nav-link']);
  const lab = list.find((r) => r.id === 'xenonite-lab');
  assert.deepEqual(lab.cost, { minerals: 2, silicates: 1 });
  assert.equal(lab.days, 3);
  assert.equal(lab.built, false); assert.equal(lab.can, true); assert.equal(lab.why, '');
  // shortfall: refused, nothing spent, Rocky says so
  g.rocky.materials.minerals = 1;
  const poor = S.craft(g, 'xenonite-lab');
  assert.equal(poor.ok, false);
  assert.match(poor.text, /No no no\. Need more stuff\./);
  assert.equal(g.rocky.materials.minerals, 1);
  assert.equal(g.rocky.says.mood, 'slumped');
  assert.equal(S.recipes(g).find((r) => r.id === 'xenonite-lab').can, false);
  // craft it: materials spent, 3 days pass, the upgrade lands
  g.rocky.materials.minerals = 2;
  const w0 = g.time.worldYears;
  assert.ok(S.craft(g, 'xenonite-lab').ok);
  assert.equal(g.rocky.materials.minerals, 0);
  assert.equal(g.rocky.materials.silicates, 0);
  assert.ok(g.ship.upgrades.includes('xenonite-lab'));
  assert.ok(g.rocky.built.includes('xenonite-lab'));
  assert.ok(Math.abs((g.time.worldYears - w0) * 365.25 - 3) < 1e-9);
  assert.equal(S.craft(g, 'xenonite-lab').ok, false);                     // already built
  assert.equal(S.recipes(g).find((r) => r.id === 'xenonite-lab').built, true);
  // Rocky must be docked
  assert.ok(S.undock(g).ok);
  assert.equal(S.craft(g, 'hull-plating').ok, false);
  assert.ok(S.dock(g).ok);
  // hull plating: repeatable
  g.rocky.materials.minerals = 10;
  g.ship.hull = 0.4;
  assert.ok(S.craft(g, 'hull-plating').ok);
  assert.equal(g.ship.hull, 1);
  assert.equal(g.rocky.materials.minerals, 7);
  g.ship.hull = 0.2;
  assert.ok(S.craft(g, 'hull-plating').ok);
  assert.equal(g.ship.hull, 1);
  assert.equal(g.rocky.materials.minerals, 4);
  // xenonite tanks: capacity x1.5
  g.rocky.materials = { minerals: 5, volatiles: 2, gas: 0, silicates: 0 };
  const cap = g.ship.fuelMaxKg;
  assert.ok(S.craft(g, 'xeno-tanks').ok);
  assert.equal(g.ship.fuelMaxKg, Math.round(cap * 1.5));
  assert.ok(g.ship.upgrades.includes('xenonite-tanks'));
  // scoop and nav link
  g.rocky.materials = { minerals: 2, volatiles: 2, gas: 3, silicates: 2 };
  assert.ok(S.craft(g, 'scoop').ok);
  assert.ok(g.ship.upgrades.includes('scoop'));
  const beforeNav = S.travelPlan(g, 'sol').fuelKg;
  g.rocky.materials = { minerals: 0, volatiles: 2, gas: 0, silicates: 2 };
  assert.ok(S.craft(g, 'nav-link').ok);
  assert.ok(g.ship.upgrades.includes('eridian-nav'));
  assert.ok(S.travelPlan(g, 'sol').fuelKg < beforeNav, 'nav link cuts jump fuel');
  assert.equal(g.rocky.says.text, 'Fist my bump. Is done.');
});

test('the xenonite-lab recipe removes the escape risk', () => {
  const g = createGame(1);
  g.lab.strains = [{ id: 'x', nTolerance: 0.9, population: 500, generation: 3 }];
  assert.ok(S.breedStep(g, { nitrogenPct: 50 }).ok);
  assert.ok(g.lab.strains.length, 'the culture survives this generation');
  assert.ok(g.lab.escapeRisk > 0, 'risky without the lab');
  assert.ok(S.craft(g, 'xenonite-lab').ok);
  assert.equal(g.lab.escapeRisk, 0);
  for (let k = 0; k < 20; k++) S.breedStep(g, { nitrogenPct: 50 });
  assert.equal(g.lab.escapeRisk, 0);
  assert.equal(g.ship.hull, 1);
});

test('the scoop multiplies the harvest yield by 1.6', () => {
  const g = createGame(1);
  orbit(g, 'tauceti-3'); g.ship.fuelKg = 5000;
  const base = S.harvestRate(star(g, 'tauceti'));
  assert.ok(Math.abs(S.harvestPlan(g, 'collector').kgPerDay - base) < 1);
  g.rocky.materials = { minerals: 2, volatiles: 0, gas: 3, silicates: 0 };
  assert.ok(S.craft(g, 'scoop').ok);
  assert.ok(g.ship.upgrades.includes('scoop'));
  const want = S.harvestRate(star(g, 'tauceti')) * 1.6;
  const got = S.harvestPlan(g, 'collector').kgPerDay;
  assert.ok(Math.abs(got - want) < 1, `${got} vs ${want}`);
});

// ---- scan sweep, tether sampling, harvesting ----
const AD = 'tauceti-3';
test('scan sweep: needs orbit, costs once, 60% is a full scan, map fills in', async () => {
  const g = createGame(1);
  assert.equal(S.scanBegin(g, AD).ok, false);                       // not in orbit
  orbit(g, AD);
  const f0 = g.ship.fuelKg, r = S.scanBegin(g, AD);
  assert.ok(r.ok && r.cost.fuelKg === S.SCAN.fuelKg && g.ship.fuelKg === f0 - S.SCAN.fuelKg);
  S.scanBegin(g, AD); assert.equal(g.ship.fuelKg, f0 - S.SCAN.fuelKg);   // restarting an active sweep is free
  const p = star(g, 'tauceti').planets[2];
  assert.equal(p.scanLevel, 0);
  let m = S.scanMap(g, AD);
  assert.equal(m.cols, 0); assert.equal(m.hotspots.filter((h) => h.revealed).length, 0);
  assert.ok(!S.scanProgress(g, AD, 0.3).crossed);
  m = S.scanMap(g, AD); assert.ok(m.cols > 15 && m.cols < 28);
  const c = S.scanProgress(g, AD, 0.31);
  assert.ok(c.crossed && p.scanLevel === 2 && p.scanned);
  m = S.scanMap(g, AD);
  assert.ok(m.full && m.hotspots.some((h) => h.revealed), 'a hotspot is inside the first 60%');
  assert.ok(m.band && m.band.hi > m.band.lo);
  for (const L of S.SCAN.LAYERS) assert.equal(m.layers[L].length, m.w * m.h);
  assert.ok(m.layers.life.some((v) => v > 0.6));
  assert.deepEqual(S.scanMap(g, AD).layers, m.layers);                    // deterministic
  S.scanProgress(g, AD, 1);
  assert.equal(S.scanMap(g, AD).coverage, 1); assert.equal(S.scanBegin(g, AD).ok, false);
  // a dead world has no life signs and nothing to sample
  orbit(g, 'tauceti-2'); S.scanBegin(g, 'tauceti-2'); S.scanProgress(g, 'tauceti-2', 1);
  const d = S.scanMap(g, 'tauceti-2');
  assert.ok(d.hotspots.length === 0 && Math.max(...d.layers.life) === 0);
  assert.equal(S.beginSample(g, 'tauceti-2', 'h1').ok, false);
});

test('tether sampling: gates, success, snap, burn, determinism', () => {
  const setup = () => {
    const g = createGame(1); orbit(g, AD);
    assert.equal(S.beginSample(g, AD, 'h1').ok, false);                 // not swept yet
    S.scanBegin(g, AD); S.scanProgress(g, AD, 0.5);
    assert.equal(S.beginSample(g, AD, 'h1').ok, false);                 // below 60%
    S.scanProgress(g, AD, 0.5);
    const h = S.scanMap(g, AD).hotspots.find((q) => q.revealed);
    assert.ok(S.beginSample(g, AD, h.id).ok);
    return g;
  };
  // success with the scripted controller; costs and a wild strain
  let g = setup();
  const t0 = g.time.shipYears, s0 = g.ship.samples;
  let last;
  for (let i = 0; i < 2000 && (!last || last.status === 'active'); i++) {
    const s = g.sampling, c = S.bandAt(s, s.t + 1 / 30);
    last = S.sampleStep(g, { depthDelta: Math.max(-0.3 / 30, Math.min(S.PROBE.lowerSpeed / 30, c - s.depth)), dt: 1 / 30 });
    assert.ok(last.tension < 1 && last.heat < 1);
  }
  assert.equal(last.status, 'success'); assert.equal(g.ship.samples, s0 + 1); assert.equal(g.lab.strains.length, 1);
  assert.ok(g.time.shipYears > t0 && g.stars[1].planets[2].sampled);
  assert.ok(last.t > S.PROBE.holdSec * 0.9 && last.t < 25, 'takes a few seconds: ' + last.t);
  // snap: drop straight to the bottom
  g = setup(); const hull = g.ship.hull; let r;
  for (let i = 0; i < 400; i++) { r = S.sampleStep(g, { depthDelta: 0.06, dt: 1 / 30 }); if (r.status !== 'active') break; }
  assert.ok(['snapped', 'burned'].includes(r.status));
  assert.ok(g.ship.hull < hull && g.ship.chainLost === 1);
  assert.equal(S.sampleStep(g, { depthDelta: 0.1, dt: 0.1 }).status, r.status);   // finished sessions stay finished
  assert.equal(g.ship.samples, 0);
  // heat kills below the band; hovering above the band never does
  g = setup(); let b = null;
  for (let i = 0; i < 400; i++) { const s = g.sampling, c = S.bandAt(s, s.t); b = S.sampleStep(g, { depthDelta: Math.max(0, Math.min(0.1 / 30, c + 0.2 - s.depth)), dt: 1 / 30 }); if (b.status !== 'active') break; }
  assert.equal(b.status, 'burned');
  g = setup();
  for (let i = 0; i < 600; i++) { const s = g.sampling; b = S.sampleStep(g, { depthDelta: Math.max(-0.3 / 30, Math.min(0.16 / 30, 0.2 - s.depth)), dt: 1 / 30 }); }
  assert.equal(b.status, 'active'); assert.equal(b.progress, 0);
  // retry works and survives a save round trip
  g = setup(); S.sampleStep(g, { depthDelta: 0.3, dt: 0.1 });
  const h2 = S.deserialize(S.serialize(g));
  assert.deepEqual(h2.sampling, g.sampling);
  // deterministic
  const a1 = setup(), a2 = setup();
  for (let i = 0; i < 90; i++) { S.sampleStep(a1, { depthDelta: 0.004, dt: 1 / 30 }); S.sampleStep(a2, { depthDelta: 0.004, dt: 1 / 30 }); }
  assert.deepEqual(a1.sampling, a2.sampling);
  // the helper path
  const h3 = createGame(1); orbit(h3, AD);
  assert.ok(S.autoSample(h3, AD).ok && h3.ship.samples === 1 && h3.sampling === null);
});

test('harvesting: collector at the Petrova planet, skim, yields scale with infection', () => {
  const g = createGame(1);
  assert.equal(S.petrovaTarget(star(g, 'tauceti').planets).id, AD);
  assert.equal(S.harvestPlan(g, 'collector').ok, false);                 // not in orbit of it
  orbit(g, AD); g.ship.fuelKg = 5000;
  const p1 = S.harvestPlan(g, 'collector');
  assert.ok(p1.ok && p1.days >= 7 && p1.days <= 28 && p1.kg > 3000);
  const t0 = g.time.worldYears, r = S.harvest(g, 'collector');
  assert.ok(r.ok && g.ship.fuelKg === 5000 - p1.fuelKg + r.gained && Math.abs((g.time.worldYears - t0) * 365.25 - p1.days) < 1e-6);
  // scales with infection: a heavily infected star pays about a full tank per several weeks
  const lo = S.harvestRate({ infection: 0.05 }), mid = S.harvestRate({ infection: 0.15 }), hi = S.harvestRate({ infection: 0.3 });
  assert.ok(lo < mid && mid < hi);
  const weeks = (g.ship.fuelMaxKg / hi) / 7; assert.ok(weeks > 2 && weeks < 6, 'weeks per tank at 30%: ' + weeks);
  // tanks cap and refusal
  g.ship.fuelKg = g.ship.fuelMaxKg - 500;
  const r2 = S.harvest(g, 'collector'); assert.ok(r2.ok && r2.gained <= 500 + 40 && g.ship.fuelKg <= g.ship.fuelMaxKg);
  g.ship.fuelKg = g.ship.fuelMaxKg; assert.equal(S.harvestPlan(g, 'collector').ok, false);
  // skim: faster per day, costs hull, refused on a weak hull
  g.ship.fuelKg = 5000;
  const sk = S.harvestPlan(g, 'skim');
  assert.ok(sk.ok && sk.days < p1.days && sk.kgPerDay > p1.kgPerDay && sk.hullCost > 0);
  const hull = g.ship.hull; assert.ok(S.harvest(g, 'skim').ok && g.ship.hull < hull);
  g.ship.hull = 0.4; assert.equal(S.harvestPlan(g, 'skim').ok, false);
  // a barely infected star yields almost nothing
  const h = createGame(1); star(h, 'tauceti').infection = 0.002; orbit(h, AD);
  assert.equal(S.harvestPlan(h, 'collector').ok, false);
  // Sol is a fuel mine as it worsens: Venus (first desert world with air) is its Petrova planet
  g.ship.hull = 1; star(g, 'sol').infection = 0.1; g.ship.fuelKg = 40000; S.travel(g, 'sol');
  assert.ok(S.harvestPlan(g, 'skim').ok);
});

test('petrovaTarget matches the renderer', async () => {
  const R = await import('../src/render/index.js');
  const g = createGame(3);
  for (const s of g.stars) assert.equal(S.petrovaTarget(s.planets)?.id, R.petrovaTarget(s.planets)?.id, s.id);
});

test('harvest keeps the tuned win path winnable', () => {
  const g = createGame(1);
  winSetup(g); breedUp(g);
  // spend fuel down, then refuel by harvesting at Tau Ceti and still win
  g.ship.fuelKg = 3000;
  for (let i = 0; i < 6; i++) S.harvest(g, 'collector');
  assert.ok(g.ship.fuelKg > 15000);
  assert.ok(S.travel(g, 'eri40').ok);
  orbit(g, 'eri40-2'); assert.ok(S.deliver(g).ok);
  assert.ok(S.travel(g, 'sol').ok); orbit(g, 'sol-3'); assert.ok(S.deliver(g).ok);
  assert.equal(g.status, 'playing'); assert.equal(g.campaign.act, 2);
});
