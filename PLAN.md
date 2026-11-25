# Plan: "Hail Mary" game, first playable version

A browser game built on Project Hail Mary ideas: Astrophage dims the stars, you fly the
Hail Mary between nearby stars, work with an Eridian partner, and breed Taumoeba to
save Sol and 40 Eridani. Planets get high-quality procedural rendering.

## Location and tech
- New folder: `Scripts/Hailed/` (not a git repo; nothing gets pushed).
- **Linux desktop app**: a python3 GTK3 + WebKit2GTK 4.1 window (`./hailed`, already installed system libs)
  runs the game. Plain ES modules plus raw WebGL2, with **no packages and no CDN**. It also runs from any
  static server (`python3 -m http.server`).
- Planets are ray-traced in a fragment shader: fbm terrain with biomes and oceans,
  animated clouds, Rayleigh/Mie atmosphere glow, terminator night lights, gas-giant
  bands and storms, rings with shadows. Stars get an animated photosphere and corona.
  The Astrophage infestation shows as a dark spreading mottling plus an IR glow.
- Sim tests run with `node --test` (Node is built in, so no deps).

## Game loop (v1)
1. **Galaxy map**: about 12 real nearby stars (Sol, Tau Ceti, 40 Eridani, α Cen,
   ε Eridani, Barnard's, Sirius, Procyon, 61 Cyg, Wolf 359, Luyten's, Ross 128).
   Each star has a luminosity and an Astrophage load. Infection grows logistically
   and spreads along Petrova lines (weighted by distance), and the star dims as it grows.
   Earth and Erid each show a "time to extinction" from their stars' output.
2. **Travel**: the spin drive burns Astrophage fuel (kg). The trip is computed with
   relativity, so ship time and world time differ, and world time passes, which lets
   the infection spread.
3. **System view**: a 3D view of the star and its procedurally generated planets
   (seeded per star) with an orbit camera. You can scan planets and sample them.
   One planet ("Adrian" at Tau Ceti) hides Taumoeba.
4. **Lab**: breed Taumoeba strains for nitrogen tolerance (generations, mutation,
   selection) and keep the risk of escape onto the ship's xenonite low.
5. **Eridian partner**: communication goes through musical chords. Vocabulary grows
   with each interaction (chords are played with WebAudio). Trust unlocks trades
   (xenonite hull and tanks, engineering repairs, fuel sharing) and joint missions.
6. **Win/lose**: deliver tolerant Taumoeba to Sol and to 40 Eridani before extinction.
   Save and load go to localStorage.

## Module contracts (so the tracks can run in parallel)
- `src/sim/*` is pure logic, with no DOM.
  `createGame(seed) -> state`, `tick(state, dtYears)`, `travel(state, starId)`,
  `samplePlanet`, `breedStep`, `eridianSay(state, intent)`, `serialize/deserialize`.
  Each star has the shape `{id,name,pos:[x,y,z]ly,spectral,lum0,lum,infection,planets[]}`.
  Each planet has the shape `{id,seed,type:'rocky'|'ocean'|'ice'|'lava'|'gas',radius,orbit,atmo:{color,density},rings?,hasTaumoeba?}`.
- `src/render/*`: `createRenderer(canvas)`,
  `renderSystem(star, planets, camera, time, infection)`, `renderPlanetCloseup(planet, ...)`.
  It reads only the plain objects described above.
- `src/ui/*` + `main.js` hold the scene state machine (map / system / lab / comms), the HUD and the panels.

## Tracks (parallel background Sonnet agents; each writes only its own folder)
- **A: Renderer** (`src/render/`, shaders). Planets, star, starfield, rings, and a
  standalone `render-test.html` for planet type and infection previews.
- **B: Simulation** (`src/sim/`, `tests/`). Star catalog, Astrophage growth and
  spread, ship and relativity, lab breeding, Eridian language and trust, save
  format, plus node tests.
- **C: Shell + UI** (`index.html`, `style.css`, `src/main.js`, `src/ui/`). Galaxy
  map (2D canvas with depth), HUD, panels, comms chord UI, and WebAudio. Until A
  and B land, it codes against the contracts with small stubs.
- **D: Integration + verify** (runs after A to C). Wires everything up, then runs
  `node --test` and a capped headless Firefox screenshot pass (Xvfb) of the map,
  the system view and a planet closeup. Fixes what breaks.

Track D finishes with screenshots before anything is handed over to run.

## Not in v1
Real Eridian ship model, story cutscenes, sound design beyond chord synth, mobile.
