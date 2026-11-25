// Debug profiler, only active with ?perf=1 (zero cost otherwise: P.b / P.e are empty functions and nothing is patched).
// Every 2 s it logs one "PERF" line: frame ms, per-section CPU ms (avg per frame), GPU ms (gl.finish), DOM mutations / frame,
// forced-layout reads (getBoundingClientRect, offsetWidth ...) count + ms per frame, timer / rAF callback time, long tasks.
const ON = new URLSearchParams(location.search).get('perf') === '1';
const noop = () => {};
export const perf = { on: ON, b: noop, e: noop, frame: noop, gl: noop };
if (ON) {
  const sec = {}, cb = {}, now = () => performance.now();
  let frames = 0, tStart = now(), tLast = tStart, worst = 0, slow = 0, muts = 0, layoutN = 0, layoutMs = 0, longMs = 0, longN = 0, drift = 0, gpu = 0;
  const open = {};
  perf.b = (n) => { open[n] = now(); };
  perf.e = (n) => { const d = now() - open[n]; sec[n] = (sec[n] || 0) + d; };
  let glc = null;
  perf.gl = (g) => { glc = g; };
  perf.finish = () => { if (!glc) return; const t = now(); glc.finish(); gpu += now() - t; };
  // forced-layout probes
  const wrap = (proto, name) => { const o = proto[name]; proto[name] = function (...a) { const t = now(); const r = o.apply(this, a); layoutN++; layoutMs += now() - t; return r; }; };
  wrap(Element.prototype, 'getBoundingClientRect'); wrap(Element.prototype, 'getClientRects');
  for (const k of ['offsetWidth', 'offsetHeight', 'offsetLeft', 'offsetTop']) {
    const d = Object.getOwnPropertyDescriptor(HTMLElement.prototype, k);
    if (d && d.get) Object.defineProperty(HTMLElement.prototype, k, { get() { const t = now(); const r = d.get.call(this); layoutN++; layoutMs += now() - t; return r; } });
  }
  // timer and rAF callback accounting, keyed by kind
  const timed = (key, fn) => function (...a) { const t = now(); try { return fn.apply(this, a); } finally { const c = cb[key] || (cb[key] = [0, 0]); c[0]++; c[1] += now() - t; } };
  const rAF = window.requestAnimationFrame.bind(window);
  let rafId = 0;
  window.requestAnimationFrame = (fn) => rAF(timed('raf:' + (fn.name || 'anon') + (fn === undefined ? '' : ''), fn));
  const sI = window.setInterval.bind(window);
  window.setInterval = (fn, ms, ...r) => sI(typeof fn === 'function' ? timed('int:' + ms + ':' + (fn.name || 'anon'), fn) : fn, ms, ...r);
  const sT = window.setTimeout.bind(window);
  window.setTimeout = (fn, ms, ...r) => sT(typeof fn === 'function' ? timed('to:' + (fn.name || 'anon'), fn) : fn, ms, ...r);
  new MutationObserver((ms) => { muts += ms.length; }).observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) { longN++; longMs += e.duration; } }).observe({ entryTypes: ['longtask'] }); } catch (_) {}
  let dl = now(); sI(() => { const t = now(); drift = Math.max(drift, t - dl - 20); dl = t; }, 20);
  perf.frame = () => {
    const t = now(), dt = t - tLast; tLast = t; frames++; if (dt > worst) worst = dt; if (dt > 33) slow++;
    if (t - tStart >= 2000) {
      const f = frames, r = (x) => (x / f).toFixed(2);
      const s = Object.keys(sec).map((k) => k + '=' + r(sec[k])).join(' ');
      const c = Object.keys(cb).filter((k) => cb[k][1] > 1).map((k) => k + '=' + cb[k][0] + 'x/' + cb[k][1].toFixed(0) + 'ms').join(' ');
      console.log(`PERF fps=${(f / ((t - tStart) / 1000)).toFixed(1)} frameMs=${((t - tStart) / f).toFixed(1)} worst=${worst.toFixed(0)} slow=${slow} | ${s} gpu=${r(gpu)} | mut/f=${r(muts)} layout/f=${r(layoutN)} layoutMs/f=${r(layoutMs)} | long=${longN}/${longMs.toFixed(0)}ms drift=${drift.toFixed(0)} | cb: ${c}`);
      for (const k in sec) sec[k] = 0; for (const k in cb) cb[k] = [0, 0];
      frames = 0; tStart = t; worst = 0; slow = 0; muts = 0; layoutN = 0; layoutMs = 0; longN = 0; longMs = 0; drift = 0; gpu = 0;
    }
  };
}
