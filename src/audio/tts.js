// Rocky's laptop translator: plain text-to-speech from espeak-ng, served by the launcher at __tts.
// The WAV is decoded with the shared AudioContext and played through the voice bus (volume slider / mute),
// with just a highpass and a gentle presence boost on the voice path.
// Falls back to the browser's built-in speech synthesis when __tts is unavailable (e.g. Windows WebView2).
import { ensure, bus, settings } from './bus.js';

export let duration = 0;                 // seconds of the last decoded line
export const getDuration = () => duration;

const progressFns = new Set();
let current = null;                      // { src?, utterance?, timer, resolve }
let gen = 0;                             // bumped by every speak()/stop() to cancel late fetches
let ttsUnavailable = false;              // remembered after the first __tts failure

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
  current = null;
  if (c) {
    if (c.timer) { clearInterval(c.timer); c.timer = 0; }
    if (c.src) {
      try { c.src.onended = null; } catch (_) {}
      try { c.src.stop(); } catch (_) {}
    }
    try { c.resolve && c.resolve(); } catch (_) {}
  }
  // Also cancel any in-flight browser speech synthesis.
  try { if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel(); } catch (_) {}
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

const MOODS = {
  still: { rate: 1.0, pitch: 0.8 },
  excited: { rate: 1.15, pitch: 1.1 },
  slumped: { rate: 0.85, pitch: 0.65 },
};

function moodParams(mood) {
  const k = String(mood == null ? 'still' : mood).toLowerCase();
  return MOODS[k] || MOODS.still;
}

async function pickVoice() {
  let ss = null;
  try { ss = (typeof window !== 'undefined') ? window.speechSynthesis : null; } catch (_) { ss = null; }
  if (!ss) return null;
  let voices = [];
  try { voices = ss.getVoices() || []; } catch (_) { voices = []; }
  if (!voices.length) {
    await new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        try { ss.removeEventListener('voiceschanged', handler); } catch (_) {}
        clearTimeout(timer);
        resolve();
      };
      const handler = () => {
        try { voices = ss.getVoices() || []; } catch (_) { voices = []; }
        if (voices && voices.length) finish();
      };
      try { ss.addEventListener('voiceschanged', handler); } catch (_) {}
      const timer = setTimeout(finish, 1000);
    });
    try { voices = ss.getVoices() || []; } catch (_) { voices = []; }
  }
  const preferred = (voices || []).find((v) => /David|Mark|Guy/i.test(String((v && v.name) || '')));
  if (preferred) return preferred;
  const en = (voices || []).find((v) => /^en/i.test(String((v && v.lang) || '')));
  if (en) return en;
  return null;
}

// Speak `text` with one of still | excited | slumped. Resolves when playback ends (or silently on failure).
export function speak(text, mood = 'still') {
  stop();
  const my = gen;
  const line = String(text == null ? '' : text).trim();
  if (!line) return Promise.resolve();
  duration = 0;
  return (async () => {
    // --- Linux launcher path (__tts / espeak-ng) ---
    if (!ttsUnavailable && typeof location !== 'undefined') {
      let bytes = null;
      let failed = false;
      try {
        const url = new URL('__tts?text=' + encodeURIComponent(line) + '&mood=' + encodeURIComponent(mood || 'still'), location.href);
        const res = await fetch(url, { cache: 'no-store' });
        if (!res || !res.ok) { failed = true; }
        else { bytes = await res.arrayBuffer(); }
      } catch (_) { failed = true; }
      if (failed) {
        ttsUnavailable = true;
      } else {
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
      }
    } else if (!ttsUnavailable && typeof location === 'undefined') {
      // No location to build __tts URL; treat as unavailable.
      ttsUnavailable = true;
    }

    if (!ttsUnavailable) return;
    // --- Fallback: browser speech synthesis ---
    let ss = null;
    try { ss = (typeof window !== 'undefined') ? window.speechSynthesis : null; } catch (_) { ss = null; }
    if (!ss) return; // resolve silently
    if (my !== gen) return;

    const mp = moodParams(mood);
    const voice = await pickVoice();
    if (my !== gen) return;

    await new Promise((resolve) => {
      let settled = false;
      const utter = (typeof SpeechSynthesisUtterance !== 'undefined') ? new SpeechSynthesisUtterance(line) : null;
      if (!utter) { resolve(); return; }
      utter.rate = mp.rate;
      utter.pitch = mp.pitch;
      try { utter.volume = settings.mute ? 0 : settings.voice; } catch (_) {}
      if (voice) { try { utter.voice = voice; } catch (_) {} }

      const finish = () => {
        if (settled) return;
        settled = true;
        if (current && current.utterance === utter) current = null;
        resolve();
      };
      utter.onboundary = (e) => {
        if (!current || current.utterance !== utter) return;
        const idx = (e && typeof e.charIndex === 'number') ? e.charIndex : 0;
        const f = idx / Math.max(1, line.length);
        emit(Math.max(0, Math.min(1, f)));
      };
      utter.onend = () => {
        if (current && current.utterance === utter) emit(1);
        finish();
      };
      utter.onerror = () => { finish(); };

      current = { utterance: utter, resolve: finish };
      try { ss.speak(utter); } catch (_) { finish(); }
    });
  })();
}