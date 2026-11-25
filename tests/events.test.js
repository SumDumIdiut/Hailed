import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/sim/index.js';
import { registerPack, content, resetContent } from '../src/sim/content.js';
import { ensureEvents, drawEvent, pendingEvent, resolveChoice } from '../src/sim/events.js';
import { PACKS, loadContent } from '../content/index.js';

const star = (g, id) => g.stars.find((s) => s.id === id);
const fresh = () => { const g = createGame(1); ensureEvents(g); return g; };
const card = (id, trigger, choices, extra = {}) => ({
  id, trigger, title: id, text: `The ${id} card.`, choices, ...extra,
});
const ok = (label = 'Continue') => ({ label, effects: [{ log: label }] });

test('registry: packs merge, later ids override, validation and reset', () => {
  resetContent();
  registerPack({ id: 'a', events: [{ id: 'e1', title: 'A' }, { id: 'e2' }], techs: [{ id: 't1' }], pois: [] });
  registerPack({ id: 'b', events: [{ id: 'e1', title: 'B' }], pois: [{ id: 'p1' }] });
  const c = content();
  assert.deepEqual(c.events.map((e) => e.id), ['e1', 'e2']);
  assert.equal(c.events[0].title, 'B');                       // later pack wins
  assert.deepEqual(c.techs.map((t) => t.id), ['t1']);
  assert.deepEqual(c.pois.map((p) => p.id), ['p1']);
  assert.throws(() => registerPack({ id: 'bad', events: [{ id: 'x' }, { id: 'x' }] }), /duplicate/i);
  assert.throws(() => registerPack({ id: 'bad', techs: [{ id: 't' }, { id: 't' }] }), /duplicate/i);
  assert.throws(() => registerPack({ id: 'bad', events: [{ title: 'no id' }] }), /id/i);
  assert.throws(() => registerPack({ events: [] }), /id/i);
  resetContent();
  assert.deepEqual(content(), { events: [], techs: [], pois: [] });
});

test('drawEvent is deterministic for a seed and respects weight', () => {
  resetContent(); loadContent(registerPack);
  const run = (seed) => {
    const g = createGame(seed); ensureEvents(g);
    const ids = [];
    for (let i = 0; i < 12; i++) ids.push(drawEvent(g, 'flight')?.id ?? null);
    return { ids, g };
  };
  const a = run(1), b = run(1), c = run(2);
  assert.deepEqual(a.ids, b.ids);
  assert.ok(a.ids.every(Boolean));
  assert.ok(new Set(a.ids).size > 1, 'the deck varies');
  assert.notDeepEqual(a.ids, c.ids);
  assert.ok(a.g.events.seen[a.ids[0]]);
  assert.equal(a.g.events.pending.id, a.ids[a.ids.length - 1]);
  // a heavy card should beat a light one over many draws
  resetContent();
  registerPack({ id: 'weights', events: [
    card('heavy', 'random', [ok()], { weight: 1000 }),
    card('light', 'random', [ok()], { weight: 1 }),
  ] });
  const g = fresh();
  let heavy = 0;
  for (let i = 0; i < 40; i++) if (drawEvent(g, 'random').id === 'heavy') heavy++;
  assert.ok(heavy > 35, `heavy drawn ${heavy}/40`);
  assert.equal(drawEvent(g, 'flight'), null);
  assert.equal(drawEvent(g, 'random', { chance: 0 }), null);
});

test('once cards never repeat; flags, notFlags and when gate eligibility', () => {
  resetContent();
  registerPack({ id: 'gates', events: [
    card('one-shot', 'flight', [ok()], { once: true }),
    card('filler', 'flight', [ok()]),
    card('flagged', 'arrive', [ok()], { requires: { flags: ['gate'] } }),
    card('unflagged', 'survey', [ok()], { requires: { notFlags: ['gate'] } }),
    card('conditional', 'random', [ok()], { when: (s, ctx) => s.ship.fuelKg > 10000 && ctx.ready === true }),
  ] });
  const g = fresh();
  const ids = [];
  for (let i = 0; i < 14; i++) ids.push(drawEvent(g, 'flight').id);
  assert.equal(ids.filter((id) => id === 'one-shot').length, 1);
  assert.equal(drawEvent(g, 'arrive'), null);                 // flagged needs the flag
  assert.equal(drawEvent(g, 'survey').id, 'unflagged');
  assert.equal(drawEvent(g, 'random', { ready: false }), null);
  assert.equal(drawEvent(g, 'random', { ready: true }).id, 'conditional');
  g.events.flags.gate = true;
  assert.equal(drawEvent(g, 'arrive').id, 'flagged');
  assert.equal(drawEvent(g, 'survey'), null);                 // notFlags now fails
  assert.equal(drawEvent(g, 'unknown-trigger'), null);
  assert.deepEqual(g.events.pending.ctx, {});
});

