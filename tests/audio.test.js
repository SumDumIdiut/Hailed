import test from 'node:test';
import assert from 'node:assert/strict';
import { sfx } from '../src/audio/sfx.js';
import { music } from '../src/audio/music.js';

test('music and sfx are removed: every call is a silent no-op', () => {
  for (const n of ['click', 'hover', 'tab', 'toast', 'beep', 'arrive']) assert.doesNotThrow(() => sfx.play(n));
  assert.doesNotThrow(() => { sfx.attachUI(); sfx.hold('scan', true).stop(); sfx.tether({}); sfx.jump('burn'); sfx.jumpEnd(); sfx.connect(); });
  assert.doesNotThrow(() => { music.setScene('map'); music.setStar({}); music.setTension(3); music.stinger('win'); music.jumpStart(); music.jumpEnd(); music.connect(); });
});
