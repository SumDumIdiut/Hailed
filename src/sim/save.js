// JSON with Infinity/NaN support.
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
  return st;
}
