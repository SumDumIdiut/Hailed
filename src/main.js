import { perf as P } from './perf.js';
import * as sim from './sim/index.js';
import { createRenderer } from './render/index.js';
import { $, esc, row, fmt, attachOrbit } from './ui/util.js';
import { createHud } from './ui/hud.js';
import { createMap } from './ui/map.js';
import { createSystemUI } from './ui/system.js';
import { createLab } from './ui/lab.js';
import { createBlip } from './ui/blip.js';
import { createRockyBar } from './ui/rockybar.js';
import { createTutorial } from './ui/tutorial.js';
import { createJump } from './ui/jump.js';
import { createObjective } from './ui/objective.js';
import { createOps } from './ui/ops.js';
import { sfx, music, bus as audioBus } from './audio/index.js';

const SAVE_KEY = 'hailed-save';
const IDLE_DRIFT = 0.02;          // world years per real second in the system scene; 0 disables
// Camera distances are renderer world units. System dist is seeded from renderer.fitDist(star) on
// entering each system (ZOOM_START of the full fit so planets are not tiny). Closeup dist is in
// planet radii-ish units; the renderer itself scales it up for ringed planets.
const ZOOM_START = 0.95;
const SYSTEM_CAM = { yaw: 0.6, pitch: 0.4, dist: 0 };
const PLANET_CAM = { yaw: 0.5, pitch: 0.2, dist: 5.5 };
const SYSTEM_LIMITS = { min: 3, max: 600 }, PLANET_LIMITS = { min: 2.2, max: 30 }, FOLLOW_LIMITS = { min: 0.4, max: 3 };
let camStar = null;

const params = new URLSearchParams(location.search);
let state = null, scene = 'title', selectedPlanet = null, ended = false;
let renderer = null, glOk = false;
const camSys = { ...SYSTEM_CAM }, camPlanet = { ...PLANET_CAM };
const hud = createHud(sim);
const objective = createObjective(sim);
let jump = null;
const tutorial = createTutorial({ sim, getState: () => state, getScene: () => scene, getSelected: () => selectedPlanet,
  getMapSelected: () => mapView.selected, getStarRect: (id) => (id ? mapView.starRect(id) : null), getStarRects: () => (scene === 'map' ? mapView.starRects() : []), isBusy: () => !!jump && jump.active });

// ---- WebGL2 / renderer -------------------------------------------------
try {
  const probe = document.createElement('canvas');
  if (!probe.getContext('webgl2')) throw new Error('no webgl2');
  renderer = createRenderer($('gl'));
  glOk = !!renderer;
} catch (e) {
  console.error('renderer unavailable', e);
  $('nogl').classList.remove('hidden');
}

// ---- helpers -----------------------------------------------------------
const currentStar = () => state.stars.find((s) => s.id === state.ship.starId);
let toastTimer = 0;
function toast(text, bad) {
  const t = $('toast'); t.textContent = text; t.classList.toggle('bad', !!bad); t.classList.remove('hidden');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add('hidden'), 3500);
  sfx.play(bad ? 'warn' : 'toast');
}
function save() { try { localStorage.setItem(SAVE_KEY, sim.serialize(state)); } catch (_) {} }
function hasSave() { try { return !!localStorage.getItem(SAVE_KEY); } catch (_) { return false; } }
function afterAction(text, bad) {
  if (text) toast(text, bad);
  save(); hud.update(state); hud.renderLog(state); objective.update(state); checkEnd(); tutorial.update();
}
function checkEnd() {
  if (!state || ended || state.status === 'playing') return;
  ended = true;
  const won = state.status === 'won';
  music.stinger(won ? 'win' : 'lose'); if (!won) sfx.play('alarm');
  $('m-title').textContent = won ? 'TWO WORLDS SAVED' : 'MISSION FAILED';
  $('m-text').textContent = state.statusText || '';
  document.querySelector('.modal-inner').classList.toggle('lost', !won);
  $('modal').classList.remove('hidden');
}

