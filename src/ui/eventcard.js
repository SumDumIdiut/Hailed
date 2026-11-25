import { $, esc } from './util.js';

// Event deck modal (S5). The sim owns the card and its choices; this module only shows it,
// applies the chosen effect through sim.resolveChoice and shows the result lines for a beat.
// update() is called every frame but only rebuilds when the cheap signature changes.

const KICKER = { flight: 'IN FLIGHT', arrive: 'ARRIVAL', survey: 'SURVEY', random: 'SIGNAL' };
const RESULT_MS = 4200;

export function createEventCard(api) {
  const sim = api.sim;
  let root = $('event-card');
  if (!root) {
    root = document.createElement('div');
    root.id = 'event-card';
    root.className = 'event-card hidden';
    root.innerHTML = `<div class="event-box">
      <div class="ev-kicker"></div>
      <div class="ev-title"></div>
      <div class="ev-text"></div>
      <div class="ev-choices"></div>
      <div class="ev-results hidden"></div>
      <div class="ev-btns hidden"><button class="primary small" type="button" data-continue>CONTINUE</button></div>
    </div>`;
    $('ui').appendChild(root);
  }
  const q = (sel) => root.querySelector(sel);
  let phase = 'choice', results = [], activeView = null, sig = '', timer = 0;

  function hide() {
    clearTimeout(timer);
    root.classList.add('hidden');
    sig = '';
  }
  function finish() {
    clearTimeout(timer);
    phase = 'choice'; results = []; activeView = null; sig = '';
    update(api.state());   // a chained card appears here, otherwise the modal closes
  }
  function choose(i) {
    const st = api.state();
    const view = sim.pendingEvent(st);
    if (!view || !view.choices[i] || !view.choices[i].ok) return;
    const out = sim.resolveChoice(st, i, sim.tick);
    results = Array.isArray(out) && out.length ? out.slice() : ['Nothing changes.'];
    activeView = view;
    phase = 'result'; sig = '';
    api.afterAction && api.afterAction();   // HUD / log / save
    update(st);
  }

  root.addEventListener('click', (e) => {
    const c = e.target.closest('[data-choice]');
    if (c && !c.disabled) { choose(+c.dataset.choice); return; }
    if (e.target.closest('[data-continue]')) finish();
  });

  function renderChoice(view) {
    q('.ev-kicker').textContent = KICKER[view.def.trigger] || 'SIGNAL';
    q('.ev-title').textContent = view.def.title || '';
    q('.ev-text').textContent = view.text || '';
    q('.ev-choices').innerHTML = view.choices.map((c, i) =>
      `<button type="button" class="ev-choice" data-choice="${i}" ${c.ok ? '' : 'disabled'} title="${esc(c.why || '')}">` +
      `<span class="ev-c-label">${esc(c.label)}</span>` +
      `<span class="ev-c-hint">${esc(c.hint || '')}</span>` +
      (c.ok ? '' : `<span class="ev-c-why">${esc(c.why)}</span>`) + `</button>`).join('');
    q('.ev-results').innerHTML = '';
    q('.ev-results').classList.add('hidden');
    q('.ev-btns').classList.add('hidden');
  }

  function renderResult(view) {
    const def = (activeView && activeView.def) || (view && view.def) || {};
    q('.ev-kicker').textContent = 'OUTCOME';
    q('.ev-title').textContent = def.title || '';
    q('.ev-text').textContent = (activeView && activeView.text) || '';
    q('.ev-choices').innerHTML = '';
    q('.ev-results').innerHTML = `<ul>${results.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>`;
    q('.ev-results').classList.remove('hidden');
    q('.ev-btns').classList.remove('hidden');
    clearTimeout(timer);
    timer = setTimeout(finish, RESULT_MS);
  }

  function update(state) {
    if (!state) { hide(); return; }
    const view = sim.pendingEvent(state);
    if (phase === 'choice' && !view) { hide(); return; }
    const key = phase === 'result'
      ? `r|${results.join('\n')}|${view ? view.def.id : ''}`
      : `c|${view.def.id}|${view.text}|${view.choices.map((c) => `${c.ok ? 1 : 0}:${c.why}`).join('~')}`;
    if (key === sig) return;
    sig = key;
    root.classList.remove('hidden');
    if (phase === 'result') renderResult(view); else renderChoice(view);
  }

  return {
    render() { sig = ''; update(api.state()); },
    update,
    reset() { phase = 'choice'; results = []; activeView = null; hide(); },
  };
}
