// mapfx.js: 2D-canvas visual layer for the galaxy map. No imports.
// All functions take a 2D context `g` and CSS-pixel coordinates (caller already applied the DPR transform).
// Convenience entry: drawMapFrame(g, W, H, timeSec, ctx). See the doc block above it.

const TAU = Math.PI * 2;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const mix = (a, b, t) => a + (b - a) * t;
const FONT = '600 11px "Liberation Sans Narrow","DejaVu Sans Condensed",sans-serif';
const AMBER = '#d6a23a';

function hstr(s) { let h = 2166136261; s = String(s); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed) { let a = (seed >>> 0) || 1; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const starKey = s => hstr((s && (s.id || s.name)) || 'star');
const C255 = c => `${Math.round(clamp(c, 0, 1) * 255)}`;

/** Spectral colour boosted in saturation so the hue reads, as [r,g,b] 0..255. */
function specRGB(star) {
  const c = (star && star.color) || [1, .93, .8];
  const m = Math.max(c[0], c[1], c[2], .001);
  const n = [c[0] / m, c[1] / m, c[2] / m];
  const l = (n[0] + n[1] + n[2]) / 3;
  return n.map(v => Math.round(clamp(l + (v - l) * 1.35, 0, 1) * 255));
}
const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

// ---------------------------------------------------------------- background
let bgCache = null;
function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') { try { return new OffscreenCanvas(w, h); } catch (e) { /* fall through */ } }
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
}
function blob(g, x, y, r, col, a) {
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, rgba(col, a)); gr.addColorStop(.5, rgba(col, a * .45)); gr.addColorStop(1, rgba(col, 0));
  g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
}
function starSprite(g, x, y, r, col, a, spikes) {
  blob(g, x, y, r * 3.2, col, a * .35);
  g.fillStyle = rgba(col, Math.min(1, a)); g.beginPath(); g.arc(x, y, Math.max(.45, r * .5), 0, TAU); g.fill();
  if (spikes) {
    for (let k = 0; k < 2; k++) {
      g.save(); g.translate(x, y); g.rotate(k * Math.PI / 2 + .2);
      const L = r * spikes, gr = g.createLinearGradient(-L, 0, L, 0);
      gr.addColorStop(0, rgba(col, 0)); gr.addColorStop(.5, rgba(col, a * .8)); gr.addColorStop(1, rgba(col, 0));
      g.fillStyle = gr; g.fillRect(-L, -.4, L * 2, .8); g.restore();
    }
  }
}
function buildBackground(W, H, dpr) {
  const M = 90;                                   // parallax margin (css px)
  const w = W + M * 2, h = H + M * 2;
  const mk = () => { const c = makeCanvas(Math.round(w * dpr), Math.round(h * dpr)); const x = c.getContext('2d'); x.scale(dpr, dpr); return [c, x]; };
  const rnd = rng(0x5eed1234);
  const [base, b] = mk();
  // deep space gradient, slight warm/cool variation
  let gr = b.createLinearGradient(0, 0, w, h);
  gr.addColorStop(0, '#05060b'); gr.addColorStop(.5, '#06070d'); gr.addColorStop(1, '#070609');
  b.fillStyle = gr; b.fillRect(0, 0, w, h);
  b.globalCompositeOperation = 'lighter';
  // diagonal milky way band
  const ang = -0.42, ca = Math.cos(ang), sa = Math.sin(ang);
  const cx = w * .5, cy = h * .52, bandW = Math.min(w, h) * .2, len = Math.hypot(w, h) * .62;
  const onBand = (u, v) => [cx + ca * u - sa * v, cy + sa * u + ca * v];
  const gauss = () => (rnd() + rnd() + rnd() + rnd() - 2) * 1.2;
  for (let i = 0; i < 520; i++) {
    const u = (rnd() - .5) * 2 * len, v = gauss() * bandW * (.9 + .5 * Math.sin(u / 260));
    const [x, y] = onBand(u, v);
    const warm = rnd();
    const col = warm < .55 ? [150, 150, 170] : warm < .85 ? [175, 150, 125] : [120, 140, 175];
    blob(b, x, y, 50 + rnd() * 90, col, (.02 + rnd() * .026) * .7);
  }
  blob(b, cx, cy, bandW * 3.4, [150, 140, 150], .035);
  blob(b, cx - ca * len * .2, cy - sa * len * .2, bandW * 2, [190, 160, 120], .035);
  // muted nebula clouds
  const neb = [[120, 70, 85], [60, 100, 110], [80, 70, 120], [125, 95, 55], [70, 95, 80]];
  for (let i = 0; i < 9; i++) {
    const x = rnd() * w, y = rnd() * h, c = neb[i % neb.length];
    const R = 120 + rnd() * 220;
    for (let k = 0; k < 6; k++) blob(b, x + (rnd() - .5) * R * .9, y + (rnd() - .5) * R * .7, R * (.35 + rnd() * .5), c, (.02 + rnd() * .022) * .7);
  }
  // dust lanes (dark) along the band
  b.globalCompositeOperation = 'source-over';
  for (let i = 0; i < 150; i++) {
    const u = (rnd() - .5) * 2 * len, v = (gauss() * .55 + (Math.sin(u / 340) * .5)) * bandW * .5;
    const [x, y] = onBand(u, v);
    blob(b, x, y, 25 + rnd() * 55, [3, 4, 7], .1 + rnd() * .09);
  }
  // far star layer (many tiny), near layer (fewer, brighter) as separate canvases for parallax
  const [far, f] = mk(), [near, n] = mk();
  f.globalCompositeOperation = 'lighter'; n.globalCompositeOperation = 'lighter';
  const temps = [[196, 192, 186], [204, 204, 200], [200, 202, 210], [180, 190, 208], [208, 192, 178]];   // desaturated: backdrop must not out-shout the game stars
  const place = () => {
    for (let t = 0; t < 8; t++) {
      const x = rnd() * w, y = rnd() * h;
      const d = Math.abs(-sa * (x - cx) + ca * (y - cy));                  // distance from band axis
      if (rnd() < .35 + .65 * Math.exp(-(d * d) / (2 * bandW * bandW * 1.4))) return [x, y];
    }
    return [rnd() * w, rnd() * h];
  };
  const nFar = Math.round(w * h / 420), nNear = Math.round(w * h / 4200);
  for (let i = 0; i < nFar; i++) {
    const [x, y] = place(), c = temps[(rnd() * temps.length) | 0];
    const a = (.06 + Math.pow(rnd(), 3) * .22) * .8;
    f.fillStyle = rgba(c, a); f.fillRect(x, y, rnd() < .15 ? 1.4 : 1, rnd() < .15 ? 1.4 : 1);
  }
  for (let i = 0; i < nNear; i++) {
    const [x, y] = place(), c = temps[(rnd() * temps.length) | 0];
    const big = Math.pow(rnd(), 4);
    starSprite(n, x, y, .55 + big * 1.1, c, (.18 + big * .3) * .8, big > .985 ? 3.5 : 0);   // only ~1% keep a faint spike
  }
  return { base, far, near, w, h, M, W, H, dpr };
}

