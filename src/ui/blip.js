import { $, esc, row, fmt } from './util.js';
import { sfx } from '../audio/index.js';

// BLIP-A station (tab 4): Rocky's ship. Dock state, his location and mission, the materials he has gathered,
// gather missions for the current system, and the xenonite crafting list. All logic is in sim/rocky.js.
const MATS = ['minerals', 'volatiles', 'gas', 'silicates'];
const MAT_LABEL = { minerals: 'Minerals', volatiles: 'Volatiles', gas: 'Gas', silicates: 'Silicates' };
const yieldText = (y) => MATS.filter((m) => y[m]).map((m) => `+${y[m]} ${m}`).join(', ');

export function createBlip(api) {
  const root = $('panel-blip');
  const S = () => api.state(), sim = api.sim;

  function reset() { /* nothing cached */ }

  // Rocky's location: the planet he is at, or "with the Hail Mary" while docked.
  function location(st) {
    const r = st.rocky;
    if (r.docked) return 'with the Hail Mary';
    const star = st.stars.find((s) => s.id === r.starId);
    if (!star) return '—';
    const p = r.planetId && star.planets.find((x) => x.id === r.planetId);
    return p ? `${star.name} · ${p.name}` : `${star.name} · parking orbit`;
  }

  function missionName(st) {
    const m = st.rocky.mission;
    if (!m) return '';
    const star = st.stars.find((s) => s.id === st.ship.starId);
    const p = star && star.planets.find((x) => x.id === m.planetId);
    return p ? p.name : 'the Blip-A';
  }

  function missionProgress(st) {
    const m = st.rocky.mission;
    if (!m) return 0;
    const span = Math.max(1e-9, m.endYears - m.startYears);
    return Math.max(0, Math.min(1, (st.time.worldYears - m.startYears) / span));
  }

  function gatherHTML(st) {
    const star = st.stars.find((s) => s.id === st.ship.starId);
    const petrova = sim.petrovaTarget(star.planets);
    let h = '';
    for (const p of star.planets) {
      const plan = sim.missionPlan(st, 'gather', p.id);
      const isP = petrova && petrova.id === p.id;
      const sub = plan.ok
        ? `${fmt(plan.days, 1)} days · ${yieldText(plan.yield)}${plan.yield.astrophageKg ? ` + ${fmt(plan.yield.astrophageKg, 0)} kg Astrophage` : ''}`
        : esc(plan.reason);
      h += `<div class="brow"><div class="bmain"><span class="bname">${esc(p.name)}${isP ? ' <span class="tag acc">+ Astrophage fuel</span>' : ''}</span>` +
        `<span class="bsub">${sub}</span></div>` +
        `<button class="small go" data-p="${esc(p.id)}" ${plan.ok ? '' : 'disabled'} title="${esc(plan.ok ? '' : plan.reason)}">GO</button></div>`;
    }
    return h;
  }

  function craftHTML(st) {
    let h = '';
    for (const r of sim.recipes(st)) {
      const cost = MATS.filter((m) => r.cost[m]).map((m) => `${r.cost[m]} ${m}`).join(', ');
      const right = r.built
        ? '<span class="tag on">BUILT</span>'
        : `<button class="small" data-c="${esc(r.id)}" ${r.can ? '' : 'disabled'} title="${esc(r.why)}">BUILD</button>`;
      h += `<div class="brow"><div class="bmain"><span class="bname">${esc(r.title)}</span>` +
        `<span class="bsub">${esc(r.desc)} · ${cost} · ${r.days} d${r.built ? '' : r.can ? '' : ' · ' + esc(r.why)}</span></div>${right}</div>`;
    }
    return h;
  }

  function render() {
    const st = S(), r = st.rocky, star = st.stars.find((s) => s.id === st.ship.starId);
    let h = `<h3>Blip-A <span class="dim">Rocky's ship</span></h3>`;
    h += `<h4>Dock</h4>` + row('Blip-A', r.docked ? '<span class="ok">DOCKED · tunnel connected</span>' : '<span class="warn">AWAY</span>') +
      `<div class="btns"><button class="small" id="blip-dock">${r.docked ? 'UNDOCK' : 'DOCK'}</button></div>`;
    h += `<h4>Rocky</h4>` + row('Location', esc(location(st)));
    if (r.mission) {
      h += row('Mission', `gathering · ${esc(missionName(st))}`) +
        `<div class="bar" id="blip-prog"><i style="width:${Math.round(missionProgress(st) * 100)}%"></i></div>` +
        `<div class="btns"><button class="small primary" id="blip-wait">WAIT FOR ROCKY</button></div>`;
    } else {
      h += row('Mission', 'docked');
    }
    h += `<h4>Materials</h4><div class="mats" id="blip-mats">` +
      MATS.map((m) => `<div class="mat"><span>${MAT_LABEL[m]}</span><b>${r.materials[m] || 0}</b></div>`).join('') + `</div>`;
    h += `<h4>Gather · ${esc(star.name)}</h4><div class="blist" id="blip-gather">${gatherHTML(st)}</div>`;
    h += `<h4>Craft · xenonite</h4><div class="blist" id="blip-craft">${craftHTML(st)}</div>`;
    root.innerHTML = h;

    $('blip-dock').addEventListener('click', () => {
      const res = r.docked ? sim.undock(st) : sim.dock(st);
      if (res.ok) api.event && api.event(r.docked ? 'dock' : 'undock');
      api.afterAction(res.text, !res.ok); render();
    });
    const wb = $('blip-wait');
    if (wb) wb.addEventListener('click', () => {
      const res = sim.waitForRocky(st);
      if (res.ok) { sfx.play('toast'); api.event && api.event('wait'); }
      api.afterAction(res.text, !res.ok); render();
    });
    root.querySelectorAll('#blip-gather [data-p]').forEach((b) => b.addEventListener('click', () => {
      const res = sim.startMission(st, 'gather', b.dataset.p);
      if (res.ok) { sfx.play('toast'); api.event && api.event('gather'); }
      api.afterAction(res.text, !res.ok); render();
    }));
    root.querySelectorAll('#blip-craft [data-c]').forEach((b) => b.addEventListener('click', () => {
      const res = sim.craft(st, b.dataset.c);
      if (res.ok) { sfx.play('breed'); api.event && api.event('craft'); }
      api.afterAction(res.text, !res.ok); render();
    }));
  }

  return { render, reset };
}
