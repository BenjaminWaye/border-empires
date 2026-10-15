import { structureBuildGoldCost, structureCostDefinition } from "@border-empires/shared";
import { busyDevelopmentProcessCount } from "../client-development-queue/client-development-queue.js";
import type { ClientState } from "../client-state/client-state.js";
import { hasManifestBuildSite } from "./client-manifest-build-sites.js";
import type { ManifestFitInput } from "./client-manifest-fit.js";

type ManifestFitState = Pick<ClientState,
  "tiles" | "me" | "manpower" | "gold" | "resourceSlots" | "activeDevelopmentProcessCount" | "developmentProcessLimit" | "settleProgressByTile"
>;

export const createManifestFitInput = (
  state: ManifestFitState,
  clues: Pick<ManifestFitInput, "clueNearTerritory" | "surveyReportFor">
): ManifestFitInput => {
  const ownedTiles = [...state.tiles.values()].filter((tile) => tile.ownerId === state.me);
  const busy = Math.max(state.activeDevelopmentProcessCount, busyDevelopmentProcessCount(ownedTiles, state.me, state.settleProgressByTile.size));
  return {
    manpower: state.manpower,
    resourceSlots: state.resourceSlots,
    hasBuildSite: (type, tech) => {
      if (busy >= Math.max(1, state.developmentProcessLimit)) return false;
      // All ordinary builds currently cost zero coin. Avoid rescanning every
      // owned tile for each Manifest unless the cost actually scales.
      const count = structureCostDefinition(type).scaling
        ? ownedTiles.filter((tile) => tile.economicStructure?.type === type).length
        : 0;
      const coinAfterUnlock = state.gold - (tech.requirements.gold ?? 0);
      return coinAfterUnlock >= structureBuildGoldCost(type, count) && hasManifestBuildSite(type, ownedTiles);
    },
    ownsFish: ownedTiles.some((tile) => tile.resource === "FISH" && tile.ownershipState === "SETTLED"),
    ...clues
  };
};
