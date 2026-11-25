import { $, esc, row, fmt, rgb } from './util.js';
import { sfx, music } from '../audio/index.js';

// System scene UI: planet labels + side panels (system list, planet info).
export function createSystemUI(api) {
  const labels = $('labels'), pSys = $('panel-system'), pPlanet = $('panel-planet');
  let labelEls = new Map(), key = '', lastResult = {}, transfer = null, mark = null;
  const COSTS = api.sim.COSTS;
  const costTxt = (c) => (c ? `${c.fuelKg} kg fuel, ${fmt(c.shipDays, 1)} d` : '');

  function planets() { return api.currentStar().planets; }
  function find(id) { return planets().find((p) => p.id === id); }

  function buildLabels() {
    const star = api.currentStar();
    const k = star.id;
    if (k === key) return;
    key = k; labels.innerHTML = ''; labelEls = new Map();
    mark = document.createElement('div'); mark.className = 'shipmark'; mark.textContent = 'HAIL MARY'; labels.appendChild(mark);
    for (const p of star.planets) {
      const d = document.createElement('div');
      d.className = 'plabel';
      d.innerHTML = `${esc(p.name)}<small>${esc(p.type)}</small>`;
      d.addEventListener('click', (e) => { e.stopPropagation(); api.selectPlanet(p.id); });
      labels.appendChild(d); labelEls.set(p.id, d);
    }
  }
  function updateLabels(visible) {
    buildLabels();
    const r = api.renderer;
    for (const [id, d] of labelEls) {
      const sp = visible && r ? r.planetScreenPos(id) : null;
      if (!sp) { d.style.display = 'none'; continue; }
      d.style.display = '';
      d.style.left = sp.x + 'px'; d.style.top = (sp.y + (sp.r || 0) + 6) + 'px';
      d.classList.toggle('sel', api.selectedId() === id);
      d.classList.toggle('orb', !transfer && api.state().ship.planetId === id);
    }
    placeMark(visible);
  }
  // Ship marker: attached to the Hail Mary's real screen position (parking orbit, planet orbit or transfer arc), never the star.
  function placeMark(visible) {
    if (!mark) return;
    const r = api.renderer, st = api.state(), sp = visible && r && r.shipScreenPos && r.shipScreenPos();
    if (!sp) { mark.style.display = 'none'; return; }
    const id = st.ship.planetId || null;
    const text = transfer ? 'HAIL MARY \u25B8' : id ? 'HAIL MARY \u00B7 ORBIT' : 'HAIL MARY \u00B7 PARKING';
    mark.style.display = ''; if (mark.textContent !== text) mark.textContent = text;
    mark.style.left = sp.x + 'px'; mark.style.top = (sp.y - 26) + 'px';
  }
  function hideLabels() { for (const d of labelEls.values()) d.style.display = 'none'; if (mark) mark.style.display = 'none'; }

  function actions(p) {
    const st = api.state(), orbiting = st.ship.planetId === p.id, plan = api.sim.travelToPlanetPlan(st, p.id);
    const tg = api.sim.petrovaTarget(api.currentStar().planets), isTarget = !!tg && tg.id === p.id, hp = api.sim.harvestPlan(st, 'collector'), sk = api.sim.harvestPlan(st, 'skim');
    let h = '<h4>Navigation</h4>' + row('Position', orbiting ? '<span class="ok">IN ORBIT</span>' : 'not in orbit');
    if (!orbiting) {
      h += row('Transfer', `${plan.ok || plan.fuelKg ? plan.fuelKg + ' kg, ' + fmt(plan.shipDays, 1) + ' d' : '--'}`, plan.ok ? '' : 'warn');
    }
    h += `<div class="btns">${orbiting ? '' : `<button class="small primary" data-a="hop" ${plan.ok ? '' : 'disabled'}>Fly to orbit</button>`}
      <button class="small" data-a="scan">Scan</button>
      <button class="small" data-a="sample" ${orbiting ? '' : 'disabled'}>Sample</button>
      ${isTarget && orbiting ? `<button class="small primary" data-a="harvest" ${hp.ok ? '' : 'disabled'}>Harvest</button>` : ''}
      ${isTarget ? `<button class="small" data-a="skim" ${sk.ok ? '' : 'disabled'}>Skim line</button>` : ''}
      <button class="small" data-a="closeup">Close-up</button></div>`;
    if (isTarget) h += `<div class="note why">Petrova-line planet: Astrophage breeds here. ${hp.ok ? `HARVEST: ${hp.days} days, about ${hp.kg} kg fuel.` : esc(hp.reason)} ${sk.ok ? `SKIM (near the star): ${sk.days} days, about ${sk.kg} kg, hull -${Math.round(sk.hullCost * 100)}%.` : ''}</div>`;
    if (!orbiting && !plan.ok && plan.reason) h += `<div class="note why">${esc(plan.reason)}</div>`;
    if (!orbiting) h += '<div class="note why">Sweeps and sampling need orbit. Fly to orbit first.</div>';
    const close = orbiting || (st.ship.planetId && api.sim.orbitDistanceAu(st, p) <= 0.6);
    const sc = close ? COSTS.scan : COSTS.scanRemote;
    h += `<div class="note cost">${orbiting ? `Sweep costs ${api.sim.SCAN.fuelKg} kg, ${fmt(api.sim.SCAN.years * 365.25, 1)} d.` : `Scan (remote, no biosignatures) costs ${sc.fuelKg} kg, ${fmt(sc.years * 365.25, 1)} d.`} A sample costs ${COSTS.sample.fuelKg} kg, ${fmt(COSTS.sample.years * 365.25, 1)} d.</div>`;
    h += `<div class="res ${lastResult[p.id] && lastResult[p.id].bad ? 'bad' : ''}" ${lastResult[p.id] ? '' : 'hidden'}>${esc(lastResult[p.id] ? lastResult[p.id].t : '')}</div>`;
    return h;
  }
  function wire(root, p) {
    root.querySelectorAll('[data-a]').forEach((b) => b.addEventListener('click', () => {
      const a = b.dataset.a;
      if (a === 'closeup') return api.openPlanet(p.id);
      if (a === 'back') return api.setScene('system');
      if (a === 'hop') return api.hop(p.id);
      if (a === 'harvest') return api.ops.startHarvest('collector', p.id);
      if (a === 'skim') return api.ops.startHarvest('skim', p.id);
      if (a === 'sample') return api.ops.startSample(p.id);
      if (a === 'scan' && api.state().ship.planetId === p.id) return api.ops.startScan(p.id);
      const r = api.sim.scanPlanet(api.state(), p.id);
      let t = r.text || '';
      if (r.findings && r.findings.length) t += '\n- ' + r.findings.join('\n- ');
      if (r.cost) t += `\n[cost: ${costTxt(r.cost)}]`;
      lastResult[p.id] = { t, bad: r.ok === false };
      api.afterAction(r.text, r.ok === false);
      if (a === 'scan' && r.ok) { sfx.play('scanBurst'); api.event('scan'); }
      renderSystem(); renderPlanet();
    }));
  }

  function renderSystem() {
    const star = api.currentStar();
    const sel = api.selectedId();
    const stt0 = api.state(), pl0 = stt0.ship.planetId && star.planets.find((x) => x.id === stt0.ship.planetId);
    let h = `<h3>${esc(star.name)} system</h3>` + row('Ship', pl0 ? `orbit of ${esc(pl0.name)}` : `parking, ${fmt(api.sim.shipOrbit(stt0), 1)} AU`) +
      row('Class', esc(star.spectral)) +
      row('Luminosity', Math.round((star.lum0 ? star.lum / star.lum0 : 1) * 100) + '%') +
      row('Infection', Math.round(star.infection * 100) + '%', star.infection > 0.5 ? 'warn' : '') +
      `<h4>Planets</h4><div class="plist">`;
    for (const p of star.planets) {
      h += `<button data-p="${esc(p.id)}" class="${p.id === sel ? 'sel' : ''} ${pl0 && pl0.id === p.id ? 'here' : ''}">${esc(p.name)}<span class="tag">${esc(p.type)}</span>` +
        `${p.scanned ? `<span class="tag on">${p.scanLevel === 1 ? 'REMOTE' : 'SCANNED'}</span>` : ''}${p.sampled ? '<span class="tag on">SAMPLED</span>' : ''}<span class="au">${fmt(p.orbit, 2)} AU</span></button>`;
    }
    h += '</div>';
    const p = sel && find(sel);
    if (p) {
      h += `<h4>${esc(p.name)}</h4>` + row('Type', esc(p.type)) + row('Radius', fmt(p.radius, 2) + ' R⊕') +
        row('Orbit', fmt(p.orbit, 2) + ' AU') + actions(p);
    } else h += '<div class="note">Click a planet or pick one from the list. Drag to orbit, wheel to zoom.</div>';
    const stt = api.state();
    if ((star.id === 'sol' || star.id === 'eri40') && stt.status === 'playing') {
      const done = stt.delivered[star.id];
      const dest = star.planets.find((x) => x.special === 'earth' || x.special === 'erid');
      const tol = stt.lab.strains.some((x) => x.nTolerance >= 0.9 && x.population > 0);
      const inOrb = dest && stt.ship.planetId === dest.id;
      h += `<h4>Mission</h4>` + (done ? '<div class="note">Taumoeba already released here.</div>' :
        `<div class="btns"><button class="primary" data-d="deliver" ${tol && inOrb ? '' : 'disabled'}>Release Taumoeba</button></div>` +
        (inOrb ? '' : `<div class="note why">Fly to orbit around ${esc(dest.name)} first.</div>`) +
        (tol ? '' : '<div class="note why">Needs a strain with 90% nitrogen tolerance (breed in the lab).</div>'));
    }
    pSys.innerHTML = h;
    const dl = pSys.querySelector('[data-d="deliver"]');
    if (dl) dl.addEventListener('click', () => { const r = api.sim.deliver(api.state()); if (r.ok !== false) { music.stinger('deliver'); sfx.play('chimeBig'); } api.afterAction(r.text, r.ok === false); renderSystem(); });
    pSys.querySelectorAll('[data-p]').forEach((b) => b.addEventListener('click', () => api.selectPlanet(b.dataset.p)));
    if (p) wire(pSys, p);
  }

  function renderPlanet() {
    const sel = api.selectedId(), p = sel && find(sel);
    if (!p) { pPlanet.innerHTML = ''; return; }
    const a = p.atmo || { color: [1, 1, 1], density: 0 };
    let h = `<h3>${esc(p.name)}</h3>` + row('Type', esc(p.type)) + row('Radius', fmt(p.radius, 2) + ' R⊕') +
      row('Orbit', fmt(p.orbit, 2) + ' AU') + row('Period', Math.round(p.periodDays) + ' days') +
      row('Atmosphere', `<span style="color:${rgb(a.color)}">●</span> ${Math.round(a.density * 100)}%`) +
      row('Rings', p.rings ? 'yes' : 'none') + row('Scanned', p.scanned ? (p.scanLevel === 1 ? 'remote only' : 'full') : 'no', p.scanned ? 'ok' : '') +
      row('Sampled', p.sampled ? 'yes' : 'no', p.sampled ? 'ok' : '') + actions(p) +
      `<div class="btns"><button class="small" data-a="back">Back to system</button></div>`;
    pPlanet.innerHTML = h;
    wire(pPlanet, p);
  }
  return { updateLabels, hideLabels, renderSystem, renderPlanet, setTransfer(t) { transfer = t; }, resetNotes() { lastResult = {}; key = ''; } };
}