/**
 * Deep-space backdrop, cached offscreen (rebuilt when W/H/dpr change). cam = {yaw,pitch} shifts layers for parallax.
 */
// The whole backdrop (3 parallax layers + shimmer + vignette) is composited into one cached canvas and blitted once per frame.
// It is re-composited only when the camera moved or the slow shimmer crossed a quantisation step (6 levels, ~sub-1% alpha each).
let bgComp = null;
export function drawBackground(g, W, H, timeSec = 0, cam) {
  const tr = g.getTransform ? g.getTransform() : null;
  const dpr = Math.min(tr ? tr.a || 1 : 1, 2);
  if (!bgCache || bgCache.W !== W || bgCache.H !== H || bgCache.dpr !== dpr) { bgCache = buildBackground(W, H, dpr); bgComp = null; }
  const c = bgCache, yaw = (cam && cam.yaw) || 0, pitch = (cam && cam.pitch) || 0;
  const shim = Math.round((.75 + .1 * Math.sin(timeSec * .7)) * 60) / 60;
  const key = Math.round(yaw / .003) + ',' + Math.round(pitch / .003) + ',' + shim;
  if (!bgComp || bgComp.key !== key) {
    if (!bgComp) {
      const cv = makeCanvas(Math.round(W * dpr), Math.round(H * dpr));
      bgComp = { cv, x: cv.getContext('2d'), key: '' };
    }
    const x = bgComp.x; bgComp.key = key;
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    const layer = (cv, f) => {
      const dx = Math.sin(yaw) * c.M * .5 * f, dy = Math.sin(pitch * 2) * c.M * .35 * f;
      x.drawImage(cv, -c.M + dx, -c.M + dy, c.w, c.h);
    };
    x.save();
    x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1;
    layer(c.base, .25);
    x.globalCompositeOperation = 'lighter';
    x.globalAlpha = shim;   // faint shimmer
    layer(c.far, .5);
    x.globalAlpha = .7;
    layer(c.near, 1);
    x.restore();
    const v = x.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .35, W / 2, H / 2, Math.hypot(W, H) * .6);   // vignette
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.6)');
    x.fillStyle = v; x.fillRect(0, 0, W, H);
  }
  g.save();
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  g.drawImage(bgComp.cv, 0, 0, W, H);
  g.restore();
}

// ---------------------------------------------------------------- stars
/** Spectral-coloured sun sprite: soft halo, core, diffraction spikes on bright ones, subtle twinkle. r = css px radius. */
export function drawStarGlow(g, x, y, r, star, timeSec = 0) {
  const inf = clamp((star && star.infection) || 0, 0, 1);
  const c = specRGB(star), k = starKey(star);
  const tw = 1 + .07 * Math.sin(timeSec * 2.6 + (k % 97)) + .04 * Math.sin(timeSec * 5.1 + (k % 31));
  const dim = (1 - .55 * inf) * tw;
  g.save();
  g.globalCompositeOperation = 'lighter';
  const R = r * (3.6 + (r > 8 ? 1.2 : 0));
  let gr = g.createRadialGradient(x, y, 0, x, y, R);
  gr.addColorStop(0, rgba(c, .5 * dim)); gr.addColorStop(.18, rgba(c, .22 * dim)); gr.addColorStop(.5, rgba(c, .06 * dim)); gr.addColorStop(1, rgba(c, 0));
  g.fillStyle = gr; g.fillRect(x - R, y - R, R * 2, R * 2);
  if (r > 4.5) {                                   // diffraction spikes
    const L = r * (3.2 + r * .35) * (.8 + .2 * dim);
    for (let i = 0; i < 2; i++) {
      g.save(); g.translate(x, y); g.rotate(i * Math.PI / 2 + .12 + (k % 7) * .02);
      const sg = g.createLinearGradient(-L, 0, L, 0);
      sg.addColorStop(0, rgba(c, 0)); sg.addColorStop(.5, rgba(c, .55 * dim)); sg.addColorStop(1, rgba(c, 0));
      g.fillStyle = sg; g.fillRect(-L, -.5, L * 2, 1); g.restore();
    }
  }
  const cr = Math.max(1.5, r * .52);
  gr = g.createRadialGradient(x, y, 0, x, y, cr * 1.5);
  const hot = c.map(v => Math.round(mix(v, 255, .6 * (1 - inf * .6))));
  gr.addColorStop(0, rgba(hot, Math.min(1, dim))); gr.addColorStop(.55, rgba(c, .9 * dim)); gr.addColorStop(1, rgba(c, 0));
  g.fillStyle = gr; g.beginPath(); g.arc(x, y, cr * 1.5, 0, TAU); g.fill();
  g.restore();
}

