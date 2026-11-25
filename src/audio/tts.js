// Rocky's laptop translator: plain text-to-speech from espeak-ng, served by the launcher at __tts.
// The WAV is decoded with the shared AudioContext and played through the voice bus (volume slider / mute),
// with just a highpass and a gentle presence boost on the voice path.
import { ensure, bus } from './bus.js';

export let duration = 0;                 // seconds of the last decoded line
export const getDuration = () => duration;

const progressFns = new Set();
let current = null;                      // { src, timer, resolve }
let gen = 0;                             // bumped by every speak()/stop() to cancel late fetches

export function onProgress(cb) {
  if (typeof cb !== 'function') return () => {};
  progressFns.add(cb);
  return () => progressFns.delete(cb);
}
function emit(f) {
  for (const cb of progressFns) { try { cb(f); } catch (_) {} }
}

export const isSpeaking = () => !!current;

export function stop() {
  gen++;
  const c = current;
  if (!c) return;
  current = null;
  if (c.timer) clearInterval(c.timer);
  try { c.src.onended = null; c.src.stop(); } catch (_) {}
  c.resolve();
}

function decode(ctx, data) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const ok = (buf) => { if (!settled) { settled = true; resolve(buf); } };
    const bad = (e) => { if (!settled) { settled = true; reject(e); } };
    try {
      const p = ctx.decodeAudioData(data, ok, bad);
      if (p && typeof p.then === 'function') p.then(ok, bad);
    } catch (e) { bad(e); }
  });
}

// Speak `text` with one of still | excited | slumped. Resolves when playback ends (or silently on failure).
export function speak(text, mood = 'still') {
  stop();
  const my = gen;
  const line = String(text == null ? '' : text).trim();
  if (!line || typeof location === 'undefined') return Promise.resolve();
  duration = 0;
  return (async () => {
    let bytes;
    try {
      const url = new URL('__tts?text=' + encodeURIComponent(line) + '&mood=' + encodeURIComponent(mood || 'still'), location.href);
      const res = await fetch(url, { cache: 'no-store' });
      if (!res || !res.ok) return;
      bytes = await res.arrayBuffer();
    } catch (_) { return; }
    if (my !== gen) return;
    const ctx = ensure();
    if (!ctx) return;
    let audio;
    try { audio = await decode(ctx, bytes); } catch (_) { return; }
    if (my !== gen) return;

    const src = ctx.createBufferSource();
    src.buffer = audio;
    const hp = ctx.createBiquadFilter();                    // translator laptop colour: no rumble
    hp.type = 'highpass'; hp.frequency.value = 180;
    const pk = ctx.createBiquadFilter();                    // +3 dB presence
    pk.type = 'peaking'; pk.frequency.value = 2500; pk.gain.value = 3; pk.Q.value = 0.9;
    src.connect(hp); hp.connect(pk); pk.connect(bus.voice);
    duration = audio.duration;

    await new Promise((resolve) => {
      const startAt = ctx.currentTime + 0.01;
      let timer = 0;
      const finish = () => {
        if (timer) { clearInterval(timer); timer = 0; }
        if (current && current.src === src) current = null;
        try { src.disconnect(); } catch (_) {}
        try { hp.disconnect(); } catch (_) {}
        try { pk.disconnect(); } catch (_) {}
        resolve();
      };
      current = { src, timer: 0, resolve: finish };
      src.onended = finish;
      try { src.start(startAt); } catch (_) { finish(); return; }
      timer = setInterval(() => {
        if (!current || current.src !== src) { clearInterval(timer); return; }
        const f = (ctx.currentTime - startAt) / Math.max(0.001, audio.duration);
        emit(Math.max(0, Math.min(1, f)));
      }, 50);
      if (current && current.src === src) current.timer = timer;
    });
    return audio.duration;
  })();
}