test('every effect type applies, clamps and reports a result', () => {
  resetContent();
  registerPack({ id: 'fx', events: [
    card('fx-all', 'flight', [{ label: 'All', effects: [
      { fuel: 90000 }, { hull: 0.5 }, { samples: 3 }, { research: 4 },
      { material: 'minerals', n: 5 }, { infection: 0.5 }, { infection: -0.01, star: 'sol' },
      { flag: 'on' }, { flag: 'off' }, { clearFlag: 'off' }, { log: 'A line in the log.' },
      { years: 0.1 }, { chance: 1, then: [{ samples: 2 }], else: [{ samples: 99 }] },
      { chain: 'fx-next' },
    ] }]),
    card('fx-next', 'flight', [ok('Next')]),
    card('fx-floor', 'flight', [{ label: 'Drain', effects: [
      { fuel: -1e9 }, { hull: -5 }, { samples: -99 }, { research: -99 },
      { material: 'minerals', n: -99 }, { infection: -9 },
    ] }]),
  ] });
  const g = fresh();
  g.ship.fuelKg = g.ship.fuelMaxKg - 100;
  g.ship.hull = 0.8;
  const solBefore = star(g, 'sol').infection;
  const years0 = g.time.shipYears;
  g.events.pending = { id: 'fx-all', ctx: {} };
  const view = pendingEvent(g);
  assert.equal(view.def.title, 'fx-all');
  assert.equal(view.text, 'The fx-all card.');
  assert.equal(view.choices[0].label, 'All');
  const ticks = [];
  const results = resolveChoice(g, 0, (st, y) => ticks.push([st, y]));
  assert.ok(results.length >= 13 && results.every((r) => typeof r === 'string' && r.length));
  assert.equal(g.ship.fuelKg, g.ship.fuelMaxKg);
  assert.equal(g.ship.hull, 1);
  assert.equal(g.ship.samples, 5);                            // 3 + 2 from the chance branch
  assert.equal(g.research, 4);                                // created from nothing
  assert.equal(g.rocky.materials.minerals, 7);
  assert.ok(Math.abs(star(g, 'tauceti').infection - 0.65) < 1e-9);
  assert.ok(Math.abs(star(g, 'sol').infection - (solBefore - 0.01)) < 1e-9);
  assert.equal(g.events.flags.on, true);
  assert.equal(g.events.flags.off, undefined);
  assert.ok(Math.abs(g.time.shipYears - (years0 + 0.1)) < 1e-9);
  assert.deepEqual(ticks, [[g, 0.1]]);
  assert.equal(g.events.pending.id, 'fx-next');              // chain survives the clear
  assert.ok(g.log.some((l) => /fx-all: All/.test(l.text)));
  assert.ok(g.log.some((l) => l.text === 'A line in the log.'));
  g.events.pending = { id: 'fx-floor', ctx: {} };
  resolveChoice(g, 0);
  assert.equal(g.ship.fuelKg, 0);
  assert.equal(g.ship.hull, 0);
  assert.equal(g.ship.samples, 0);
  assert.equal(g.research, 0);
  assert.equal(g.rocky.materials.minerals, 0);
  assert.equal(star(g, 'tauceti').infection, 0);
});

test('chance effects roll on state.rng and take then or else', () => {
  resetContent();
  registerPack({ id: 'chance', events: [
    card('always', 'flight', [{ label: 'yes', effects: [
      { chance: 1, then: [{ flag: 'yes' }], else: [{ flag: 'no' }] },
    ] }]),
    card('never', 'flight', [{ label: 'no', effects: [
      { chance: 0, then: [{ flag: 'yes' }], else: [{ flag: 'no' }] },
    ] }]),
  ] });
  const g = fresh();
  const s0 = g.rng.s;
  g.events.pending = { id: 'always', ctx: {} };
  resolveChoice(g, 0);
  assert.equal(g.events.flags.yes, true);
  assert.equal(g.events.flags.no, undefined);
  g.events.pending = { id: 'never', ctx: {} };
  resolveChoice(g, 0);
  assert.equal(g.events.flags.no, true);
  assert.notEqual(g.rng.s, s0);
});

