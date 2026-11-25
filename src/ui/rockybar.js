import * as tts from '../audio/tts.js';

// Rocky's subtitle bar: a slim strip at the bottom centre, above the log. When state.rocky.says changes it speaks the
// line through the laptop TTS and shows it, lighting each word as he says it. Auto-hides 4 s after the line ends.
export function createRockyBar() {
  const bar = document.createElement('div');
  bar.id = 'rockybar';
  bar.className = 'hidden';
  bar.innerHTML = '<span class="rk-tag">ROCKY:</span><span class="rk-line"></span>';
  document.getElementById('ui').appendChild(bar);
  const lineEl = bar.querySelector('.rk-line');
  let lastKey = '', words = [], hideT = 0;

  tts.onProgress((f) => {
    if (!words.length) return;
    const idx = Math.min(words.length - 1, Math.max(0, Math.floor(f * words.length)));
    words.forEach((w, i) => w.classList.toggle('on', i === idx));
  });

  function show(says) {
    const text = String(says && says.text || '').trim();
    clearTimeout(hideT);
    words = text ? text.split(/\s+/) : [];
    lineEl.innerHTML = '';
    words.forEach((w) => { const s = document.createElement('span'); s.className = 'sw'; s.textContent = w; lineEl.appendChild(s); });
    bar.classList.remove('hidden');
    const done = () => { hideT = setTimeout(() => bar.classList.add('hidden'), 4000); };
    try {
      const p = tts.speak(text, says && says.mood);
      if (p && typeof p.then === 'function') p.then(done, done); else done();
    } catch (_) { done(); }
  }

  return {
    // Cheap per-frame poll from the main loop: nothing happens unless Rocky has a new line.
    update(state) {
      const says = state && state.rocky && state.rocky.says;
      const key = says ? says.worldYears + '|' + says.text : '';
      if (key === lastKey) return;
      lastKey = key;
      if (says) show(says); else bar.classList.add('hidden');
    },
    reset() { lastKey = ''; words = []; bar.classList.add('hidden'); tts.stop(); },
  };
}