/** Astrophage on a star: crawling dark cells over the disc, a ragged cell ring, dim IR shimmer and drifting specks. Nothing at infection 0. */
export function drawInfection(g, x, y, r, star, timeSec = 0) {
  const inf = clamp((star && star.infection) || 0, 0, 1);
  if (inf < .01) return;
  const rn = rng(starKey(star) ^ 0xa57), t = timeSec;
  g.save();
  // IR shimmer halo
  g.globalCompositeOperation = 'lighter';
  const pulse = .75 + .25 * Math.sin(t * 1.3 + rn() * 6);
  const R = r * (2.6 + inf * 1.4);
  const gr = g.createRadialGradient(x, y, r * .6, x, y, R);
  gr.addColorStop(0, `rgba(170,22,10,${.2 * inf * pulse})`); gr.addColorStop(.6, `rgba(120,10,6,${.07 * inf})`); gr.addColorStop(1, 'rgba(100,5,3,0)');
  g.fillStyle = gr; g.fillRect(x - R, y - R, R * 2, R * 2);
  // dark mottled cells crawling over the disc (clipped to the disc)
  g.globalCompositeOperation = 'source-over';
  const dr = Math.max(2, r * .62);
  g.save(); g.beginPath(); g.arc(x, y, dr * 1.05, 0, TAU); g.clip();
  const n = Math.round(4 + inf * 16);
  for (let i = 0; i < n; i++) {
    const a0 = rn() * TAU, d0 = Math.sqrt(rn()) * dr * 1.1, sz = dr * (.22 + rn() * .38) * (.5 + inf * .8);
    const ph = rn() * 6, a = a0 + t * .12 * (rn() < .5 ? 1 : -1) + Math.sin(t * .4 + ph) * .3;
    const px = x + Math.cos(a) * d0, py = y + Math.sin(a) * d0, s = sz * (1 + .15 * Math.sin(t * 1.5 + ph));
    const cg = g.createRadialGradient(px, py, 0, px, py, s);
    cg.addColorStop(0, `rgba(6,1,1,${.85 * (.35 + inf * .65)})`); cg.addColorStop(.65, `rgba(10,2,2,${.5 * inf})`); cg.addColorStop(1, 'rgba(10,2,2,0)');
    g.fillStyle = cg; g.beginPath(); g.arc(px, py, s, 0, TAU); g.fill();
  }
  g.restore();
  // ragged ring of cells + red rims
  g.globalCompositeOperation = 'source-over';
  const rn2 = rng(starKey(star) ^ 0x77), m = Math.round(8 + inf * 22);
  for (let i = 0; i < m; i++) {
    const a = rn2() * TAU + t * .05 * (i % 2 ? 1 : -1), d = r * (.85 + rn2() * .75 * (.4 + inf)), s = Math.max(.9, r * (.08 + rn2() * .16));
    const wob = 1 + .25 * Math.sin(t * 2 + i * 1.7);
    const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d * .98;
    g.fillStyle = `rgba(14,3,3,${.55 + .35 * inf})`; g.beginPath(); g.ellipse(px, py, s * wob, s / wob, a, 0, TAU); g.fill();
    g.strokeStyle = `rgba(210,50,30,${.18 + .35 * inf * (.5 + .5 * Math.sin(t * 1.7 + i))})`; g.lineWidth = .7; g.stroke();
  }
  // drifting IR specks
  g.globalCompositeOperation = 'lighter';
  const sp = Math.round(4 + inf * 14);
  for (let i = 0; i < sp; i++) {
    const a = rn2() * TAU, u = (rn2() + t * .09 * (.6 + rn2())) % 1, d = r * (1 + u * 2.6);
    const al = Math.sin(u * Math.PI) * (.35 + .5 * inf);
    g.fillStyle = `rgba(255,70,40,${al})`; g.fillRect(x + Math.cos(a + u * .6) * d, y + Math.sin(a + u * .6) * d, 1.3, 1.3);
  }
  g.restore();
}

// ---------------------------------------------------------------- links, grid, stems
function bez(x1, y1, cx, cy, x2, y2, u) {
  const a = 1 - u; return [a * a * x1 + 2 * a * u * cx + u * u * x2, a * a * y1 + 2 * a * u * cy + u * u * y2];
}
/** Flowing reddish Astrophage stream between two stars; strength 0..1 (brighter/denser with strength). */
export function drawPetrovaLink(g, x1, y1, x2, y2, strength = .5, timeSec = 0) {
  const s = clamp(strength, 0, 1), dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy);
  if (len < 4 || s < .01) return;
  const seed = (Math.round(x1 * 7 + y1 * 13 + x2 * 3 + y2 * 5) >>> 0) % 997;
  const bow = len * .07 * (seed % 2 ? 1 : -1);
  const cx = (x1 + x2) / 2 - dy / len * bow, cy = (y1 + y2) / 2 + dx / len * bow;
  g.save();
  g.globalCompositeOperation = 'lighter'; g.lineCap = 'round';
  const path = () => { g.beginPath(); g.moveTo(x1, y1); g.quadraticCurveTo(cx, cy, x2, y2); };
  const grad = g.createLinearGradient(x1, y1, x2, y2);
  const a0 = .5 + .5 * Math.sin(timeSec * .8 + seed);
  grad.addColorStop(0, `rgba(210,50,35,${.2 + .4 * s})`); grad.addColorStop(.5, `rgba(235,90,45,${.12 + .3 * s})`); grad.addColorStop(1, `rgba(210,50,35,${.2 + .4 * s})`);
  g.strokeStyle = grad;
  g.globalAlpha = .1 + .1 * s; g.lineWidth = 8; path(); g.stroke();
  g.globalAlpha = .2 + .25 * s; g.lineWidth = 3; path(); g.stroke();
  g.globalAlpha = .25 + .3 * s * (.8 + .2 * a0); g.lineWidth = 1; g.setLineDash([10, 7, 2, 7]); g.lineDashOffset = -timeSec * 22; path(); g.stroke(); g.setLineDash([]);
  g.globalAlpha = 1;
  const n = Math.max(5, Math.round(len / 9));
  for (let i = 0; i < n; i++) {
    const h = ((i * 0.618 + seed * .13) % 1), u = (i / n + timeSec * (.06 + .05 * h) + h) % 1;
    const [px, py] = bez(x1, y1, cx, cy, x2, y2, u);
    const off = Math.sin(u * 40 + i * 2 + timeSec * 3) * 2.2;
    const nx = -dy / len, ny = dx / len, al = Math.sin(u * Math.PI) * (.3 + .6 * s) * (.6 + .4 * Math.sin(timeSec * 4 + i));
    const sz = 1 + (h > .75 ? 1.2 : .3);
    g.fillStyle = `rgba(255,${110 + (h * 90) | 0},70,${al})`;
    g.fillRect(px + nx * off - sz / 2, py + ny * off - sz / 2, sz, sz);
  }
  g.restore();
}

/**
 * Faint reference grid. project(p3, R) -> {x,y,f,z} (the map's own projector). Rings on the galactic plane,
 * fading with distance (f = perspective factor) and with ring radius. Very low alpha, drawn as dotted arcs.
 */
