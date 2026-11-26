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

// Prologue walkthrough: at most eight short boxes, driven by sim.prologueStep(state).
// Action boxes close themselves when the step changes; info boxes use "Got it". Warnings stay in every act.
// Steps are checked in order and the first unseen one shows. Progress is stored in localStorage
// 'hailed-tutorial' as { seen: {id:true}, skipped: bool }.
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

  // The prologue flag distinguishes a prologue game from an old Act I save. A skipped game can keep
  // the flag ("as if completed"), so main.js marks it. Before the sim lands, stepOf() stays quiet.
  // If the sim advances the act from inside prologueStep, act II still allows the completion box.
  const stepOf = (st) => {
    if (!st || !st.campaign || !st.campaign.prologue || st.campaign.uiSkipPrologue
      || typeof sim.prologueStep !== 'function') return null;
    let s = null;
    try { s = sim.prologueStep(st); } catch (_) { return null; }
    if ((st.campaign.act ?? 1) === 1) return s;
    return s === 'done' ? s : null;
  };
  const onStep = (id) => (c) => stepOf(c.st) === id;
  const leftStep = (id) => (c) => { const s = stepOf(c.st); return !!s && s !== id; };
  const inSys = (c) => c.scene === 'system' || c.scene === 'planet';

  // Warnings first, then the eight prologue boxes in step order.
  const STEPS = [
    { id: 'warn-hull', title: 'Hull integrity low',
      do: 'Keep the hull above 20% or the spin drive refuses to fly.',
      when: (c) => c.st.ship.hull < 0.4, target: block('h-hull') },
    { id: 'low-fuel', title: 'Running low on fuel',
      do: 'HARVEST Astrophage at the Petrova planet to refill the tank.',
      when: (c) => c.st.ship.fuelKg / c.st.ship.fuelMaxKg < 0.3, target: block('h-fuel') },

    { id: 'welcome', title: 'Prologue',
      do: 'Astrophage eats the stars. Save Earth and Erid. Rocky built a xenonite lab on the way.',
      why: 'No escape risk in the prologue.',
      when: (c) => stepOf(c.st) === 'scan' && !store.seen.welcome,
      target: () => $('h-earth-b') },
    { id: 'scan', title: 'Scan Adrian',
      do: (c) => inSys(c) ? 'Press SCAN, then hold SPACE to sweep (3× faster here).' : 'Open SYSTEM (2), select Adrian, then press SCAN.',
      why: 'A full sweep reveals the Taumoeba.',
      when: onStep('scan'), done: leftStep('scan'),
      target: (c) => vis('[data-a="scan"]') || vis('#ops-scan') || vis('#tabs [data-scene="system"]') },
    { id: 'sample', title: 'Take a sample',
      do: 'LIFE SIGNS → click a green hotspot → SAMPLE. Hold SPACE in the band; R to reel in.',
      why: 'Fill the sample meter to seed the strain.',
      when: onStep('sample'), done: leftStep('sample'),
      target: () => vis('#ops-layer-life') || vis('#ops-sample') || vis('#ops-samp') || vis('#tabs [data-scene="planet"]'),
      clear: ['#ops-map'] },
    { id: 'breed', title: 'Breed the strain',
      do: 'LAB (3): pick NITROGEN, press BREED until both bars are covered.',
      why: 'Sol and Erid need only nitrogen here.',
      when: onStep('breed'), done: leftStep('breed'),
      target: () => vis('#lab-breed') || vis('#tabs [data-scene="lab"]'),
      clear: ['#lab-focus', '.strain-card', '#lab-chart'] },
    { id: 'beetle', title: 'Send a Beetle to Sol',
      do: 'NAV (1): select Sol → LAUNCH BEETLE. It costs nothing and flies at 0.99c.',
      why: 'The probe saves Earth on arrival.',
      when: onStep('beetle'), done: leftStep('beetle'),
      target: () => vis('#map-launch-beetle') || starEl(getStarRect('sol')) || vis('#tabs [data-scene="map"]') },
    { id: 'jump', title: 'Jump to 40 Eridani',
      do: 'NAV (1): select 40 Eridani → SPIN DRIVE: ENGAGE.',
      why: 'You must deliver Erid’s strain in person.',
      when: onStep('jump'), done: leftStep('jump'),
      target: (c) => $('engage') || starEl(getStarRect('eri40')) || vis('#tabs [data-scene="map"]'),
      clear: ['#panel-map'] },
    { id: 'deliver', title: 'Deliver at Erid',
      do: 'LAB (3): DELIVER HERE.',
      why: 'Erid is saved; the Beetle handles Earth.',
      when: onStep('deliver'), done: leftStep('deliver'),
      target: () => vis('#lab-deliver') || vis('#tabs [data-scene="lab"]') },
    { id: 'done', title: 'Prologue complete',
      do: 'Both worlds are safe. Act II begins now — the Beetle is guaranteed to reach Sol.',
      when: onStep('done'), target: () => $('objective') },
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

