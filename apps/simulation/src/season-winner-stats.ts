import type { SeasonWinnerStats } from "@border-empires/sim-protocol";
import { MONUMENTAL_STRUCTURE_TYPES, type MonumentalStructureType } from "@border-empires/shared";
import type { RuntimeExportState } from "./runtime-state-export.js";

const MONUMENTAL_STRUCTURE_TYPE_SET: ReadonlySet<string> = new Set(MONUMENTAL_STRUCTURE_TYPES);

// Computed once, at the moment a player is crowned season winner (see
// simulation-service.ts), from the same runtime export already produced for
// that tick — no extra tile scan is triggered by this call site. Only
// completed monuments (status "active") count; in-progress "*_PART" stages
// don't.
export const computeSeasonWinnerStats = (
  runtimeState: Pick<RuntimeExportState, "tiles" | "players">,
  winnerId: string
): SeasonWinnerStats => {
  const winnerPlayer = runtimeState.players.find((player) => player.id === winnerId);
  const production = winnerPlayer?.strategicProductionPerMinute;

  let totalPopulation = 0;
  const monumentalBuildings: Partial<Record<MonumentalStructureType, number>> = {};

  for (const tile of runtimeState.tiles) {
    if (tile.ownerId !== winnerId) continue;
    if (tile.townJson) {
      const town = JSON.parse(tile.townJson) as { population?: number };
      if (typeof town.population === "number") totalPopulation += town.population;
    }
    if (tile.economicStructureJson) {
      const structure = JSON.parse(tile.economicStructureJson) as { type?: string; status?: string };
      if (structure.status === "active" && structure.type && MONUMENTAL_STRUCTURE_TYPE_SET.has(structure.type)) {
        const type = structure.type as MonumentalStructureType;
        monumentalBuildings[type] = (monumentalBuildings[type] ?? 0) + 1;
      }
    }
  }

  return {
    ironPerMinute: production?.IRON ?? 0,
    goldPerMinute: winnerPlayer?.incomePerMinute ?? 0,
    supplyPerMinute: production?.SUPPLY ?? 0,
    foodPerMinute: production?.FOOD ?? 0,
    crystalPerMinute: production?.CRYSTAL ?? 0,
    totalPopulation,
    monumentalBuildings
  };
};
