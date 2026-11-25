import { $, fmt, clamp } from './util.js';
import { music, sfx } from '../audio/index.js';
export const LOW_YEARS = 10;
const DECAY_SCALE = 50;           // years of starlight the countdown bar spans (full bar = 50 yr or more)
const NS = 'http://www.w3.org/2000/svg';
let lowArmed = false;

// ---- arc gauge: 20 segments over a 240 degree sweep, 5 scale ticks, a pointer that settles with a little overshoot ----
const A0 = -120, SWEEP = 240, SEGS = 20, CX = 32, CY = 30, R = 21;
const pol = (r, deg) => { const a = (deg - 90) * Math.PI / 180; return [CX + r * Math.cos(a), CY + r * Math.sin(a)]; };
function gauge(id, labels) {
  const box = $(id);
  if (!box._cells) {
    const step = SWEEP / SEGS, gap = 2.6;
    let s = '<svg viewBox="0 0 64 46" aria-hidden="true">';
    for (let i = 0; i < SEGS; i++) {
      const [x1, y1] = pol(R, A0 + i * step + gap / 2), [x2, y2] = pol(R, A0 + (i + 1) * step - gap / 2);
      s += `<path class="sg" d="M${x1.toFixed(2)} ${y1.toFixed(2)}A${R} ${R} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}"/>`;
    }
    for (let i = 0; i <= 4; i++) {
      const [a, b] = pol(R + 3.6, A0 + i * SWEEP / 4), [c, d] = pol(R + (i % 2 ? 5.4 : 7), A0 + i * SWEEP / 4);
      s += `<line class="tk" x1="${a.toFixed(2)}" y1="${b.toFixed(2)}" x2="${c.toFixed(2)}" y2="${d.toFixed(2)}"/>`;
    }
    if (labels) {
      const [lx, ly] = pol(R, A0), [rx, ry] = pol(R, A0 + SWEEP);
      s += `<text class="gt" x="${(lx - 1).toFixed(1)}" y="${(ly + 7).toFixed(1)}" text-anchor="middle">${labels[0]}</text><text class="gt" x="${(rx + 1).toFixed(1)}" y="${(ry + 7).toFixed(1)}" text-anchor="middle">${labels[1]}</text>`;
    }
    s += `<g class="needle"><line x1="${CX}" y1="${CY}" x2="${CX}" y2="${CY - R + 4}"/><circle cx="${CX}" cy="${CY}" r="2.4"/></g></svg>`;
    box.innerHTML = s;
    box._cells = [...box.querySelectorAll('.sg')]; box._needle = box.querySelector('.needle'); box._lit = -1; box._f = -1;
  }
  return (frac) => {
    const f = clamp(frac, 0, 1), n = Math.round(f * SEGS), lit = f > 0 && n === 0 ? 1 : n;
    if (Math.abs(f - box._f) > 0.0008) { box._f = f; box._needle.style.transform = `rotate(${(A0 + f * SWEEP).toFixed(1)}deg)`; }
    if (lit === box._lit) return;
    box._lit = lit;
    box._cells.forEach((c, i) => c.classList.toggle('on', i < lit));
  };
}

// ---- rolling digits: each character is its own cell, and only the cells that changed animate ----
// mode 'flap' = split-flap card flipping down, 'slide' = digit dropping in. No animation while a jump drives the values.
function roll(el, text, mode, animate) {
  if (el._t === text) return;
  const had = el._c && el._c.length === text.length;
  if (!had) {
    el.textContent = '';
    el._c = [...text].map((ch) => { const s = document.createElement('span'); s.className = /\d/.test(ch) ? 'c' : 'c p'; s.textContent = ch; el.appendChild(s); return s; });
  } else {
    [...text].forEach((ch, i) => {
      const s = el._c[i];
      if (s.textContent === ch) return;
      s.textContent = ch; s.className = /\d/.test(ch) ? 'c' : 'c p';
      if (animate && s.animate) {
        s.animate(mode === 'flap' ? [{ transform: 'scaleY(.12)', filter: 'brightness(1.6)' }, { transform: 'scaleY(1)', filter: 'none' }]
          : [{ transform: 'translateY(-45%)', opacity: 0.1 }, { transform: 'none', opacity: 1 }], { duration: mode === 'flap' ? 170 : 200, easing: 'ease-out' });
      }
    });
  }
  el._t = text;
}

