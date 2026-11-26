import { $, esc, fmt } from './util.js';
import { sfx, music } from '../audio/index.js';
import { letterbox, flash, REDUCED } from './cinematics.js';

// Travel sequences. Interstellar: confirm sheet with the forecast, then spool-up, burn, flip, brake, arrival (about 5.5 s).
// In-system transfer: no confirm (the cost is on the button), same sequence at about 2.7 s.
// The real sim call runs when the sequence ends (or is skipped), so the sim only ever sees a finished trip.
// All animated numbers come from a forecast made on a clone of the state, so the HUD ticks from the before
// values to exactly what the sim will land on.
const G = 9.80665, AU_M = 1.495978707e11;
const PH_STAR = [['spool', 1.4, 'Spooling spin drive'], ['burn', 1.5, 'Accelerating at 1.5 g'], ['flip', 0.6, 'Turnaround'],
  ['brake', 1.5, 'Decelerating'], ['arrive', 0.5, 'Arrival']];
const PH_HOP = [['spool', 0.5, 'Priming drive'], ['burn', 0.8, 'Transfer burn'], ['flip', 0.3, 'Turnaround'],
  ['brake', 0.8, 'Braking burn'], ['arrive', 0.3, 'Orbit insertion']];
const TRACK = 40;

const snap = (sim, st) => ({ world: st.time.worldYears, ship: st.time.shipYears, fuelKg: st.ship.fuelKg,
  earth: sim.extinctionYears(st, 'earth'), erid: sim.extinctionYears(st, 'erid'), status: st.status });
const lerp = (a, b, f) => (Number.isFinite(a) && Number.isFinite(b) ? a + (b - a) * f : f >= 1 ? b : a);
const yr = (n, d = 2) => fmt(n, d) + ' yr';
const sgn = (n, d = 2) => (n >= 0 ? '+' : '-') + fmt(Math.abs(n), d);