if (params.get('notut') === '1') tutorial.suppress();
const ops = createOps({
  sim, state: () => state, afterAction, event: (n) => tutorial.on(n),
  openPlanet(id) { if (scene !== 'planet') { selectedPlanet = id; setScene('planet'); } },
  shipOrbitRadius: (p) => (renderer ? renderer.shipOrbitRadius(p) : 1.5),
});
let xfer = null;
const sysUI = createSystemUI({
  ops, sim, renderer, state: () => state, currentStar,
  selectedId: () => selectedPlanet,
  selectPlanet(id) { selectedPlanet = id; sysUI.renderSystem(); tutorial.update(); },
  hop: (id) => jump.hop(id), event: (n) => tutorial.on(n),
  openPlanet(id) { selectedPlanet = id; setScene('planet'); },
  afterAction, setScene: (s) => setScene(s),
});
const lab = createLab({ sim, state: () => state, afterAction, event: (n) => tutorial.on(n) });
const blip = createBlip({ sim, state: () => state, afterAction, event: (n) => tutorial.on(n) });
const rockybar = createRockyBar();
window.__hailed = { get state() { return state; }, sim, ops, blip, setScene: (n) => setScene(n), select: (id) => { selectedPlanet = id; } };

// ---- map ---------------------------------------------------------------
const mapView = createMap($('map'), $('tooltip'), { onSelect: renderMapPanel });
function renderMapPanel(star) {
  const p = $('panel-map');
  if (!star || scene !== 'map') { p.classList.add('hidden'); return; }
  if (jump && jump.active) return;
  p.classList.remove('hidden');
  const here = star.id === state.ship.starId;
  let h = `<h3>${esc(star.name.toUpperCase())}</h3>` + row('Class', esc(star.spectral)) +
    row('Luminosity', Math.round((star.lum0 ? star.lum / star.lum0 : 1) * 100) + '%') +
    row('Infection', Math.round(star.infection * 100) + '%', star.infection > 0.5 ? 'warn' : '');
  if (here) {
    h += '<div class="note">The Hail Mary is here.</div><div class="btns"><button class="primary small" id="go-sys">Open system view</button></div>';
  } else {
    const plan = sim.travelPlan(state, star.id);
    h += '<h4>TRAVEL PLAN</h4>' + row('Distance', fmt(plan.distanceLy, 2) + ' ly') + row('Fuel', fmt(plan.fuelKg, 0) + ' kg', plan.ok ? '' : 'warn') +
      row('Ship time', fmt(plan.shipYears, 2) + ' yr') + row('World time', fmt(plan.worldYears, 2) + ' yr', 'warn');
    if (!plan.ok) h += `<div class="res" style="border-color:var(--red)">${esc(plan.reason || 'Cannot travel')}</div>`;
    h += `<div class="btns"><button class="primary" id="engage" ${plan.ok ? '' : 'disabled'}>Spin drive: engage</button></div>`;
  }
  p.innerHTML = h; tutorial.update();
  const e = $('engage'); if (e) e.addEventListener('click', () => engage(star.id));
  const g = $('go-sys'); if (g) g.addEventListener('click', () => setScene('system'));
}
function engage(starId) { jump.confirm(starId); }

// ---- jump / transfer sequences ----
jump = createJump({
  sim, hud, state: () => state,
  fail: (reason) => afterAction(reason, true),
  hudValues: () => ({ earth: sim.extinctionYears(state, 'earth'), erid: sim.extinctionYears(state, 'erid') }),
  // Per-frame: draw the ship on the galaxy map (star jump) or the system view (transfer). null clears it.
  frame(f) {
    if (!f) { mapView.setRoute(null); sysUI.setTransfer(null); xfer = null; return; }
    if (f.kind === 'star') mapView.setRoute({ fromId: f.fromId, toId: f.toId, f: f.f });
    else { sysUI.setTransfer({ fromId: f.fromId, toId: f.toId, f: f.f }); xfer = { fromId: f.fromId, toId: f.toId, progress: f.f }; }
  },
  done(kind, id, r, run) {
    if (r.ok === false) { afterAction(r.reason, true); return; }
    if (kind === 'star') {
      tutorial.on('travel');
      selectedPlanet = null; sysUI.resetNotes(); mapView.select(null);
      const d = (x) => x.toFixed(2);
      afterAction(`Arrived at ${currentStar().name}. Ship +${d(r.shipYears)} yr, world +${d(r.worldYears)} yr, fuel -${r.fuelKg} kg.`);
      setScene('system');
    } else {
      tutorial.on('hop');
      afterAction(`In orbit around ${run.planet.name}. ${r.shipDays.toFixed(1)} days, fuel -${r.fuelKg} kg.`);
      sysUI.renderSystem(); sysUI.renderPlanet();
    }
  },
});

