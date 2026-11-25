// Tutorial placement audit. Debug only: loaded by main.js when the URL has ?tutaudit=1 (all steps, results printed to the
// console as "TUTAUDIT ..." lines, then the window closes) or ?tutstep=<id[@variant]> (one step held on screen for a screenshot).
// For each scenario it builds a game state in which the step applies, forces the step, and asks tutorial.audit.measure() for
// the overlap (px^2) between the box and: the target, the step's `clear` list, and every other control.
import { nextTarget } from './objective.js';

const AD = 'tauceti-3';
const ALL = ['map', 'system', 'planet', 'lab'];
const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
const wait = async (ms) => { const t = performance.now(); while (performance.now() - t < ms) await raf(); };

export function start({ sim, tutorial, params, h }) {
  const S = () => h.state();
  const orbit = () => { sim.travelToPlanet(S(), AD); h.select(AD); };
  const strain = (tol) => {                       // a sampled strain (and a scanned Adrian) without playing the sampling game
    if (S().ship.planetId !== AD) sim.travelToPlanet(S(), AD);
    sim.autoSample(S(), AD);
    if (tol != null) { S().lab.strains.forEach((x) => { x.nTolerance = tol; x.population = Math.max(1, x.population || 1); }); S().lab.bestTolerance = tol; S().lab.escapeRisk = +(0.6 * tol * tol).toFixed(4); }
    if (S().ship.planetId) { S().ship.planetId = null; }   // back to parking orbit unless the scenario flies out again
  };
  const dest = () => { const t = nextTarget(sim, S()); return S().stars.find((s) => s.id === t); };
  const gotoScene = (sc) => {
    if (sc === 'planet') { if (S().ship.planetId !== AD) orbit(); else h.select(AD); }
    if (sc === 'system') h.select(null);
    h.setScene(sc);
  };
  // Rocky: craft a xenonite lab and go to blip scene
  const craftXenoniteLab = () => {
    sim.craft(S(), 'xenonite-lab');
    h.setScene('blip');
  };
  const gotoBlip = () => { h.setScene('blip'); };

  const story = () => { /* comms system removed; no-op */ };

  const hotspotClick = () => {      // select a hotspot on the scan map by really clicking it
    document.getElementById('ops-layer-life').click();
    const m = sim.scanMap(S(), AD), q = m.hotspots.find((x) => x.revealed), cv = document.getElementById('ops-map'), r = cv.getBoundingClientRect();
    cv.dispatchEvent(new MouseEvent('click', { clientX: r.left + q.x * r.width, clientY: r.top + q.y * r.height, bubbles: true }));
  };
  const scanFull = () => { sim.scanBegin(S(), AD); sim.scanProgress(S(), AD, 1); };

  const SC = [];   // { id, v, run }
  const add = (id, variants) => variants.forEach((x) => SC.push({ id, v: x.v, run: x.run }));
  add('warn-years', () => { let n = 0; while (Math.min(sim.extinctionYears(S(), 'earth'), sim.extinctionYears(S(), 'erid')) >= 4 && n++ < 800) sim.tick(S(), 0.5); });
  add('warn-hull', () => { S().ship.hull = 0.3; });
  add('warn-risk', [{ v: 'lab', run: () => { strain(0.9); gotoScene('lab'); } }, /* other variants filtered out */]);
  add('low-fuel', () => { S().ship.fuelKg = 12000; });
  add('stakes', () => {});
  add('weapon', () => {});
  add('controls', () => {});
  add('objective', () => {});
  add('go-system', [{ v: 'map', run: () => gotoScene('map') }]);
  add('pick-adrian', [{ v: 'system', run: () => gotoScene('system') }]);
  add('hop', [{ v: 'system', run: () => { h.select(AD); h.setScene('system'); } }, { v: 'planet', run: () => { h.select(AD); h.setScene('planet'); } }]);
  add('scan', [{ v: 'system', run: () => { orbit(); h.setScene('system'); } }, { v: 'planet', run: () => { orbit(); h.setScene('planet'); } }]);
  add('life-layer', [{ v: 'planet', run: () => { orbit(); scanFull(); h.setScene('planet'); } }]);
  add('sample', [
    { v: 'hotspot', run: () => { orbit(); scanFull(); h.setScene('planet'); hotspotClick(); } },
    { v: 'tether', run: () => { orbit(); h.setScene('planet'); h.ops.debug('sample', new URLSearchParams('depth=0.55')); } },
    { v: 'tether-deep', run: () => { orbit(); h.setScene('planet'); h.ops.debug('sample', new URLSearchParams('depth=0.9')); } },
  ]);
  add('follow', [{ v: 'planet', run: () => { orbit(); h.setScene('planet'); } }]);
  add('go-lab', ['map', 'system', 'planet'].map((sc) => ({ v: sc, run: () => { strain(); gotoScene(sc); } })));
  add('breed', [{ v: 'lab', run: () => { strain(); gotoScene('lab'); } }]);
  add('lab-risk', [{ v: 'lab', run: () => { strain(); sim.breedStep(S(), { nitrogenPct: 12 }); gotoScene('lab'); } }]);
  // Rocky-related steps replaced: go-comms → go-blip, say-hi/trust/lab-trade removed
  add('go-blip', [{ v: 'blip', run: () => craftXenoniteLab() }]);
  add('build-lab', [{ v: 'blip', run: () => craftXenoniteLab() }]);
  add('gather-mission', [{ v: 'blip', run: () => { /* send Rocky to gather - target a GO button */ } }]);
  add('wait-rocky', [{ v: 'blip', run: () => { /* wait for Rocky - target WAIT FOR ROCKY button */ } }]);
  add('tolerance', ['map', 'system', 'planet', 'lab'].map((sc) => ({ v: sc, run: () => { strain(0.95); if (sc === 'lab') sim.breedStep(S(), { nitrogenPct: 12 }); gotoScene(sc); } })));
  add('engage', [
    { v: 'map', run: () => { strain(0.95); gotoScene('map'); } },
    { v: 'selected', run: () => { strain(0.95); h.mapView.select(dest().id); gotoScene('map'); } },
  ]);
  const atDest = (inOrbit) => { strain(0.95); const d = dest(); S().ship.starId = d.id; S().ship.planetId = null; if (inOrbit) S().ship.planetId = d.planets.find((p) => p.special === 'earth' || p.special === 'erid').id; return d; };
  add('deliver-orbit', [
    { v: 'system', run: () => { const d = atDest(false); h.select(d.planets.find((p) => p.special === 'earth' || p.special === 'erid').id); h.setScene('system'); } },
    { v: 'planet', run: () => { const d = atDest(false); h.select(d.planets.find((p) => p.special === 'earth' || p.special === 'erid').id); h.setScene('planet'); } },
  ]);
  add('deliver', [{ v: 'system', run: () => { atDest(true); h.setScene('system'); } }]);
  add('first-delivery', () => { S().delivered.eri40 = true; }).filter((x) => x.v !== 'planet');

  add('relativity', () => {});
  add('costs', () => { S().ship.fuelKg = 50000; });
  add('irony', () => {});
  add('orbit-here', () => {});

  const want = params.get('tutstep');
  const log = (...a) => console.log('TUTAUDIT', ...a);

  async function runOne(sc) {
    h.fresh();
    await wait(60);
    sc.run();
    h.refresh();
    await wait(250);
    tutorial.audit.force(sc.id);
    await wait(250);
    return tutorial.audit.measure();
  }

  (async () => {
    await wait(500);
    if (want) {                                    // one step, held on screen for a screenshot
      const [id, v] = want.split('@');
      const sc = SC.find((x) => x.id === id && (!v || x.v === v));
      if (!sc) { log('unknown step', want); return; }
      h.fresh(); await wait(60); sc.run(); h.refresh(); await wait(250);
      tutorial.audit.force(sc.id); await wait(400);
      log(JSON.stringify(tutorial.audit.measure()));
      return;
    }
    const only = params.get('tutaudit') && params.get('tutaudit') !== '1' ? params.get('tutaudit').split(',') : null;
    const rows = [];
    log(`viewport ${innerWidth}x${innerHeight}`);
    for (const sc of SC) {
      if (only && !only.includes(sc.id)) continue;
      let m;
      try { m = await runOne(sc); } catch (e) { m = { id: sc.id, err: String(e && e.stack || e) }; }
      if (!m) m = { id: sc.id, err: 'step not active' };
      m.v = sc.v; rows.push(m);
      log(`${m.pass ? 'PASS' : 'FAIL'} ${sc.id}@${sc.v} scene=${m.scene} side=${m.side}${m.compact ? '/compact' + (m.compact === 2 ? '+wide' : '') : ''} box=${m.box ? m.box.join(',') : '-'} tgt=${m.tgt} clear=${m.clr} ctl=${m.ctl}${m.ctl ? '(' + m.who + ')' : ''} cvs=${m.cvs}${m.hasTarget === false ? ' NO-TARGET' : ''}${m.err ? ' ERR ' + m.err : ''}`);
    }
    // the jump confirm sheet: the tutorial must stand down while it is open
    tutorial.audit.release();
    h.fresh(); await wait(60); strain(0.95); gotoScene('map'); h.mapView.select(dest().id); h.setScene('map'); await wait(200);
    document.getElementById('engage').click(); await wait(400);
    const lay = document.getElementById('tut'), hidden = lay.classList.contains('gone') || !document.querySelector('#tut .tut-box.on');
    log(`${hidden ? 'PASS' : 'FAIL'} jump-confirm tutorial hidden while sheet open`);
    const bad = rows.filter((r) => !r.pass).length;
    log(`SUMMARY ${innerWidth}x${innerHeight} ${rows.length - bad}/${rows.length} pass, ${bad} fail`);
    log('JSON ' + JSON.stringify(rows.map((r) => ({ id: r.id, v: r.v, side: r.side, c: r.compact || 0, t: r.tgt, k: r.clr, l: r.ctl, p: r.pass ? 1 : 0 }))));
    log('DONE');
    h.quit();
  })();
}