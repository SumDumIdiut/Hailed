// Content registry. Packs are plain data modules; later packs override earlier ones by id.
const COLLECTIONS = ['events', 'techs', 'pois'];

let packs = [];

const validId = (x) => typeof x === 'string' && x.trim().length > 0;

// Register one pack. Ids must be strings and must be unique inside each collection of a pack.
// Reusing an id in a later pack is allowed: that is how overrides work.
export function registerPack(pack) {
  if (!pack || typeof pack !== 'object' || !validId(pack.id)) throw new Error('Content pack needs a string id');
  const clean = { id: pack.id };
  for (const key of COLLECTIONS) {
    const list = pack[key] ?? [];
    if (!Array.isArray(list)) throw new Error(`Pack ${pack.id}: ${key} must be an array`);
    const seen = new Set();
    clean[key] = list.map((item) => {
      if (!item || typeof item !== 'object' || !validId(item.id)) {
        throw new Error(`Pack ${pack.id}: ${key} item needs a string id`);
      }
      if (seen.has(item.id)) throw new Error(`Pack ${pack.id}: duplicate ${key} id ${item.id}`);
      seen.add(item.id);
      return item;
    });
  }
  packs.push(clean);
  return clean;
}

// Current merged registry: { events, techs, pois }. Arrays are fresh; definitions are shared.
export function content() {
  const out = {};
  for (const key of COLLECTIONS) {
    const byId = new Map();
    for (const pack of packs) for (const item of pack[key]) byId.set(item.id, item);
    out[key] = [...byId.values()];
  }
  return out;
}

export function resetContent() { packs = []; }