// ---- cameras / picking -------------------------------------------------
const gl = $('gl');
const followOn = () => scene === 'planet' && ops.following && state && state.ship.planetId === selectedPlanet;
attachOrbit(gl, () => (followOn() ? ops.camFollow : scene === 'planet' ? camPlanet : camSys),
  () => (followOn() ? FOLLOW_LIMITS : scene === 'planet' ? PLANET_LIMITS : SYSTEM_LIMITS));
gl.addEventListener('click', (e) => {
  if (scene !== 'system' || !renderer || gl._dragMoved > 4) return;
  const id = renderer.pick(e.clientX, e.clientY);
  selectedPlanet = id || null; sysUI.renderSystem();
});

// ---- scenes ------------------------------------------------------------
const PANELS = ['panel-map', 'panel-system', 'panel-planet', 'panel-ops', 'panel-lab', 'panel-blip'];
const hints = {
  map: 'Drag: rotate | Wheel: zoom | Click: select star | 1-4: stations',
  system: 'Drag: orbit | Wheel: zoom | Click planet to select',
  planet: 'Drag: look around | Wheel: distance | F: follow ship / free camera | Esc: back',
  lab: '', blip: '',
};
function seedSystemCam() {
  const star = currentStar();
  if (camStar === star.id) return;
  camStar = star.id;
  camSys.dist = renderer ? Math.round(renderer.fitDist(star) * ZOOM_START) : 0;
  if (renderer && camSys.dist < SYSTEM_LIMITS.min) camSys.dist = SYSTEM_LIMITS.min;
}
function setScene(name) {
  if (!state) return;
  if (name === 'planet' && !selectedPlanet) name = 'system';
  scene = name;
  music.setScene(name); if (name === 'system' || name === 'planet') music.setStar(currentStar());
  for (const id of PANELS) $(id).classList.add('hidden');
  $('map').classList.toggle('on', name === 'map');
  $('gl').style.visibility = name === 'map' ? 'hidden' : 'visible';
  $('tooltip').classList.add('hidden');
  document.querySelectorAll('#tabs [data-scene]').forEach((b) => b.classList.toggle('active', b.dataset.scene === (name === 'planet' ? 'system' : name)));
  $('hint').textContent = hints[name] || ''; $('hint').classList.toggle('hidden', !hints[name]);
  if (name === 'map') renderMapPanel(state.stars.find((s) => s.id === mapView.selected));
  if (name === 'system' || name === 'planet') seedSystemCam();
  if (name === 'system') { $('panel-system').classList.remove('hidden'); sysUI.renderSystem(); }
  ops.setVisible(name === 'planet');
  if (name === 'planet') { $('panel-planet').classList.remove('hidden'); $('panel-ops').classList.remove('hidden'); ops.enter(selectedPlanet); sysUI.renderPlanet(); }
  if (name === 'lab') { $('panel-lab').classList.remove('hidden'); lab.render(); }
  if (name === 'blip') { $('panel-blip').classList.remove('hidden'); blip.render(); }
  if (name !== 'system') sysUI.hideLabels();
  tutorial.update();
}

document.querySelectorAll('#tabs [data-scene]').forEach((b) => b.addEventListener('click', () => setScene(b.dataset.scene)));
$('btn-save').addEventListener('click', () => { save(); toast('Game saved.'); });
window.addEventListener('keydown', (e) => {
  if (!state) return;
  if (jump.key(e)) { e.preventDefault(); return; }
  if (e.target.tagName === 'INPUT') return;
  if (scene === 'planet' && ops.key(e, true)) { e.preventDefault(); return; }
  if (jump.active) return;
  const m = { 1: 'map', 2: 'system', 3: 'lab', 4: 'blip' }[e.key];
  if (m) setScene(m);
  else if (e.key === 'Escape') { if (scene === 'planet') setScene('system'); else if (scene === 'system' && selectedPlanet) { selectedPlanet = null; sysUI.renderSystem(); } }
});

