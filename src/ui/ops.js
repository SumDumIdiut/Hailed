import { $, esc, fmt } from './util.js';
import { sfx, music } from '../audio/index.js';

// Planet-scene operations: orbital scan sweep + spectrometer map, tether-probe sampling, Astrophage harvesting, and the
// chase camera state. All game rules live in src/sim; this file only drives time and draws the panel.
const SCAN_SECS = 7;            // real seconds for a full sweep
const HARVEST_SECS = 8, SKIM_SECS = 3.5;
const ORBIT_RATE = 0.75;        // rad/s of the ship around the planet in the close-up
const LAYERS = [['thermal', 'Thermal'], ['atmo', 'CO2 / Atmo'], ['astro', 'Astrophage IR'], ['life', 'Life signs']];
const LCOL = { thermal: null, atmo: [60, 200, 170], astro: [230, 60, 120], life: [90, 255, 110] };
const ramp = (v) => { v = Math.max(0, Math.min(1, v)); return [Math.min(255, 20 + v * 480), Math.min(255, 30 + Math.max(0, v - 0.3) * 330), Math.min(255, 110 - v * 120 + Math.max(0, v - 0.75) * 700)]; };

export function createOps(api) {
  const { sim } = api, root = $('panel-ops');
  let planetId = null, layerOn = { thermal: true, atmo: false, astro: false, life: false }, sel = null;
  let phase = 0, lock = 0, scanning = false, run = null, held = { space: false, btn: false, r: false }, banner = null, brokenT = 0;
  let follow = true, hint = '';
  const camFollow = { yaw: 0, pitch: 0, dist: 0.95 };
  const mapCv = document.createElement('canvas'); mapCv.width = sim.SCAN.w; mapCv.height = sim.SCAN.h;

  root.innerHTML = `<h3><span>Orbital survey <span id="ops-pl" class="dim"></span></span></h3>
    <div class="row"><span>Sweep coverage</span><span id="ops-cov">0%</span></div><div class="ops-bar"><i id="ops-covbar"></i><b id="ops-covmark"></b></div>
    <div class="scr"><canvas id="ops-map" width="320" height="160"></canvas></div>
    <div class="btns ops-layers">${LAYERS.map(([k, n]) => `<button class="small" data-l="${k}" id="ops-layer-${k}">${n}</button>`).join('')}</div>
    <div class="note" id="ops-legend"></div>
    <div class="btns" id="ops-btns"><button class="small primary" id="ops-scan">Scan</button><button class="small" id="ops-sample">Sample</button>
      <button class="small" id="ops-harvest">Harvest</button><button class="small" id="ops-follow">Follow ship (F)</button></div>
    <div id="ops-samp" class="hidden"><h4>Tether probe</h4><div class="ops-samp-grid"><div class="scr gaugebox"><canvas id="ops-gauge" width="130" height="250"></canvas></div>
      <div class="ops-bars"><div class="ops-g"><span>TENSION</span><div class="ops-bar t"><i id="ops-ten"></i></div></div>
        <div class="ops-g"><span>HEAT</span><div class="ops-bar h"><i id="ops-heat"></i></div></div>
        <div class="ops-g"><span>SAMPLE</span><div class="ops-bar s"><i id="ops-prog"></i></div></div>
        <div class="ops-keys"><div><kbd>SPACE</kbd> hold to lower</div><div>release to hold depth</div><div><kbd>R</kbd> reel in</div><div><kbd>Esc</kbd> abort</div></div>
        <button class="small primary" id="ops-hold">Hold to lower</button></div></div>
      <div class="res" id="ops-msg" hidden></div><div class="btns"><button class="small" id="ops-retry" hidden>Retry (Enter)</button><button class="small" id="ops-done" hidden>Back to map</button></div></div>
    <div id="ops-harv" class="hidden"><h4>Astrophage collector</h4><div class="ops-bar s big"><i id="ops-hprog"></i></div><div class="note" id="ops-hnote"></div>
      <div class="btns"><button class="small" id="ops-hcancel">Retract</button></div></div>
    <div class="res" id="ops-info" hidden></div>`;
  const E = (id) => $(id);
  const map = E('ops-map'), mctx = map.getContext('2d'), gauge = E('ops-gauge'), gctx = gauge.getContext('2d');
  const st = () => api.state();
  const planet = () => (planetId ? st().stars.flatMap((s) => s.planets).find((p) => p.id === planetId) : null);
  const orbiting = () => !!planetId && st().ship.planetId === planetId;
  const info = (t, bad) => { const e = E('ops-info'); e.hidden = !t; e.textContent = t || ''; e.classList.toggle('bad', !!bad); };

  root.querySelectorAll('[data-l]').forEach((b) => b.addEventListener('click', () => {
    layerOn[b.dataset.l] = !layerOn[b.dataset.l];
    if (b.dataset.l === 'life' && layerOn.life) api.event('life-layer');
    syncButtons();
  }));
  map.addEventListener('click', (e) => {
    if (run || sim_active()) return;
    const m = sim.scanMap(st(), planetId); if (!m || !m.full || !layerOn.life) { if (m && m.full && !layerOn.life) info('Open the LIFE SIGNS layer to see hotspots.'); return; }
    const r = map.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    let best = null, bd = 0.07;
    for (const h of m.hotspots) { if (!h.revealed) continue; const d = Math.hypot((h.x - x) * 2, h.y - y); if (d < bd) { bd = d; best = h; } }
    sel = best ? best.id : null;
    if (best) api.event('hotspot');
    syncButtons();
  });
  E('ops-scan').addEventListener('click', () => startScan(planetId));
  E('ops-sample').addEventListener('click', () => startSample());
  E('ops-harvest').addEventListener('click', () => startHarvest('collector'));
  E('ops-follow').addEventListener('click', () => toggleFollow());
  E('ops-hcancel').addEventListener('click', () => { run = null; syncButtons(); });
  E('ops-retry').addEventListener('click', () => startSample());
  E('ops-done').addEventListener('click', () => { sim.endSample(st()); banner = null; syncButtons(); });
  const hold = E('ops-hold');
  hold.addEventListener('pointerdown', () => { held.btn = true; });
  window.addEventListener('pointerup', () => { held.btn = false; });

  const sim_active = () => !!(st().sampling && st().sampling.status === 'active' && st().sampling.planetId === planetId);
  const sampling = () => st().sampling && st().sampling.planetId === planetId ? st().sampling : null;

  function toggleFollow() { follow = !follow; api.event('follow'); syncButtons(); return follow; }
  function startScan(id) {
    if (id && id !== planetId) enter(id);
    api.openPlanet(planetId);
    if (!orbiting()) return api.afterAction('Fly to orbit first: the sweep needs the scanner footprint to cross the surface.', true);
    const r = sim.scanBegin(st(), planetId);
    if (!r.ok) { info(r.text, true); return api.afterAction(r.text, true); }
    scanning = true; info('');
    api.event('scan');
    api.afterAction(r.text);
    syncButtons();
  }
  function startSample(id) {
    if (id && id !== planetId) enter(id);
    api.openPlanet(planetId);
    if (!orbiting()) return api.afterAction('Fly to orbit first.', true);
    const p = planet(), sc = sim.scanCoverage(st(), planetId);
    if (sc < sim.SCAN.fullAt) { info(`Sweep ${p.name} to ${Math.round(sim.SCAN.fullAt * 100)}%+ first (now ${Math.round(sc * 100)}%): press SCAN.`, true); return; }
    if (!layerOn.life) { layerOn.life = true; api.event('life-layer'); }
    if (!sel) { info('Pick a hotspot on the scan map first (click a green ring).', true); syncButtons(); return; }
    const r = sim.beginSample(st(), planetId, sel);
    if (!r.ok) { info(r.text, true); return; }
    banner = null; brokenT = 0; info(''); scanning = false;
    syncButtons();
  }
  function startHarvest(mode, id) {
    if (id && id !== planetId) enter(id);
    const plan = sim.harvestPlan(st(), mode);
    if (!plan.ok) { info(plan.reason, true); return api.afterAction(plan.reason, true); }
    if (mode === 'collector') api.openPlanet(plan.planetId);
    run = { mode, t: 0, dur: mode === 'skim' ? SKIM_SECS : HARVEST_SECS, plan };
    scanning = false; info('');
    syncButtons();
  }
  function finishRun() {
    const r = sim.harvest(st(), run.mode);
    run = null;
    api.afterAction(r.text, r.ok === false);
    api.event('harvest');
    info(r.text, r.ok === false);
    syncButtons();
  }

  function enter(id) { if (planetId !== id) { planetId = id; sel = null; banner = null; scanning = false; } syncButtons(); }
  function reset() { planetId = null; sel = null; scanning = false; run = null; banner = null; phase = 0; lock = 0; info(''); if (api.state()) sim.endSample(api.state()); }

  function syncButtons() {
    const p = planet(); if (!p || !st()) return;
    E('ops-pl').textContent = p.name;
    const orb = orbiting(), sc = sim.scanCoverage(st(), planetId), active = sim_active(), samp = sampling();
    root.querySelectorAll('[data-l]').forEach((b) => b.classList.toggle('primary', !!layerOn[b.dataset.l]));
    E('ops-scan').disabled = !orb || scanning || !!run || !!samp || sc >= 1;
    E('ops-scan').textContent = scanning ? 'Sweeping...' : sc >= 1 ? 'Mapped' : sc > 0 ? 'Resume scan' : 'Scan';
    E('ops-sample').disabled = !orb || !!run || !!samp || scanning || sc < sim.SCAN.fullAt;
    E('ops-follow').disabled = !orb; E('ops-follow').classList.toggle('primary', follow && orb);
    const hp = sim.harvestPlan(st(), 'collector');
    const tgt = sim.petrovaTarget(st().stars.find((s) => s.id === st().ship.starId).planets);
    E('ops-harvest').classList.toggle('hidden', !(tgt && tgt.id === planetId));
    E('ops-harvest').disabled = !hp.ok || !!run || !!samp;
    E('ops-harvest').title = hp.ok ? `${hp.days} days, about ${hp.kg} kg of fuel` : hp.reason;
    E('ops-samp').classList.toggle('hidden', !samp);
    E('ops-harv').classList.toggle('hidden', !(run && run.mode === 'collector'));
    const done = samp && samp.status !== 'active';
    E('ops-retry').hidden = !(samp && (samp.status === 'snapped' || samp.status === 'burned'));
    E('ops-done').hidden = !done;
    E('ops-hold').disabled = !active;
    E('ops-msg').hidden = !banner; if (banner) { E('ops-msg').textContent = banner.t; E('ops-msg').classList.toggle('bad', !!banner.bad); }
    const m = sim.scanMap(st(), planetId);
    let lg = '';
    if (m && m.full && m.hasLife) {
      const hs = m.hotspots.filter((h) => h.revealed);
      lg = layerOn.life ? (sel ? `Hotspot ${sel.toUpperCase()} selected. Press SAMPLE.` : `${hs.length} life-sign hotspots found (green rings). Click one.`) : 'Taumoeba signature found. Open the LIFE SIGNS layer.';
      if (layerOn.life && m.band) lg += ` Taumoeba band: depth ${fmt(m.band.lo, 2)}-${fmt(m.band.hi, 2)}.`;
    } else if (m && m.full) lg = 'No life signs on this world.';
    else lg = scanning ? 'Sweeping... the scanner footprint is painting the surface.' : orb ? 'Press SCAN. The map fills in as the ship sweeps; 60%+ is a full scan.' : 'Not in orbit: fly to orbit around this planet.';
    E('ops-legend').textContent = lg;
  }

  // ---- drawing ----
  function drawMap() {
    const m = sim.scanMap(st(), planetId); if (!m) return;
    const { w, h } = m, id = mapCv.getContext('2d').createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, o = i * 4;
      let c = [9, 12, 16];
      if (m.revealed[x]) {
        c = [14, 18, 24];
        for (const [k] of LAYERS) if (layerOn[k]) {
          const v = m.layers[k][i];
          const add = k === 'thermal' ? ramp(v) : LCOL[k].map((q) => q * Math.min(1, v * (k === 'life' ? 1.5 : 1.1)));
          c = c.map((q, j) => Math.min(255, q + add[j] * (k === 'thermal' ? 0.85 : 0.9)));
        }
      } else if ((x + y) % 2 === 0) c = [14, 17, 22];
      id.data[o] = c[0]; id.data[o + 1] = c[1]; id.data[o + 2] = c[2]; id.data[o + 3] = 255;
    }
    mapCv.getContext('2d').putImageData(id, 0, 0);
    mctx.imageSmoothingEnabled = true; mctx.drawImage(mapCv, 0, 0, 320, 160);
    mctx.strokeStyle = 'rgba(160,190,210,.14)'; mctx.lineWidth = 1;
    for (let i = 1; i < 6; i++) { mctx.beginPath(); mctx.moveTo(i * 320 / 6, 0); mctx.lineTo(i * 320 / 6, 160); mctx.stroke(); }
    for (let i = 1; i < 4; i++) { mctx.beginPath(); mctx.moveTo(0, i * 40); mctx.lineTo(320, i * 40); mctx.stroke(); }
    if (m.active && m.coverage < 1) {            // sweep line
      const lon = m.lon0 + m.coverage * Math.PI * 2, x = ((((lon + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2) * 320;
      mctx.strokeStyle = 'rgba(80,220,255,.95)'; mctx.lineWidth = 2; mctx.beginPath(); mctx.moveTo(x, 0); mctx.lineTo(x, 160); mctx.stroke();
    }
    if (layerOn.life && m.full) for (const q of m.hotspots) {
      if (!q.revealed) continue;
      const x = q.x * 320, y = q.y * 160, s = q.id === sel;
      mctx.strokeStyle = s ? '#fff' : '#6fd6a6'; mctx.lineWidth = s ? 2.5 : 1.5;
      mctx.beginPath(); mctx.arc(x, y, s ? 9 : 7, 0, 7); mctx.stroke();
      mctx.fillStyle = s ? '#fff' : '#6fd6a6'; mctx.font = '10px monospace'; mctx.fillText(q.id.toUpperCase(), x + 10, y - 6);
    }
    E('ops-cov').textContent = Math.round(m.coverage * 100) + '%';
    E('ops-covbar').style.width = m.coverage * 100 + '%';
    E('ops-covmark').style.left = sim.SCAN.fullAt * 100 + '%';
  }
  function drawGauge(s, snap) {
    const W = 130, H = 250, top = 14, bot = H - 10, Y = (d) => top + d * (bot - top);
    gctx.clearRect(0, 0, W, H); gctx.fillStyle = '#070b10'; gctx.fillRect(0, 0, W, H);
    const cols = ['#142235', '#1a2336', '#3a2b24', '#2a1814'];
    sim.PROBE.layers.forEach(([n, a, b], i) => {
      gctx.fillStyle = cols[i]; gctx.fillRect(34, Y(a), W - 34, Y(b) - Y(a));
      gctx.fillStyle = '#66768a'; gctx.font = '9px sans-serif'; gctx.fillText(n, 38, Y(a) + 11);
    });
    const c = snap ? snap.bandCenter : s.bandBase, lo = c - sim.PROBE.bandHalf, hi = c + sim.PROBE.bandHalf;
    gctx.fillStyle = 'rgba(111,214,166,.3)'; gctx.fillRect(34, Y(lo), W - 34, Y(hi) - Y(lo));
    gctx.strokeStyle = '#6fd6a6'; gctx.lineWidth = 1.5; gctx.strokeRect(34, Y(lo), W - 34, Y(hi) - Y(lo));
    gctx.fillStyle = '#6fd6a6'; gctx.font = '10px sans-serif'; gctx.fillText('TARGET', 78, Y(c) + 3);
    gctx.fillStyle = '#66768a'; gctx.font = '9px monospace';
    for (let i = 0; i <= 5; i++) gctx.fillText((i / 5).toFixed(1), 2, Y(i / 5) + 3);
    gctx.fillStyle = '#b4c1cf'; gctx.fillRect(14, 4, 14, 6);                      // ship
    const d = s.depth, hot = s.heat;
    gctx.strokeStyle = hot > 0.5 ? '#ff9040' : '#cfe0ee'; gctx.lineWidth = 1.5;
    gctx.beginPath(); gctx.moveTo(21, 10); gctx.lineTo(21 + Math.sin(performance.now() / 300) * 2 * s.tension, Y(d)); gctx.stroke();
    gctx.fillStyle = hot > 0.5 ? '#ff7a30' : '#5ec4d8'; gctx.beginPath(); gctx.moveTo(21, Y(d) + 6); gctx.lineTo(15, Y(d) - 3); gctx.lineTo(27, Y(d) - 3); gctx.fill();
  }

  // ---- per frame ----
  function frame(dt, p) {
    if (p && p.id !== planetId) enter(p.id);
    // harvest
    let harvest = null;
    if (run) {
      run.t += dt;
      const prog = Math.min(1, run.t / run.dur);
      E('ops-hprog').style.width = prog * 100 + '%';
      E('ops-hnote').textContent = `${run.mode === 'skim' ? 'Skimming' : 'Collector deployed'}: ${Math.round(prog * run.plan.kg)} of ${run.plan.kg} kg, ${run.plan.days} days`;
      harvest = { progress: prog, mode: run.mode };
      if (run.t >= run.dur) finishRun();
    }
    sfx.hold('harvest', run && run.mode === 'collector' ? Math.min(1, run.t / run.dur) : false);   // collector hum, pitch climbs with progress
    const bar = $('runbar');
    if (bar) { bar.classList.toggle('hidden', !run || run.mode !== 'skim'); if (run) bar.firstElementChild.style.width = Math.min(100, run.t / run.dur * 100) + '%'; }
    if (!p) { sfx.tether(null); sfx.hold('scan', false); return { harvest }; }
    const orb = orbiting();
    phase += dt * ORBIT_RATE * (scanning ? 1.7 : 1);
    lock += ((scanning ? 1 : 0) - lock) * Math.min(1, dt * 2.5);
    const S = st(), sc = S.stars.flatMap((s) => s.planets).find((x) => x.id === planetId);
    // scan sweep
    if (scanning && orb) {
      const r = sim.scanProgress(S, planetId, dt / SCAN_SECS);
      if (!r.ok) scanning = false;
      else {
        if (r.crossed) { sfx.play('confirm'); api.afterAction(r.text); api.event('scan-full'); syncButtons(); }
        if (r.done) { scanning = false; syncButtons(); }
      }
    }
    sfx.hold('scan', scanning && orb);                              // sonar pings + data chatter while the sweep runs
    // tether
    let tether = null, mark = null; const burning = !!(run && run.mode === 'skim');
    const samp = sampling();
    if (samp) {
      const sel2 = sim.scanMap(S, planetId).hotspots.find((h) => h.id === samp.hotspotId);
      if (sel2) mark = { lat: sel2.lat, lon: sel2.lon };
      let snap;
      if (samp.status === 'active') {
        const lower = held.space || held.btn, dd = (lower ? sim.PROBE.lowerSpeed : 0) * dt - (held.r ? sim.PROBE.reelSpeed : 0) * dt;
        snap = sim.sampleStep(S, { depthDelta: dd, dt });
        if (snap.status === 'success') { banner = { t: snap.text }; sfx.play('collected'); music.stinger('triumph'); api.event('sample'); api.afterAction(snap.text); sim.endSample(S); syncButtons(); }
        else if (snap.status === 'snapped' || snap.status === 'burned') { banner = { t: snap.text, bad: true }; brokenT = 1.4; sfx.play(snap.status === 'snapped' ? 'snap' : 'burnfail'); api.afterAction(snap.text, true); syncButtons(); }
      } else snap = { depth: samp.depth, tension: samp.tension, heat: samp.heat, progress: samp.progress, bandCenter: sim.bandAt(samp, samp.t) };
      const live = sampling();
      if (live) {
        if (brokenT > 0) brokenT -= dt;
        tether = { depth: live.depth, tension: live.tension, heat: live.heat, broken: live.status !== 'active' && live.status !== 'success' && brokenT > 0 };
        if (live.status !== 'active' && brokenT <= 0 && live.status !== 'success') tether = null;
        E('ops-ten').style.width = live.tension * 100 + '%'; E('ops-heat').style.width = live.heat * 100 + '%'; E('ops-prog').style.width = live.progress * 100 + '%';
        E('ops-ten').parentNode.classList.toggle('danger', live.tension > 0.8); E('ops-heat').parentNode.classList.toggle('danger', live.heat > 0.6);
        drawGauge(live, snap);
      } else tether = null;
    } else if (sel && layerOn.life) {
      const h = sim.scanMap(S, planetId).hotspots.find((q) => q.id === sel);
      if (h) mark = { lat: h.lat, lon: h.lon };
    }
    { const lv = sampling(); sfx.tether(lv && lv.status === 'active' ? { lower: !!(held.space || held.btn), reel: !!held.r, tension: lv.tension, heat: lv.heat } : null); }   // winch / creak / sizzle
    if (scene_visible) drawMap();
    const ship = orb ? { orbitRadius: api.shipOrbitRadius(sc), inclination: 0.9, phase, burning, tether } : null;
    return {
      harvest, ship, follow: follow && orb ? camFollow : null,
      opts: { ship, scan: (scanning || lock > 0.02) && sc.scan ? { active: true, lon0: sc.scan.lon0, coverage: sc.scan.coverage, lock } : null,
        mark, harvest: harvest && harvest.mode === 'collector' ? harvest : null, follow: follow && orb ? camFollow : null },
    };
  }
  let scene_visible = false;

  // ---- keys: returns true if consumed ----
  function key(e, down) {
    if (!scene_visible) return false;
    if (e.key === ' ' && (sim_active())) { held.space = down; return true; }
    if ((e.key === 'r' || e.key === 'R') && sim_active()) { held.r = down; return true; }
    if (!down) return false;
    if ((e.key === 'f' || e.key === 'F') && orbiting()) { toggleFollow(); return true; }
    if (e.key === 'Escape' && sampling()) { sim.endSample(st()); banner = null; held = { space: false, btn: false, r: false }; syncButtons(); return true; }
    if (e.key === 'Escape' && run) { run = null; syncButtons(); return true; }
    if (e.key === 'Enter' && sampling() && !E('ops-retry').hidden) { startSample(); return true; }
    return false;
  }

  return {
    frame, key, enter, reset, syncButtons, startScan, startSample, startHarvest, toggleFollow, camFollow,
    // Debug entry for screenshots (?flow=scan|sample|harvest): put the panel into that state.
    debug(fl, params) {
      if (fl === 'scan') { startScan(planetId); const pc = +(params.get('cov') || 0.5); sim.scanProgress(st(), planetId, pc); }
      if (fl === 'sample') {
        sim.scanBegin(st(), planetId); sim.scanProgress(st(), planetId, 1); layerOn.life = true;
        const h = sim.scanMap(st(), planetId).hotspots.find((q) => q.revealed); sel = h.id; startSample();
        const target = +(params.get('depth') || 0.55); const s = st().sampling;
        for (let i = 0; i < 300 && s.depth < target; i++) sim.sampleStep(st(), { depthDelta: 0.01, dt: 0.02 });
      }
      if (fl === 'harvest') { startHarvest('collector'); if (run) run.t = run.dur * 0.55; }
    },
    setVisible(v) { scene_visible = v; if (v) syncButtons(); },
    get following() { return follow; }, get running() { return !!run; }, get layers() { return layerOn; }, get selected() { return sel; },
    get busy() { return scanning || !!run || !!sampling(); },
  };
}
