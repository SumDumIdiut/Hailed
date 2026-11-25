# Hailed: module contracts (binding for all tracks)

Plain ES modules, no packages, no CDN, no build step. Served with `python3 -m http.server` from `Scripts/Hailed/`.
Units: distances between stars in light-years (ly), planet orbits in AU, time in years, fuel in kg.

## Data shapes (plain JSON-safe objects)

```js
Star = {
  id: 'sol' | 'tauceti' | 'eri40' | ...,   // stable string ids
  name: 'Sol', spectral: 'G2V',
  pos: [x, y, z],            // ly, Sol at origin
  color: [r, g, b],          // 0..1, blackbody-ish for spectral type
  lum0: 1.0,                 // original luminosity (solar units)
  lum: 1.0,                  // current luminosity (dimmed by infection)
  infection: 0.0,            // 0..1 Astrophage coverage
  radius: 1.0,               // solar radii
  planets: [Planet, ...]
}
Planet = {
  id: 'tauceti-3', name: 'Adrian', seed: 12345,   // integer seed drives all procedural look
  type: 'rocky' | 'ocean' | 'ice' | 'lava' | 'gas' | 'desert',
  radius: 1.0,               // earth radii
  orbit: 1.0,                // AU
  phase: 0.0,                // starting orbital angle, radians
  periodDays: 365,
  atmo: { color: [r,g,b], density: 0..1 },
  palette: [[r,g,b], ...],   // 3-5 colors for surface/bands
  rings: null | { inner: 1.4, outer: 2.3, color: [r,g,b], opacity: 0..1 },  // in planet radii
  hasTaumoeba: false, scanned: false, scanLevel: 0 /* 0 none, 1 remote, 2 full */, sampled: false,
  special: null | 'earth' | 'erid' | 'adrian'
}
```

