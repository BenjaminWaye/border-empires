import type { WorldStyle } from "@border-empires/shared";
import { createInitialSeasonState } from "../season-lifecycle.js";
import { seedProfileWorldgen, type SimulationSeedProfile } from "../seed-state/seed-state.js";

/** Missing season metadata belongs to a recovered pre-specialization world, never an implicit migration. */
export function recoveredSeasonFallback(input: { rulesetId: string | undefined; mapStyle: WorldStyle; seedProfile: SimulationSeedProfile | undefined; now: number }) {
  const season = createInitialSeasonState({ seasonSequence: 1, rulesetId: input.rulesetId ?? `seed:${input.seedProfile ?? "default"}`, ...(seedProfileWorldgen(input.seedProfile) ?? { worldSeed: 0 }), mapStyle: input.mapStyle, startedAt: input.now });
  delete season.afcUpgradeRuleset;
  return season;
}
