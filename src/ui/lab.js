import { $, esc, row, fmt } from './util.js';
import { sfx } from '../audio/index.js';

export function createLab(api) {
  const root = $('panel-lab');
  let history = [], nitrogen = 10, last = '';
  function reset() { history = []; last = ''; }
  function chart(cv) {
    const w = cv.clientWidth || 300, h = cv.clientHeight || 130, d = Math.min(devicePixelRatio || 1, 2);
    cv.width = w * d; cv.height = h * d;
    const g = cv.getContext('2d'); g.setTransform(d, 0, 0, d, 0, 0);
    g.fillStyle = '#070b10'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(94,196,216,.13)'; g.lineWidth = 1;
    for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(0, h * i / 4); g.lineTo(w, h * i / 4); g.stroke(); }
    const pts = history; if (!pts.length) { g.fillStyle = '#66768a'; g.font = '11px "JetBrainsMono NFM","DejaVu Sans Mono",monospace'; g.fillText('no data: breed a generation', 10, h / 2); return; }
    const n = Math.max(pts.length, 2), X = (i) => 8 + (w - 16) * (i / (n - 1)), Y = (v) => h - 8 - (h - 16) * v;
    g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(X(i), Y(p.v)) : g.moveTo(X(i), Y(p.v))));
    g.strokeStyle = '#e8a93c'; g.lineWidth = 1.5; g.stroke();
    pts.forEach((p, i) => { g.fillStyle = '#e8a93c'; g.fillRect(X(i) - 2, Y(p.v) - 2, 4, 4); });
    g.fillStyle = '#66768a'; g.font = '10px "JetBrainsMono NFM","DejaVu Sans Mono",monospace'; g.fillText('best N tolerance / generation', 8, 12);
  }
  function render() {
    const st = api.state(), lab = st.lab;
    if (!history.length) history.push({ g: lab.generations, v: lab.bestTolerance });
    const risk = lab.escapeRisk;
    let h = `<h3>Xenonite lab <span class="dim">Taumoeba breeding</span></h3><div class="cols"><div>
      <h4>Nitrogen environment</h4>
      <input type="range" id="lab-n" min="0" max="100" step="1" value="${nitrogen}">
      <div class="row"><span>Nitrogen</span><span id="lab-nv" style="color:var(--acc)">${nitrogen}%</span></div>
      <div class="btns"><button class="primary" id="lab-breed">Breed generation</button></div>
      <div class="note cost">Each generation costs ${api.sim.COSTS.breed.fuelKg} kg fuel and ${(api.sim.COSTS.breed.years * 365.25).toFixed(1)} days.</div>
      ${last ? `<div class="res">${esc(last)}</div>` : ''}
      <h4>Stats</h4>` + row('Generations', lab.generations) + row('Best tolerance', Math.round(lab.bestTolerance * 100) + '%', 'ok') +
      row('Samples on hand', st.ship.samples) +
      `<h4>Escape risk</h4><div class="risk"><b class="z1"></b><b class="z2"></b><b class="z3"></b><i style="left:calc(${Math.round(risk * 100)}% - 1px)"></i></div>
      <div class="row"><span></span><span class="${risk > 0.6 ? 'warn' : ''}">${Math.round(risk * 100)}%</span></div>
      <div class="note">Taumoeba that learns to eat xenonite will breach the hull. Keep this low.</div>
      </div><div><h4>Strains</h4>`;
    const strains = lab.strains.slice().sort((a, b) => b.nTolerance - a.nTolerance).slice(0, 8);
    if (!strains.length) h += '<div class="note">No strains yet. Sample Adrian\'s Taumoeba first.</div>';
    for (const s of strains) {
      h += `<div class="strain"><span>${esc(String(s.id).slice(0, 8))}</span><div class="bar"><i style="width:${Math.round(s.nTolerance * 100)}%"></i></div><span>${Math.round(s.nTolerance * 100)}%</span></div>`;
    }
    h += `<h4>Best tolerance by generation</h4><div class="scr"><canvas class="chart" id="lab-chart"></canvas></div></div></div>`;
    root.innerHTML = h;
    const sl = $('lab-n');
    sl.addEventListener('input', () => { nitrogen = +sl.value; $('lab-nv').textContent = nitrogen + '%'; });
    $('lab-breed').addEventListener('click', () => {
      const r = api.sim.breedStep(api.state(), { nitrogenPct: nitrogen });
      last = r.text || '';
      if (r.ok !== false) sfx.play('breed');
      if (/breach/i.test(last)) setTimeout(() => sfx.play('klaxon'), 600);   // escape-breach klaxon
      if (r.ok !== false) history.push({ g: api.state().lab.generations, v: api.state().lab.bestTolerance });
      api.afterAction(r.text, r.ok === false);
      if (r.ok !== false && api.event) api.event('breed');
      render();
    });
    chart($('lab-chart'));
  }
  return { render, reset };
}
