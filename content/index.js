import core from './events-core.js';
import tech from './tech-core.js';
import deep from './events-deep.js';
import crews from './events-crews.js';
import worlds from './events-worlds.js';
import gen from './events-gen.js';   // written by tools/gen-events.py (local model)

// Add a pack file here and import it to make it part of the game's content.
export const PACKS = [core, tech, deep, crews, worlds, gen];

export function loadContent(registerPack) {
  PACKS.forEach(registerPack);
}
