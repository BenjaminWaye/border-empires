import type { SimulationSeasonState } from "@border-empires/sim-protocol";
import type { PlayerSubscriptionSnapshot } from "@border-empires/sim-protocol";
import type { PlayerRespawnNotice } from "@border-empires/shared";
import type { buildPlayerSubscriptionSnapshot } from "../player-snapshot/player-snapshot.js";

export type SnapshotBuildOptionsInput = {
  useFullVisibility: boolean;
  needsFullWorldExport: boolean;
  respawnNotice: PlayerRespawnNotice | undefined;
  currentSeasonState: SimulationSeasonState;
  nonCompetitivePlayerIds: ReadonlySet<string> | undefined;
  fullVisibilityTiles: PlayerSubscriptionSnapshot["tiles"] | undefined;
  worldStatusSnapshot: PlayerSubscriptionSnapshot["worldStatus"] | undefined;
};

export const buildSnapshotBuildOptions = ({
  useFullVisibility,
  needsFullWorldExport,
  respawnNotice,
  currentSeasonState,
  nonCompetitivePlayerIds,
  fullVisibilityTiles,
  worldStatusSnapshot,
}: SnapshotBuildOptionsInput): NonNullable<Parameters<typeof buildPlayerSubscriptionSnapshot>[2]> => ({
  includeWorldStatus: needsFullWorldExport,
  fullVisibility: useFullVisibility,
  tilesAlreadyVisible: !useFullVisibility,
  ...(fullVisibilityTiles ? { sharedFullVisibilityTiles: fullVisibilityTiles } : {}),
  ...(worldStatusSnapshot ? { worldStatusSnapshot } : {}),
  seasonState: currentSeasonState,
  ...(respawnNotice ? { respawnNotice } : {}),
  ...(nonCompetitivePlayerIds ? { nonCompetitivePlayerIds } : {}),
});
