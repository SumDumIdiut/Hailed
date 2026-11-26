// Music: two of the player's tracks, decoded once and looped through the music bus (volume, mute and the voice duck
// all apply there). 'drift' is the steady bed for the map, systems and surfaces; 'swell' (one long build) plays on the
// title screen and under cinematic moments (jumps, act cards, endings). Tracks crossfade, and each remembers where it
// was so the bed resumes instead of restarting after every jump.
import { bus, onReady } from './bus.js';

const TRACKS = { drift: 'assets/music/drift.mp3', swell: 'assets/music/swell.mp3' };
const SWELL_PEAK = 75;      // seconds into 'swell' where its build is strongest (measured: loudest 80-120 s)
const buffers = {}, loading = {}, pos = {};
let cur = null;             // { name, src, gain, startedAt, offset }
let want = null;
let ctxRef = null;

function load(name) {
  if (!loading[name]) {
    loading[name] = fetch(TRACKS[name])
      .then((r) => { if (!r.ok) throw new Error(r.status + ' ' + TRACKS[name]); return r.arrayBuffer(); })
      .then((ab) => new Promise((res, rej) => ctxRef.decodeAudioData(ab, res, rej)))
      .then((b) => (buffers[name] = b))
      .catch((e) => { console.error('music: could not load', name, e); delete loading[name]; return null; });
  }
  return loading[name];
}

function stopCurrent(fade) {
  if (!cur) return;
  const old = cur, t = ctxRef.currentTime;
  pos[old.name] = (old.offset + (t - old.startedAt)) % old.src.buffer.duration;
  old.gain.gain.cancelScheduledValues(t);
  old.gain.gain.setTargetAtTime(0, t, fade / 3);
  setTimeout(() => { try { old.src.stop(); old.src.disconnect(); old.gain.disconnect(); } catch (_) {} }, fade * 1500 + 200);
  cur = null;
}

function play(name, { offset = null, fade = 2.5, level = 1 } = {}) {
  want = name;
  onReady(async (ctx) => {
    ctxRef = ctx;
    if (cur && cur.name === name) { cur.gain.gain.setTargetAtTime(level, ctx.currentTime, fade / 3); return; }
    const buf = buffers[name] || (await load(name));
    if (!buf || want !== name || (cur && cur.name === name)) return;
    stopCurrent(fade);
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const gain = ctx.createGain(); gain.gain.value = 0;
    src.connect(gain); gain.connect(bus.music);
    const from = (offset ?? pos[name] ?? 0) % buf.duration;
    src.start(ctx.currentTime, from);
    gain.gain.setTargetAtTime(level, ctx.currentTime, fade / 3);
    cur = { name, src, gain, startedAt: ctx.currentTime, offset: from };
  });
}

export const music = {
  /** title -> swell from its quiet opening; any game scene -> the drift bed. */
  setScene(name) { if (name === 'title') play('swell', { offset: 0, fade: 3 }); else play('drift', { fade: 3 }); },
  /** Interstellar jumps ride the swell's build, then hand back to the bed where it left off. */
  jumpStart(total, kind) { if (kind === 'star') play('swell', { offset: SWELL_PEAK - 20, fade: 1.5 }); },
  jumpEnd() { if (want === 'swell') play('drift', { fade: 4 }); },
  /** Act cards, deliveries, endings: a short lift into the swell's peak. */
  stinger(kind) { play('swell', { offset: SWELL_PEAK, fade: 1.2 }); if (kind !== 'win' && kind !== 'lose') setTimeout(() => { if (want === 'swell') play('drift', { fade: 5 }); }, 12000); },
  setStar() {}, setTension() {}, connect() {},
  /** For headless checks: which track is playing and whether its buffer decoded. */
  get debug() { return { want, playing: cur && cur.name, loaded: Object.keys(buffers) }; },
};
