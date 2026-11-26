// Contract for src/sim/economy.js (written by the local model from this test + tools/specs/economy.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMarket, price, trade, driftMarket, cargoMass, cargoSpace } from '../src/sim/economy.js';
import { createRng } from '../src/sim/rng.js';

const RES = [
  { id: 'iron', value: 10, mass: 1 },
  { id: 'helium3', value: 60, mass: 0.2 },
  { id: 'xenonite', value: 200, mass: 0.5 },
];
const byId = Object.fromEntries(RES.map((r) => [r.id, r]));

test('markets are deterministic per seed and cover every resource', () => {
  const a = createMarket(42, RES), b = createMarket(42, RES), c = createMarket(43, RES);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
  for (const r of RES) {
    assert.ok(Number.isInteger(a.stock[r.id]) && a.stock[r.id] >= 0);
    assert.ok(a.demand[r.id] >= 0.5 && a.demand[r.id] <= 1.8);
  }
  assert.equal(JSON.parse(JSON.stringify(a)).stock.iron, a.stock.iron);   // plain JSON
});

test('buy price is above sell price and scales with demand', () => {
  const m = createMarket(1, RES);
  for (const r of RES) {
    const buy = price(m, r, 'buy'), sell = price(m, r, 'sell');
    assert.ok(Number.isInteger(buy) && Number.isInteger(sell));
    assert.ok(buy > sell, `${r.id} buy ${buy} > sell ${sell}`);
    assert.ok(sell >= 1);
  }
  const hi = { ...m, demand: { ...m.demand, iron: 1.6 } }, lo = { ...m, demand: { ...m.demand, iron: 0.6 } };
  assert.ok(price(hi, byId.iron, 'sell') > price(lo, byId.iron, 'sell'));
});

test('buying spends credits, fills cargo, empties stock', () => {
  const m = createMarket(7, RES); m.stock.iron = 20;
  const ship = { credits: 1000, cargo: {}, cargoCap: 50 };
  const each = price(m, byId.iron, 'buy');
  const r = trade(ship, m, byId.iron, 5, 'buy');
  assert.equal(r.ok, true, r.why);
  assert.equal(ship.cargo.iron, 5);
  assert.equal(m.stock.iron, 15);
  assert.equal(ship.credits, 1000 - r.total);
  assert.ok(r.total >= each * 5);   // price can rise as you buy
});

test('trade refusals explain why and change nothing', () => {
  const m = createMarket(7, RES); m.stock.xenonite = 1;
  const poor = { credits: 5, cargo: {}, cargoCap: 50 };
  const r1 = trade(poor, m, byId.xenonite, 1, 'buy');
  assert.equal(r1.ok, false); assert.match(r1.why, /credit/i); assert.equal(poor.credits, 5);
  const rich = { credits: 1e6, cargo: {}, cargoCap: 50 };
  const r2 = trade(rich, m, byId.xenonite, 3, 'buy');
  assert.equal(r2.ok, false); assert.match(r2.why, /stock/i);
  const full = { credits: 1e6, cargo: { iron: 50 }, cargoCap: 50 };
  const r3 = trade(full, createMarket(7, RES), byId.iron, 1, 'buy');
  assert.equal(r3.ok, false); assert.match(r3.why, /cargo/i);
  const empty = { credits: 0, cargo: {}, cargoCap: 50 };
  const r4 = trade(empty, m, byId.iron, 1, 'sell');
  assert.equal(r4.ok, false); assert.match(r4.why, /have/i);
});

test('selling pays credits, removes cargo, adds stock and lowers demand', () => {
  const m = createMarket(9, RES);
  const before = m.demand.helium3, stock0 = m.stock.helium3;
  const ship = { credits: 0, cargo: { helium3: 10 }, cargoCap: 50 };
  const r = trade(ship, m, byId.helium3, 10, 'sell');
  assert.equal(r.ok, true, r.why);
  assert.equal(ship.cargo.helium3 || 0, 0);
  assert.equal(ship.credits, r.total);
  assert.ok(r.total > 0);
  assert.equal(m.stock.helium3, stock0 + 10);
  assert.ok(m.demand.helium3 < before);
  assert.ok(!('helium3' in ship.cargo) || ship.cargo.helium3 === 0);
});

test('drift pulls demand back toward 1 and restocks over time', () => {
  const m = createMarket(3, RES);
  m.demand.iron = 0.5; m.stock.iron = 0;
  driftMarket(m, 2, createRng(5));
  assert.ok(m.demand.iron > 0.5 && m.demand.iron <= 1.8);
  assert.ok(m.stock.iron > 0);
  const m2 = createMarket(3, RES); m2.demand.iron = 0.5; m2.stock.iron = 0;
  driftMarket(m2, 2, createRng(5));
  assert.deepEqual(m, m2);   // deterministic for the same rng seed
});

test('cargo mass and free space use resource masses', () => {
  const cargo = { iron: 10, helium3: 10 };
  assert.equal(cargoMass(cargo, byId), 12);
  assert.equal(cargoSpace({ cargo, cargoCap: 50 }, byId), 38);
  assert.equal(cargoMass({}, byId), 0);
});
