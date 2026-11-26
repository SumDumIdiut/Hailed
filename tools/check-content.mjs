// Validate a generated content pack: node tools/check-content.mjs content/<file>.js
// Exits 1 with a list of problems (fed back to the local model by tools/oll.py).
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const file = process.argv[2];
const pack = (await import(pathToFileURL(path.resolve(file)).href)).default;
const errs = [];
const err = (m) => { if (errs.length < 40) errs.push(m); };
const str = (v, lo = 1, hi = 400) => typeof v === 'string' && v.trim().length >= lo && v.length <= hi;
const num = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const PLANETS = ['rocky', 'ocean', 'ice', 'lava', 'desert', 'gas'];

function uniqueIds(list, what) {
  const seen = new Set();
  for (const x of list) {
    if (!str(x.id, 2, 40) || !/^[a-z0-9-]+$/.test(x.id)) err(`${what}: bad id ${JSON.stringify(x.id)} (lowercase, digits, dashes)`);
    if (seen.has(x.id)) err(`${what}: duplicate id ${x.id}`);
    seen.add(x.id);
  }
}

const SCHEMAS = {
  resources(p) {
    const L = p.resources;
    if (!Array.isArray(L) || L.length < 28) return err(`need >= 28 resources, got ${L?.length}`);
    uniqueIds(L, 'resource');
    const kinds = new Set();
    for (const r of L) {
      kinds.add(r.kind);
      if (!['mineral', 'gas', 'organic', 'exotic', 'manufactured'].includes(r.kind)) err(`${r.id}: kind must be mineral|gas|organic|exotic|manufactured`);
      if (!str(r.name, 2, 30)) err(`${r.id}: name`);
      if (!Number.isInteger(r.rarity) || r.rarity < 1 || r.rarity > 5) err(`${r.id}: rarity integer 1..5`);
      if (!num(r.value, 2, 2000)) err(`${r.id}: value 2..2000`);
      if (!num(r.mass, 0.05, 5)) err(`${r.id}: mass 0.05..5`);
      if (r.kind !== 'manufactured' && (!Array.isArray(r.planetTypes) || !r.planetTypes.length || r.planetTypes.some((t) => !PLANETS.includes(t)))) err(`${r.id}: planetTypes must be a non-empty subset of ${PLANETS.join(',')}`);
      if (!str(r.desc, 20, 220)) err(`${r.id}: desc 20..220 chars`);
    }
    for (const k of ['mineral', 'gas', 'organic', 'exotic', 'manufactured']) if (!kinds.has(k)) err(`no resource of kind ${k}`);
    for (const t of PLANETS) if (!L.some((r) => (r.planetTypes || []).includes(t))) err(`no resource found on ${t} planets`);
  },
  factions(p) {
    const L = p.factions;
    if (!Array.isArray(L) || L.length !== 5) return err(`need exactly 5 factions, got ${L?.length}`);
    uniqueIds(L, 'faction');
    for (const f of L) {
      for (const k of ['name', 'motto', 'blurb', 'astrophageStance']) if (!str(f[k], 3, 400)) err(`${f.id}: ${k}`);
      if (!/^#[0-9a-f]{6}$/i.test(f.color || '')) err(`${f.id}: color #rrggbb`);
      if (!Array.isArray(f.likes) || f.likes.length < 2) err(`${f.id}: likes needs >= 2 resource or activity ids`);
      if (!Array.isArray(f.stationNames) || f.stationNames.length < 6 || f.stationNames.some((s) => !str(s, 3, 40))) err(`${f.id}: stationNames needs >= 6 names`);
      if (!f.relations || typeof f.relations !== 'object') err(`${f.id}: relations {factionId: -1..1}`);
      else for (const [k, v] of Object.entries(f.relations)) { if (!L.some((o) => o.id === k) || k === f.id) err(`${f.id}: relation to unknown/self ${k}`); if (!num(v, -1, 1)) err(`${f.id}: relation ${k} must be -1..1`); }
    }
  },
  shipparts(p) {
    const L = p.parts, SLOTS = ['cockpit', 'reactor', 'drive', 'tank', 'cargo', 'lab', 'hab', 'scanner', 'hull', 'shield'];
    if (!Array.isArray(L) || L.length < 36) return err(`need >= 36 parts, got ${L?.length}`);
    uniqueIds(L, 'part');
    for (const s of SLOTS) if (L.filter((x) => x.slot === s).length < 3) err(`slot ${s} needs >= 3 parts`);
    for (const x of L) {
      if (!SLOTS.includes(x.slot)) err(`${x.id}: slot must be one of ${SLOTS.join(',')}`);
      if (!str(x.name, 3, 40)) err(`${x.id}: name`);
      if (!Number.isInteger(x.tier) || x.tier < 1 || x.tier > 4) err(`${x.id}: tier 1..4`);
      if (!num(x.mass, 1, 400)) err(`${x.id}: mass 1..400 tonnes`);
      if (!num(x.cost, 100, 200000)) err(`${x.id}: cost 100..200000 credits`);
      if (!x.stats || typeof x.stats !== 'object' || !Object.keys(x.stats).length) err(`${x.id}: stats object`);
      else for (const [k, v] of Object.entries(x.stats)) if (!['power', 'thrust', 'fuelCap', 'cargoCap', 'crew', 'scanRange', 'hullHp', 'shieldHp', 'labSlots', 'jumpRange', 'powerUse'].includes(k) || !num(v, -500, 100000)) err(`${x.id}: bad stat ${k}=${v}`);
      if (!str(x.desc, 15, 200)) err(`${x.id}: desc 15..200 chars`);
    }
  },
};

const kind = Object.keys(SCHEMAS).find((k) => pack && Array.isArray(pack[k === 'shipparts' ? 'parts' : k]));
if (!pack || !kind) { console.error('default export must be { id, resources | factions | parts: [...] }'); process.exit(1); }
SCHEMAS[kind](pack);
if (errs.length) { console.error(`${file}: ${errs.length} problem(s)\n- ` + errs.join('\n- ')); process.exit(1); }
console.log(`${file}: ok (${kind})`);
