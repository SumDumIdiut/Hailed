// Audio settings mini-panel: a "Sound" button on the title screen and a speaker button in the HUD tab bar open the same
// popover (music / effects / voice sliders + mute). M toggles mute anywhere. Uses the existing panel / button / range styles.
import { settings, setVolume, setMute, toggleMute, onChange } from './bus.js';

const ICON = (muted) => `<svg viewBox="0 0 20 16" width="18" height="14" aria-hidden="true" style="vertical-align:-2px"><path d="M1 5h3.5L9 1.5v13L4.5 11H1z" fill="currentColor"/>` +
  (muted ? '<path d="M12 5l6 6M18 5l-6 6" stroke="currentColor" stroke-width="1.8" fill="none"/>' :
    '<path d="M12 5.2a4 4 0 0 1 0 5.6M14.6 3a7.4 7.4 0 0 1 0 10" stroke="currentColor" stroke-width="1.5" fill="none"/>') + '</svg>';
const ROWS = [['music', 'Music'], ['voice', 'Rocky\'s voice']];
let pop = null, hudBtn = null, titleBtn = null, toastT = 0;

function build() {
  pop = document.createElement('section');
  pop.id = 'audio-pop'; pop.className = 'panel hidden';
  pop.style.cssText = 'position:fixed;right:14px;top:calc(var(--deckh, 118px) + 14px);width:260px;z-index:60;padding-bottom:12px';
  pop.innerHTML = '<h3><span>Sound</span></h3>' + ROWS.map(([k, n]) =>
    `<div class="row"><span>${n}</span><span id="au-${k}-v"></span></div><input type="range" min="0" max="100" step="1" id="au-${k}" aria-label="${n} volume">`).join('') +
    '<div class="btns"><button class="small" id="au-mute"></button><button class="small ghost" id="au-close">Close</button></div><div class="note">M toggles mute.</div>';
  document.body.appendChild(pop);
  for (const [k] of ROWS) pop.querySelector('#au-' + k).addEventListener('input', (e) => setVolume(k, e.target.value / 100));
  pop.querySelector('#au-mute').addEventListener('click', () => setMute(!settings.mute));
  pop.querySelector('#au-close').addEventListener('click', () => pop.classList.add('hidden'));
  document.addEventListener('pointerdown', (e) => {                    // click outside closes it
    if (!pop.classList.contains('hidden') && !pop.contains(e.target) && !e.target.closest('#btn-audio, #btn-sound')) pop.classList.add('hidden');
  }, true);
}
function sync() {
  if (!pop) return;
  for (const [k] of ROWS) { pop.querySelector('#au-' + k).value = Math.round(settings[k] * 100); pop.querySelector('#au-' + k + '-v').textContent = Math.round(settings[k] * 100) + '%'; }
  pop.querySelector('#au-mute').textContent = settings.mute ? 'Unmute' : 'Mute';
  if (hudBtn) { hudBtn.innerHTML = ICON(settings.mute); hudBtn.title = settings.mute ? 'Sound off (M)' : 'Sound (M mutes)'; }
  if (titleBtn) titleBtn.textContent = settings.mute ? 'Sound: off' : 'Sound';
}
function toggle() { pop.classList.toggle('hidden'); sync(); }
function flash(text) {
  const t = document.getElementById('toast'); if (!t) return;
  t.textContent = text; t.classList.remove('bad', 'hidden'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.add('hidden'), 1600);
}

function mount() {
  build();
  const tabs = document.getElementById('tabs');
  if (tabs) { hudBtn = document.createElement('button'); hudBtn.id = 'btn-audio'; hudBtn.className = 'ghost'; hudBtn.addEventListener('click', toggle); tabs.appendChild(hudBtn); }
  const tb = document.querySelector('.title-btns');
  if (tb) { titleBtn = document.createElement('button'); titleBtn.id = 'btn-sound'; titleBtn.className = 'ghost'; titleBtn.addEventListener('click', toggle); tb.insertBefore(titleBtn, document.getElementById('btn-quit')); }
  onChange(sync); sync();
  window.addEventListener('keydown', (e) => {
    if ((e.key === 'm' || e.key === 'M') && !e.ctrlKey && !e.altKey && !e.metaKey && !/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) {
      flash(toggleMute() ? 'Sound muted (M to unmute)' : 'Sound on');
    }
  });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
