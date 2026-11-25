// JSON with Infinity/NaN support.
import { ensureEvents } from './events.js';
import { initKnowledge, genPois } from './galaxy.js';

const rep = (k, v) => (typeof v === 'number' && !Number.isFinite(v) ? { $num: String(v) } : v);
const rev = (k, v) => (v && typeof v === 'object' && '$num' in v ? Number(v.$num) : v);
export function serialize(state) { return JSON.stringify({ v: 1, state }, rep); }
export function deserialize(str) {
  const o = JSON.parse(str, rev);
  if (!o || o.v !== 1 || !o.state) throw new Error('Bad save file');
  const st = o.state;
  if (st.ship && st.ship.planetId === undefined) st.ship.planetId = null;   // saves from before in-system travel
  for (const star of st.stars || []) for (const p of star.planets) if (p.scanLevel === undefined) p.scanLevel = p.scanned ? 2 : 0;
  delete st.eridian;                                   // the comms system is gone; old saves carry it
  if (!st.rocky) st.rocky = {                          // saves from before Rocky's ship
    docked: true,
    starId: (st.ship && st.ship.starId) || 'tauceti',
    planetId: st.ship ? (st.ship.planetId ?? null) : null,
    mission: null,
    materials: { minerals: 2, volatiles: 1, gas: 0, silicates: 1 },
    built: [], says: null,
  };
  // Expansion fields. Old saves keep their original stars: never generate new ones here.
  if (!Number.isFinite(st.research)) st.research = 0;
  if (!st.tech || typeof st.tech !== 'object' || Array.isArray(st.tech)) st.tech = { owned: [] };
  if (!Array.isArray(st.tech.owned)) st.tech.owned = [];
  if (!st.genetics || typeof st.genetics !== 'object' || Array.isArray(st.genetics)) {
    st.genetics = { strains: [], nextId: 1, best: 0 };
  }
  if (!Array.isArray(st.genetics.strains)) st.genetics.strains = [];
  if (!Number.isFinite(st.genetics.nextId)) st.genetics.nextId = 1;
  if (!Array.isArray(st.beetles)) st.beetles = [];
  if (!Array.isArray(st.pois)) st.pois = genPois(st.stars || [], st.seed ?? 1);
  if (!st.galaxy || typeof st.galaxy !== 'object') {
    initKnowledge(st);
  } else {
    const probe = { seed: st.seed ?? 1, stars: st.stars || [] };
    initKnowledge(probe);                                // lanes and initial known stars for this catalog
    if (!Array.isArray(st.galaxy.lanes) || !st.galaxy.lanes.length) st.galaxy.lanes = probe.galaxy.lanes;
    if (!st.galaxy.known || typeof st.galaxy.known !== 'object') st.galaxy.known = probe.galaxy.known;
    if (!st.galaxy.surveyed || typeof st.galaxy.surveyed !== 'object') st.galaxy.surveyed = {};
    if (!Array.isArray(st.galaxy.relays)) st.galaxy.relays = [];
  }
  ensureEvents(st);
  if (!st.campaign || typeof st.campaign !== 'object' || Array.isArray(st.campaign)) {
    st.campaign = { act: 1, mode: 'campaign', board: [], saved: [], dark: [], score: 0,
      cycle: 0, difficulty: 1, targets: [], pendingCard: null };
  }
  return st;
}
