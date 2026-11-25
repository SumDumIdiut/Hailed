// ---- Placement audit (debug only, zero effect without the URL param) ----
// Re-run it after any UI change. Needs a display (Xvfb works) and a throwaway HOME so the real save is untouched:
//   Xvfb :97 -screen 0 1920x1080x24 +extension GLX &
//   HOME=$(mktemp -d) DISPLAY=:97 LIBGL_ALWAYS_SOFTWARE=1 WEBKIT_DISABLE_DMABUF_RENDERER=1 HAILED_SIZE=1280x720 \
//     ./hailed --screenshot /tmp/x.png --delay 300 tutaudit=1          (all steps; prints "TUTAUDIT PASS|FAIL ..." lines, then quits)
//   ... tutaudit=trust,sample   limits it to those step ids
//   ... --screenshot /tmp/step.png --delay 4 tutstep=trust     holds one step on screen for a screenshot
// HAILED_SIZE=WxH sets the real viewport (the launcher also fixes the window size in --screenshot mode). The audit lives in
// ui/tutaudit.js: one scenario (or several, per scene) per step puts the game in a state where the step applies, forces the step,
// and measures the box against the target, the step's `clear` list and every control (px^2). A step PASSes with zero overlap on all.
// Per-step `clear: [selector | fn]` = the UI the step is about; place() treats it as a no-go zone (x40) next to the target (x50).
import { $, esc } from './util.js';
import { nextTarget } from './objective.js';

// Action-first walkthrough. Each box says what to do (exact button labels), why, and highlights the control.
// Action steps have `done(c)` and close themselves when the player actually does the thing; info steps use "Got it".
// Steps are checked in order and the first unseen one shows. A step whose action is already done is skipped.
// Progress is stored in localStorage 'hailed-tutorial' as { seen: {id:true}, skipped: bool }.
// The layer never blocks the game: #tut is pointer-events:none, only the box itself takes clicks.
const KEY = 'hailed-tutorial';
const MARGIN = 10, GAP = 16;
const vis = (sel) => [...document.querySelectorAll(sel)].find((e) => e.getClientRects().length) || null;
// The map draws its stars on a canvas, so a star has no element: stand in for one (rect + the bits place() asks for).
const starEl = (rect) => rect && ({ getClientRects: () => [rect], getBoundingClientRect: () => rect, closest: () => null, contains: () => false });
const block = (id) => () => { const e = $(id); return e && e.closest('.hud-block'); };