test('chain makes the next card pending and keeps its ctx', () => {
  resetContent();
  registerPack({ id: 'chain', events: [
    card('a', 'flight', [{ label: 'Onward', effects: [{ chain: 'b' }, { research: 2 }] }]),
    card('b', 'survey', [{ label: 'Done', effects: [{ flag: 'done' }] }]),
  ] });
  const g = fresh();
  const view1 = drawEvent(g, 'flight', { star: 'sol' });     // only 'a' is eligible
  assert.equal(view1.id, 'a');
  const results = resolveChoice(g, 0);
  assert.ok(results.some((r) => /b/.test(r)));
  assert.equal(g.events.pending.id, 'b');
  assert.deepEqual(g.events.pending.ctx, { star: 'sol' });
  assert.equal(pendingEvent(g).def.title, 'b');
  assert.equal(g.research, 2);
  resolveChoice(g, 0);
  assert.equal(g.events.pending, null);
  assert.equal(g.events.flags.done, true);
  assert.ok(g.log.some((l) => /b: Done/.test(l.text)));
});

test('choice affordability is shown, explained and enforced', () => {
  resetContent();
  registerPack({ id: 'cost', events: [card('costs', 'survey', [
    { label: 'Free', requires: { fuelKg: 10, samples: 0, materials: { minerals: 1 }, research: 0 }, effects: [{ flag: 'free' }] },
    { label: 'Dear', requires: { fuelKg: 1e9, samples: 9, materials: { minerals: 99 }, research: 99 }, effects: [{ flag: 'dear' }] },
    { label: 'Researched', requires: { research: 1 }, effects: [{ flag: 'researched' }] },
  ])] });
  const g = fresh();
  g.events.pending = { id: 'costs', ctx: {} };
  const view = pendingEvent(g);
  assert.deepEqual(view.choices.map((c) => c.label), ['Free', 'Dear', 'Researched']);
  assert.equal(view.choices[0].ok, true);
  assert.equal(view.choices[0].why, '');
  assert.equal(view.choices[1].ok, false);
  assert.match(view.choices[1].why, /fuel/);
  assert.match(view.choices[1].why, /minerals/);
  assert.match(view.choices[1].why, /samples/);
  assert.match(view.choices[1].why, /research/);
  assert.equal(view.choices[2].ok, false);                   // research is missing on a fresh game
  assert.match(resolveChoice(g, 1)[0], /Need/);
  assert.equal(g.events.pending.id, 'costs');                // a refused choice leaves the card open
  assert.equal(g.events.flags.dear, undefined);
  assert.ok(resolveChoice(g, 0).length > 0);
  assert.equal(g.events.flags.free, true);
  assert.equal(pendingEvent(g), null);
  const h = fresh(); h.research = 5;
  h.events.pending = { id: 'costs', ctx: {} };
  resolveChoice(h, 2);
  assert.equal(h.events.flags.researched, true);
  assert.equal(resolveChoice(h, 3).length, 0);                // bad index
});

test('all core events are valid and resolvable', () => {
  resetContent(); loadContent(registerPack);
  assert.ok(PACKS.some((p) => p.id === 'core'));
  const g = createGame(1); ensureEvents(g);
  const events = content().events;
  assert.ok(events.length >= 40, `${events.length} events`);
  const ids = new Set();
  const texts = [];
  for (const def of events) {
    assert.ok(!ids.has(def.id), `duplicate ${def.id}`); ids.add(def.id);
    assert.ok(['flight', 'arrive', 'survey', 'random'].includes(def.trigger), def.id);
    assert.equal(typeof def.title, 'string');
    const text = typeof def.text === 'function' ? def.text(g, {}) : def.text;
    assert.equal(typeof text, 'string'); assert.ok(text.length > 0, def.id);
    texts.push(text);
    assert.ok(Array.isArray(def.choices) && def.choices.length > 0, def.id);
    for (const choice of def.choices) {
      assert.equal(typeof choice.label, 'string'); assert.ok(choice.label.length, def.id);
      assert.ok(Array.isArray(choice.effects) && choice.effects.length > 0, def.id);
    }
  }
  const carto = events.filter((e) => e.id.startsWith('carto-'));
  assert.equal(carto.length, 6);
  for (let i = 1; i <= 6; i++) {
    assert.ok(carto.some((e) => e.choices.some((c) => c.effects.some((fx) => fx.flag === `carto${i}`))), `flag carto${i}`);
  }
  assert.ok(texts.some((t) => /question\?/i.test(t)), 'Rocky asks questions');
  const all = [...texts, ...events.flatMap((e) => e.choices.map((c) => `${c.label} ${c.hint || ''}`))].join(' ');
  assert.match(all, /amaze/i);

  // every choice actually runs without throwing, even on a fresh state
  const rich = createGame(1); ensureEvents(rich);
  rich.ship.fuelKg = rich.ship.fuelMaxKg; rich.ship.samples = 50; rich.research = 50;
  rich.rocky.materials = { minerals: 50, volatiles: 50, gas: 50, silicates: 50 };
  for (const def of events) def.choices.forEach((_choice, i) => {
    rich.events.pending = { id: def.id, ctx: {} };
    assert.ok(Array.isArray(resolveChoice(rich, i)), def.id);
  });
  resetContent();
});
