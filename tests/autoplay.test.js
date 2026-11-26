import { test } from 'node:test';
import assert from 'node:assert/strict';
import { playSeed } from '../tools/autoplay.mjs';

// The headless balance autoplayer: one bounded seeded run must not throw and must get
// through the Act I winning route into Act II (it may finish the run, or keep playing).
test('autoplay: a bounded greedy run plays without exceptions and reaches act II', () => {
  const r = playSeed(1, { maxActions: 3000, maxWorldYears: 3000 });
  assert.ok(r, 'the bot returned a report');
  assert.ok(r.act >= 2, `the bot should have reached act II, got act ${r.act}`);
  assert.ok(r.actions <= 3000, `the bot should respect the action budget, used ${r.actions}`);
});

// A regression guard for the Act III idle loop: with no action left, world time used
// to advance forever (0.25 years per pass) while the stuck signature changed with it.
test('autoplay: a seeded run ends before 1500 world years with bounded actions', () => {
  for (const seed of [1, 2]) {
    const r = playSeed(seed, { maxActions: 4000, maxWorldYears: 1500 });
    assert.notEqual(r.outcome, 'playing', `seed ${seed} never ended: ${r.stuckReason}`);
    assert.ok(r.worldYears < 1500, `seed ${seed} burned ${r.worldYears.toFixed(1)} world years`);
    assert.ok(r.actions < 4000, `seed ${seed} used ${r.actions} actions`);
  }
});