window.addEventListener('keyup', (e) => { if (state && scene === 'planet') ops.key(e, false); });

// ---- game start --------------------------------------------------------
function startGame(s, sceneName) {
  state = s; ended = false; selectedPlanet = null; tutorial.newSession();
  $('modal').classList.add('hidden'); $('title').classList.add('hidden');
  Object.assign(camSys, SYSTEM_CAM); camStar = null; Object.assign(camPlanet, PLANET_CAM);
  ops.reset(); sysUI.resetNotes(); lab.reset(); blip.reset(); rockybar.reset(); mapView.select(null);
  hud.show(true); hud.update(state); hud.renderLog(state);
  setScene(sceneName || 'map');
}
function newGame(sceneName) { tutorial.replay(); const s = sim.createGame(1); startGame(s, sceneName); save(); } // a new game always replays the tutorial
function continueGame() {
  try { startGame(sim.deserialize(localStorage.getItem(SAVE_KEY)), 'map'); }
  catch (e) { console.error(e); toast('Save is unreadable.', true); }
}
function quit() {
  try { window.webkit.messageHandlers.hailed.postMessage('quit'); } catch (_) { window.close(); }
}
$('btn-new').addEventListener('click', () => newGame('map'));
$('btn-continue').addEventListener('click', continueGame);
$('btn-quit').addEventListener('click', quit);
$('btn-tut').addEventListener('click', () => {
  tutorial.replay();
  const b = $('btn-tut'); b.textContent = 'Tutorial reset: on'; setTimeout(() => { b.textContent = 'Replay tutorial'; }, 2500);
});
$('m-btn').addEventListener('click', () => newGame('map'));
$('btn-continue').disabled = !hasSave();

if (params.get('autostart') === '1') {
  const want = params.get('scene') || 'map';
  newGame('map');
  if (want === 'planet' || want === 'system') {
    const ps = currentStar().planets;
    selectedPlanet = (ps.find((p) => p.special === 'adrian') || ps[0] || {}).id || null;
    if (want === 'system') selectedPlanet = null;
  }
  if (params.get('flow') === '1') runFlow();
  const fl = params.get('flow');
  if (fl === 'orbit' || fl === 'scan' || fl === 'sample' || fl === 'harvest') debugFlow(fl);
  setScene(want);
  if (fl === 'scan' || fl === 'sample' || fl === 'harvest') ops.debug(fl, params);
}
function debugFlow(fl) {
  const ad = currentStar().planets.find((p) => p.special === 'adrian');
  sim.travelToPlanet(state, ad.id); selectedPlanet = ad.id;
  if (fl === 'harvest') state.ship.fuelKg = 20000;
}
// Debug: scripted playthrough (?autostart=1&flow=1) so lab/Blip-A screenshots have data in them.
function runFlow() {
  sim.craft(state, 'xenonite-lab');                             // Rocky builds the lab, like the tutorial says
  const star = currentStar();
  const adrian = star.planets.find((p) => p.special === 'adrian') || star.planets[0];
  sim.travelToPlanet(state, adrian.id);
  console.log('flow sample', JSON.stringify(sim.autoSample(state, adrian.id)));
  for (let i = 0; i < 5; i++) sim.breedStep(state, { nitrogenPct: 8 + i * 3 });
  hud.update(state); hud.renderLog(state);
}

// Debug: tutorial placement audit (?tutaudit=1, or ?tutstep=<id[@variant]> for one step held on screen). Off otherwise.
if (params.has('tutaudit') || params.has('tutstep')) {
  import('./ui/tutaudit.js').then((m) => m.start({
    sim, tutorial, params,
    h: { fresh: () => startGame(sim.createGame(1), 'map'), setScene, scene: () => scene, state: () => state, select: (id) => { selectedPlanet = id; },
      mapView, ops, jump, refresh: () => { hud.update(state); hud.renderLog(state); objective.update(state); sysUI.renderSystem(); sysUI.renderPlanet(); lab.render(); blip.render(); },
      quit },
  })).catch((e) => console.error('tutaudit failed', e));
}

