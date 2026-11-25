import { esc, fmt } from './util.js';

// Mission board (S7). From act II on it replaces the single directive in #objective with a
// compact strip of live contracts. The act-I objective.js directive is left untouched and
// keeps ownership of the same DOM nodes: we only append/remove a child and toggle a class.

const KIND = { save: 'S', survey: 'V', relay: 'R', poi: 'P' };
const DONE_MS = 700;

export function createBoard(api) {
  const root = document.getElementById('objective');
  let sig = '', list = null;
  const flashed = new Set();   // contracts already paid out and hidden
  const flashing = new Set();  // contracts mid "done" flash, still in the DOM

  function clear() {
    if (!list && !root.classList.contains('board') && !flashed.size) return;
    if (list) { list.remove(); list = null; }
    root.classList.remove('board');
    sig = ''; flashed.clear(); flashing.clear();
  }

  const rewardText = (r) => {
    const out = [];
    if (r.research) out.push(`+${r.research} RP`);
    if (r.fuelKg) out.push(`+${r.fuelKg} KG`);
    return out.join(' · ');
  };
  const detail = (b) => {
    const due = Number.isFinite(b.deadline) && b.deadline > 0 ? `<span class="board-deadline">DUE ${fmt(b.deadline, 1)} YR</span>` : '';
    const reward = rewardText(b.reward || {});
    return due + (reward ? `<span class="board-reward">${reward}</span>` : '');
  };

  function update(state) {
    const c = (state && state.campaign) || {};
    const board = Array.isArray(c.board) ? c.board : [];
    const ids = new Set(board.map((b) => b.id));
    for (const id of [...flashed]) if (!ids.has(id)) { flashed.delete(id); flashing.delete(id); }
    // An id can be recycled by the sim: treat a fresh, unfinished contract as new work.
    for (const b of board) if (!b.done && flashed.has(b.id)) { flashed.delete(b.id); flashing.delete(b.id); }

    // A newly paid contract flashes once, then disappears until the board changes.
    for (const b of board) {
      if (!b.done || flashed.has(b.id)) continue;
      flashed.add(b.id); flashing.add(b.id);
      setTimeout(() => { flashing.delete(b.id); sig = ''; }, DONE_MS);
    }
    const shown = board.filter((b) => !flashed.has(b.id) || flashing.has(b.id));
    const key = `${c.act || 1}|${c.mode || ''}|` + shown.map((b) =>
      `${b.id}~${b.title}~${b.detail}~${b.deadline}~${rewardText(b.reward || {})}~${flashing.has(b.id) ? 1 : 0}`).join('|');
    if (key === sig) return;
    sig = key;

    root.classList.add('board');
    root.classList.remove('alert');
    if (!list) {
      list = document.createElement('div');
      list.className = 'board-list';
      list.addEventListener('click', (e) => {
        const item = e.target.closest && e.target.closest('[data-star]');
        if (item) api.onSelect(item.dataset.star);
      });
      root.appendChild(list);
    }
    const act = c.mode === 'endless' ? `CYCLE ${c.cycle || 0}` : `ACT ${c.act || 1}`;
    list.innerHTML = `<div class="board-head"><span>MISSION BOARD</span><span>${act} · ${board.length} OPEN</span></div>` +
      (shown.length ? shown.map((b) => {
        const tag = b.starId ? 'button' : 'div';
        const attrs = b.starId ? ` type="button" data-star="${esc(b.starId)}" title="Open ${esc(b.starId)} on the nav chart"` : '';
        return `<${tag} class="board-item${flashing.has(b.id) ? ' done' : ''}"${attrs}>` +
          `<span class="board-kind">${KIND[b.kind] || '?'}</span>` +
          `<span class="board-main"><span class="board-title">${esc(b.title)}</span>` +
          `<span class="board-detail">${esc(b.detail)}</span></span>` +
          `<span class="board-meta">${detail(b)}</span></${tag}>`;
      }).join('') : `<div class="board-none">All contracts complete. The board is redrawing.</div>`);
  }

  return { update, reset: clear, clear };
}