export function drawGrid(g, project, R, opts = {}) {
  const rings = opts.rings || 3, base = opts.alpha ?? .07;
  g.save(); g.lineWidth = 1;
  for (let k = 1; k <= rings; k++) {
    const r = R * k / rings, seg = 96;
    let prev = null;
    for (let i = 0; i <= seg; i++) {
      const a = i / seg * TAU, p = project([Math.cos(a) * r, 0, Math.sin(a) * r], R);
      if (prev && i % 3 !== 0) {
        const al = base * clamp(.35 + (p.f - .8) * 1.1, .15, 1) * (1 - .3 * (k - 1) / rings);
        g.strokeStyle = `rgba(150,170,200,${al})`; g.beginPath(); g.moveTo(prev.x, prev.y); g.lineTo(p.x, p.y); g.stroke();
      }
      prev = p;
    }
    if (opts.labels !== false) {
      const lp = project([r * .7071, 0, r * .7071], R);
      g.fillStyle = 'rgba(150,170,200,.22)'; g.font = '500 9px "Liberation Sans Narrow",sans-serif';
      g.fillText(`${Math.round(r * 10) / 10} LY`, lp.x + 4, lp.y - 3);
    }
  }
  const o = project([0, 0, 0], R);                    // origin crosshair
  g.strokeStyle = 'rgba(150,170,200,.14)'; g.beginPath(); g.moveTo(o.x - 5, o.y); g.lineTo(o.x + 5, o.y); g.moveTo(o.x, o.y - 3); g.lineTo(o.x, o.y + 3); g.stroke();
  g.restore();
}

/** Soft depth-fading drop-stem with a small glowing foot-dot on the plane (bx,by). */
export function drawStem(g, bx, by, x, y, alpha = 1, color) {
  const c = color || [150, 185, 225];
  const gr = g.createLinearGradient(x, y, bx, by);
  gr.addColorStop(0, rgba(c, .16 * alpha)); gr.addColorStop(.7, rgba(c, .06 * alpha)); gr.addColorStop(1, rgba(c, .12 * alpha));
  g.save(); g.strokeStyle = gr; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x, y); g.lineTo(bx, by); g.stroke();
  g.globalCompositeOperation = 'lighter';
  const R = 7, fg = g.createRadialGradient(bx, by, 0, bx, by, R);
  fg.addColorStop(0, rgba(c, .5 * alpha)); fg.addColorStop(.35, rgba(c, .16 * alpha)); fg.addColorStop(1, rgba(c, 0));
  g.fillStyle = fg; g.save(); g.translate(bx, by); g.scale(1, .5); g.translate(-bx, -by); g.fillRect(bx - R, by - R, R * 2, R * 2); g.restore();
  g.fillStyle = rgba(c, .7 * alpha); g.fillRect(bx - 1, by - .5, 2, 1);
  g.restore();
}

// ---------------------------------------------------------------- markers, labels, ship, route, selection
/**
 * Travel-target marker: spectral core + soft halo, crisp ring (reticle ticks), and an infection arc ring
 * (red segment proportional to infection) outside it. r = ring radius (>= 7). hover brightens.
 */
export function drawStarMarker(g, x, y, r, star, o = {}) {
  const t = o.t || 0, hov = !!o.hover, sel = !!o.selected, inf = clamp((star && star.infection) || 0, 0, 1);
  const c = specRGB(star), k = starKey(star);
  const tw = 1 + .05 * Math.sin(t * 2.6 + (k % 97));
  const lum = clamp(o.lum == null ? .5 : o.lum, 0, 1);
  const boost = hov ? 1.35 : 1;
  g.save();
  g.globalCompositeOperation = 'lighter';
  const R = r * (1.9 + .6 * lum) * (hov ? 1.15 : 1);
  let gr = g.createRadialGradient(x, y, 0, x, y, R);
  gr.addColorStop(0, rgba(c, Math.min(1, .55 * boost * tw))); gr.addColorStop(.35, rgba(c, .2 * boost)); gr.addColorStop(1, rgba(c, 0));
  g.fillStyle = gr; g.fillRect(x - R, y - R, R * 2, R * 2);
  g.globalCompositeOperation = 'source-over';
  // core
  const cr = 2.6 + 1.6 * lum + (hov ? 1 : 0);
  const hot = c.map(v => Math.round(mix(v, 255, .55 * (1 - inf * .5))));
  gr = g.createRadialGradient(x, y, 0, x, y, cr * 1.4);
  gr.addColorStop(0, rgba(hot, 1)); gr.addColorStop(.6, rgba(c, 1)); gr.addColorStop(1, rgba(c, 0));
  g.fillStyle = gr; g.beginPath(); g.arc(x, y, cr * 1.4, 0, TAU); g.fill();
  // dark gap so the ring reads against halos
  g.strokeStyle = 'rgba(4,6,10,.75)'; g.lineWidth = 3.2; g.beginPath(); g.arc(x, y, r, 0, TAU); g.stroke();
  // crisp ring
  g.strokeStyle = hov || sel ? 'rgba(255,226,150,.98)' : 'rgba(214,224,236,.8)'; g.lineWidth = hov ? 1.8 : 1.3;
  g.beginPath(); g.arc(x, y, r, 0, TAU); g.stroke();
  // reticle ticks
  g.lineWidth = 1.3;
  for (let q = 0; q < 4; q++) {
    const a = q * Math.PI / 2 + Math.PI / 4;
    g.beginPath(); g.moveTo(x + Math.cos(a) * (r - 2.5), y + Math.sin(a) * (r - 2.5)); g.lineTo(x + Math.cos(a) * (r + 2.5), y + Math.sin(a) * (r + 2.5)); g.stroke();
  }
  // infection arc ring
  const ir = r + 5;
  if (inf > .005) {
    g.lineCap = 'butt';
    g.strokeStyle = 'rgba(120,20,16,.55)'; g.lineWidth = 3; g.beginPath(); g.arc(x, y, ir, 0, TAU); g.stroke();
    const sweep = Math.max(.22, inf * TAU), a0 = -Math.PI / 2;
    g.globalCompositeOperation = 'lighter';
    g.strokeStyle = 'rgba(255,60,40,.28)'; g.lineWidth = 6; g.beginPath(); g.arc(x, y, ir, a0, a0 + sweep); g.stroke();
    g.globalCompositeOperation = 'source-over';
    g.strokeStyle = inf > .5 ? '#ff4a35' : '#f2523a'; g.lineWidth = 3; g.beginPath(); g.arc(x, y, ir, a0, a0 + sweep); g.stroke();
  } else {
    g.strokeStyle = 'rgba(120,150,170,.22)'; g.lineWidth = 1; g.beginPath(); g.arc(x, y, ir, 0, TAU); g.stroke();
  }
  g.restore();
}