export function createJump(api) {
  const { sim } = api;
  const root = $('jump'), conf = $('jump-confirm'), fl = $('jump-flight');
  let mode = 'idle', ctx = null, run = null, raf = 0, els = null;

  function show(m) {
    mode = m;
    root.classList.toggle('hidden', m === 'idle');
    root.classList.toggle('flight', m === 'flight');
    conf.classList.toggle('hidden', m !== 'confirm');
    fl.classList.toggle('hidden', m !== 'flight');
  }

  // ---- interstellar: confirm sheet ----
  function confirm(starId) {
    if (mode !== 'idle') return false;
    const st = api.state(), plan = sim.travelPlan(st, starId);
    if (!plan.ok) { api.fail(plan.reason); return false; }
    const clone = sim.deserialize(sim.serialize(st));
    sim.travel(clone, starId);
    const to = st.stars.find((s) => s.id === starId), from = st.stars.find((s) => s.id === st.ship.starId);
    const trip = sim.relativisticTrip(plan.distanceLy);
    ctx = { kind: 'star', id: starId, plan, trip, before: snap(sim, st), after: snap(sim, clone), to, from };
    const { before: b, after: a } = ctx, peak = Math.tanh(sim.ACCEL * trip.shipYears / 2);
    const dark = (v, st2) => (st2 !== 'playing' && v === 0 ? 'DARK' : yr(v, 1));
    const rowT = (k, x, y, d, cls = '') => `<tr><td>${k}</td><td>${x}</td><td>${y}</td><td class="d ${cls}">${d}</td></tr>`;
    conf.innerHTML = `<div class="jhead"><span>Spin drive: ${esc(from.name)} &rarr; ${esc(to.name)}</span><span>Esc cancel &middot; Enter engage</span></div>
      <div class="jbody"><table class="jt"><tr><th>Forecast</th><th>Now</th><th>On arrival</th><th>Change</th></tr>` +
      rowT('Fuel', Math.round(b.fuelKg) + ' kg', Math.round(a.fuelKg) + ' kg', '-' + plan.fuelKg + ' kg') +
      rowT('Ship clock', yr(b.ship), yr(a.ship), sgn(plan.shipYears) + ' yr') +
      rowT('World clock', yr(b.world), yr(a.world), sgn(plan.worldYears) + ' yr', 'bad') +
      rowT('Earth countdown', yr(b.earth, 1), dark(a.earth, a.status), sgn(a.earth - b.earth, 1) + ' yr', a.earth < b.earth ? 'bad' : '') +
      rowT('Erid countdown', yr(b.erid, 1), dark(a.erid, a.status), sgn(a.erid - b.erid, 1) + ' yr', a.erid < b.erid ? 'bad' : '') +
      `</table><div class="jfacts"><span>RANGE ${fmt(plan.distanceLy, 2)} ly</span><span>BURN 1.5 g</span><span>PEAK ${fmt(peak, 3)} c</span><span>FLIP AT MIDPOINT</span></div>` +
      (a.status !== 'playing' ? '<div class="jwarn">Forecast: a homeworld goes dark before you arrive. This trip loses the game.</div>' : '') +
      `<div class="jbtns"><button id="jump-cancel">Cancel</button><button class="primary" id="jump-go">Engage spin drive</button></div></div>`;
    show('confirm');
    $('jump-cancel').addEventListener('click', cancel);
    $('jump-go').addEventListener('click', go);
    $('jump-go').focus();
    return true;
  }

  // ---- in-system transfer ----
  function hop(planetId) {
    if (mode !== 'idle') return false;
    const st = api.state(), plan = sim.travelToPlanetPlan(st, planetId);
    if (!plan.ok) { api.fail(plan.reason); return false; }
    const clone = sim.deserialize(sim.serialize(st));
    sim.travelToPlanet(clone, planetId);
    ctx = { kind: 'orbit', id: planetId, plan, from: st.ship.planetId || null, before: snap(sim, st), after: snap(sim, clone),
      planet: st.stars.find((s) => s.id === st.ship.starId).planets.find((p) => p.id === planetId) };
    go();
    return true;
  }

  function cancel() { if (mode === 'confirm') { ctx = null; show('idle'); } }

  function go() {
    if (!ctx) return;
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    const hopMode = ctx.kind === 'orbit', phases = hopMode ? PH_HOP : PH_STAR;
    run = { ...ctx, phases, total: phases.reduce((s, p) => s + p[1], 0), t0: performance.now() };
    ctx = null;
    root.classList.toggle('hop', hopMode);
    const starJump = !hopMode;
    const title = hopMode ? `Transfer burn: orbit ${esc(run.planet.name)}` : `Spin drive: ${esc(run.from.name)} &rarr; ${esc(run.to.name)}`;
    fl.innerHTML = `<div class="jhead"><span>${title}</span><span>Esc / Space: skip to arrival</span></div><div class="jbody">
      ${starJump ? `<div class="jclocks">
        <div class="jclock"><span class="k">SHIP</span><span class="v jnum" data-e="jship"></span></div>
        <div class="jclock"><span class="k">WORLD</span><span class="v jnum" data-e="jworld"></span></div>
        <div class="jclock"><span class="k">VELOCITY</span><span class="v jnum" data-e="jvel"></span></div>
      </div>` : ''}
      <div class="jphase"><span class="ph" data-e="ph"></span><span class="cd" data-e="cd"></span></div>
      <div class="jgrid"><div><span class="k">Velocity</span><span class="v" data-e="vel"></span></div>
        <div><span class="k">${hopMode ? 'Accel' : 'Lorentz gamma'}</span><span class="v" data-e="gam"></span></div>
        <div><span class="k">To go</span><span class="v" data-e="togo"></span></div>
        <div><span class="k">Elapsed (ship)</span><span class="v" data-e="el"></span></div></div>
      <div class="jgrid"><div><span class="k">Ship clock</span><span class="v" data-e="dship"></span></div>
        <div><span class="k">World clock</span><span class="v" data-e="dworld"></span></div>
        <div><span class="k">Fuel burned</span><span class="v" data-e="dfuel"></span></div>
        <div><span class="k">Earth / Erid</span><span class="v" data-e="ee"></span></div></div>
      <div class="jtrack">${'<i></i>'.repeat(TRACK)}</div>
      <div class="jfoot"><span>${esc(hopMode ? (run.from ? 'Current orbit' : 'Parking orbit') : run.from.name)}</span><span>${hopMode ? '' : 'Flip at midpoint'}</span><span>${esc(hopMode ? run.planet.name : run.to.name)}</span></div></div>`;
    els = {}; fl.querySelectorAll('[data-e]').forEach((e) => { els[e.dataset.e] = e; });
    els.cells = [...fl.querySelectorAll('.jtrack i')];
    els.cells[Math.floor(TRACK / 2) - 1].classList.add('mid');
    show('flight');
    if (starJump) {
      letterbox(true);
      run.streaks = makeStreaks(fl.parentElement || fl);
    }
    music.jumpStart(run.total, run.kind);
    cancelAnimationFrame(raf); raf = requestAnimationFrame(frame);
  }

  // Subtle star-streak effect: ~60 thin radial lines from the centre, scaling outward (transform/opacity only), made once.
  function makeStreaks(host) {
    let s = host.querySelector('.jstreaks');
    if (!s) {
      s = document.createElement('div'); s.className = 'jstreaks';
      for (let i = 0; i < 60; i++) {
        const d = document.createElement('i');
        d.style.setProperty('--a', String((i * 360) / 60) + 'deg');
        s.appendChild(d);
      }
      host.appendChild(s);
    }
    return [...s.children];
  }

  // Everything the display needs at elapsed seconds e: fractions of ship time / world time / distance and instruments.
  function compute(e) {
    const { phases, kind, trip, plan } = run;
    let acc = 0, idx = 0;
    for (; idx < phases.length - 1; idx++) { if (e < acc + phases[idx][1]) break; acc += phases[idx][1]; }
    const u = Math.min(1, Math.max(0, (e - acc) / phases[idx][1])), id = phases[idx][0];
    const o = { phase: phases[idx][2], id, sf: 0, wf: 0, pos: 0, vel: 0, gam: 1, cd: '' };
    if (id === 'spool') o.cd = 'T-' + Math.min(3, 3 - Math.floor(u * 3));
    else if (id === 'flip') { o.sf = o.wf = o.pos = 0.5; }
    else if (id === 'arrive') { o.sf = o.wf = o.pos = 1; }
    else {
      const rem = id === 'brake' ? 1 - u : u;                    // progress into the burn, as seen from the nearer end
      if (kind === 'star') {
        const a = sim.ACCEL, tau = rem * trip.shipYears / 2;
        const t = Math.sinh(a * tau) / a, x = (Math.cosh(a * tau) - 1) / a;
        o.vel = Math.tanh(a * tau); o.gam = Math.cosh(a * tau);
        const sFrac = tau / trip.shipYears, wFrac = t / trip.worldYears, xFrac = x / plan.distanceLy;
        if (id === 'burn') { o.sf = sFrac; o.wf = wFrac; o.pos = xFrac; } else { o.sf = 1 - sFrac; o.wf = 1 - wFrac; o.pos = 1 - xFrac; }
      } else {
        const th = plan.shipDays * 86400 / 2, t = rem * th, a = 1.5 * G, d = plan.distanceAu * AU_M;
        o.vel = a * t; const xFrac = (0.5 * a * t * t) / d;
        if (id === 'burn') { o.sf = o.wf = rem / 2; o.pos = xFrac; } else { o.sf = o.wf = 1 - rem / 2; o.pos = 1 - xFrac; }
      }
    }
    return o;
  }

  function frame(now) {
    if (!run) return;
    const e = (now - run.t0) / 1000;
    if (e >= run.total) { complete(); return; }
    const o = compute(e), { before: b, after: a, kind } = run, hopMode = kind === 'orbit';
    if (o.id !== run.ph) { run.ph = o.id; sfx.jump(o.id, (run.phases.find((p) => p[0] === o.id) || [0, 1])[1], kind); }   // spool / burn / flip / brake / arrive sounds
    if (o.id === 'spool' && o.cd !== run.cd) { run.cd = o.cd; sfx.play('beep', { n: +String(o.cd).slice(2) || 1 }); }          // T-3, T-2, T-1 beeps
    api.hud.setOverride({ world: lerp(b.world, a.world, o.wf), ship: lerp(b.ship, a.ship, o.sf), fuelKg: lerp(b.fuelKg, a.fuelKg, o.sf),
      earth: lerp(b.earth, a.earth, o.wf), erid: lerp(b.erid, a.erid, o.wf) });
    api.frame({ kind, fromId: hopMode ? run.from : run.from.id, toId: run.id, f: o.pos });
    const T = els;
    T.ph.textContent = o.phase;
    T.cd.textContent = o.cd || Math.round(o.pos * 100) + '%';
    const dShip = (a.ship - b.ship) * o.sf, dWorld = (a.world - b.world) * o.wf;
    if (hopMode) {
      T.vel.textContent = fmt(o.vel / 1000, 0) + ' km/s'; T.gam.textContent = '1.50 g';
      T.togo.textContent = fmt(run.plan.distanceAu * (1 - o.pos), 2) + ' AU';
      T.el.textContent = fmt(run.plan.shipDays * o.sf, 2) + ' d';
      T.dship.textContent = '+' + fmt(dShip * 365.25, 2) + ' d'; T.dworld.textContent = '+' + fmt(dWorld * 365.25, 2) + ' d';
    } else {
      T.vel.textContent = fmt(o.vel, 4) + ' c'; T.gam.textContent = fmt(o.gam, 2);
      T.togo.textContent = fmt(run.plan.distanceLy * (1 - o.pos), 2) + ' ly';
      T.el.textContent = fmt(dShip, 2) + ' yr';
      T.dship.textContent = '+' + fmt(dShip, 2) + ' yr'; T.dworld.textContent = '+' + fmt(dWorld, 2) + ' yr';
    }
    // interstellar two-clock readout: SHIP/WORLD counting up to the trip values (time dilation), velocity climbing and back.
    if (kind === 'star') {
      const trip = run.trip;
      if (T.jship) T.jship.textContent = fmt(o.sf * trip.shipYears, 2) + ' yr';
      if (T.jworld) T.jworld.textContent = fmt(o.wf * trip.worldYears, 2) + ' yr';
      if (T.jvel) T.jvel.textContent = fmt(o.vel, 2) + ' c';
      if (run.streaks && !REDUCED) {
        const amp = 0.3 + 0.45 * Math.min(1, Math.max(0, o.vel));
        run.streaks.forEach((str, i) => {
          str.style.setProperty('--amp', String(amp));
          str.style.opacity = String(0.04 + 0.13 * amp + 0.02 * (i % 7));
        });
      }
    }
    T.dfuel.textContent = '-' + Math.round((b.fuelKg - a.fuelKg) * o.sf) + ' kg';
    const hud = api.hudValues();
    T.ee.textContent = `${fmt(hud.earth, 1)} / ${fmt(hud.erid, 1)} yr`;
    const lit = Math.round(o.pos * TRACK);
    T.cells.forEach((c, i) => c.classList.toggle('on', i < lit));
    raf = requestAnimationFrame(frame);
  }

  function complete() {
    if (!run) return;
    cancelAnimationFrame(raf);
    const r = run; run = null;
    api.hud.setOverride(null); api.frame(null);
    sfx.jumpEnd(); music.jumpEnd();
    show('idle'); root.classList.remove('hop');
    const st = api.state();
    const result = r.kind === 'star' ? sim.travel(st, r.id) : sim.travelToPlanet(st, r.id);
    api.done(r.kind, r.id, result, r);
    if (r.kind === 'star') {
      if (r.streaks) r.streaks.forEach((e) => { e.style.opacity = '0'; });   // arrival
      flash(); letterbox(false);
    }
  }

  // Esc / Space / Enter while a sheet or sequence is up. Returns true if it consumed the key.
  function key(e) {
    if (mode === 'idle') return false;
    if (mode === 'confirm') {
      if (e.key === 'Escape') { cancel(); return true; }
      if (e.key === 'Enter') { go(); return true; }
      return e.key === ' ';
    }
    if (e.key === 'Escape' || e.key === ' ' || e.key === 'Enter') { complete(); return true; }
    return false;
  }

  return { confirm, hop, key, cancel, skip: complete, get active() { return mode !== 'idle'; }, get flying() { return mode === 'flight'; } };
}
