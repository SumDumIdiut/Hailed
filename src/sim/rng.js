// Deterministic mulberry32 RNG. State is a plain {s} holder so it can live inside a save file.
export function rngFrom(h) {
  const next = () => {
    h.s = (h.s + 0x6D2B79F5) >>> 0;
    let t = h.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const api = {
    next,
    range: (a, b) => a + (b - a) * next(),
    int: (a, b) => a + Math.floor(next() * (b - a + 1)),
    chance: (p) => next() < p,
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    gauss: () => {
      const u = Math.max(1e-12, next()), v = next();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
  };
  return api;
}
export function createRng(seed) { return rngFrom({ s: seed >>> 0 }); }
export function hashStr(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export function mixSeed(a, b) {
  let h = (Math.imul(a >>> 0, 0x9E3779B1) ^ Math.imul((b >>> 0) + 0x7F4A7C15, 0x85EBCA6B)) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 0x2C1B3C6D) >>> 0; h ^= h >>> 12;
  return h >>> 0;
}
// RNG stream stored in game state (state.rng = {s}).
export function stateRng(state) { return rngFrom(state.rng); }
