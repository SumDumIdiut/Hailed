import core from './events-core.js';
import tech from './tech-core.js';
import deep from './events-deep.js';
import crews from './events-crews.js';
import worlds from './events-worlds.js';

// Add a pack file here and import it to make it part of the game's content.
export const PACKS = [core, tech, deep, crews, worlds];

export function loadContent(registerPack) {
  PACKS.forEach(registerPack);
}
