import * as fx from './mapfx.js';
import { rgb, clamp, esc, row, fmt, attachOrbit } from './util.js';

const PETROVA_LY = 6;
const TAGS = { sol: 'Earth \u00b7 target', eri40: 'Erid \u00b7 target' };
export function createMap(canvas, tooltipEl, hooks) {
  const g = canvas.getContext('2d');
  const cam = { yaw: 0.5, pitch: 0.55, dist: 1 }; // dist = zoom
  let route = null, proj = [], hover = null, selected = null, mouse = { x: 0, y: 0 }, W = 1, H = 1, dpr = 1, state = null;
  attachOrbit(canvas, cam, { min: 0.4, max: 4 }, () => {});
  let viewKey = '';
  // Default view: grid-search yaw/pitch for the one that maximises the smallest projected gap between stars.
  function bestView() {
    const pts = state.stars.map((s) => s.pos);
    const R = maxR();
    const w0 = Math.max(200, W - 180), h0 = Math.max(200, H - 160);
    let best = { yaw: cam.yaw, pitch: cam.pitch, score: -1 };
    const saved = { yaw: cam.yaw, pitch: cam.pitch };
    for (let pitch = 0.45; pitch <= 1.35; pitch += 0.075) {
      for (let yaw = 0; yaw < Math.PI * 2; yaw += Math.PI / 36) {
        cam.yaw = yaw; cam.pitch = pitch;
        const q = pts.map((p) => raw(p, R));
        let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
        for (const r of q) { x0 = Math.min(x0, r.rx); x1 = Math.max(x1, r.rx); y0 = Math.min(y0, r.ry); y1 = Math.max(y1, r.ry); }
        const sc = Math.min(w0 / Math.max(1e-6, x1 - x0), h0 / Math.max(1e-6, y1 - y0));
        let mn = Infinity;
        for (let i = 0; i < q.length; i++) for (let j = i + 1; j < q.length; j++) mn = Math.min(mn, Math.hypot(q[i].rx - q[j].rx, q[i].ry - q[j].ry) * sc);
        // mild preference for a 3D look (not flat top-down) and for using the screen well
        const score = mn + Math.min(sc * (x1 - x0), w0) * 0.01 - Math.abs(pitch - 0.9) * 3;
        if (score > best.score) best = { yaw, pitch, score };
      }
    }
    cam.yaw = saved.yaw; cam.pitch = saved.pitch;
    return best;
  }
  function resetView() {
    if (!state || !state.stars.length) return;
    const b = bestView(); cam.yaw = b.yaw; cam.pitch = b.pitch; cam.dist = 1;
  }
  canvas.addEventListener('dblclick', () => resetView());
  window.addEventListener('keydown', (e) => {
    if ((e.key === 'r' || e.key === 'R') && !e.ctrlKey && !e.metaKey && !e.altKey && canvas.offsetParent !== null &&
        !/^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || '')) resetView();
  });
  // wheel direction: scroll up zooms in
  canvas.addEventListener('mousemove', (e) => { mouse = { x: e.clientX, y: e.clientY }; updateHover(); });
  canvas.addEventListener('mouseleave', () => { hover = null; tooltipEl.classList.add('hidden'); });
  canvas.addEventListener('click', (e) => {
    if (canvas._dragMoved > 4) return;
    mouse = { x: e.clientX, y: e.clientY }; updateHover();
    if (hover) { selected = hover.star.id; hooks.onSelect(hover.star); }
    else if (selected) { selected = null; hooks.onSelect(null); }
  });
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
  }
  window.addEventListener('resize', resize); resize();

  function maxR() { return Math.max(4, ...state.stars.map((s) => Math.hypot(...s.pos))); }
  // Unscaled perspective projection (ly-ish units, y up). The screen mapping comes from fitView().
  function raw(p, R) {
    const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw), cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    const x1 = p[0] * cy - p[2] * sy, z1 = p[0] * sy + p[2] * cy;
    const y1 = p[1] * cp - z1 * sp, z2 = p[1] * sp + z1 * cp;
    const camD = R * 3.2, f = camD / (camD - z2);
    return { rx: x1 * f, ry: -y1 * f, f, z: z2 };
  }
  // Fit every star (and its drop stem) into the free area: below the HUD, tabs and objective bar, above the log ticker.
  // Recomputed from the projected bounds each frame, so it stays correct while rotating. cam.dist then zooms about the centre.
  const fit = { sc: 1, cx: 0, cy: 0, ox: 0, oy: 0 };
  // The dashboard's bottom edge: re-measured at most every 250 ms (a layout read per frame forced a reflow whenever the DOM was dirty).
  let deckAt = -1e9, deckB = 110;
  function deckBottom() {
    const n = performance.now();
    if (n - deckAt > 250) { deckAt = n; const deck = document.getElementById('deck'); deckB = deck ? deck.getBoundingClientRect().bottom : 110; }
    return deckB;
  }
  function fitView(R) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const s of state.stars) for (const q of [s.pos, [s.pos[0], 0, s.pos[2]]]) {
      const r = raw(q, R);
      x0 = Math.min(x0, r.rx); x1 = Math.max(x1, r.rx); y0 = Math.min(y0, r.ry); y1 = Math.max(y1, r.ry);
    }
    // Below the dashboard (its height changes with the objective wrap), clear of the log ticker; the right margin keeps stars
    // out from under the selected-star panel (320 px) and leaves room for their labels.
    const top = deckBottom() + 34;
    const bottom = H - 70, left = 80, right = W - (W >= 1100 ? 370 : 170);
    const w = Math.max(1e-6, x1 - x0), h = Math.max(1e-6, y1 - y0);
    fit.sc = Math.min((right - left) / w, (bottom - top) / h);
    fit.cx = (x0 + x1) / 2; fit.cy = (y0 + y1) / 2;
    fit.ox = (left + right) / 2; fit.oy = (top + bottom) / 2;
  }
  function project(p, R) {
    const r = raw(p, R), k = fit.sc / cam.dist;
    return { x: fit.ox + (r.rx - fit.cx) * k, y: fit.oy + (r.ry - fit.cy) * k, f: r.f, z: r.z };
  }
  function updateHover() {
    hover = null; let best = 16;
    for (const p of proj) {
      const d = Math.hypot(p.x - mouse.x, p.y - mouse.y);
      if (d < Math.max(best, p.r + 6) && d < best + p.r) { best = d; hover = p; }
    }
    canvas.style.cursor = hover ? 'pointer' : '';
    if (!hover) { tooltipEl.classList.add('hidden'); return; }
    const s = hover.star, ship = state.stars.find((x) => x.id === state.ship.starId);
    const dist = Math.hypot(s.pos[0] - ship.pos[0], s.pos[1] - ship.pos[1], s.pos[2] - ship.pos[2]);
    tooltipEl.innerHTML = `<b>${esc(s.name.toUpperCase())}</b>` + row('Type', esc(s.spectral)) +
      row('Luminosity', Math.round((s.lum0 ? s.lum / s.lum0 : 1) * 100) + '%') +
      row('Infection', Math.round(s.infection * 100) + '%', s.infection > 0.5 ? 'warn' : '') +
      row('Distance', s === ship ? 'here' : fmt(dist, 2) + ' ly');
    tooltipEl.classList.remove('hidden');
    tooltipEl.style.left = Math.min(mouse.x + 16, W - 200) + 'px';
    tooltipEl.style.top = Math.min(mouse.y + 16, H - 130) + 'px';
  }

  function routeText(st, pr) {
    const se = selected && st.stars.find((x) => x.id === selected), sh = st.stars.find((x) => x.id === st.ship.starId);
    if (!se || !sh || se === sh) return undefined;
    return fmt(Math.hypot(se.pos[0] - sh.pos[0], se.pos[1] - sh.pos[1], se.pos[2] - sh.pos[2]), 1) + ' ly';
  }

  function draw(st, t) {
    state = st;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const R = maxR();
    const key = st.stars.map((s) => s.id).join(',') + '|' + Math.round(W / 40) + 'x' + Math.round(H / 40);
    if (key !== viewKey) { viewKey = key; resetView(); }
    fitView(R);
    proj = st.stars.map((s) => {
      const p = project(s.pos, R);
      const base = project([s.pos[0], 0, s.pos[2]], R);
      return { star: s, x: p.x, y: p.y, tx: p.x, ty: p.y, f: p.f, z: p.z, bx: base.x, by: base.y,
        r: clamp(6.5 + 1.8 * Math.log10(1 + Math.max(0, s.lum) * 8) * p.f, 7, 10) };
    });
    // gentle screen-space de-clustering: markers closer than MIN px get nudged apart (leader line back to the true spot)
    const MIN = 22;
    for (let it = 0; it < 24; it++) {
      let moved = false;
      for (let i = 0; i < proj.length; i++) for (let j = i + 1; j < proj.length; j++) {
        const a = proj[i], b = proj[j];
        let dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
        if (d >= MIN) continue;
        if (d < 0.01) { const an = (i * 2.4 + j) ; dx = Math.cos(an); dy = Math.sin(an); d = 1; }
        const push = (MIN - d) / 2 * 0.6, ux = dx / d, uy = dy / d;
        a.x -= ux * push; a.y -= uy * push; b.x += ux * push; b.y += uy * push; moved = true;
      }
      for (const p of proj) {   // spring back toward truth, cap displacement
        const ox = p.x - p.tx, oy = p.y - p.ty, od = Math.hypot(ox, oy);
        if (od > 30) { p.x = p.tx + ox / od * 30; p.y = p.ty + oy / od * 30; }
      }
      if (!moved) break;
    }
    const links = [];
    for (let i = 0; i < proj.length; i++) for (let j = i + 1; j < proj.length; j++) {
      const a = proj[i], b = proj[j];
      if (a.star.infection < 0.05 || b.star.infection < 0.05) continue;
      const d = Math.hypot(a.star.pos[0] - b.star.pos[0], a.star.pos[1] - b.star.pos[1], a.star.pos[2] - b.star.pos[2]);
      if (d > PETROVA_LY) continue;
      links.push({ a, b, strength: Math.min(a.star.infection, b.star.infection) * (1 - d / PETROVA_LY) * 1.4 });
    }
    fx.drawMapFrame(g, W, H, t, {
      cam, gridProject: project, gridR: R,
      stars: proj.map((p) => ({
        x: p.x, y: p.y, tx: p.tx, ty: p.ty, r: p.r, depth: p.z, f: p.f, bx: p.bx, by: p.by, star: p.star,
        isShip: p.star.id === st.ship.starId, selected: p.star.id === selected, hovered: hover === p,
        tag: TAGS[p.star.id],
        sub: p.star.infection > 0.05 ? Math.round(p.star.infection * 100) + '% infected' : undefined,
      })),
      links,
      route: undefined,
      routeLabel: routeText(st, proj),
    });
    // route of a jump in progress: solid flown part, dashed remainder, ship marker
    if (route) {
      const A = proj.find((q) => q.star.id === route.fromId), B = proj.find((q) => q.star.id === route.toId);
      if (A && B) {
        const x = A.x + (B.x - A.x) * route.f, y = A.y + (B.y - A.y) * route.f;
        g.lineWidth = 1; g.strokeStyle = 'rgba(214,162,58,.5)'; g.setLineDash([3, 4]);
        g.beginPath(); g.moveTo(A.x, A.y); g.lineTo(B.x, B.y); g.stroke(); g.setLineDash([]);
        g.strokeStyle = '#d6a23a'; g.lineWidth = 2; g.beginPath(); g.moveTo(A.x, A.y); g.lineTo(x, y); g.stroke();
        g.fillStyle = '#d6a23a'; g.beginPath(); g.moveTo(x, y - 6); g.lineTo(x + 5, y); g.lineTo(x, y + 6); g.lineTo(x - 5, y); g.closePath(); g.fill();
      }
    }
  }
  // Screen rect around a star's marker and label (canvas px = CSS px), or null when it is not on screen.
  function starRect(id) {
    const p = proj.find((q) => q.star.id === id); if (!p) return null;
    const l = p.x - 44, t = p.y - p.r - 8;
    return { left: l, top: t, right: l + 88, bottom: t + 62, width: 88, height: 62 };
  }
  // Marker + label rect of every star (a label sits to the right of its marker): the map's own "controls" for the tutorial.
  const starRects = () => proj.map((p) => ({ left: p.x - 14, top: p.y - p.r - 6, right: p.x + 124, bottom: p.y + p.r + 22, width: 138, height: 2 * p.r + 28 }));
  return { setRoute(r) { route = r; }, starRect, starRects, draw, resize, get selected() { return selected; }, select(id) { selected = id; }, get cam() { return cam; } };
}
