import { $, esc, row } from './util.js';
import { sfx } from '../audio/index.js';

// Tech tree screen (tab 5). Five branch columns, tiers 1-5 down the rows. sim/tech.js owns
// the rules; this module wraps the registry in the { techs } shape its helpers expect, and
// only re-renders when research / materials / owned ids change.

const BRANCHES = [
  { id: 'drive', label: 'DRIVE' },
  { id: 'lab', label: 'LAB' },
  { id: 'xenonite', label: 'XENONITE' },
  { id: 'survey', label: 'SURVEY' },
  { id: 'probes', label: 'PROBES' },
];
const TIERS = [1, 2, 3, 4, 5];
const MAT_LABEL = { minerals: 'min', volatiles: 'vol', gas: 'gas', silicates: 'sil' };

export function createTech(api) {
  const root = $('panel-tech');
  const tooltip = $('tooltip');
  const sim = api.sim;
  const defs = { techs: sim.techDefs() };
  const byId = new Map(defs.techs.map((t) => [t.id, t]));
  let sig = '';

  const costText = (t) => {
    const mats = Object.entries(t.cost.materials || {}).map(([m, n]) => `${n} ${MAT_LABEL[m] || m}`);
    return `${t.cost.research} RP${mats.length ? ' · ' + mats.join(', ') : ''}`;
  };
  const signature = (st) => JSON.stringify([
    Math.floor(st.research ?? 0), st.rocky && st.rocky.materials, st.tech && st.tech.owned, defs.techs.length,
  ]);

  function render() {
    const st = api.state();
    const owned = (st.tech && st.tech.owned) || [];
    let h = `<h3>Tech Tree <span class="dim">Research <span class="mono">${Math.floor(st.research ?? 0)}</span> RP</span></h3>`;
    h += `<div class="tech-grid"><div class="tech-corner">TIER</div>` +
      BRANCHES.map((b) => `<div class="tech-branch">${b.label}</div>`).join('');
    for (const tier of TIERS) {
      h += `<div class="tech-tier">T${tier}</div>`;
      for (const branch of BRANCHES) {
        const nodes = defs.techs.filter((t) => t.branch === branch.id && t.tier === tier);
        h += `<div class="tech-cell">` + nodes.map((t) => {
          const has = owned.includes(t.id);
          const locked = !has && (t.requires || []).some((r) => !owned.includes(r));
          const check = sim.canBuy(st, defs, t.id);
          const state = has ? 'owned' : locked ? 'locked' : 'available';
          const right = has ? '<span class="tag on">OWNED</span>'
            : locked ? '<span class="tag">LOCKED</span>'
              : `<button type="button" class="small" data-buy="${esc(t.id)}" ${check.ok ? '' : 'disabled'} title="${esc(check.why || '')}">BUY</button>`;
          return `<div class="tech-node ${state}" data-id="${esc(t.id)}">` +
            `<span class="tn-name">${esc(t.name)}</span>` +
            `<span class="tn-cost">${costText(t)}</span>` +
            `<span class="tn-state">${state.toUpperCase()}</span>${right}</div>`;
        }).join('') + `</div>`;
      }
    }
    h += `</div>`;
    root.innerHTML = h;
    sig = signature(st);
  }

  function update(state) {
    if (!state || root.classList.contains('hidden')) { sig = ''; return; }
    if (signature(state) !== sig) render();
  }

  root.addEventListener('mousemove', (e) => {
    const node = e.target.closest && e.target.closest('.tech-node');
    if (!node) { tooltip.classList.add('hidden'); return; }
    const t = byId.get(node.dataset.id);
    if (!t) { tooltip.classList.add('hidden'); return; }
    const st = api.state();
    const owned = (st.tech && st.tech.owned) || [];
    const locked = (t.requires || []).filter((r) => !owned.includes(r));
    const why = sim.canBuy(st, defs, t.id).why;
    tooltip.innerHTML = `<b>${esc(t.name.toUpperCase())}</b>` +
      `<div class="note">${esc(t.desc || '')}</div>` + row('Cost', costText(t)) +
      row('State', owned.includes(t.id) ? 'OWNED' : locked.length ? 'LOCKED' : 'AVAILABLE') +
      (why ? `<div class="note why">${esc(why)}</div>` : '');
    tooltip.classList.remove('hidden');
    tooltip.style.left = Math.min(e.clientX + 16, window.innerWidth - 240) + 'px';
    tooltip.style.top = Math.min(e.clientY + 16, window.innerHeight - 150) + 'px';
  });
  root.addEventListener('mouseleave', () => tooltip.classList.add('hidden'));

  root.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('[data-buy]');
    if (!b || b.disabled) return;
    const st = api.state();
    const res = sim.buy(st, defs, b.dataset.buy);
    if (res.ok) { sfx.play('toast'); api.event && api.event('tech'); }
    api.afterAction && api.afterAction(res.ok ? `Research unlocked ${byId.get(b.dataset.buy).name}.` : res.why, !res.ok);
    sig = '';
    if (!root.classList.contains('hidden')) render();
  });

  return {
    render,
    update,
    reset() { sig = ''; tooltip.classList.add('hidden'); },
  };
}
