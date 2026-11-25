export function addLog(state, text) {
  state.log.push({ worldYears: +state.time.worldYears.toFixed(4), text });
  if (state.log.length > 300) state.log.splice(0, state.log.length - 300);
}
// Pass ship time (and the same world time) in the lab etc.
export function spendTime(state, years, tickFn) {
  state.time.shipYears += years;
  tickFn(state, years);
}

// Charge a small action cost: ship time (and equal world time) plus fuel. Never blocks; fuel floors at 0.
export function spend(state, { fuelKg = 0, years = 0 }, tickFn) {
  const burned = Math.min(state.ship.fuelKg, fuelKg);
  state.ship.fuelKg -= burned;
  if (years > 0) { state.time.shipYears += years; if (tickFn) tickFn(state, years); }
  return { fuelKg: +burned.toFixed(2), shipDays: +(years * 365.25).toFixed(2) };
}