const NAME_FONT = '700 12px "Liberation Sans Narrow","DejaVu Sans Condensed",sans-serif';
const SUB_FONT = '600 10px "Liberation Sans Narrow","DejaVu Sans Condensed",sans-serif';
const TAG_FONT = '700 9px "Liberation Sans Narrow","DejaVu Sans Condensed",sans-serif';

/** Measure a label: returns {w,h,nameW,chips:[{t,w,ship}],chipH,subH}. */
function measureLabel(g, e) {
  g.font = NAME_FONT; const nameW = g.measureText(String(e.star.name).toUpperCase()).width;
  g.font = TAG_FONT;
  const chips = (e.tags || []).map(t => ({ t: String(t.text).toUpperCase(), ship: !!t.ship, w: g.measureText(String(t.text).toUpperCase()).width + 13 }));
  let chipsW = 0; for (const c of chips) chipsW += c.w + 3;
  g.font = SUB_FONT; const subW = e.sub ? g.measureText(String(e.sub).toUpperCase()).width : 0;
  const chipH = chips.length ? 14 : 0, subH = e.sub ? 12 : 0;
  return { nameW, chips, chipH, subH, w: Math.max(nameW, chipsW, subW) + 8, h: chipH + 15 + subH };
}

/** Draw one placed label. box = {x,y,w,h} top-left; leader = [x1,y1,x2,y2] or null. */
function paintLabel(g, e, m, box, leader) {
  const hot = e.hovered || e.selected;
  g.save();
  if (leader) {
    g.strokeStyle = hot ? 'rgba(214,162,58,.85)' : 'rgba(190,205,220,.5)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(leader[0], leader[1]); g.lineTo(leader[2], leader[3]); g.stroke();
  }
  g.fillStyle = hot ? 'rgba(14,11,5,.8)' : 'rgba(4,6,10,.62)'; g.fillRect(box.x, box.y, box.w, box.h);
  if (hot) { g.strokeStyle = 'rgba(214,162,58,.6)'; g.lineWidth = 1; g.strokeRect(box.x + .5, box.y + .5, box.w - 1, box.h - 1); }
  let ty = box.y + 2;
  if (m.chips.length) {
    let cx = box.x + 4; g.font = TAG_FONT;
    for (const c of m.chips) {
      g.fillStyle = c.ship ? AMBER : 'rgba(214,162,58,.16)'; g.fillRect(cx, ty, c.w, 11);
      if (!c.ship) { g.strokeStyle = 'rgba(214,162,58,.85)'; g.lineWidth = 1; g.strokeRect(cx + .5, ty + .5, c.w - 1, 10); }
      g.fillStyle = c.ship ? '#1a1308' : AMBER; if (!c.ship) g.fillRect(cx + 3, ty + 4, 3, 3);
      g.fillText(c.t, cx + (c.ship ? 6 : 9), ty + 8.5);
      cx += c.w + 3;
    }
    ty += 14;
  }
  g.font = NAME_FONT; g.fillStyle = hot ? '#ffd27a' : (e.isShip || e.tag ? '#f0e6cc' : 'rgba(232,238,244,.96)');
  g.fillText(String(e.star.name).toUpperCase(), box.x + 4, ty + 10.5);
  if (e.sub) {
    g.font = SUB_FONT; g.fillStyle = (e.star.infection || 0) > .5 ? 'rgba(255,120,100,.98)' : 'rgba(215,160,140,.95)';
    g.fillText(String(e.sub).toUpperCase(), box.x + 4, ty + 22.5);
  }
  g.restore();
}

/**
 * Per-frame label collision avoidance. entries: stars with x,y,r (marker radius incl. arc), priority rank via flags.
 * Tries right/left/above/below, then offset placements with a leader line; hides the rest (hover reveals them).
 */
function layoutLabels(g, entries, W, H, bounds) {
  const rank = e => e.selected ? 0 : e.hovered ? 1 : e.isShip ? 2 : e.tag ? 3 : 4;
  const order = entries.slice().sort((a, b) => rank(a) - rank(b) || (b.depth || 0) - (a.depth || 0));
  const markers = entries.map(e => ({ x: e.x - e.mr - 2, y: e.y - e.mr - 2, w: e.mr * 2 + 4, h: e.mr * 2 + 4 }));
  // the ship glyph + plume stands above its star
  entries.forEach((e, i) => { if (e.isShip) markers.push({ x: e.x - 9, y: e.y - e.mr - 30, w: 18, h: 28 }); });
  const placed = [], out = [];
  const hit = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  const overlapArea = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  for (const e of order) {
    const m = measureLabel(g, e), w = m.w, h = m.h, d = e.mr + 3;
    const cands = [
      { x: e.x + d, y: e.y - h / 2 }, { x: e.x - d - w, y: e.y - h / 2 },
      { x: e.x - w / 2, y: e.y - d - h }, { x: e.x - w / 2, y: e.y + d },
    ];
    for (const dist of [e.mr + 20, e.mr + 40, e.mr + 66]) {
      for (let k = 0; k < 8; k++) {
        const a = k * Math.PI / 4 - Math.PI / 4, cx = e.x + Math.cos(a) * dist, cy = e.y + Math.sin(a) * dist;
        cands.push({ x: Math.cos(a) > .3 ? cx : Math.cos(a) < -.3 ? cx - w : cx - w / 2, y: Math.sin(a) > .3 ? cy : Math.sin(a) < -.3 ? cy - h : cy - h / 2, lead: true });
      }
    }
    const force = e.selected || e.hovered || e.isShip;
    let best = null, bestCost = Infinity;
    for (let ci = 0; ci < cands.length; ci++) {
      const c = cands[ci], box = { x: c.x, y: c.y, w, h };
      let cost = ci * .01;
      if (box.x < bounds.l) cost += (bounds.l - box.x) * 40; if (box.x + w > bounds.r) cost += (box.x + w - bounds.r) * 40;
      if (box.y < bounds.t) cost += (bounds.t - box.y) * 40; if (box.y + h > bounds.b) cost += (box.y + h - bounds.b) * 40;
      for (const p of placed) cost += overlapArea(box, p) * 10;
      for (let mi = 0; mi < markers.length; mi++) cost += overlapArea(box, markers[mi]) * 6;
      if (cost < bestCost) { bestCost = cost; best = { box, lead: !!c.lead }; }
      if (cost < .1 && ci < 4) break;
    }
    if (!best || (bestCost >= 1 && !force)) continue;            // collides: hidden, shown on hover
    const box = best.box; placed.push({ x: box.x - 2, y: box.y - 1, w: box.w + 4, h: box.h + 2 });
    let leader = null;
    if (best.lead) {
      const px = clamp(e.x, box.x, box.x + box.w), py = clamp(e.y, box.y, box.y + box.h);
      const dx = px - e.x, dy = py - e.y, L = Math.hypot(dx, dy) || 1;
      leader = [e.x + dx / L * e.mr, e.y + dy / L * e.mr, px, py];
    }
    out.push({ e, m, box, leader });
  }
  return out;
}

