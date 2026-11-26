// Event deck: data-driven cards drawn from the content registry. Pure logic, deterministic via state.rng.
import { hashStr, mixSeed, stateRng } from './rng.js';
import { addLog, spendTime } from './util.js';
import { findStar } from './stars.js';
import { content } from './content.js';

const num = (n) => (typeof n === 'number' && Number.isFinite(n) ? n : 0);
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const noTick = () => {};
const sign = (d) => (d >= 0 ? '+' : '-');

// Old saves have no event state. Fill in the shape without disturbing anything already there.
// deckSeed identifies the deck for a save; draws themselves advance the shared state.rng stream.
export function ensureEvents(state) {
  if (!state.events || typeof state.events !== 'object' || Array.isArray(state.events)) state.events = {};
  const ev = state.events;
  if (!ev.flags || typeof ev.flags !== 'object') ev.flags = {};
  if (!ev.seen || typeof ev.seen !== 'object') ev.seen = {};
  if (ev.pending === undefined) ev.pending = null;
  if (!Number.isFinite(ev.deckSeed)) ev.deckSeed = mixSeed(state.seed ?? 1, hashStr('events'));
  return ev;
}

function ensureResearch(state) {
  if (!Number.isFinite(state.research)) state.research = 0;
  return state.research;
}

function ensureMaterials(state) {
  if (!state.rocky || typeof state.rocky !== 'object') state.rocky = {};
  if (!state.rocky.materials || typeof state.rocky.materials !== 'object') state.rocky.materials = {};
  return state.rocky.materials;
}

// Choice affordability, also used by pendingEvent and resolveChoice. Requirements are gates only;
// spending is expressed by negative effects (e.g. { fuel: -500 }).
function affordability(state, req) {
  if (!req) return { ok: true, why: '' };
  const need = [];
  if (req.fuelKg != null && num(state.ship?.fuelKg) < req.fuelKg) need.push(`${req.fuelKg} kg fuel`);
  if (req.samples != null && num(state.ship?.samples) < req.samples) need.push(`${req.samples} samples`);
  const mats = state.rocky?.materials || {};
  for (const [m, n] of Object.entries(req.materials || {})) if (num(mats[m]) < n) need.push(`${n} ${m}`);
  if (req.research != null && num(state.research) < req.research) need.push(`${req.research} research`);
  return need.length ? { ok: false, why: `Need ${need.join(', ')}.` } : { ok: true, why: '' };
}

function eligible(state, def, trigger, ctx) {
  if (def.trigger !== trigger) return false;
  const ev = state.events;
  if (def.once && ev.seen[def.id]) return false;
  const req = def.requires || {};
  for (const f of req.flags || []) if (!ev.flags[f]) return false;
  for (const f of req.notFlags || []) if (ev.flags[f]) return false;
  if (typeof def.when === 'function' && !def.when(state, ctx)) return false;
  return true;
}

// Pick an eligible card by weight using state.rng. ctx.chance is a probability gate on the draw.
// Sets pending = { id, ctx } and records the card in seen. Returns the definition or null.
export function drawEvent(state, trigger, ctx = {}) {
  const ev = ensureEvents(state);
  const rng = stateRng(state);
  const { chance: _gate, ...eventCtx } = ctx || {};
  if (rng.next() >= (ctx?.chance ?? 1)) return null;
  const pool = content().events.filter((def) => eligible(state, def, trigger, eventCtx));
  const total = pool.reduce((s, def) => s + Math.max(0, num(def.weight ?? 1)), 0);
  if (!pool.length || total <= 0) return null;
  let roll = rng.next() * total;
  let def = pool[pool.length - 1];
  for (const d of pool) {
    roll -= Math.max(0, num(d.weight ?? 1));
    if (roll < 0) { def = d; break; }
  }
  ev.seen[def.id] = true;
  ev.pending = { id: def.id, ctx: eventCtx };
  return def;
}

// The card as the UI shows it: resolved text and per-choice affordability.
export function pendingEvent(state) {
  const ev = ensureEvents(state);
  const pending = ev.pending;
  if (!pending) return null;
  const def = content().events.find((d) => d.id === pending.id);
  if (!def) return null;
  const ctx = pending.ctx || {};
  const text = typeof def.text === 'function' ? def.text(state, ctx) : String(def.text ?? '');
  const choices = (def.choices || []).map((choice) => {
    const { ok, why } = affordability(state, choice.requires);
    return { label: choice.label, hint: choice.hint || '', ok, why };
  });
  return { def, text, choices };
}

