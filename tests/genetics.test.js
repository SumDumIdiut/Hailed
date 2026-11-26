import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/sim/index.js';
import { BIOSPHERE, MAX_STRAINS, biosphereProfile, newStrain, breed, coverage, canSave, nameStrain } from '../src/sim/genetics.js';
import { BEETLE_COST, launchBeetle, beetleTick } from '../src/sim/beetles.js';
import { findStar, starDistance } from '../src/sim/stars.js';

const star = (g, id) => g.stars.find((s) => s.id === id);

// A strain with the given nitrogen level and otherwise-tolerant traits.
function mkStrainGame(g, nitrogen) {
  const st = newStrain(g);
  st.traits.nitrogen = nitrogen;
  st.traits.co2 = 0.9; st.traits.cold = 0.9; st.traits.heat = 0.9; st.traits.radiation = 0.9; st.traits.vigor = 0.5;
  g.genetics.strains = [st]; g.genetics.best = st.id; g.genetics.nextId = 2;
  return st;
}

test('biosphere profiles are deterministic and in range', () => {
  const g = createGame(1);
  const sol = star(g, 'sol');
  assert.deepEqual(biosphereProfile(sol), biosphereProfile(sol));
  const eri = star(g, 'eri40');
  assert.deepEqual(biosphereProfile(eri), biosphereProfile(eri));
  for (const t of BIOSPHERE) {
    assert.ok(biosphereProfile(sol)[t] >= 0 && biosphereProfile(sol)[t] <= 0.95, `${t} out of range: ${biosphereProfile(sol)[t]}`);
    assert.ok(biosphereProfile(eri)[t] >= 0 && biosphereProfile(eri)[t] <= 0.95, `${t} out of range: ${biosphereProfile(eri)[t]}`);
  }
  // M dwarfs sit in a radiation bath
  const m = g.stars.find((s) => s.spectral[0] === 'M');
  assert.ok(biosphereProfile(m).radiation > 0.5);
  // ice-heavy systems push the cold trait
  const icy = g.stars.find((s) => s.planets.some((p) => p.type === 'ice'));
  assert.ok(icy && biosphereProfile(icy).cold > 0.5);
});

test('biosphere nitrogen rules: Erid needs ammonia-rich air, Sol needs nitrogen', () => {
  const g = createGame(1);
  assert.ok(biosphereProfile(star(g, 'eri40')).nitrogen >= 0.6);
  assert.ok(biosphereProfile(star(g, 'sol')).nitrogen >= 0.5);
  // Venus-like atmosphere pushes co2 and heat
  const venus = star(g, 'sol').planets.find((p) => p.name === 'Venus');
  const venusSys = { id: 'sol', spectral: 'G2V', planets: [venus] };
  const vp = biosphereProfile(venusSys);
  assert.ok(vp.co2 > 0.5 && vp.heat > 0.5);
});

test('breeding pushes the focus trait up, pays ship time, and guards the escape risk', () => {
  const g = createGame(1);
  const st = newStrain(g);
  const ship0 = g.time.shipYears;
  const b = breed(g, { focus: 'nitrogen', pressure: 0.5 });
  assert.ok(b.ok);
  assert.ok(b.strain.traits.nitrogen > st.traits.nitrogen, `${b.strain.traits.nitrogen} vs ${st.traits.nitrogen}`);
  assert.equal(b.strain.gen, st.gen + 1);
  assert.ok(g.time.shipYears > ship0, 'a generation costs ship time');
  assert.ok(g.lab.escapeRisk > 0, 'escape risk without the xenonite lab');
  assert.ok(b.strain.traits.vigor < st.traits.vigor, 'high pressure drops generation speed');
  // with the xenonite lab there is no escape risk
  const h = createGame(1);
  h.ship.upgrades.push('xenonite-lab');
  const st2 = newStrain(h);
  const b2 = breed(h, { focus: 'co2', pressure: 0.2 });
  assert.ok(b2.ok);
  assert.equal(h.lab.escapeRisk, 0);
});

test('repeated breeding from the selected strain advances the generation', () => {
  const g = createGame(1);
  g.ship.upgrades.push('xenonite-lab');          // no escape risk ends the run early
  const first = newStrain(g);
  g.genetics.best = first.id;                    // the UI marks its selection this way
  let parentId = first.id;
  for (let n = 1; n <= 5; n++) {
    const b = breed(g, { focus: 'nitrogen', pressure: 0.2 });
    assert.equal(b.ok, true, b.text);
    assert.equal(b.parent.id, parentId, 'breeds from the strain on screen');
    assert.equal(b.strain.gen, n, 'generation N+1, never generation 1 again');
    parentId = b.strain.id;
    g.genetics.best = parentId;                  // the UI selects the child next
  }
  // An explicit strainId wins over genetics.best (the bot uses this while working a target).
  const other = newStrain(g);
  g.genetics.best = other.id;
  const b = breed(g, { focus: 'co2', pressure: 0.2, strainId: first.id });
  assert.equal(b.parent.id, first.id);
  assert.equal(b.strain.gen, first.gen + 1);
});

