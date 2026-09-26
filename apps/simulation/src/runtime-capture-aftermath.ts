import type { DomainTileState } from "@border-empires/game-domain";
import {
  TOWN_CAPTURE_POPULATION_LOSS_MULT,
  TOWN_CAPTURE_SHOCK_MS
} from "./runtime-structure-rules/runtime-structure-rules.js";
import { SYNTHETIC_SETTLEMENT_POPULATION } from "./runtime-hydration.js";

type CapturedTown = NonNullable<DomainTileState["town"]>;

export type CapturedTownAftermath = {
  town: CapturedTown | undefined;
  settlementRelocationPopulation: number | undefined;
  populationBefore: number | undefined;
  populationAfter: number | undefined;
};

export function capturedTownAftermath(
  town: CapturedTown | undefined,
  previousOwnerId: string | undefined,
  attackerId: string,
  nowMs: number
): CapturedTownAftermath {
  if (!town || !previousOwnerId || previousOwnerId === attackerId) {
    return { town, settlementRelocationPopulation: undefined, populationBefore: undefined, populationAfter: undefined };
  }

  const popBefore = typeof town.population === "number" ? town.population : SYNTHETIC_SETTLEMENT_POPULATION;
  const popAfter = Math.max(1, popBefore * TOWN_CAPTURE_POPULATION_LOSS_MULT);
  if (town.populationTier === "SETTLEMENT") {
    return { town: undefined, settlementRelocationPopulation: popAfter, populationBefore: popBefore, populationAfter: popAfter };
  }

  return {
    town: {
      ...town,
      population: popAfter,
      populationBeforeCapture: popBefore,
      captureShockUntil: nowMs + TOWN_CAPTURE_SHOCK_MS
    },
    settlementRelocationPopulation: undefined,
    populationBefore: popBefore,
    populationAfter: popAfter
  };
}