// Apply one plain-data effect, appending a human-readable result to out.
function applyEffect(state, fx, ctx, tick, out) {
  if (!fx || typeof fx !== 'object') return;
  if (fx.fuel !== undefined) {
    const max = Number.isFinite(state.ship.fuelMaxKg) ? state.ship.fuelMaxKg : Infinity;
    const before = num(state.ship.fuelKg);
    const after = clamp(before + num(fx.fuel), 0, max);
    state.ship.fuelKg = after;
    out.push(`Fuel ${sign(after - before)}${Math.abs(Math.round(after - before))} kg.`);
  }
  if (fx.hull !== undefined) {
    const before = clamp(num(state.ship.hull), 0, 1);
    const after = clamp(before + num(fx.hull), 0, 1);
    state.ship.hull = after;
    out.push(`Hull ${sign(after - before)}${Math.round(Math.abs(after - before) * 100)}%.`);
  }
  if (fx.samples !== undefined) {
    const before = num(state.ship.samples);
    const after = Math.max(0, before + num(fx.samples));
    state.ship.samples = after;
    out.push(`Samples ${sign(after - before)}${Math.abs(after - before)}.`);
  }
  if (fx.research !== undefined) {
    const before = ensureResearch(state);
    const after = Math.max(0, before + num(fx.research));
    state.research = after;
    out.push(`Research ${sign(after - before)}${Math.abs(after - before)}.`);
  }
  if (fx.material !== undefined) {
    const mats = ensureMaterials(state);
    const before = num(mats[fx.material]);
    const after = Math.max(0, before + num(fx.n));
    mats[fx.material] = after;
    out.push(`${fx.material} ${sign(after - before)}${Math.abs(after - before)}.`);
  }
  if (fx.infection !== undefined) {
    const id = !fx.star || fx.star === 'here' ? state.ship.starId : fx.star;
    const star = findStar(state, id);
    // Saved stars (and Act I deliveries) host Taumoeba: event spores cannot take hold there.
    if (star && num(fx.infection) > 0 && (star.saved || state.delivered?.[star.id])) {
      out.push(`${star.name}'s Taumoeba bloom shrugs off the spores.`);
    } else if (star) {
      const before = clamp(num(star.infection), 0, 1);
      const after = clamp(before + num(fx.infection), 0, 1);
      star.infection = after;
      out.push(`${star.name} infection ${sign(after - before)}${Math.abs(after - before).toFixed(2)}.`);
    }
  }
  if (fx.flag !== undefined) {
    state.events.flags[fx.flag] = true;
    out.push(`${fx.flag} noted.`);
  }
  if (fx.clearFlag !== undefined) {
    delete state.events.flags[fx.clearFlag];
    out.push(`${fx.clearFlag} cleared.`);
  }
  if (fx.log !== undefined) {
    addLog(state, fx.log);
    out.push(fx.log);
  }
  if (fx.years !== undefined) {
    const years = num(fx.years);
    if (years !== 0) spendTime(state, years, tick);
    out.push(`${Math.abs(years).toFixed(2)} ship years pass.`);
  }
  if (fx.chain !== undefined) {
    state.events.pending = { id: fx.chain, ctx: { ...(ctx || {}) } };
    const next = content().events.find((d) => d.id === fx.chain);
    out.push(`Next: ${next ? next.title : fx.chain}.`);
  }
  if (fx.chance !== undefined) {
    const branch = stateRng(state).chance(num(fx.chance)) ? fx.then : fx.else;
    for (const sub of branch || []) applyEffect(state, sub, ctx, tick, out);
  }
}

// Resolve the indexed choice: apply its effects, clear the card (unless chained), log the outcome.
// An unaffordable choice is refused with a reason and leaves the card pending.
export function resolveChoice(state, index, tick = noTick) {
  const view = pendingEvent(state);
  if (!view || !Number.isInteger(index) || index < 0 || index >= view.choices.length) return [];
  const check = view.choices[index];
  if (!check.ok) return [check.why];
  const choice = view.def.choices[index];
  const ctx = state.events.pending.ctx || {};
  const tickFn = typeof tick === 'function' ? tick : noTick;
  state.events.pending = null;
  state.events.seen[view.def.id] = true;
  const results = [];
  for (const fx of choice.effects || []) applyEffect(state, fx, ctx, tickFn, results);
  addLog(state, `${view.def.title}: ${choice.label}.${results.length ? ' ' + results.join(' ') : ''}`);
  return results;
}