/** Animated selection reticle: rotating dashed ring, pulsing corner brackets, soft amber glow. */
export function drawSelection(g, x, y, r, timeSec = 0) {
  const rr = r + 13 + Math.sin(timeSec * 2.4) * 1.2;
  g.save();
  g.globalCompositeOperation = 'lighter';
  const gl = g.createRadialGradient(x, y, r, x, y, rr + 14);
  gl.addColorStop(0, 'rgba(214,162,58,.16)'); gl.addColorStop(1, 'rgba(214,162,58,0)');
  g.fillStyle = gl; g.fillRect(x - rr - 14, y - rr - 14, (rr + 14) * 2, (rr + 14) * 2);
  g.globalCompositeOperation = 'source-over';
  g.strokeStyle = 'rgba(214,162,58,.7)'; g.lineWidth = 1; g.setLineDash([3, 5]); g.lineDashOffset = timeSec * 10;
  g.beginPath(); g.arc(x, y, rr - 3, 0, TAU); g.stroke(); g.setLineDash([]);
  g.strokeStyle = AMBER; g.lineWidth = 1.2;
  const b = rr + 4 + Math.sin(timeSec * 4) * 1;
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    g.beginPath(); g.moveTo(x + sx * b, y + sy * (b - 7)); g.lineTo(x + sx * b, y + sy * b); g.lineTo(x + sx * (b - 7), y + sy * b); g.stroke();
  }
  g.restore();
}

/** Hail Mary marker: amber ring around the current star plus a small ship glyph with a drive plume above it. (Name goes in the label chip.) */
export function drawShip(g, x, y, r, timeSec = 0) {
  const oy = y - r - 17 - Math.sin(timeSec * 2.2) * 1.2;
  g.save();
  const pr = r + 10 + (timeSec * 7 % 5);
  g.strokeStyle = `rgba(214,162,58,${.55 - .1 * (pr - r - 10)})`; g.lineWidth = 1.5;
  g.beginPath(); g.arc(x, y, pr, 0, TAU); g.stroke();
  g.strokeStyle = 'rgba(244,190,80,.95)'; g.lineWidth = 1.5; g.setLineDash([6, 4]); g.lineDashOffset = -timeSec * 6;
  g.beginPath(); g.arc(x, y, r + 8, 0, TAU); g.stroke(); g.setLineDash([]);
  const fl = .7 + .3 * Math.sin(timeSec * 31) * Math.sin(timeSec * 17.3) + .15 * Math.sin(timeSec * 53);
  g.globalCompositeOperation = 'lighter';
  const pg = g.createLinearGradient(x, oy + 4, x, oy + 4 + 12 * fl);
  pg.addColorStop(0, 'rgba(255,200,110,.95)'); pg.addColorStop(.5, 'rgba(255,120,50,.5)'); pg.addColorStop(1, 'rgba(255,80,30,0)');
  g.fillStyle = pg; g.beginPath(); g.moveTo(x - 2, oy + 4); g.lineTo(x + 2, oy + 4); g.lineTo(x, oy + 4 + 12 * fl); g.closePath(); g.fill();
  g.globalCompositeOperation = 'source-over';
  g.fillStyle = AMBER; g.strokeStyle = '#7a5a1c'; g.lineWidth = .8;
  g.beginPath(); g.moveTo(x, oy - 8); g.lineTo(x + 2, oy - 2); g.lineTo(x + 2, oy + 4); g.lineTo(x + 4.5, oy + 6); g.lineTo(x - 4.5, oy + 6); g.lineTo(x - 2, oy + 4); g.lineTo(x - 2, oy - 2); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = '#1a1308'; g.fillRect(x - .7, oy - 4, 1.4, 5);
  g.restore();
}

/** Travel-route preview from (x1,y1) to (x2,y2): glowing line, marching dashes, chevrons and a target reticle. */
export function drawRoute(g, x1, y1, x2, y2, timeSec = 0) {
  const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy);
  if (len < 6) return;
  const ux = dx / len, uy = dy / len;
  g.save(); g.lineCap = 'round';
  g.globalCompositeOperation = 'lighter';
  g.strokeStyle = 'rgba(214,162,58,.12)'; g.lineWidth = 6; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
  g.globalCompositeOperation = 'source-over';
  g.strokeStyle = 'rgba(224,176,70,.8)'; g.lineWidth = 1.2; g.setLineDash([7, 6]); g.lineDashOffset = -timeSec * 18;
  g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); g.setLineDash([]);
  const n = Math.max(1, Math.floor(len / 70));
  for (let i = 0; i < n; i++) {                       // travelling chevrons
    const u = ((i + .5) / n + timeSec * .08) % 1, px = x1 + dx * u, py = y1 + dy * u;
    g.strokeStyle = `rgba(255,214,120,${.35 + .55 * Math.sin(u * Math.PI)})`; g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(px - uy * 4 - ux * 4, py + ux * 4 - uy * 4); g.lineTo(px, py); g.lineTo(px + uy * 4 - ux * 4, py - ux * 4 - uy * 4); g.stroke();
  }
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 3; i++) {                        // travelling light pulses
    const u = (timeSec * .35 + i / 3) % 1, px = x1 + dx * u, py = y1 + dy * u;
    const pg = g.createRadialGradient(px, py, 0, px, py, 9);
    pg.addColorStop(0, 'rgba(255,230,160,.95)'); pg.addColorStop(.3, 'rgba(255,190,80,.4)'); pg.addColorStop(1, 'rgba(255,170,50,0)');
    g.fillStyle = pg; g.fillRect(px - 9, py - 9, 18, 18);
  }
  g.globalCompositeOperation = 'source-over';
  const rr = 9 + Math.sin(timeSec * 3) * 1.5;         // reticle at the target
  g.strokeStyle = 'rgba(224,176,70,.85)'; g.lineWidth = 1;
  g.beginPath(); g.arc(x2, y2, rr, 0, TAU); g.stroke();
  for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + timeSec * .6; g.beginPath(); g.moveTo(x2 + Math.cos(a) * (rr + 2), y2 + Math.sin(a) * (rr + 2)); g.lineTo(x2 + Math.cos(a) * (rr + 6), y2 + Math.sin(a) * (rr + 6)); g.stroke(); }
  g.restore();
}