## src/sim/index.js (Track B), pure logic, no DOM, runs in node
```js
createGame(seed = 1) -> GameState
tick(state, dtYears)                       // advance world time: infection growth/spread, star dimming, extinction check
travelPlan(state, starId) -> { ok, reason, distanceLy, fuelKg, shipYears, worldYears }
travel(state, starId) -> same object; applies it (moves ship, burns fuel, ticks world by worldYears)
travelToPlanetPlan(state, planetId) -> { ok, reason, distanceAu, fuelKg, shipDays, worldDays }   // in-system hop
travelToPlanet(state, planetId) -> same object; sets ship.planetId, burns fuel, ticks world by worldDays/365.25
shipOrbit(state) -> AU radius of the ship (planet orbit, or PARK_AU*sqrt(lum0) when planetId is null)
scanPlanet(state, planetId) -> { ok, text, findings: string[], level: 1|2, cost }
   // any planet in the system. level 2 (full) only in orbit of it or at a planet within CLOSE_AU (0.6) AU; else level 1 (remote):
   // coarse data, no biosignatures, never reveals Taumoeba.
samplePlanet(state, planetId) -> { ok, text, cost }   // needs ship.planetId === planetId, a level-2 scan and hasTaumoeba
breedStep(state, { nitrogenPct }) -> { ok, text, strains }   // one lab generation
// ---- Rocky's ship, the Blip-A (src/sim/rocky.js) ----
// Rocky flies his own ship. While docked the Blip-A is joined to the Hail Mary by the xenonite tunnel: interstellar
// jumps carry both ships, and in-system hops keep the Blip-A in the same orbit. Rocky's spoken lines land in
// state.rocky.says = { text, mood: 'still' | 'excited' | 'slumped', worldYears } (null until he says something).
dock(state) -> { ok, text } / undock(state) -> { ok, text }
   // allowed only in the ship's system, at the same orbit (ship.planetId === rocky.planetId) and with no mission running;
   // each costs 0.5 day of world time (and ship time), like other small actions.
missionPlan(state, 'gather', planetId) -> { ok, reason, days, yield }
   // days = 2 + 3*sqrt(|planet.orbit - shipOrbit(state)|) for the round trip + 6 days mining.
   // yield by planet type: rocky 4 minerals, lava 5 minerals, desert 4 silicates, ice 4 volatiles,
   // ocean 3 volatiles, gas 4 gas. The Petrova planet (petrovaTarget) additionally yields astrophageKg: 8000,
   // added to the Hail Mary's fuel on return and capped at fuelMaxKg - it replaces the old fuel-refill trade.
startMission(state, 'gather', planetId) -> { ok, text }
   // both ships in the same system, no mission running; undocks Rocky automatically, stores
   // mission = { kind:'gather', planetId, startYears, endYears, yield } in world years. Passes no time itself.
rockyTick(state)                    // after world time advances: pays the yield (materials + fuel), moves the Blip-A
                                    // to the ship's current star and orbit, docks it, addLogs, sets says
waitForRocky(state) -> { ok, text } // ticks world time to mission end (+0.01 day), then calls rockyTick
recipes(state) -> [{ id, title, desc, cost, days, built, can, why }]
craft(state, id) -> { ok, text }    // needs Rocky docked, enough materials, and the recipe not already built (unless
                                    // repeatable); spends the materials, advances `days` world time, applies the effect
MATERIALS = ['minerals', 'volatiles', 'gas', 'silicates'];  RECIPES:
   | id | cost | days | effect |
   | xenonite-lab | minerals 2, silicates 1 | 3 | push upgrade 'xenonite-lab', refreshLab (escape risk 0) |
   | xeno-tanks | minerals 5, volatiles 2 | 5 | fuelMaxKg * 1.5, upgrade 'xenonite-tanks' |
   | hull-plating | minerals 3 | 3 | hull = 1 (repeatable) |
   | scoop | gas 3, minerals 2 | 5 | upgrade 'scoop': harvest yield * 1.6 |
   | nav-link | silicates 2, volatiles 2 | 5 | upgrade 'eridian-nav': jump fuel * 0.7 |
No trust gates. The starting materials (minerals 2, volatiles 1, silicates 1) pay for the xenonite lab exactly.
While Rocky is undocked or on a mission, travelPlan/travel are refused with
"Rocky is away on the Blip-A. Wait for him to dock."; on a successful jump rocky.starId follows the ship.
Saves: `eridian` is dropped on deserialize; a missing `rocky` gets the default (docked at the ship's star and orbit).
ship.upgrades are kept as they are.

GameState = {
  seed, status: 'playing' | 'won' | 'lost', statusText,
  time: { worldYears: 0, shipYears: 0 },
  ship: { starId: 'tauceti', planetId: null /* null = near star / high parking orbit */, fuelKg, fuelMaxKg, hull: 0..1, upgrades: string[], samples: number },
  stars: Star[],
  lab: { strains: [{ id, nTolerance: 0..1, population, generation }], bestTolerance, escapeRisk: 0..1, generations },
  rocky: { docked, starId, planetId, mission: null | { kind, planetId, startYears, endYears, yield },   // Rocky's Blip-A
           materials: { minerals, volatiles, gas, silicates }, built: [], says: null | { text, mood, worldYears } },  // old saves get a default on deserialize
  delivered: { sol: false, eri40: false },
  log: [{ worldYears, text }]   // newest last
}
```

## src/render/index.js (Track A), WebGL2 only
```js
createRenderer(canvas) -> Renderer
Renderer = {
  resize(),                                   // match canvas size * devicePixelRatio (cap 2)
  renderSystem(star, timeSec, camera, opts),  // star + all planets on orbits + starfield bg + orbit lines
  renderPlanet(planet, star, timeSec, camera),// close-up of one planet, lit by its star, with starfield bg
  pick(clientX, clientY) -> planetId | null,  // valid for the last renderSystem frame
  planetScreenPos(planetId) -> {x, y, r} | null,  // CSS px, for UI labels
  dispose()
}
camera = { yaw, pitch, dist }   // orbit camera around the star (system) or planet (closeup)
opts = { selectedId?: string, showOrbits?: true }
```
Orbit positions: angle = phase + 2π·timeSec·(365/periodDays)/60 (one Earth year ≈ 60 s on screen). Displayed orbit radius is compressed (`sqrt`) so all planets fit.
Infection must visibly darken and mottle the star (star.infection) and give a faint IR/red halo.

## UI (Track C): index.html, style.css, src/main.js, src/ui/*
Imports only `./sim/index.js` and `./render/index.js` through the APIs above.
Scenes: `map` (2D canvas galaxy map), `system` (WebGL system view), `planet` (closeup), `lab`, `comms`.

## Costs (src/sim/ship.js `COSTS`, in-system constants)
Interstellar `travel` resets `ship.planetId` to null. Fuel never blocks a small action; it floors at 0. Results carry `cost: { fuelKg, shipDays }`.
- In-system hop: Newtonian brachistochrone at 1.5 g, d = |orbit radius difference| in AU, t = 2*sqrt(d/a) = about 2.3 days per AU. Ship time equals world time.
  Fuel = (60 + 240*sqrt(d)) kg, x0.7 with eridian-nav. Parking radius is 3*sqrt(lum0) AU. Typical: 250-450 kg, 2-4 days; outermost giant 700-800 kg, 6-7 days.
