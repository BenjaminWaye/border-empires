import type { SimulationSeasonState } from "@border-empires/sim-protocol";
import type { PlayerSubscriptionSnapshot } from "@border-empires/sim-protocol";
import type { PlayerRespawnNotice } from "@border-empires/shared";
import type { SimulationRuntime } from "../runtime/runtime.js";

type RuntimeState = ReturnType<SimulationRuntime["exportState"]>;

export type SnapshotBuildOptionsInput = {
  useFullVisibility: boolean;
  needsFullWorldExport: boolean;
  runtimeState: RuntimeState;
  respawnNotice: PlayerRespawnNotice | undefined;
  currentSeasonState: SimulationSeasonState;
  nonCompetitivePlayerIds: ReadonlySet<string> | undefined;
  sharedFullVisibilityTiles: (runtimeState: RuntimeState) => PlayerSubscriptionSnapshot["tiles"];
};

export const buildSnapshotBuildOptions = ({
  useFullVisibility,
  needsFullWorldExport,
  runtimeState,
  respawnNotice,
  currentSeasonState,
  nonCompetitivePlayerIds,
  sharedFullVisibilityTiles,
}: SnapshotBuildOptionsInput) => ({
  includeWorldStatus: needsFullWorldExport,
  fullVisibility: useFullVisibility,
  tilesAlreadyVisible: !useFullVisibility,
  ...(useFullVisibility ? { sharedFullVisibilityTiles: sharedFullVisibilityTiles(runtimeState) } : {}),
  seasonState: currentSeasonState,
  ...(respawnNotice ? { respawnNotice } : {}),
  ...(nonCompetitivePlayerIds ? { nonCompetitivePlayerIds } : {}),
});
