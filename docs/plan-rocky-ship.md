# Plan: scrap comms, Rocky's ship + xenonite crafting

User request (2026-11-20): scrap the COMMS system (not the lab). Rocky can pilot his own ship (the Blip-A) with the
docking-connection system, gather materials, and make the upgrades out of xenonite. Rocky talks with a computer TTS
voice (espeak-ng through the launcher), like the translator voice in the movie.

## Removed
- The comms/conversation system: story beats, replies, trust, the "Ask Rocky" menu, trades, the XENO-LINK station
  (scene `comms`, tab 4), `src/ui/comms.js`, `src/ui/pictos.js`, and the comms test and playtest tooling.
- Upgrade trades. Rocky crafts the upgrades instead.

## Kept
- The lab: Taumoeba breeding, nitrogen tolerance and escape risk are all unchanged.
- Deliver still needs a tolerant strain.

## New: Rocky's ship, `src/sim/rocky.js`
State `state.rocky = { docked, starId, planetId, mission, materials, built, gone }`.
- **Docking:** while docked, the Blip-A is joined to the Hail Mary by the xenonite tunnel, and interstellar jumps
  carry both ships. `dock` and `undock` need the same orbit and cost 0.5 day. You can't jump while Rocky is away.
- **Missions:** Rocky flies the Blip-A in the current system.
  - `gather` mines materials from a planet: rocky/lava give minerals, desert gives silicates, ice/ocean give
    volatiles, gas gives gas. The Petrova planet also gives Astrophage fuel, which replaces the old fuel-refill trade.
  - He comes back and docks automatically.
- **Crafting** happens while docked, costs materials and days, and has no trust gates:

  | Recipe | Effect |
  |---|---|
  | `xenonite-lab` | removes lab escape risk (keeps the existing upgrade id) |
  | `xeno-tanks` | fuel capacity ×1.5 (id `xenonite-tanks`) |
  | `hull-plating` | hull repair, repeatable |
  | `scoop` | harvest rate ×1.6 |
  | `nav-link` | jump fuel ×0.7 (id `eridian-nav`) |

- **Rocky's lines:** short spoken barks (TTS plus a subtitle bar) when a mission starts, ends or something is
  crafted, e.g. "Amaze! Good rocks. Question?".

## UI
- Tab 4 becomes **BLIP-A**: dock state, Rocky's location and mission progress, materials, gather missions per
  planet, and the crafting list.
- The system view shows the Blip-A as a second ship, docked to the Hail Mary or away at a planet.

## Work split (opencode, sequential)
1. Rocky's TTS voice (`tts.js` plus the launcher endpoint). This is done first.
2. Sim: scrap comms, add rocky.js, migrate saves, tests.
3. UI: scrap the comms station, add the BLIP-A station and Rocky's subtitle bar.
4. Render: the Blip-A model and docking tunnel.
5. Text: objective chain, tutorial, CONTRACTS.md.
