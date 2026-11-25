import { $, esc, row, fmt } from './util.js';
import { sfx } from '../audio/index.js';

export function createLab(api) {
  const root = $('panel-lab');
  let history = [], nitrogen = 10, last = '';
  let selectedStrainId = null, focusTrait = null, genStatus = '', genStatusBad = false;
  function reset() { history = []; last = ''; selectedStrainId = null; focusTrait = null; genStatus = ''; genStatusBad = false; }
  function statusHtml() {
    return genStatus
      ? `<div id="lab-gen-result" class="res${genStatusBad ? ' bad' : ''}">${esc(genStatus)}</div>`
      : `<div id="lab-gen-result" class="res hidden"></div>`;
  }
  // The trait where this star's biosphere needs the most improvement over the strain.
  function focusFor(strain, profile) {
    const traits = api.sim.TRAITS || [];
    if (!strain || !profile || !traits.length) return traits[0] || 'nitrogen';
    let focus = traits[0], gap = -Infinity;
    for (const t of traits) {
      const d = (profile[t] ?? 0) - (strain.traits?.[t] ?? 0);
      if (d > gap) { gap = d; focus = t; }
    }
    return focus;
  }
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
  function renderOld() {
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
      if (/breach/i.test(last)) setTimeout(() => sfx.play('klaxon'), 600);
      if (r.ok !== false) history.push({ g: api.state().lab.generations, v: api.state().lab.bestTolerance });
      api.afterAction(r.text, r.ok === false);
      if (r.ok !== false && api.event) api.event('breed');
      render();
    });
    chart($('lab-chart'));
  }

  function renderGenetics() {
    const st = api.state();
    const sim = api.sim;
    const g = st.genetics || { strains: [], nextId: 1, best: null };
    const strains = g.strains || [];
    const bestStrain = strains.find((x) => x.id === g.best) || strains[strains.length - 1] || null;
    const star = st.stars.find((s) => s.id === st.ship.starId);
    const profile = star ? sim.biosphereProfile(star) : null;
    const cov = bestStrain && profile ? sim.coverage(bestStrain, profile) : 0;
    const bioTraits = sim.BIOSPHERE || sim.TRAITS || [];

    // Keep the player's choices across re-renders, falling back if a strain was culled by breeding.
    if (selectedStrainId && !strains.some((x) => x.id === selectedStrainId)) selectedStrainId = null;
    const selectedStrain = strains.find((x) => x.id === selectedStrainId) || bestStrain;
    if (!sim.TRAITS.includes(focusTrait)) focusTrait = focusFor(selectedStrain, profile);

    if (!strains.length) {
      let h = `<h3>Xenonite lab <span class="dim">Genetics</span></h3>`;
      h += `<div class="note">No strains yet. Seed a wild strain to begin.</div>`;
      h += `<div class="btns"><button class="primary" id="lab-seed">SEED STRAIN</button></div>`;
      h += statusHtml();
      root.innerHTML = h;
      const sb = $('lab-seed');
      if (sb) sb.addEventListener('click', () => {
        const s = sim.newStrain(st);
        selectedStrainId = s ? s.id : null;
        focusTrait = null;
        genStatus = 'Seeded a new strain.';
        genStatusBad = false;
        api.afterAction(genStatus, false);
        render();
      });
      return;
    }

    let h = `<h3>Xenonite lab <span class="dim">Genetics</span></h3>`;
    h += `<h4>Strains <span class="dim">select one to breed or deliver</span></h4><div class="strain-list">`;
    for (const s of strains) {
      const selected = s.id === selectedStrain?.id;
      h += `<div class="strain-card ${selected ? 'selected' : ''}" data-id="${esc(s.id)}">`;
      h += `<div class="strain-head"><input class="strain-name" data-id="${esc(s.id)}" value="${esc(s.name || s.id)}" /><span class="gen">gen ${s.gen}</span></div>`;
      h += `<div class="traits">`;
      for (const t of sim.TRAITS) {
        const v = s.traits?.[t] ?? 0;
        h += `<div class="trait-row"><span>${esc(t)}</span><div class="bar"><i style="width:${Math.round(v * 100)}%"></i></div><span>${Math.round(v * 100)}%</span></div>`;
      }
      h += `</div></div>`;
    }
    h += `</div>`;

    h += `<h4>Breed <span class="dim">from ${esc(selectedStrain ? (selectedStrain.name || selectedStrain.id) : '—')}</span></h4>`;
    h += `<div class="row"><span>Focus trait</span></div>`;
    h += `<div class="focus-traits" id="lab-focus" role="group">` + sim.TRAITS.map((t) => {
      const on = t === focusTrait;
      return `<button type="button" class="focus-btn${on ? ' on selected' : ''}" data-trait="${esc(t)}" aria-pressed="${on}">${esc(String(t).toUpperCase())}</button>`;
    }).join('') + `</div>`;
    h += `<div class="row"><span>Pressure</span><input type="range" id="lab-pressure" min="0" max="100" value="50"><span id="lab-pressure-v">50%</span></div>`;
    h += `<div class="btns"><button class="primary" id="lab-breed">BREED</button></div>`;

    if (star && profile) {
      h += `<h4>Biosphere · ${esc(star.name)}</h4><div class="bio-traits">`;
      for (const t of bioTraits) {
        h += `<div class="bio-row"><span>${esc(String(t).toUpperCase())}</span><div class="bio-bar"><i style="width:${Math.round((profile[t] || 0) * 100)}%"></i></div><span>${Math.round((profile[t] || 0) * 100)}%</span></div>`;
      }
      h += `</div>`;
      h += `<div class="row"><span>Coverage (best strain)</span><span id="lab-cov" class="${cov >= 1 ? 'ok' : 'warn'}">${Math.round(cov * 100)}%</span></div>`;
      const short = bioTraits
        .filter((t) => bestStrain && (bestStrain.traits?.[t] ?? 0) < (profile[t] ?? 0))
        .sort((a, b) => (profile[b] ?? 0) - (profile[a] ?? 0));
      h += `<div class="cov-short">`;
      h += short.length
        ? `<span class="cov-label">Short</span>` + short.map((t) => `<span class="tag warn">${esc(String(t).toUpperCase())} ${Math.round((bestStrain.traits?.[t] ?? 0) * 100)}% / ${Math.round((profile[t] ?? 0) * 100)}%</span>`).join('')
        : `<span class="dim">All biosphere requirements covered.</span>`;
      h += `</div>`;
    }
    h += `<div class="btns"><button class="primary" id="lab-deliver">DELIVER HERE</button></div>`;
    h += statusHtml();

    root.innerHTML = h;

    root.querySelectorAll('.strain-card').forEach((card) => {
      card.addEventListener('click', (e) => {
        if (e.target.tagName === 'INPUT') return;   // editing a name must not reselect the card
        selectedStrainId = card.dataset.id;
        render();
      });
    });
    root.querySelectorAll('.focus-btn').forEach((btn) => {
      btn.addEventListener('click', () => { focusTrait = btn.dataset.trait; render(); });
    });

    root.querySelectorAll('.strain-name').forEach((inp) => {
      inp.addEventListener('change', () => {
        sim.nameStrain(st, inp.dataset.id, inp.value);
        api.afterAction('', false);
        render();
      });
    });

    const sl = $('lab-pressure');
    if (sl) sl.addEventListener('input', () => { const v = $('lab-pressure-v'); if (v) v.textContent = sl.value + '%'; });

    const breedBtn = $('lab-breed');
    if (breedBtn) breedBtn.addEventListener('click', () => {
      const pressure = +$('lab-pressure').value / 100;
      if (selectedStrain) {
        // sim.breed extends the strain marked as best; point it at the player's selection.
        if (!st.genetics) st.genetics = { strains: [], nextId: 1, best: null };
        st.genetics.best = selectedStrain.id;
      }
      const r = sim.breed(st, { focus: focusTrait, pressure }, sim.tick);
      genStatus = r.text || '';
      genStatusBad = r.ok === false;
      if (r.ok !== false && r.strain) selectedStrainId = r.strain.id;   // keep the chosen focus trait across the re-render
      api.afterAction(r.text, r.ok === false);
      render();
    });

    const delBtn = $('lab-deliver');
    if (delBtn) delBtn.addEventListener('click', () => {
      if (!selectedStrain) return;
      const r = sim.deliverStrain(st, selectedStrain.id);
      genStatus = r.text || '';
      genStatusBad = !r.ok;
      api.afterAction(r.text, !r.ok);
      render();
    });
  }

  function render() {
    const st = api.state();
    if (st.campaign && st.campaign.act >= 2) { renderGenetics(); return; }
    renderOld();
  }

  return { render, reset };
}
