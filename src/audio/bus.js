// Shared audio plumbing: one AudioContext, the mixer (music / sfx / voice buses -> master -> compressor -> limiter),
// persisted settings (localStorage 'hailed-audio'), first-gesture unlock, pause while the window is hidden,
// and the generated noise / impulse-response buffers every other audio module reuses. All sound is procedural.
const KEY = 'hailed-audio';
const DEFAULTS = { music: 0.6, sfx: 0.8, voice: 0.9, mute: false };
const MASTER = 0.85;

function load() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY));
    if (v && typeof v === 'object') {
      const o = {};
      for (const k of ['music', 'sfx', 'voice']) if (Number.isFinite(v[k])) o[k] = Math.max(0, Math.min(1, v[k]));
      if (typeof v.mute === 'boolean') o.mute = v.mute;
      return o;
    }
  } catch (_) {}
  return {};
}
export const settings = { ...DEFAULTS, ...load() };
function save() { try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch (_) {} }

const listeners = new Set(), readyFns = [];
export const onChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const onReady = (fn) => { if (ctx) fn(ctx); else readyFns.push(fn); };
const emit = () => listeners.forEach((fn) => { try { fn(settings); } catch (_) {} });

export let ctx = null;
export const bus = { master: null, music: null, sfx: null, voice: null, musicDuck: null };
let duckTimer = 0;

function applyLevels(fast) {
  if (!ctx) return;
  const t = ctx.currentTime, tc = fast ? 0.01 : 0.05;
  bus.master.gain.setTargetAtTime(settings.mute ? 0 : MASTER, t, tc);
  bus.musicVol.gain.setTargetAtTime(settings.music * 0.7, t, tc);
  bus.sfxVol.gain.setTargetAtTime(settings.sfx * 0.9, t, tc);
  bus.voiceVol.gain.setTargetAtTime(settings.voice * 1.0, t, tc);
}
export function setVolume(k, v) { settings[k] = Math.max(0, Math.min(1, +v || 0)); save(); applyLevels(); emit(); }
export function setMute(m) { settings.mute = !!m; save(); applyLevels(true); emit(); }
export const toggleMute = () => { setMute(!settings.mute); return settings.mute; };

// The music ducks (to `level`, 0..1) for `hold` seconds while Rocky talks.
export function duck(level, hold) {
  if (!ctx) return;
  const t = ctx.currentTime;
  bus.musicDuck.gain.cancelScheduledValues(t);
  bus.musicDuck.gain.setTargetAtTime(level, t, 0.12);
  bus.musicDuck.gain.setTargetAtTime(1, t + Math.max(0.1, hold), 0.5);
}

export function ensure() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { ctx = new AC({ latencyHint: 'interactive' }); } catch (_) { try { ctx = new AC(); } catch (_2) { ctx = null; return null; } }
    const lim = ctx.createDynamicsCompressor();         // brickwall-ish limiter at the very end
    lim.threshold.value = -3; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.002; lim.release.value = 0.1;
    const comp = ctx.createDynamicsCompressor();        // gentle glue compressor
    comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 4; comp.attack.value = 0.01; comp.release.value = 0.25;
    bus.master = ctx.createGain(); bus.master.gain.value = 0;
    bus.master.connect(comp); comp.connect(lim); lim.connect(ctx.destination);
    bus.musicVol = ctx.createGain(); bus.sfxVol = ctx.createGain(); bus.voiceVol = ctx.createGain();
    bus.musicDuck = ctx.createGain();
    bus.music = ctx.createGain(); bus.sfx = ctx.createGain(); bus.voice = ctx.createGain();
    bus.music.connect(bus.musicDuck); bus.musicDuck.connect(bus.musicVol); bus.musicVol.connect(bus.master);
    bus.sfx.connect(bus.sfxVol); bus.sfxVol.connect(bus.master);
    bus.voice.connect(bus.voiceVol); bus.voiceVol.connect(bus.master);
    applyLevels(true);
    ctx.addEventListener && ctx.addEventListener('statechange', () => { if (ctx.state === 'running') unlockOff(); });
    readyFns.splice(0).forEach((fn) => { try { fn(ctx); } catch (e) { console.error(e); } });
  }
  if (ctx.state === 'suspended' && !document.hidden) ctx.resume().catch(() => {});
  return ctx;
}
// True when sound is actually being produced (used to skip scheduling work).
export const live = () => !!ctx && ctx.state === 'running' && !document.hidden;

// First user gesture creates / resumes the context (WebKit autoplay rules).
const GESTURES = ['pointerdown', 'keydown', 'touchstart', 'mousedown'];
function unlock() { ensure(); }
function unlockOff() { if (typeof window !== 'undefined') GESTURES.forEach((g) => window.removeEventListener(g, unlock, true)); }
if (typeof window !== 'undefined') {           // (guarded so the pure composition code can be unit-tested in node)
  GESTURES.forEach((g) => window.addEventListener(g, unlock, true));
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend().catch(() => {});
    else ctx.resume().catch(() => {});
  });
}

// ---- shared generated buffers ----
let noiseB = null, brownB = null;
export function noiseBuf() {
  if (!noiseB && ctx) { noiseB = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate); const d = noiseB.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  return noiseB;
}
export function brownBuf() {
  if (!brownB && ctx) {
    brownB = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate); const d = brownB.getChannelData(0); let y = 0;
    for (let i = 0; i < d.length; i++) { y = (y + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = y * 3.5; }
  }
  return brownB;
}
// Noise source node (looping). Caller starts/stops it.
export function noiseSrc(brown = false) {
  const s = ctx.createBufferSource(); s.buffer = brown ? brownBuf() : noiseBuf(); s.loop = true;
  s.loopStart = 0; s.loopEnd = s.buffer.duration; return s;
}
// Generated reverb impulse response: decaying stereo noise whose tail darkens over time.
export function makeIR(seconds, decay = 2.6, bright = 0.55, dark = 0.07, seed = 1) {
  const sr = ctx.sampleRate, n = Math.floor(sr * seconds), ir = ctx.createBuffer(2, n, sr);
  let s = seed >>> 0;
  const rnd = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c); let y = 0;
    for (let i = 0; i < n; i++) {
      const u = i / n, k = bright + (dark - bright) * Math.min(1, u * 1.5);
      y += ((rnd() * 2 - 1) - y) * k;
      d[i] = y * Math.pow(1 - u, decay) * (i < 200 ? i / 200 : 1);
    }
  }
  return ir;
}