export function createHud(sim) {
  const set = (id, t) => { const e = $(id); if (e._t !== t) { e._t = t; e._c = null; e.textContent = t; } };
  let fuelG = null, hullG = null, override = null, deckObs = null;
  const decay = (k, y) => {
    const f = Number.isFinite(y) ? clamp(y / DECAY_SCALE, 0, 1) : 1, i = $('h-' + k + '-d').firstElementChild;
    if (Math.abs((i._f ?? -1) - f) > 0.002) { i._f = f; i.style.width = (f * 100).toFixed(1) + '%'; }
  };
  return {
    show(v) {
      $('hud').classList.toggle('hidden', !v); $('tabs').classList.toggle('hidden', !v); $('objective').classList.toggle('hidden', !v);
      // Panels and the map fit themselves below the dashboard, whatever height its objective line wraps to.
      if (!deckObs && window.ResizeObserver) {
        const deck = $('deck'), push = () => document.documentElement.style.setProperty('--deck-h', Math.ceil(deck.getBoundingClientRect().bottom) + 'px');
        deckObs = new ResizeObserver(push); deckObs.observe(deck); push();
      }
    },
    // While a jump plays, the clocks, fuel and countdowns show animated values instead of the sim's.
    // o = { world, ship, fuelKg, earth, erid } (years / kg); null releases it.
    setOverride(o) { override = o; $('hud').classList.toggle('live', !!o); },
    update(state) {
      fuelG = fuelG || gauge('h-fuel', ['E', 'F']); hullG = hullG || gauge('h-hull');
      const sh = state.ship, o = override, anim = !o;
      roll($('h-world'), fmt(o ? o.world : state.time.worldYears, 2), 'flap', anim);
      roll($('h-ship'), fmt(o ? o.ship : state.time.shipYears, 2), 'flap', anim);
      const fuel = o ? o.fuelKg : sh.fuelKg;
      fuelG(fuel / sh.fuelMaxKg);
      roll($('h-fuel-t'), String(Math.round(fuel)), 'slide', anim);
      const tip = `${Math.round(fuel)} / ${Math.round(sh.fuelMaxKg)} kg`, fe = $('h-fuel');
      if (fe._tip !== tip) { fe._tip = tip; fe.title = tip; }
      hullG(sh.hull);
      roll($('h-hull-t'), Math.round(sh.hull * 100) + '%', 'slide', anim);
      $('h-fuel').classList.toggle('low', fuel / sh.fuelMaxKg < 0.1);
      $('h-hull').classList.toggle('low', sh.hull < 0.25);
      roll($('h-samples'), String(sh.samples), 'flap', anim);
      const star = state.stars.find((s) => s.id === sh.starId);
      const planet = sh.planetId && star.planets.find((p) => p.id === sh.planetId);
      set('h-loc', star.name);
      set('h-orbit', planet ? `Orbit: ${planet.name} ${fmt(planet.orbit, 2)} AU` : `Parking orbit ${fmt(sim.shipOrbit(state), 1)} AU`);
      $('h-loc-b').classList.toggle('orbiting', !!planet);
      const ys = [];
      for (const k of ['earth', 'erid']) {
        const y = o ? o[k] : sim.extinctionYears(state, k);
        ys.push(y);
        if (Number.isFinite(y)) roll($('h-' + k), 'T−' + fmt(y), 'slide', anim); else set('h-' + k, 'SAFE');
        decay(k, y);
        $('h-' + k + '-b').classList.toggle('low', y < LOW_YEARS);
      }
      // audio: the lower countdown darkens the score under LOW_YEARS; a soft alarm sounds once when one first drops below it
      const low = Math.min(...ys.map((y) => (Number.isFinite(y) ? y : Infinity)));
      music.setTension(state.status === 'playing' ? low : 0);
      if (low < LOW_YEARS && !lowArmed) { lowArmed = true; sfx.play('alarm'); } else if (low > LOW_YEARS + 2) lowArmed = false;
    },
    renderLog(state) {
      const box = $('log');
      const last = state.log.slice(-4);
      const key = last.length + ':' + (last.length ? last[last.length - 1].text : '');
      if (box._key === key) return;
      box._key = key;
      box.innerHTML = '';
      for (const l of last) {
        const d = document.createElement('div');
        d.textContent = `T+${fmt(l.worldYears, 2)}  ${l.text}`;
        box.appendChild(d);
      }
    },
  };
}