test('coverage and canSave: a strain covers a profile or it does not', () => {
  const g = createGame(1);
  const eri = star(g, 'eri40');
  const full = { nitrogen: 0.9, co2: 0.9, cold: 0.9, heat: 0.9, radiation: 0.9, vigor: 0.9 };
  const fitting = { nitrogen: 0.7, co2: 0.9, cold: 0.9, heat: 0.9, radiation: 0.9, vigor: 0.9 };
  const e = biosphereProfile(eri);
  assert.equal(coverage({ traits: fitting }, e), 1);
  assert.equal(canSave({ traits: fitting }, e), true);
  assert.equal(canSave({ traits: full }, e), true);
  const weak = { ...full, nitrogen: 0.2 };
  assert.ok(coverage({ traits: weak }, e) < 1);
  assert.equal(canSave({ traits: weak }, e), false);
  // Sol wants less nitrogen than Erid but still needs a real atmosphere
  assert.equal(canSave({ traits: full }, biosphereProfile(star(g, 'sol'))), true);
  assert.equal(canSave({ traits: { ...full, nitrogen: 0.4 } }, biosphereProfile(star(g, 'sol'))), false);
});

test('strains are capped at eight', () => {
  const g = createGame(1);
  for (let i = 0; i < MAX_STRAINS + 3; i++) newStrain(g);
  assert.equal(g.genetics.strains.length, MAX_STRAINS);
  const b = breed(g, { focus: 'nitrogen', pressure: 0.1 });
  assert.ok(b.ok);
  assert.equal(g.genetics.strains.length, MAX_STRAINS);
});

test('strain naming trims to 24 characters', () => {
  const g = createGame(1);
  const st = newStrain(g);
  const named = nameStrain(g, st.id, '  The Quiet Storm  ');
  assert.equal(named.name, 'The Quiet Storm');
  assert.equal(nameStrain(g, 'g9999', 'nope'), null);
});

test('beetle launch: costs fuel and xenonite parts, computes the flight', () => {
  const g = createGame(1);
  const st = mkStrainGame(g, 0.7);
  g.rocky.materials = { minerals: 2, volatiles: 1, gas: 0, silicates: 1 };
  g.ship.fuelKg = BEETLE_COST.fuelKg - 1;
  assert.equal(launchBeetle(g, st.id, 'eri40').ok, false);
  g.ship.fuelKg = BEETLE_COST.fuelKg;
  g.rocky.materials.minerals = 1;                       // xenonite parts short
  assert.equal(launchBeetle(g, st.id, 'eri40').ok, false);
  g.rocky.materials.minerals = 2;
  const r = launchBeetle(g, st.id, 'eri40');
  assert.ok(r.ok);
  assert.equal(g.ship.fuelKg, 0);
  assert.equal(g.rocky.materials.minerals, 0);
  assert.equal(g.rocky.materials.silicates, 0);
  assert.equal(g.beetles.length, 1);
  assert.equal(g.beetles[0].status, 'flying');
  const from = findStar(g, g.ship.starId), to = findStar(g, 'eri40');
  assert.ok(Math.abs(r.travelYears - starDistance(from, to) / 0.9) < 1e-9);
  assert.ok(r.beetle.arriveWorldYears > r.beetle.departWorldYears);
});

test('beetle arrival saves the star when the strain covers the biosphere', () => {
  const g = createGame(1);
  const st = mkStrainGame(g, 0.7);
  const sol = star(g, 'sol');
  const infBefore = sol.infection;
  assert.ok(launchBeetle(g, st.id, 'sol').ok);
  g.time.worldYears = g.beetles[0].arriveWorldYears;
  const arrivals = beetleTick(g);
  assert.equal(arrivals.length, 1);
  assert.equal(arrivals[0].ok, true);
  assert.equal(sol.saved, true);
  assert.ok(sol.infection < infBefore);
  assert.ok(g.log.some((l) => /delivered/.test(l.text)));
});

test('beetle arrival fails and names the trait that fell short', () => {
  const g = createGame(1);
  const st = mkStrainGame(g, 0.05);                    // Erid needs nitrogen >= 0.6
  assert.ok(launchBeetle(g, st.id, 'eri40').ok);
  g.time.worldYears = g.beetles[0].arriveWorldYears;
  const arrivals = beetleTick(g);
  assert.equal(arrivals.length, 1);
  assert.equal(arrivals[0].ok, false);
  assert.equal(arrivals[0].short, 'nitrogen');
  assert.ok(/nitrogen/.test(g.log[g.log.length - 1].text));
});

test('breeding is deterministic for a given seed', () => {
  const a = createGame(1);
  const b = createGame(1);
  const sa = newStrain(a), sb = newStrain(b);
  assert.deepEqual(sa.traits, sb.traits);
  const ra = breed(a, { focus: 'nitrogen', pressure: 0.5 });
  const rb = breed(b, { focus: 'nitrogen', pressure: 0.5 });
  assert.deepEqual(ra.strain.traits, rb.strain.traits);
  assert.equal(ra.strain.id, rb.strain.id);
});
