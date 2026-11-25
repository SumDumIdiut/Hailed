import core from './events-core.js';
import tech from './tech-core.js';

// Add a pack file here and import it to make it part of the game's content.
export const PACKS = [core, tech];

export function loadContent(registerPack) {
  PACKS.forEach(registerPack);
}
