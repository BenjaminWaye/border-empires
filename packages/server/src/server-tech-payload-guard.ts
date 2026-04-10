import type { Player } from "@border-empires/shared";

import type { SeasonalTechConfig } from "./server-shared-types.js";

type RepairReason = "incompatible_config" | "empty_config" | "empty_catalog";

export type PlayerTechPayloadSnapshot<TCatalog> = {
  techChoices: string[];
  techCatalog: TCatalog[];
};

type PlayerTechPayloadGuardDeps<TCatalog> = {
  player: Player;
  activeSeasonTechConfig: SeasonalTechConfig;
  worldSeed: number;
  chooseSeasonalTechConfig: (seed: number) => SeasonalTechConfig;
  seasonTechConfigIsCompatible: (config: SeasonalTechConfig) => boolean;
  setActiveSeasonTechConfig: (config: SeasonalTechConfig) => void;
  reachableTechs: (player: Player) => string[];
  activeTechCatalog: (player: Player) => TCatalog[];
  onRepair?: (event: {
    reason: RepairReason;
    playerId: string;
    previousConfigId: string;
    previousActiveNodeCount: number;
    nextConfigId: string;
    nextActiveNodeCount: number;
  }) => void;
};

const repairReasonForConfig = (
  config: SeasonalTechConfig,
  seasonTechConfigIsCompatible: (config: SeasonalTechConfig) => boolean
): RepairReason | null => {
  if (!seasonTechConfigIsCompatible(config)) return "incompatible_config";
  if (config.rootNodeIds.length === 0 || config.activeNodeIds.size === 0) return "empty_config";
  return null;
};

export const resolvePlayerTechPayloadSnapshot = <TCatalog>(
  deps: PlayerTechPayloadGuardDeps<TCatalog>
): PlayerTechPayloadSnapshot<TCatalog> => {
  let currentConfig = deps.activeSeasonTechConfig;
  const ensureConfig = (reason: RepairReason | null): SeasonalTechConfig => {
    if (reason === null) return currentConfig;
    const previous = currentConfig;
    const repaired = deps.chooseSeasonalTechConfig(deps.worldSeed);
    deps.setActiveSeasonTechConfig(repaired);
    currentConfig = repaired;
    deps.onRepair?.({
      reason,
      playerId: deps.player.id,
      previousConfigId: previous.configId,
      previousActiveNodeCount: previous.activeNodeIds.size,
      nextConfigId: repaired.configId,
      nextActiveNodeCount: repaired.activeNodeIds.size
    });
    return repaired;
  };

  currentConfig = ensureConfig(repairReasonForConfig(currentConfig, deps.seasonTechConfigIsCompatible));

  let techChoices = deps.reachableTechs(deps.player);
  let techCatalog = deps.activeTechCatalog(deps.player);
  if (currentConfig.activeNodeIds.size > 0 && techCatalog.length === 0) {
    currentConfig = ensureConfig("empty_catalog");
    techChoices = deps.reachableTechs(deps.player);
    techCatalog = deps.activeTechCatalog(deps.player);
  }
  return { techChoices, techCatalog };
};
