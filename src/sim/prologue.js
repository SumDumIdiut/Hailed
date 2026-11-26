// Shared prologue rules (Act I, "Prologue"). Pure constants/helpers, no DOM, no imports
// from the rest of the sim so every module can use them without a dependency cycle.
// All randomness in the prologue still comes from the game's own RNG stream.

export const PROLOGUE_NITROGEN = { sol: 0.45, eri40: 0.55 };

// Old saves and hand-built states have no flag: the original Act I keeps its exact rules.
export const isPrologue = (state) => !!state?.campaign?.prologue && (state.campaign?.act ?? 1) === 1;

// The teaching biospheres: nitrogen only, so the player learns "profile -> breed -> deliver"
// without the full six-trait grind. Other stars keep their normal deterministic profile.
export function prologueProfile(star) {
  const need = star && PROLOGUE_NITROGEN[star.id];
  if (!need) return null;
  return { nitrogen: need, co2: 0, cold: 0, heat: 0, radiation: 0 };
}

export const solBeetleLaunched = (state) =>
  (state.beetles || []).some((b) => b.to === 'sol' && b.strainId);

// A full-pressure generation is deliberately quick here: four breeds from a wild
// culture (nitrogen ~0.05-0.08) clear the 0.55 Erid requirement.
export const prologueBreedPush = (pressure) => 0.13 + 0.05 * Math.max(0, Math.min(1, pressure || 0));