export function createTutorial({ sim, getState, getScene, getSelected = () => null, getMapSelected = () => null, getStarRect = () => null, getStarRects = () => [], isBusy = () => false }) {
  let auditHold = false, off = false, store = load(), flags = {}, active = null, cool = 0, raf = 0, lastTick = 0, placeIv = 0;
  const layer = document.createElement('div');
  layer.id = 'tut';
  layer.innerHTML = '<div class="tut-ring"></div><div class="tut-box"><span class="tut-arrow"></span>' +
    '<h5></h5><p class="do"></p><p class="why"></p><div class="tut-btns"><button class="primary small tut-ok">Got it</button>' +
    '<span class="tut-wait">Waiting for you</span><a href="#" class="tut-why-t">Why?</a><a href="#" class="tut-skip">Skip tutorial</a></div></div>';
  $('ui').appendChild(layer);
  const ring = layer.querySelector('.tut-ring'), box = layer.querySelector('.tut-box'),
    arrow = layer.querySelector('.tut-arrow'), h5 = layer.querySelector('h5'), pDo = layer.querySelector('.do'),
    pWhy = layer.querySelector('.why'), okBtn = layer.querySelector('.tut-ok'), waitEl = layer.querySelector('.tut-wait');

  function load() {
    try { const v = JSON.parse(localStorage.getItem(KEY)); if (v && typeof v === 'object') return { seen: v.seen || {}, skipped: !!v.skipped }; } catch (_) {}
    return { seen: {}, skipped: false };
  }
  function persist() { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (_) {} }

  const AD = 'tauceti-3';
  const adrian = (st) => st.stars.find((s) => s.id === 'tauceti').planets.find((p) => p.id === AD);
  const tolerant = (st) => st.lab.strains.some((s) => s.nTolerance >= 0.9 && s.population > 0);
  const yearsLeft = (st) => ({ earth: sim.extinctionYears(st, 'earth'), erid: sim.extinctionYears(st, 'erid') });
  const gotTaumoeba = (st) => st.ship.samples > 0 || st.lab.strains.length > 0;
  const inSys = (c) => c.scene === 'system' || c.scene === 'planet';
  const dest = (c) => { const t = nextTarget(sim, c.st); return t && c.st.stars.find((s) => s.id === t); };
  const destPlanet = (c) => { const d = dest(c); return d && d.planets.find((p) => p.special === 'earth' || p.special === 'erid'); };
  const WORLDNAME = { eri40: 'Erid', sol: 'Earth' };
  const atDest = (c) => { const d = dest(c); return !!d && c.st.ship.starId === d.id; };

  // Order matters. Warnings first, then the guided route from "what is going on" to "win".
  const STEPS = [
    { id: 'warn-years', clear: ['#h-earth-b', '#h-erid-b'], title: 'Countdown under 5 years',
      do: 'Deliver Taumoeba to the world with the smaller number first.', why: 'A world that reaches T- 0 is lost for good, and every trip, scan and chat uses up years.',
      when: (c) => { const y = yearsLeft(c.st); return y.earth < 5 || y.erid < 5; },
      target: (c) => { const y = yearsLeft(c.st); return block(y.erid < y.earth ? 'h-erid' : 'h-earth')(); } },
    { id: 'warn-hull', clear: [block('h-hull')], title: 'Hull integrity low',
      do: 'Open BLIP-A (4). Fix hull and accept his offer.', why: 'Below 20% the spin drive refuses to fly. Needs 25% trust and 2000 kg fuel.',
      when: (c) => c.st.ship.hull < 0.4, target: block('h-hull') },
    { id: 'warn-risk', clear: ['#panel-lab .risk', '#tabs'], title: 'Escape risk is climbing',
      do: 'Open BLIP-A (4). Build the Xenonite lab to contain escape risk.', why: 'Tough Taumoeba can eat through the hull. A breach cracks the hull and wipes your strains.',
      when: (c) => c.st.lab.escapeRisk > 0.25 && !c.st.ship.upgrades.includes('xenonite-lab'),
      target: (c) => (c.scene === 'lab' ? vis('#panel-lab .risk') : vis('#tabs [data-scene="blip"]')) },
    { id: 'low-fuel', clear: [block('h-fuel'), '#objective'], title: 'Running low on fuel',
      do: 'Low fuel? Gather at the Petrova planet for Astrophage fuel, or HARVEST.', why: 'Interstellar jumps burn tens of thousands of kg. Astrophage is fuel: gather it.',
      when: (c) => c.st.ship.fuelKg / c.st.ship.fuelMaxKg < 0.3, target: block('h-fuel') },

    // ---- the briefing ----
    { id: 'stakes', clear: ['#h-earth-b', '#h-erid-b'], title: 'Your enemy is Astrophage',
      do: 'There is no combat. Astrophage is eating the starlight. When Earth or Erid reaches T- 0, it is lost.',
      why: 'These two countdowns are your health bars. You win by saving both.',
      when: () => true, target: () => $('h-earth-b') },
    { id: 'weapon', clear: [block('h-world')], title: 'Taumoeba is your weapon',
      do: 'Find Taumoeba, breed it until it survives 90% nitrogen, then release it at Earth and at Erid.',
      why: 'Time is your real resource: every trip, scan, chat and breed spends years while Astrophage keeps growing.',
      when: (c) => c.seen.stakes, target: block('h-world') },
    { id: 'controls', clear: ['#tabs'], title: 'Controls',
      do: 'Drag to rotate, wheel to zoom, click to select. Keys 1-4 switch NAV / SYSTEM / LAB / BLIP-A. Esc goes back or skips a burn.',
      why: 'You can also click the tabs at the top left of the dashboard.', when: (c) => c.seen.weapon, target: () => $('tabs') },
    { id: 'objective', clear: ['#objective'], title: 'Follow the objective bar',
      do: 'The OBJECTIVE bar always shows your next action. Do what it says.', why: 'It updates as you play, including when fuel or hull needs attention.',
      when: (c) => c.seen.controls, target: () => $('objective') },

    // ---- stage 1: get Taumoeba ----
    { id: 'go-system', clear: ['#tabs'], title: 'Go to the system view',
      do: 'Press SYSTEM (or key 2).', why: 'Tau Ceti itself is not dying. Something on a planet here eats Astrophage.',
      when: (c) => c.st.ship.starId === 'tauceti' && !gotTaumoeba(c.st) && c.scene === 'map', scene: ['map'],
      done: (c) => inSys(c), target: () => vis('#tabs [data-scene="system"]') },
    { id: 'pick-adrian', clear: ['#panel-system .plist'], title: 'Select Adrian',
      do: 'Click Adrian in the PLANETS list, or click the planet.', why: 'Adrian has a thick orange atmosphere. That is where the Taumoeba live.',
      when: (c) => inSys(c) && c.st.ship.starId === 'tauceti' && !gotTaumoeba(c.st), scene: ['system', 'planet'],
      done: (c) => c.selected === AD, target: () => vis('#panel-system [data-p="' + AD + '"]') },
    { id: 'hop', clear: ['#panel-system:not(.hidden)', '#panel-planet:not(.hidden)'], title: 'Fly to orbit',
      do: 'Press FLY TO ORBIT.', why: 'You can only sample from orbit. The transfer costs fuel and a few days, shown above the button.',
      when: (c) => inSys(c) && c.selected === AD && c.st.ship.starId === 'tauceti' && !gotTaumoeba(c.st), scene: ['system', 'planet'],
      done: (c) => c.st.ship.planetId === AD, target: () => vis('[data-a="hop"]') },
    { id: 'scan', clear: ['#panel-system:not(.hidden)', '#panel-planet:not(.hidden)', '#ops-scan', '#ops-map', '#ops-cov'], title: 'Scan Adrian',
      do: 'Press SCAN, then wait until the sweep passes 60% (the planet paints over as the ship circles).', why: 'A sweep from orbit is a full scan: the spectrometer map fills in and finds the Taumoeba signature. From far away it can not.',
      when: (c) => inSys(c) && c.st.ship.planetId === AD && adrian(c.st).scanLevel < 2 && !gotTaumoeba(c.st), scene: ['system', 'planet'],
      done: (c) => adrian(c.st).scanLevel >= 2, target: () => vis('[data-a="scan"]') },
    { id: 'life-layer', clear: ['#ops-map', '.ops-layers', '#ops-legend'], title: 'Find the Taumoeba',
      do: 'In the scan panel press LIFE SIGNS, then click a green hotspot ring on the map.', why: 'Taumoeba cluster in hotspots. Each one has an altitude band where they live.',
      when: (c) => c.scene === 'planet' && c.st.ship.planetId === AD && adrian(c.st).scanLevel >= 2 && !gotTaumoeba(c.st), scene: ['planet'],
      done: (c) => !!c.flags.hotspot || !!c.st.sampling, target: () => $('ops-layer-life') },
    { id: 'sample', clear: ['#ops-samp', '#ops-map', '#ops-btns'], title: 'Take a sample with the tether probe',
      do: 'Press SAMPLE, then hold SPACE to lower the chain into the green band. Release to hold, R to reel in. Keep it in the band until the sample meter fills.',
      why: 'Tension climbs with depth and gusts; heat climbs fast below the band. A snapped or burned chain costs hull and a day, and you can retry.',
      when: (c) => c.scene === 'planet' && c.st.ship.planetId === AD && adrian(c.st).scanLevel >= 2 && !gotTaumoeba(c.st) && (!!c.flags.hotspot || !!c.st.sampling), scene: ['planet'],
      done: (c) => gotTaumoeba(c.st), target: () => vis('#ops-samp') || $('ops-sample') },
    { id: 'follow', clear: ['#ops-btns'], title: 'Follow the ship',
      do: 'Press F to switch between the chase camera and the free orbit camera. Drag to look around, wheel for distance.', why: 'In orbit the camera follows the Hail Mary by default.',
      when: (c) => c.scene === 'planet' && c.st.ship.planetId === c.selected, scene: ['planet'], target: () => $('ops-follow') },

    // ---- stage 2: breed ----
    { id: 'go-lab', clear: ['#tabs'], title: 'Breed it tougher',
      do: 'Press LAB (or key 3).', why: 'Wild Taumoeba dies in a star\'s nitrogen-rich air. You need a strain that tolerates 90%.',
      when: (c) => c.st.lab.strains.length > 0 && c.st.lab.bestTolerance < 0.9 && c.scene !== 'lab' && c.st.lab.generations === 0, 
      done: (c) => c.scene === 'lab', target: () => vis('#tabs [data-scene="lab"]') },
    { id: 'breed', clear: ['#lab-n', '#lab-nv', '#lab-breed', '#lab-chart', '#panel-lab .strain'], title: 'Run a generation',
      do: (c) => `Set the nitrogen slider to about ${Math.min(100, Math.round(c.st.lab.bestTolerance * 100 + 10))}%, then press BREED GENERATION. Repeat.`,
      why: 'About 10% above your current tolerance works. Too low learns nothing, too high kills the culture. Each run costs fuel and days.',
      when: (c) => c.scene === 'lab' && c.st.lab.strains.length > 0 && c.st.lab.generations === 0, scene: ['lab'],
      done: (c) => c.st.lab.generations >= 1, target: () => $('lab-breed') },
    { id: 'lab-risk', clear: ['#panel-lab .risk'], title: 'Watch the escape risk',
      do: 'Keep an eye on the ESCAPE RISK bar.', why: 'Tougher Taumoeba may eat the hull. Rocky can craft a Xenonite lab that removes the risk.',
      when: (c) => c.scene === 'lab' && c.st.lab.generations >= 1, scene: ['lab'], target: () => vis('#panel-lab .risk') },

    // ---- BLIP-A steps (new) ----
    { id: 'blip-intro', clear: ['#tabs'], title: 'BLIP-A: Rocky\'s ship',
      do: 'Press BLIP-A (tab 4). Rocky\'s ship is docked to yours by the xenonite tunnel.', why: 'BLIP-A shows Rocky\'s dock state, location, missions, materials and crafting list.',
      when: (c) => c.scene !== 'blip', target: () => vis('#panel-blip') },
    { id: 'blip-build-lab', clear: ['#blip-craft'], title: 'Build the Xenonite lab',
      do: 'Press BUILD on a craft recipe.', why: 'The Xenonite lab removes Taumoeba escape risk. It costs 2 minerals and 1 silicate.', when: (c) => c.scene === 'blip' && !c.st.ship.upgrades.includes('xenonite-lab'),
      target: () => vis('#blip-craft .small:not(.on)') },
    { id: 'blip-gather', clear: ['#blip-gather'], title: 'Send Rocky to gather',
      do: 'Press GO on a planet to send Rocky on a gather mission.', why: 'Rocky mines materials from the planet. Lava planets give minerals, ice planets give volatiles.', when: (c) => c.scene === 'blip',
      target: () => vis('#blip-gather .go:not([disabled])') },
    { id: 'blip-wait', clear: ['#blip-wait'], title: 'Wait for Rocky',
      do: 'Press WAIT FOR ROCKY to wait until his mission finishes.', why: 'When Rocky is away on a mission, use this to wait for him to return and dock automatically.', when: (c) => c.scene === 'blip' && c.st.rocky && !c.st.rocky.docked && !!c.st.rocky.mission, target: () => vis('#blip-wait') },

    // ---- stage 3 and 4: deliver ----
    { id: 'tolerance', clear: ['#tabs'], title: 'Tolerance 90%: weapon ready',
      do: (c) => `Go to ${WORLDNAME[nextTarget(sim, c.st)]} first. Press NAV (or key 1).`, why: 'The world with the smaller countdown must be saved first.',
      when: (c) => tolerant(c.st) && !!nextTarget(sim, c.st) && !atDest(c) && c.scene !== 'map',
      done: (c) => c.scene === 'map' || atDest(c), target: () => vis('#tabs [data-scene="map"]') },
    { id: 'engage', clear: ['#panel-map', '#engage', () => starEl(getStarRect((dest(ctx()) || {}).id)), () => starEl(getStarRect(ctx().st.ship.starId))], title: 'Fly there',
      do: (c) => { const d = dest(c); return 'Click ' + (d ? d.name : 'the star') + ' on the map, then press SPIN DRIVE: ENGAGE.'; },
      why: 'The confirm sheet shows fuel, ship years and world years before you commit. Esc or Space skips the burn animation.',
      when: (c) => tolerant(c.st) && !!nextTarget(sim, c.st) && !atDest(c) && c.scene === 'map', scene: ['map'],
      done: (c) => atDest(c), target: (c) => $('engage') || starEl(getStarRect((dest(c) || {}).id)) || $('map') },
    { id: 'deliver-orbit', clear: ['#panel-system', '#panel-planet:not(.hidden)'], title: 'Enter orbit',
      do: (c) => { const p = destPlanet(c); return 'Click ' + (p ? p.name : 'the world') + ', then press FLY TO ORBIT.'; },
      why: 'Taumoeba must be released from orbit. Open SYSTEM (2) if you are not there.',
      when: (c) => tolerant(c.st) && atDest(c) && c.st.ship.planetId !== (destPlanet(c) || {}).id && inSys(c), scene: ['system', 'planet'],
      done: (c) => c.st.ship.planetId === (destPlanet(c) || {}).id,
      target: (c) => vis('[data-a="hop"]') || vis('#panel-system [data-p="' + (destPlanet(c) || {}).id + '"]') },
    { id: 'deliver', clear: ['#panel-system'], title: 'Release the Taumoeba',
      do: 'Press RELEASE TAUMOEBA.', why: 'The Astrophage there will start to recede and the countdown stops falling.',
      when: (c) => tolerant(c.st) && atDest(c) && c.st.ship.planetId === (destPlanet(c) || {}).id && c.scene === 'system', scene: ['system'],
      done: (c) => !!c.st.delivered[c.st.ship.starId], target: () => vis('#panel-system [data-d="deliver"]') },
    { id: 'first-delivery', title: 'It worked',
      do: (c) => (c.st.delivered.sol && c.st.delivered.eri40 ? 'Both worlds are safe.' : c.st.delivered.eri40 ? 'One world down. Now take it to Sol.' : 'One world down. Now take it to 40 Eridani.'),
      why: 'Follow the OBJECTIVE bar for the last trip.', when: (c) => (c.st.delivered.sol || c.st.delivered.eri40) && c.st.status === 'playing' },

    // ---- explanations that fire after something happened ----
    { id: 'relativity', clear: [block('h-world'), block('h-ship')], title: 'Two clocks',
      do: 'WORLD clock is time at home; SHIP clock is how long you age.', why: 'Going fast makes your clock slower. A long jump costs you less than it costs them, and Astrophage grows during all of it.',
      when: (c) => c.flags.travel, target: block('h-world') },
    { id: 'costs', clear: [block('h-fuel')], title: 'Everything costs something',
      do: 'Read the cost under each button before pressing it.', why: 'In-system hops burn a few hundred kg. Scans, sampling, talking and breeding each burn a little fuel and a few days.',
      when: (c) => c.st.ship.fuelKg < c.st.ship.fuelMaxKg - 100 && c.seen.weapon, target: block('h-fuel') },
    { id: 'irony', clear: [block('h-fuel')], title: 'Infected stars are fuel mines',
      do: 'The more Astrophage a star has, the more fuel you can harvest per day. The thing killing Earth is also what fills your tanks.', why: 'Tau Ceti is barely infected, so it is safe but yields little. A badly infected star pays far more.',
      when: (c) => c.flags.harvest, target: block('h-fuel') },
    { id: 'orbit-here', clear: [block('h-loc')], title: 'You are in orbit',
      do: 'Your orbit shows under POSITION in the top bar and as a marker in the system view.', why: 'Sampling and releasing only work while you orbit the right planet. Leaving the system resets you to parking orbit.',
      when: (c) => c.flags.hop, target: block('h-loc') },
  ];

  function ctx() { return { st: getState(), scene: getScene(), flags, seen: store.seen, selected: getSelected(), mapSelected: getMapSelected() }; }
  const resolve = (v, a) => (typeof v === 'function' ? v(a) : v);

  function update() {
    const st = getState();
    if (auditHold) return;
    if (!st || off || store.skipped || st.status !== 'playing' || !$('title').classList.contains('hidden') || isBusy()) { hide(); return; }
    const c = ctx();
    if (active) {
      let finished = false;
      try { finished = !!(active.done && active.done(c)); } catch (_) {}
      if (finished) { dismiss(true, 350); return; }
      if (active.scene && !active.scene.includes(c.scene)) hide();
      return;
    }
    if (performance.now() < cool) return;
    for (const s of STEPS) {
      if (store.seen[s.id]) continue;
      let ok = false;
      try { ok = s.when(c); } catch (_) {}
      if (!ok) continue;
      let already = false;
      try { already = !!(s.done && s.done(c)); } catch (_) {}
      if (already) { store.seen[s.id] = true; persist(); continue; }
      show(s, c); return;
    }
  }

  // Typewriter reveal: the "Do this" text types in (about 90 chars/s), then the "Why" line. The final HTML is restored at the end.
  let typing = null;
  function startType() {
    typing = { t0: performance.now(), doHtml: pDo.innerHTML, doText: pDo.textContent, why: pWhy.textContent };
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) { finishType(); return; }
    pDo.textContent = ''; pWhy.textContent = '';
    box.classList.add('typing');
  }
  function finishType() {
    if (!typing) return;
    pDo.innerHTML = typing.doHtml; pWhy.textContent = typing.why;
    box.classList.remove('typing'); box.classList.add('show-why');
    typing = null;
  }
  function stepType() {
    if (!typing) return;
    const n = Math.floor((performance.now() - typing.t0) / 1000 * 90), total = typing.doText.length;
    if (n >= total + typing.why.length) { finishType(); return; }
    pDo.textContent = typing.doText.slice(0, Math.min(n, total));
    pWhy.textContent = n > total ? typing.why.slice(0, n - total) : '';
  }
  function show(s, c) {
    active = s; typing = null; box.classList.remove('typing', 'show-why'); mode = 0; solveKey = ''; lastPlace = null; placedFor = null;
    h5.textContent = s.title;
    const act = !!s.done;
    pDo.innerHTML = (act ? '<b>Do this:</b> ' : '') + esc(resolve(s.do, c));
    pWhy.textContent = s.why ? (act ? 'Why: ' : '') + resolve(s.why, c) : '';
    pWhy.style.display = s.why ? '' : 'none';
    okBtn.style.display = act ? 'none' : ''; waitEl.style.display = act ? '' : 'none';
    layer.classList.remove('gone');
    box.classList.remove('on'); ring.classList.remove('on');
    place();
    requestAnimationFrame(() => { box.classList.add('on'); startType(); cancelAnimationFrame(raf); loop(); });
    cancelAnimationFrame(raf); raf = 0;
    clearInterval(placeIv); placeIv = setInterval(() => { if (active) place(); }, 150);
  }
  function loop() { raf = 0; if (!active || !typing) return; raf = requestAnimationFrame(loop); stepType(); }
  let hideT = 0;
  function hide() {
    if (!active) return;
    active = null;
    cancelAnimationFrame(raf); raf = 0; clearInterval(placeIv); placeIv = 0;
    hideT = setTimeout(() => { if (!active) layer.classList.add('gone'); }, 300);
  }
  function dismiss(markSeen, coolMs = 700) {
    if (active && markSeen) { store.seen[active.id] = true; persist(); }
    hide(); cool = performance.now() + coolMs;
  }

  // ---- placement ----
  const CTL = 'button, input, select, textarea, canvas, .tok, .glyph, .gauge, .bar, .meter, .ops-bar, .risk, .arc, .decay, .hud-block, ' +
    '#cm-ctx, #cm-sub, .cm-offer, .cm-stat, .plist, .strain, .rep, .bt, .cm-ask, .note, .res, .cm-empty, #tabs, #objective, #log div, #hint, .panel h4';
  const elsOf = (list) => {
    const out = [];
    for (const q of list || []) {
      let els = [];
      try { const v = typeof q === 'function' ? q() : q; els = typeof v === 'string' ? [...document.querySelectorAll(v)] : v ? [].concat(v) : []; } catch (_) {}
      for (const e of els) if (e && e.getClientRects && e.getClientRects().length && !(e instanceof Node && layer.contains(e))) {
        const r = e.getBoundingClientRect(); if (r.width > 0 && r.height > 0) out.push(e);
      }
    }
    return out;
  };
  const rectsOf = (list) => elsOf(list).map((e) => e.getBoundingClientRect());
  const controlRects = () => {
    const vw = innerWidth, vh = innerHeight;
    return [...document.querySelectorAll(CTL)].filter((el) => !layer.contains(el) && el.getClientRects().length)
      .map((el) => ({ q: el.getBoundingClientRect(), cv: el.tagName === 'CANVAS' })).filter((o) => o.q.width > 0 && o.q.height > 0 && o.q.width * o.q.height < vw * vh * 0.35)
      .concat(getStarRects().map((q) => ({ q, cv: false, star: true })));
  };
  const overlap = (px, py, bw, bh, q) => Math.max(0, Math.min(px + bw, q.right) - Math.max(px, q.left)) * Math.max(0, Math.min(py + bh, q.bottom) - Math.max(py, q.top));
  let obsDirty = true, obsAt = 0, obs = [], obsKey = '', solveKey = '', solved = null;
  const rk = (q) => q ? Math.round(q.left) + ',' + Math.round(q.top) + ',' + Math.round(q.width) + ',' + Math.round(q.height) : '-';
  const QUIET = '#hud, #objective, #log, #toast, #tooltip, #audio-pop';
  const watch = new MutationObserver((ms) => { if (ms.some((m) => { const t = m.target; return !layer.contains(t) && !(t.closest && t.closest(QUIET)); })) obsDirty = true; });
  watch.observe($('ui'), { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden'] });
  let mode = 0, lastPlace = null, placedFor = null;

  const solve = function(g, bw, bh) {
    const { r, pr, vw, vh, cx, cy, clr } = g;
    const clampY = (py) => Math.max(MARGIN, Math.min(vh - bh - MARGIN, py));
    const clampX = (px) => Math.max(MARGIN, Math.min(vw - bw - MARGIN, px));
    const inView = (px, py) => px >= MARGIN && px + bw <= vw - MARGIN && py >= MARGIN && py + bh <= vh - MARGIN;
    const cands = [];
    if (r) {
      if (pr && pr.width < vw * 0.7) {
        cands.push(['right', pr.right + GAP, clampY(cy - bh / 2)], ['left', pr.left - GAP - bw, clampY(cy - bh / 2)]);
        if (pr.height < vh * 0.7) cands.push(['below', clampX(cx - bw / 2), pr.bottom + GAP], ['above', clampX(cx - bw / 2), pr.top - GAP - bh]);
      }
      cands.push(['below', clampX(cx - bw / 2), r.bottom + GAP], ['above', clampX(cx - bw / 2), r.top - GAP - bh],
        ['right', r.right + GAP, clampY(cy - bh / 2)], ['left', r.left - GAP - bw, clampY(cy - bh / 2)]);
    }
    cands.push([null, vw - bw - MARGIN, vh - bh - 44], [null, MARGIN, vh - bh - 44], [null, vw - bw - MARGIN, MARGIN + 140], [null, MARGIN, MARGIN + 140]);
    let best = null;
    const run = (list, base) => list.forEach(([sd, px0, py0, grid], i0) => { const i = base + i0;
      const px = Math.round(px0), py = Math.round(py0);
      if (!inView(px, py)) return;
      const tgt = r ? overlap(px, py, bw, bh, r) : 0;
      let cl = 0; for (const q of clr) cl += overlap(px, py, bw, bh, q);
      let ct = 0, cv = 0; for (const o of obs) { const a = overlap(px, py, bw, bh, o.q); if (o.cv) cv += a; else ct += a; }
      let sc = tgt * 50 + cl * 40 + ct * 60 + cv * 0.05 + (pr && pr.width < vw * 0.7 && px < pr.right && px + bw > pr.left && py < pr.bottom && py + bh > pr.top ? bw * bh * 0.5 : 0) + i * 0.01;
      if (grid && r) sc += Math.hypot(px + bw / 2 - cx, py + bh / 2 - cy) * 2 + 800;
      if (lastPlace && lastPlace.sd === sd && Math.abs(lastPlace.px - px) < 2 && Math.abs(lastPlace.py - py) < 2) sc -= 400;
      if (!best || sc < best.sc) best = { sc, sd, px, py, tgt, cl, ct, cv };
    });
    run(cands, 0);
    if (!best || !r || best.sc >= 800) {
      const grid = [];
      for (let gy = MARGIN; gy <= vh - bh - MARGIN; gy += 12) for (let gx = MARGIN; gx <= vw - bw - MARGIN; gx += 24) grid.push([null, gx, gy, true]);
      run(grid, cands.length);
    }
    return best;
  };

  const place = function() {
    const c = ctx();
    let t = null;
    try { t = resolve(active.target, c); } catch (_) {}
    if (t && placedFor !== active) {
      placedFor = active;
      try { if (t.scrollIntoView) t.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (_) {}
    }
    const r = t && t.getBoundingClientRect();
    const has = !!(r && r.width > 0 && r.height > 0);
    const now = performance.now();
    if ((obsDirty && now - obsAt > 250) || now - obsAt > 600) {
      if (obsDirty) mode = 0;
      obsDirty = false; obsAt = now; obs = controlRects(); obsKey = obs.map((o) => rk(o.q)).join(';');
    }
    const vw = innerWidth, vh = innerHeight;
    const host = has ? t.closest('.panel, .screen, .modal, #deck') : null;
    const g = { r: has ? r : null, vw, vh, cx: has ? r.left + r.width / 2 : 0, cy: has ? r.top + r.height / 2 : 0,
      pr: host && host !== t ? host.getBoundingClientRect() : null, clr: rectsOf(resolve(active.clear, c)) };
    const setMode = (m) => { box.classList.toggle('compact', m > 0); box.classList.toggle('wide', m === 2); };
    setMode(mode);
    const key = [active.id, mode, box.offsetWidth, box.offsetHeight, vw, vh, rk(g.r), rk(g.pr), g.clr.map(rk).join(';'), obsKey].join('|');
    let best;
    if (key === solveKey && solved) best = solved.best;
    else {
      best = solve(g, box.offsetWidth, box.offsetHeight);
      const bad = (b) => !b || b.tgt > 0 || b.cl > 0 || b.ct > 0;
      if (bad(best) && mode === 0) {
        let bm = 0;
        for (const m of [1, 2]) {
          setMode(m);
          const b2 = solve(g, box.offsetWidth, box.offsetHeight);
          if (b2 && (!best || b2.sc < best.sc)) { best = b2; bm = m; }
        }
        mode = bm; setMode(bm);
      }
      solveKey = [active.id, mode, box.offsetWidth, box.offsetHeight, vw, vh, rk(g.r), rk(g.pr), g.clr.map(rk).join(';'), obsKey].join('|'); solved = { best };
    }
    const bw = box.offsetWidth, bh = box.offsetHeight;
    let x, y, side = null;
    if (best) { x = best.px; y = best.py; side = best.sd; lastPlace = best; } else { x = vw - bw - 14; y = vh - bh - 44; lastPlace = null; }
    box.dataset.side = side || 'none';
    const L = Math.round(x) + 'px', T = Math.round(y) + 'px';
    if (box._L !== L) { box._L = L; box.style.left = L; }
    if (box._T !== T) { box._T = T; box.style.top = T; }
    if (has) {
      const rs = 'left:' + (r.left - 5) + 'px;top:' + (r.top - 5) + 'px;width:' + (r.width + 10) + 'px;height:' + (r.height + 10) + 'px';
      if (ring._s !== rs) { ring._s = rs; ring.style.cssText = rs; }
      ring.classList.add('on');
      if (side) {
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        const along = (side === 'below' || side === 'above') ? Math.max(14, Math.min(bw - 14, cx - x)) : Math.max(14, Math.min(bh - 14, cy - y));
        const as = (side === 'below' || side === 'above') ? 'left:' + (along - 6) + 'px;' : 'top:' + (along - 6) + 'px;';
        if (arrow._s !== as) { arrow._s = as; arrow.style.cssText = as; }
        const dx = Math.max(r.left - (x + bw), x - r.right, 0), dy = Math.max(r.top - (y + bh), y - r.bottom, 0);
        box.dataset.side = Math.hypot(dx, dy) > 60 ? 'none' : side;
      }
    } else ring.classList.remove('on');
  };

  layer.querySelector('.tut-why-t').addEventListener('click', (e) => { e.preventDefault(); box.classList.toggle('show-why'); });
  layer.querySelector('.tut-ok').addEventListener('click', () => dismiss(true));
  layer.querySelector('.tut-skip').addEventListener('click', (e) => { e.preventDefault(); store.skipped = true; persist(); dismiss(false); });
  window.addEventListener('resize', () => active && place());
  layer.classList.add('gone');

  // ---- audit ----
  const AUDIT = new URLSearchParams(location.search).has('tutaudit') || new URLSearchParams(location.search).has('tutstep');
  const audit = !AUDIT ? null : {
    ids: () => STEPS.map((s) => s.id),
    force(id) {
      const s = STEPS.find((x) => x.id === id); if (!s) return false;
      auditHold = true; active = null; clearTimeout(hideT); show(s, ctx()); return true;
    },
    release() { auditHold = false; hide(); },
    measure() {
      if (!active) return null;
      obsDirty = true; place();
      const c = ctx(), vw = innerWidth, vh = innerHeight;
      const bx = { left: box.offsetLeft, top: box.offsetTop, right: box.offsetLeft + box.offsetWidth, bottom: box.offsetTop + box.offsetHeight };
      const ov = (q) => Math.max(0, Math.min(bx.right, q.right) - Math.max(bx.left, q.left)) * Math.max(0, Math.min(bx.bottom, q.bottom) - Math.max(bx.top, q.top));
      let t = null; try { t = resolve(active.target, c); } catch (_) {}
      const tr = t && t.getBoundingClientRect();
      const clrEls = elsOf(resolve(active.clear, c)), tgt = tr && tr.width > 0 ? ov(tr) : 0;
      let clr = 0; for (const e of clrEls) clr += ov(e.getBoundingClientRect());
      let ctl = 0, cvs = 0, who = '', wa = 0;
      const known = [t, ...clrEls].filter(Boolean);
      for (const e of document.querySelectorAll(CTL)) {
        if (layer.contains(e) || !e.getClientRects().length) continue;
        const q = e.getBoundingClientRect();
        if (q.width * q.height >= vw * vh * 0.35 || known.some((k) => k instanceof Node && (k.contains(e) || e.contains(k)))) continue;
        if (e.tagName === 'CANVAS') cvs += ov(q); else { const a = ov(q); ctl += a; if (a > wa) { wa = a; who = e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (e.className && e.className.baseVal === undefined ? '.' + String(e.className).trim().replace(/\s+/g, '.') : ''); } }
      }
      for (const q of getStarRects()) { const a = ov(q); if (a > 0) { ctl += a; if (a > wa) { wa = a; who = 'map-star'; } } }
      const inView = bx.left >= 0 && bx.top >= 0 && bx.right <= vw && bx.bottom <= vh;
      const ok = (!active.target || !!tr) && tgt === 0 && clr === 0 && ctl === 0 && inView;
      return { id: active.id, scene: getScene(), side: box.dataset.side, compact: box.classList.contains('wide') ? 2 : box.classList.contains('compact') ? 1 : 0, box: [bx.left, bx.top, box.offsetWidth, box.offsetHeight],
        hasTarget: !!tr, tgt: Math.round(tgt), clr: Math.round(clr), ctl: Math.round(ctl), who, cvs: Math.round(cvs), inView, pass: ok };
    },
  };

  return {
    audit,
    on(name) { flags[name] = true; update(); },
    update,
    tick(nowMs) { if (nowMs - lastTick > 600) { lastTick = nowMs; update(); } },
    newSession() { flags = {}; hide(); cool = performance.now() + 500; },
    replay() { store = { seen: {}, skipped: false }; persist(); flags = {}; hide(); },
    skip() { store.skipped = true; persist(); hide(); },
    suppress() { off = true; hide(); },
    get skipped() { return store.skipped; },
  };
}

