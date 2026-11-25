import test from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../src/sim/index.js';
import * as T from '../src/sim/tech.js';
import core from '../content/tech-core.js';

const defs = core;
const byId = (id) => defs.techs.find((t) => t.id === id);
const BRANCHES = ['drive', 'lab', 'xenonite', 'survey', 'probes'];
const newGame = () => {
  const g = S.createGame(2);
  g.research = 500;
  g.rocky.materials = { minerals: 50, volatiles: 50, gas: 50, silicates: 50 };
  return g;
};

test('tree structure: unique ids, branches, tiers 1-5 per branch', () => {
  assert.equal(defs.id, 'core-tech');
  const ids = new Set();
  for (const t of defs.techs) {
    assert.ok(t.id, 'missing id');
    assert.ok(!ids.has(t.id), `duplicate id ${t.id}`);
    ids.add(t.id);
    assert.ok(t.name && t.desc, `${t.id} has no name/desc`);
    assert.ok(BRANCHES.includes(t.branch), `${t.id} bad branch ${t.branch}`);
    assert.ok(Number.isInteger(t.tier) && t.tier >= 1 && t.tier <= 5, `${t.id} bad tier ${t.tier}`);
    assert.ok(t.cost && Number.isFinite(t.cost.research), `${t.id} bad cost`);
  }
  for (const b of BRANCHES) for (const tier of [1, 2, 3, 4, 5]) {
    assert.ok(defs.techs.some((t) => t.branch === b && t.tier === tier), `${b} has no tier ${tier}`);
  }
});

test('requires exist and there are no cycles', () => {
  for (const t of defs.techs) for (const r of t.requires ?? []) assert.ok(byId(r), `${t.id} requires missing ${r}`);
  const left = new Set(defs.techs.map((t) => t.id));
  let progress = true;
  while (progress && left.size > 0) {
    progress = false;
    for (const id of [...left]) {
      const t = byId(id);
      if ((t.requires ?? []).every((r) => !left.has(r))) { left.delete(id); progress = true; }
    }
  }
  assert.equal(left.size, 0, 'cycle detected in the tech tree');
});

test('canBuy: unknown, already owned, unmet requires, research, materials', () => {
  const g = newGame();
  const unk = T.canBuy(g, defs, 'nope');
  assert.equal(unk.ok, false);
  assert.match(unk.why, /unknown/i);
  assert.equal(T.canBuy(g, defs, 'drive-1').ok, true);
  T.buy(g, defs, 'drive-1');
  assert.equal(T.canBuy(g, defs, 'drive-1').ok, false, 'owned tech is not buyable');
  // requirements gate
  const k = newGame();
  const dependent = defs.techs.find((t) => (t.requires ?? []).length > 0);
  assert.equal(T.canBuy(k, defs, dependent.id).ok, false);
  assert.match(T.canBuy(k, defs, dependent.id).why, /needs/i);
  // research gate
  const h = S.createGame(2); h.research = byId('drive-1').cost.research - 1;
  assert.equal(T.canBuy(h, defs, 'drive-1').ok, false);
  assert.match(T.canBuy(h, defs, 'drive-1').why, /research/i);
  // materials gate: a tech whose materials run out
  const m = newGame();
  m.rocky.materials = { minerals: 0, volatiles: 0, gas: 0, silicates: 0 };
  const matsTech = defs.techs.find((t) => Object.keys(t.cost.materials ?? {}).length && !(t.requires ?? []).length);
  assert.equal(T.canBuy(m, defs, matsTech.id).ok, false);
  assert.match(T.canBuy(m, defs, matsTech.id).why, /materials/i);
});

test('buy: research and materials spent, pushed to state.tech.owned, logged', () => {
  const g = newGame();
  const x = byId('xeno-1');
  assert.equal(g.rocky.materials.minerals, 50);
  assert.equal(g.rocky.materials.volatiles, 50);
  const r = T.buy(g, defs, 'xeno-1');
  assert.equal(r.ok, true, r.why);
  assert.equal(g.research, 500 - x.cost.research, 'research spent');
  assert.equal(g.rocky.materials.minerals, 50 - x.cost.materials.minerals, 'minerals spent');
  assert.equal(g.rocky.materials.volatiles, 50 - x.cost.materials.volatiles, 'volatiles spent');
  assert.ok(Array.isArray(g.tech.owned));
  assert.ok(g.tech.owned.includes('xeno-1'));
  assert.ok(g.log.some((l) => /research unlocked/i.test(l.text)));
  // buying again: refused, nothing spent
  assert.equal(T.buy(g, defs, 'xeno-1').ok, false);
  assert.equal(g.rocky.materials.minerals, 50 - x.cost.materials.minerals);
});

