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
