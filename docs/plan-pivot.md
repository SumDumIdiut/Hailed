# Plan: pivot to an interstellar exploration RPG (branch `dev`)

User request (2026-11-26): "pivot to a more interstellar type game, use the 2 tracks in my downloads". When asked which
way, they answered: "something like Starfield, largely original ideas, not just a movie ripoff, prioritise ollama".

The goal is a space-exploration RPG in the Hailed setting, using that genre's mechanics: fly your ship, travel between
stars, land, explore, trade, take on work, and build up a ship and a crew. The ideas, places and story are our own.
The Astrophage crisis stays as the main story line. It is no longer the only thing to do.

## Core loop

```
STAR MAP → spin-drive jump (cinematic) → SYSTEM: fly the ship yourself
   → dock at a station (trade, jobs, crew, refit)  |  orbit a planet → LAND
   → SURFACE: walk out, scan flora/fauna/minerals, mine, find sites (derelicts, ruins, caves, camps)
   → back to the ship → sell / craft / refit / follow quests → next jump
```

Time dilation stays the setting's signature cost. Long jumps age the rest of the galaxy: prices drift, quests expire
and stars dim while you fly.

## Pillars

| # | Pillar | What it is | Who builds it |
|---|---|---|---|
| 1 | Music | Two of the user's tracks: `stuff-001.mp3` as the steady flight/map bed, `flippeds song.mp3` (one long swell) for the title and cinematic moments. Crossfades and a volume setting. | Claude |
| 2 | Free flight | Third-person flight in a system: throttle, yaw/pitch, boost; approach a planet or station to get ORBIT / DOCK / LAND prompts. Pure flight physics in `sim/flight.js`. | Claude (core), ollama (tuning tables) |
| 3 | Surfaces | Walkable planet surfaces: seeded heightfield terrain chunks in WebGL2, sky and lighting from the planet's atmosphere and star, a third-person explorer, resource nodes, points of interest. | Claude (renderer); ollama (site and biome data) |
| 4 | Resources and crafting | About 30 resources by planet type; crafting into ship parts, outpost parts and research items. | ollama (data and pure modules), validated by tests |
| 5 | Stations and economy | Orbital stations per system, run by factions; buy/sell with supply and demand; prices drift with world time. | ollama (data, `sim/economy.js` from a spec) + Claude (UI) |
| 6 | Factions and quests | Five original factions; quest templates (deliver, survey, salvage, escort-by-Beetle, rescue, research) plus handcrafted faction arcs; reputation. | ollama (writing), Claude (quest engine) |
| 7 | Ship builder | Modules (cockpit, reactor, spin drive, tanks, cargo, lab, hab, scanner, hull) that set mass, fuel, cargo, crew and scan range. | ollama (part tables), Claude (builder UI) |
| 8 | Crew and skills | Rocky plus recruitable crew with skills; a player skill tree (piloting, science, trade, engineering, survival). | ollama (crew roster, skill text) |
| 9 | Outposts | Place extractors and storage on surfaces; they produce resources while you travel (time dilation makes this interesting). | later |

The existing systems carry over: the galaxy (stars, lanes, fog), the event deck (fires during flights, landings and
docking), genetics and Beetles (the main quest's tools), the tech tree (folded into skills and research), and endless
mode (becomes "free roam" after the main story).

## How Ollama is used

The user asked to prioritise Ollama. The 8B model is good at data and single-file code written from a precise spec. It
is unreliable at multi-file agentic edits on this repo (see memory). So:
- `tools/oll.py` runs one job: a spec plus pasted context goes to `qwen2.5-coder:7b` (code) or `qwen3:8b` (content).
  It writes the result, runs a verify command (node --check / node --test / a validator), feeds errors back and retries.
  Every call holds `/tmp/claude-1000/.ollama.lock` and sends `keep_alive: 0`, so only one model is ever resident.
- Ollama gets content packs (resources, factions, stations, quests, ship parts, crew, surface sites, item text) and
  self-contained pure modules with tests.
- Claude does the architecture, renderers, cross-module integration and anything that fails twice on Ollama.

## Phases

1. Music. `tools/oll.py`. Ollama content packs for resources, factions and ship parts, in parallel with Claude's flight
   prototype.
2. Free flight in systems, plus docking at stations (shop UI and economy).
3. Landing and the surface explorer (terrain, scanning, mining, sites).
4. Quests and factions, crew, skills.
5. Ship builder and outposts. Then rebalance and re-run the autoplayer, extended to the new loop.