- Full scan 0.005 yr + 3 kg; remote scan 0.002 yr + 1 kg; sample 0.004 yr + 12 kg; breed generation 0.015 yr + 6 kg.

## COMMS scene (src/ui/comms.js, audio.js)
Big tunnel canvas (Rocky's body language, the pictogram he holds up), English subtitles under it (word-highlighted from the TTS progress), the translator
waveform bar (animated while the TTS line plays), then reply buttons and the "Ask Rocky for..." menu. Selectors: #cm-talk, #cm-sub, #cm-subline .sw,
#cm-replies .rep(.deal), #cm-ask, #cm-beats, #cm-next, #cm-leave, #cm-stat. Debug: `?commstest=1&audio=1` runs src/ui/commsplay.js; `tools/commstest.py WxH OUTDIR` drives it headless.

## Hail Mary, orbital scan, tether sampling, harvesting (added)
Sim (`src/sim/sampling.js`, `src/sim/harvest.js`, exported from `sim/index.js`):
- `scanBegin(state, planetId)` (needs orbit; charges SCAN cost once: 0.004 yr + 4 kg) / `scanProgress(state, planetId, dCoverage)` -> `{ok, coverage, crossed, done}`;
  coverage >= `SCAN.fullAt` (0.6) = full scan (`scanLevel 2`). `scanCoverage`, `scanMap(state, planetId)` -> `{w,h,coverage,lon0,cols,revealed[],layers:{thermal,atmo,astro,life}[w*h],hotspots:[{id,lat,lon,x,y,radius,richness,bandCenter,revealed}],band,full,hasLife}`.
  Sweep fills longitude columns eastward from `planet.scan.lon0`; lon = atan2(z,x), lat = asin(y) in object space (same as the shader). `planet.scan = {coverage, lon0, active, sweeps}` is saved.
- `beginSample(state, planetId, hotspotId)` (orbit, coverage >= 0.6, revealed hotspot), `sampleStep(state, {depthDelta, dt})`, `endSample(state)`; session in `state.sampling` = `{depth 0..1, tension, heat, progress, t, status:'active'|'success'|'snapped'|'burned', ...}`.
  `PROBE`: lower 0.16/s, reel 0.34/s, band half width 0.07 (drifts with `bandAt`), 4 s in band fills the meter, tension snaps at 1, heat burns at 1. Failure: hull -0.04 (snap) / -0.06 (burn), -1 day, `ship.chainLost++`, retry allowed. Success calls the shared `collectSample` (sample + wild strain, 0.004 yr + 12 kg).
  `autoSample(state, planetId)` = scripted helper (sweep, first hotspot, perfect controller) for tests. `samplePlanet` (instant) is kept for legacy tests/tools but the UI no longer uses it.
- Harvest: `petrovaTarget(planets)` (mirror of the renderer, tested for parity), `harvestPlan(state, 'collector'|'skim')`, `harvest(state, mode)`, `harvestRate(star)`.
  kg/day = 14000 * infection^1.5 (Tau Ceti 0.15: ~810, 0.30: ~2300 = a 60000 kg tank in about 26 days). Collector: orbit of the Petrova planet, 14 days, 40 kg to deploy. Skim: 3 days at 3x the rate, 120 kg, hull -(0.10 + 0.2*infection), refused below 45% hull. Both capped by free tank space.
Renderer (additions only): `renderPlanet(planet, star, t, camera, { ship:{orbitRadius,inclination,phase,burning,tether:{depth,tension,heat,broken}}, scan:{active,lon0,coverage,lock}, mark:{lat,lon}, harvest:{progress}, follow:{yaw,pitch,dist} })`,
  `renderSystem(star, t, camera, { ship:{ orbitPlanetId | parkAu | position, transfer:{fromId,toId,fromAu,progress}, burning }, harvest:{boost} })`, `shipScreenPos()`, `shipOrbitRadius(planet)`, `probeRadius(R, depth)`. Ship mesh in `render/ship.js`.
UI: `src/ui/ops.js` (left panel in the planet scene: scan map + layers, tether mini-game, collector). Keys in the planet scene: F follow/free camera, SPACE hold to lower, R reel in, Esc abort. Debug URL: `flow=orbit|scan|sample|harvest`, `notut=1`.