// ---- adaptive quality ---------------------------------------------------
// If frames stay above ~25 ms for 2 s the render backing store shrinks (steps down to 60%); if they stay under ~11 ms for 6 s it grows
// back. Off in ?perf=1 runs unless &adapt=1 (software GL would always trip it). &quality=<0.5..1> pins the scale.
const ADAPT = !P.on || params.get('adapt') === '1';
let slowFor = 0, fastFor = 0;
function adapt(ms) {
  if (!ADAPT || !renderer || !(ms < 250) || document.hidden) { slowFor = fastFor = 0; return; }
  if (ms > 25) { slowFor += ms; fastFor = 0; } else if (ms < 11) { fastFor += ms; slowFor = 0; } else { slowFor = fastFor = 0; }
  if (slowFor > 2000 && renderer.scale > 0.6) { renderer.setScale(renderer.scale - 0.15); slowFor = 0; }
  else if (fastFor > 6000 && renderer.scale < 1) { renderer.setScale(renderer.scale + 0.1); fastFor = 0; }
}
if (params.has('quality') && renderer) renderer.setScale(+params.get('quality') || 1);

// ---- main loop ---------------------------------------------------------
let last = performance.now(), t0 = last;
function frame(now) {
  requestAnimationFrame(frame);
  P.frame();
  const dt = Math.min(0.1, (now - last) / 1000); adapt(now - last); last = now;
  if (!state) { if (renderer) { P.b('backdrop'); drawBackdrop((now - t0) / 1000); P.e('backdrop'); P.finish && P.finish(); } return; }
  const t = (now - t0) / 1000;
  P.b('sim');
  if (IDLE_DRIFT > 0 && scene === 'system' && state.status === 'playing' && !jump.active) {
    sim.tick(state, dt * IDLE_DRIFT);
  }
  P.e('sim'); P.b('ops');
  let planetFrame = {};
  if (scene === 'planet') { const ps = currentStar().planets.find((x) => x.id === selectedPlanet); planetFrame = ops.frame(dt, ps || null); }
  else planetFrame = ops.frame(dt, null);
  P.e('ops'); P.b('hud'); hud.update(state); hud.renderLog(state); P.e('hud'); P.b('objective'); objective.update(state); P.e('objective');
  P.b('rocky'); rockybar.update(state); P.e('rocky');
  P.b('tutorial'); tutorial.tick(now); P.e('tutorial');
  if (state.status !== 'playing') checkEnd();
  if (scene === 'map') { P.b('map'); mapView.draw(state, t); P.e('map'); }
  else if (renderer) {
    try {
      const star = currentStar();
      const blip = state.rocky.starId === star.id
        ? { docked: state.rocky.docked, planetId: state.rocky.planetId, starId: state.rocky.starId } : null;
      P.b('render');
      if (scene === 'planet') {
        const p = star.planets.find((x) => x.id === selectedPlanet);
        if (p) renderer.renderPlanet(p, star, t, camPlanet, { ...(planetFrame.opts || {}), blip });
      } else {
        const parkAu = sim.PARK_AU * Math.sqrt(star.lum0);
        const ship = xfer ? { transfer: { ...xfer, fromAu: parkAu }, parkAu, burning: true }
          : state.ship.planetId ? { orbitPlanetId: state.ship.planetId, parkAu } : { parkAu };
        renderer.renderSystem(star, t, camSys, { selectedId: scene === 'system' ? selectedPlanet : undefined, showOrbits: true, ship, blip,
          harvest: planetFrame.harvest ? { boost: planetFrame.harvest.progress } : null });
      }
      P.e('render'); P.finish && P.finish();
    } catch (e) { if (!frame.err) { frame.err = 1; console.error(e); } }
    if (scene === 'system') { P.b('labels'); sysUI.updateLabels(true); P.e('labels'); }
  }
}
function drawBackdrop(t) {
  try {
    if (!drawBackdrop.star) drawBackdrop.star = sim.createGame(1);
    const s = drawBackdrop.star.stars.find((x) => x.id === drawBackdrop.star.ship.starId);
    camSys.yaw = 0.4 + t * 0.05;
    renderer.renderSystem(s, t, camSys, { showOrbits: true });
  } catch (_) {}
}
if (P.on) P.gl($('gl').getContext('webgl2'));
if (params.get('audio') === '1') audioBus.ensure();   // debug: force-start audio without a click
requestAnimationFrame(frame);
window.addEventListener('resize', () => renderer && renderer.resize());