// ---------------------------------------------------------------- one-call frame
/**
 * drawMapFrame(g, W, H, timeSec, ctx): backdrop, grid, stems, Petrova links, star markers, route (+distance), ship,
 * selection, and collision-free labels.
 *
 * ctx = {
 *   cam, gridProject, gridR,
 *   stars: [{ x, y, depth, star, r?, tx?, ty?, bx?, by?, f?, isShip?, selected?, hovered?, sub?, tag? }],
 *          // r: marker ring radius (px, >= 7); tx,ty: true position when (x,y) was nudged apart (leader drawn)
 *   links: [{ a, b, strength }],
 *   route: { from, to } | null | undefined (default ship -> selected),
 *   routeLabel: optional text shown mid-route, e.g. '10.9 LY'
 *   bounds: optional {l,t,r,b} label area
 * }
 */
import { perf as P } from '../perf.js';
export function drawMapFrame(g, W, H, timeSec, ctx) {
  const stars = ctx.stars || [];
  g.save();
  g.setLineDash([]); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  P.b('m.bg'); drawBackground(g, W, H, timeSec, ctx.cam); P.e('m.bg'); P.b('m.grid');
  if (ctx.gridProject) drawGrid(g, ctx.gridProject, ctx.gridR || 4, { labels: false, alpha: .05 }); P.e('m.grid'); P.b('m.lanes');
  for (const l of ctx.lanes || []) { if (l.from && l.to) drawLane(g, l.from.x, l.from.y, l.to.x, l.to.y, l.infection, timeSec); }
  P.e('m.lanes'); P.b('m.stem');
  let zmin = Infinity, zmax = -Infinity;
  for (const s of stars) { zmin = Math.min(zmin, s.depth || 0); zmax = Math.max(zmax, s.depth || 0); }
  const zr = Math.max(1e-6, zmax - zmin);
  const near = s => stars.length > 1 ? (((s.depth || 0) - zmin) / zr) : 1;
  const order = stars.slice().sort((a, b) => (a.depth || 0) - (b.depth || 0));
  const radius = s => Math.max(7, s.r ?? 7);
  for (const s of order) if (s.bx != null) drawStem(g, s.bx, s.by, s.tx ?? s.x, s.ty ?? s.y, .3 + .5 * near(s), specRGB(s.star));
  P.e('m.stem'); P.b('m.links');
  for (const l of ctx.links || []) {
    const A = l.a, B = l.b; if (!A || !B) continue;
    drawPetrovaLink(g, A.x, A.y, B.x, B.y, l.strength ?? .5, timeSec);
  }
  // leader lines from nudged markers back to their true position
  for (const s of order) {
    if (s.tx == null || Math.hypot(s.tx - s.x, s.ty - s.y) < 3) continue;
    g.strokeStyle = 'rgba(200,215,230,.45)'; g.lineWidth = 1; g.beginPath(); g.moveTo(s.tx, s.ty); g.lineTo(s.x, s.y); g.stroke();
    g.fillStyle = 'rgba(220,230,240,.8)'; g.beginPath(); g.arc(s.tx, s.ty, 1.5, 0, TAU); g.fill();
  }
  P.e('m.links'); P.b('m.mark');
  let route = ctx.route;
  if (route === undefined) {
    const sh = stars.find(s => s.isShip), se = stars.find(s => s.selected);
    if (sh && se && sh !== se) route = { from: sh, to: se };
  }
  if (route && route.from && route.to) drawRoute(g, route.from.x, route.from.y, route.to.x, route.to.y, timeSec);
  for (const s of order) {
    const r = radius(s), n = near(s);
    if (s.smudge) {
      g.save(); g.globalAlpha = 0.35;
      g.fillStyle = 'rgba(180,190,210,0.5)';
      g.beginPath(); g.arc(s.x, s.y, 3.5, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(200,210,230,0.7)';
      g.font = '600 9px "Liberation Sans Narrow","DejaVu Sans Condensed",sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('?', s.x, s.y + 0.5);
      g.textBaseline = 'alphabetic';
      g.restore();
      continue;
    }
    if (s.saved) {
      g.save(); g.globalCompositeOperation = 'lighter';
      const R = r * 2.2;
      const gr = g.createRadialGradient(s.x, s.y, 0, s.x, s.y, R);
      gr.addColorStop(0, 'rgba(94,196,216,0.35)'); gr.addColorStop(1, 'rgba(94,196,216,0)');
      g.fillStyle = gr; g.fillRect(s.x - R, s.y - R, R * 2, R * 2);
      g.restore();
    }
    g.globalAlpha = .82 + .18 * n;
    if (s.dark) {
      g.save();
      g.fillStyle = 'rgba(120,120,130,0.6)';
      g.beginPath(); g.arc(s.x, s.y, Math.max(2, r * 0.6), 0, Math.PI * 2); g.fill();
      g.restore();
    } else {
      drawStarMarker(g, s.x, s.y, r, s.star, { t: timeSec, hover: s.hovered, selected: s.selected, lum: clamp(Math.log10(1 + Math.max(0, s.star.lum ?? 1) * 8) / 1.5, 0, 1) });
    }
    g.globalAlpha = 1;
    if (s.relay && s.relayRadiusPx) {
      g.save(); g.strokeStyle = 'rgba(94,196,216,0.35)'; g.lineWidth = 1.5; g.setLineDash([4, 4]); g.lineDashOffset = -timeSec * 4;
      g.beginPath(); g.arc(s.x, s.y, s.relayRadiusPx, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
      g.restore();
    }
  }
  for (const s of order) {
    const r = radius(s);
    if (s.selected) drawSelection(g, s.x, s.y, r + 4, timeSec);
    if (s.isShip) drawShip(g, s.x, s.y, r + 4, timeSec);
  }
  // route distance on the selected route only
  if (route && route.from && route.to && ctx.routeLabel) {
    const mx = (route.from.x + route.to.x) / 2, my = (route.from.y + route.to.y) / 2;
    g.save(); g.font = '700 13px "Liberation Sans Narrow","DejaVu Sans Condensed",sans-serif'; if ('letterSpacing' in g) g.letterSpacing = '.6px';
    const tx = String(ctx.routeLabel).toUpperCase(), tw = g.measureText(tx).width + 12;
    g.fillStyle = 'rgba(14,11,5,.85)'; g.fillRect(mx - tw / 2, my - 10, tw, 20);
    g.strokeStyle = 'rgba(214,162,58,.8)'; g.lineWidth = 1; g.strokeRect(mx - tw / 2 + .5, my - 9.5, tw - 1, 19);
    g.fillStyle = '#ffd27a'; g.textAlign = 'center'; g.fillText(tx, mx, my + 4.5); g.restore();
  }
  P.e('m.mark'); P.b('m.pois');
  for (const p of ctx.pois || []) drawPoi(g, p.x, p.y, p.kind, p.source, timeSec, p.hovered);
  P.e('m.pois'); P.b('m.beetles');
  for (const b of ctx.beetles || []) drawBeetle(g, b.x, b.y, timeSec);
  P.e('m.beetles'); P.b('m.lab');
  g.save();
  if ('letterSpacing' in g) g.letterSpacing = '.5px';
  const bounds = ctx.bounds || { l: 6, t: 96, r: W - 6, b: H - 36 };
  const ents = stars.map(s => {
    const tags = []; if (s.isShip) tags.push({ text: 'Hail Mary', ship: true }); if (s.tag) tags.push({ text: s.tag });
    const showSub = s.selected || s.hovered || s.tag || s.isShip;
    return Object.assign({}, s, { mr: radius(s) + 8, tags, sub: showSub ? s.sub : undefined });
  });
  for (const L of layoutLabels(g, ents, W, H, bounds)) paintLabel(g, L.e, L.m, L.box, L.leader);
  g.restore();
  g.restore(); P.e('m.lab');
}


export function drawLane(g, x1, y1, x2, y2, infection, timeSec = 0) {
  const len = Math.hypot(x2 - x1, y2 - y1);
  if (len < 4) return;
  const inf = clamp(infection || 0, 0, 1);
  g.save();
  g.lineCap = 'butt';
  const r = Math.round(200 + 30 * inf), gg = Math.round(120 - 40 * inf), b = 50;
  g.strokeStyle = `rgba(${r},${gg},${b},${0.18 + 0.45 * inf})`;
  g.lineWidth = 0.8 + 1.2 * inf;
  g.setLineDash([5, 5]);
  g.lineDashOffset = -timeSec * 6;
  g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
  g.setLineDash([]);
  g.restore();
}

export function drawPoi(g, x, y, kind, source, timeSec = 0, hovered = false) {
  g.save();
  if (source) {
    const pulse = 0.5 + 0.5 * Math.sin(timeSec * 3);
    const R = 10 + pulse * 6;
    g.globalCompositeOperation = 'lighter';
    const gr = g.createRadialGradient(x, y, 0, x, y, R);
    gr.addColorStop(0, 'rgba(170,90,255,0.6)'); gr.addColorStop(1, 'rgba(170,90,255,0)');
    g.fillStyle = gr; g.fillRect(x - R, y - R, R * 2, R * 2);
    g.globalCompositeOperation = 'source-over';
    g.strokeStyle = 'rgba(170,90,255,0.9)'; g.lineWidth = 1.5;
    g.beginPath(); g.arc(x, y, R, 0, Math.PI * 2); g.stroke();
  }
  const colors = { derelict: '#c9a2ff', rogue: '#ff7a7a', cloud: '#7adfff', buoy: '#ffd27a', nebula: '#b388ff', wreck: '#ff9b6a' };
  const col = colors[kind] || '#ffffff';
  g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 1.5;
  const r = 4;
  if (kind === 'derelict') { g.strokeRect(x - r, y - r, r * 2, r * 2); }
  else if (kind === 'rogue') { g.beginPath(); g.moveTo(x, y - r); g.lineTo(x + r, y); g.lineTo(x, y + r); g.lineTo(x - r, y); g.closePath(); g.stroke(); }
  else if (kind === 'cloud') { g.globalAlpha = 0.7; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1; }
  else if (kind === 'buoy') { g.beginPath(); g.moveTo(x, y - r); g.lineTo(x + r, y + r); g.lineTo(x - r, y + r); g.closePath(); g.stroke(); }
  else if (kind === 'nebula') { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.arc(x, y, r * 0.5, 0, Math.PI * 2); g.fill(); }
  else if (kind === 'wreck') { g.beginPath(); g.moveTo(x - r, y - r); g.lineTo(x + r, y + r); g.moveTo(x + r, y - r); g.lineTo(x - r, y + r); g.stroke(); }
  else { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke(); }
  if (hovered) {
    g.strokeStyle = 'rgba(255,226,150,.9)'; g.lineWidth = 1.5;
    g.beginPath(); g.arc(x, y, r + 3, 0, Math.PI * 2); g.stroke();
  }
  g.restore();
}

export function drawBeetle(g, x, y, timeSec = 0) {
  g.save();
  g.fillStyle = '#d6a23a';
  g.beginPath(); g.arc(x, y, 2.5, 0, Math.PI * 2); g.fill();
  g.restore();
}

export default { drawMapFrame, drawBackground, drawStarGlow, drawStarMarker, drawInfection, drawPetrovaLink, drawGrid, drawStem, drawShip, drawRoute, drawSelection };
