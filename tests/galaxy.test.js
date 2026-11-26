import test from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../src/sim/galaxy.js';
import { createGame } from '../src/sim/index.js';
import { createStars, starDistance } from '../src/sim/stars.js';

test('extendGalaxy: determinism, count, ids, spacing, radius', () => {
  const base = createStars(5);
  const a = G.extendGalaxy(base, 5);
  const b = G.extendGalaxy(createStars(5), 5);
  assert.equal(a.length, 48);
  assert.deepEqual(a, b);
  assert.notDeepEqual(G.extendGalaxy(createStars(5), 5), G.extendGalaxy(createStars(5), 6));
  // new ids
  for (const s of a) assert.match(s.id, /^g-\d+$/);
  // radiusLy
  for (const s of a) {
    const d = Math.hypot(s.pos[0], s.pos[1], s.pos[2]);
    assert.ok(d <= 25.001, String(d));
  }
  // spacing from original stars
  for (const s of a) for (const o of base) {
    assert.ok(starDistance(s, o) >= 1.2 - 1e-9, `${s.id} too close to ${o.id}`);
  }
  // does not mutate input
  assert.equal(base.length, 12);
});

test('extendGalaxy: star shape, planets, spectral weighting', () => {
  const base = createStars(1);
  const extra = G.extendGalaxy(base, 1);
  const all = [...base, ...extra];
  const mCount = extra.filter((s) => s.spectral[0] === 'M').length;
  assert.ok(mCount > 20, 'M dwarfs dominate: ' + mCount);
  for (const s of extra) {
    assert.ok(['A','F','G','K','M'].includes(s.spectral[0]));
    assert.ok(s.lum0 > 0 && s.radius > 0 && s.mass > 0);
    assert.ok(Array.isArray(s.pos) && s.pos.length === 3);
    assert.ok(Array.isArray(s.planets) && s.planets.length >= 1);
    const ids = new Set(s.planets.map((p) => p.id));
    assert.equal(ids.size, s.planets.length);
    for (const p of s.planets) {
      assert.ok(p.id.startsWith(s.id + '-'));
      assert.ok(['rocky','ocean','ice','lava','gas','desert'].includes(p.type));
    }
  }
});

test('extendGalaxy: frontier band and id prefix, genPois id prefix', () => {
  const base = createStars(1);
  const opts = { count: 16, radiusLy: 35, innerRadiusLy: 29, idPrefix: 'g2' };
  const shell = G.extendGalaxy(base, 99, opts);
  assert.deepEqual(shell, G.extendGalaxy(base, 99, opts));
  assert.equal(shell.length, 16);
  for (const s of shell) {
    const d = Math.hypot(s.pos[0], s.pos[1], s.pos[2]);
    assert.ok(d > 28.99 && d < 35.01, `${s.id} at ${d}`);
    assert.match(s.id, /^g2-\d+$/);
  }
  const pois = G.genPois(shell, 99, { count: 4, buoys: 1, idPrefix: 'poi-c2', startIndex: 25 });
  assert.deepEqual(pois.map((p) => p.id), ['poi-c2-25', 'poi-c2-26', 'poi-c2-27', 'poi-c2-28']);
  assert.deepEqual(G.genPois(shell, 99, { count: 4, buoys: 1, idPrefix: 'poi-c2', startIndex: 25 }), pois);
});

test('buildLanes: graph properties', () => {
  const base = createStars(1);
  const extra = G.extendGalaxy(base, 1);
  const all = [...base, ...extra];
  const lanes = G.buildLanes(all, 1);
  assert.ok(Array.isArray(lanes) && lanes.length > 0);
  const deg = new Map(all.map((s) => [s.id, 0]));
  const edgeSet = new Set();
  for (const l of lanes) {
    assert.equal(typeof l.a, 'string');
    assert.equal(typeof l.b, 'string');
    assert.notEqual(l.a, l.b);
    const key = [l.a, l.b].sort().join('|');
    assert.ok(!edgeSet.has(key), 'duplicate edge');
    edgeSet.add(key);
    deg.set(l.a, (deg.get(l.a) || 0) + 1);
    deg.set(l.b, (deg.get(l.b) || 0) + 1);
    const sa = all.find((s) => s.id === l.a);
    const sb = all.find((s) => s.id === l.b);
    assert.ok(starDistance(sa, sb) <= 9.001);
  }
  for (const s of all) assert.ok((deg.get(s.id) || 0) >= 1, s.id + ' has no lane');
});

test('initKnowledge, revealAround, buildRelay', () => {
  const g = createGame(1);
  g.stars = [...createStars(1), ...G.extendGalaxy(createStars(1), 1)];
  const gal = G.initKnowledge(g);
  assert.ok(gal.lanes.length > 0);
  assert.deepEqual(gal.surveyed, {});
  assert.deepEqual(gal.relays, []);
  const tauceti = g.stars.find((s) => s.id === 'tauceti');
  for (const s of g.stars) {
    if (s.id === 'sol' || s.id === 'tauceti' || s.id === 'eri40') assert.equal(gal.known[s.id], true);
    else if (starDistance(s, tauceti) <= 6) assert.equal(gal.known[s.id], true);
  }
  // revealAround
  const before = Object.keys(g.galaxy.known).length;
  G.revealAround(g, 'tauceti', 6);
  assert.ok(Object.keys(g.galaxy.known).length >= before);
  // buildRelay
  assert.equal(G.buildRelay(g, 'sol'), true);
  assert.ok(g.galaxy.relays.includes('sol'));
  assert.equal(G.buildRelay(g, 'sol'), false);
});

test('spreadTick: respects saved stars and deterministic', () => {
  const make = () => {
    const g = createGame(1);
    g.stars = [...createStars(1), ...G.extendGalaxy(createStars(1), 1)];
    G.initKnowledge(g);
    const src = g.stars.find((s) => s.id === 'tauceti');
    src.infection = 0.5;
    return g;
  };
  const g1 = make();
  const g2 = make();
  // mark a known target saved
  const tgt = g1.stars.find((s) => s.id !== 'tauceti' && g1.galaxy.known[s.id]);
  tgt.saved = true;
  const tgt2 = g2.stars.find((s) => s.id === tgt.id);
  tgt2.saved = true;
  const beforeInf = tgt.infection;
  // run several ticks
  for (let i = 0; i < 5; i++) { G.spreadTick(g1, 1); G.spreadTick(g2, 1); }
  assert.equal(tgt.infection, beforeInf);
  // determinism
  const inf1 = g1.stars.map((s) => s.infection);
  const inf2 = g2.stars.map((s) => s.infection);
  assert.deepEqual(inf1, inf2);
});

test('genPois: counts, kinds, fields', () => {
  const base = createStars(1);
  const extra = G.extendGalaxy(base, 1);
  const pois = G.genPois([...base, ...extra], 1);
  assert.ok(pois.length >= 20 && pois.length <= 30);
  const kinds = new Set(pois.map((p) => p.kind));
  for (const k of ['derelict','rogue','cloud','buoy','nebula','wreck']) assert.ok(kinds.has(k), k);
  for (const p of pois) {
    assert.match(p.id, /^poi-\d+$/);
    assert.ok(Array.isArray(p.pos) && p.pos.length === 3);
    assert.equal(typeof p.name, 'string');
    assert.equal(p.used, false);
  }
  // determinism
  const pois2 = G.genPois([...createStars(1), ...G.extendGalaxy(createStars(1), 1)], 1);
  assert.deepEqual(pois, pois2);
});