test('buy works before the game has tech fields (research gate active)', () => {
  const g = S.createGame(3);
  assert.equal(T.buy(g, defs, 'drive-1').ok, false, 'no research yet');
  g.research = 50;
  assert.equal(T.buy(g, defs, 'drive-1').ok, true);
  assert.equal(g.research, 50 - byId('drive-1').cost.research);
  assert.ok(Array.isArray(g.tech.owned));
  assert.ok(g.tech.owned.includes('drive-1'));
});

test('available lists buyable ids', () => {
  const g = newGame();
  const a = T.available(g, defs);
  assert.ok(a.includes('drive-1'));
  assert.ok(a.includes('xeno-1'));
  T.buy(g, defs, 'drive-1');
  assert.ok(!T.available(g, defs).includes('drive-1'), 'owned tech is not available');
  assert.ok(T.available(g, defs).includes('drive-2'), 'successor becomes available');
  assert.ok(T.available(g, defs).includes('drive-alt-1'), 'the alternate peer is available');
});

test('modifiers fold owned effects: muls default 1, adds default 0', () => {
  const g = newGame();
  const m0 = T.modifiers(g, defs);
  assert.equal(m0.muls.fuelMul, 1);
  assert.equal(m0.muls.jumpFuelMul, 1);
  assert.equal(m0.muls.harvestMul, 1);
  assert.equal(m0.muls.scanSpeedMul, 1);
  assert.equal(m0.muls.breedPressureMax, 1);
  assert.equal(m0.muls.escapeRiskMul, 1);
  assert.equal(m0.muls.beetleSpeedMul, 1);
  assert.equal(m0.muls.beetleCostMul, 1);
  assert.equal(m0.muls.hullMax, 1);
  assert.deepEqual(m0.adds, { relayRadiusAdd: 0 });
  assert.deepEqual(m0.unlocks, []);
  // fold: drive-1, drive-2 and xeno-1
  T.buy(g, defs, 'drive-1');
  T.buy(g, defs, 'drive-2');
  T.buy(g, defs, 'xeno-1');
  const m = T.modifiers(g, defs);
  assert.ok(Math.abs(m.muls.jumpFuelMul - (byId('drive-1').effects.jumpFuelMul * byId('drive-2').effects.jumpFuelMul)) < 1e-12);
  assert.ok(Math.abs(m.muls.fuelMul - (byId('drive-1').effects.fuelMul * byId('xeno-1').effects.fuelMul)) < 1e-12);
  assert.ok(Math.abs(m.muls.fuelMul - 1.575) < 1e-9, `fuelMul folds to 1.05 x 1.5, got ${m.muls.fuelMul}`);
  assert.ok(m.muls.jumpFuelMul < 0.93, `jump cost shrinks, got ${m.muls.jumpFuelMul}`);
});

test('modifiers collect unlocks and adds', () => {
  const g = newGame();
  for (const id of ['surv-1', 'surv-2', 'surv-3', 'surv-4']) T.buy(g, defs, id);
  const m = T.modifiers(g, defs);
  assert.ok(m.unlocks.includes('biosphere-hints'));
  assert.ok(!m.unlocks.includes('map-fill'));
  assert.equal(m.adds.relayRadiusAdd, 0, 'no relay tech owned yet');
  // add key: buy the probes chain (light-bee unlocks in probes-1)
  for (const id of ['probes-1', 'probes-2', 'probes-3', 'probes-4']) assert.ok(T.buy(g, defs, id).ok, id);
  const p = T.modifiers(g, defs);
  assert.ok(p.adds.relayRadiusAdd > 0, `relayRadiusAdd folds up, got ${p.adds.relayRadiusAdd}`);
  assert.ok(p.unlocks.includes('light-bee'));
});
