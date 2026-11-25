import core from './events-core.js';

// Add a pack file here and import it to make it part of the game's content.
export const PACKS = [core];

export function loadContent(registerPack) {
  PACKS.forEach(registerPack);
}
