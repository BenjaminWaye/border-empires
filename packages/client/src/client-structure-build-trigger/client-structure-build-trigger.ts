// Split out of client-action-flow.ts (already over the repo's 500-line
// file-growth cap) so this file can grow independently.
import { isTownSupportPlacementStructure, type BuildableStructureType } from "@border-empires/shared";
import type { ClientState } from "../client-state/client-state.js";
import type { OptimisticStructureKind, Tile } from "../client-types.js";

export type BuildDispatchDeps = {
  sendDevelopmentBuild: (
    payload: { type: "BUILD_STRUCTURE"; x: number; y: number; structureType: BuildableStructureType },
    optimistic: () => void,
    opts: { x: number; y: number; label: string; optimisticKind: OptimisticStructureKind }
  ) => boolean;
  applyOptimisticStructureBuild: (x: number, y: number, kind: OptimisticStructureKind) => void;
  structureDisplayLabel: (structureType: BuildableStructureType) => string;
};

// Builds a structure directly, applying the optimistic tile update only for
// types that don't require town-support placement (matching the per-action
// optimistic behavior that previously lived in each build_* handler).
export const dispatchGenericBuild = (structureType: BuildableStructureType, tile: Tile, deps: BuildDispatchDeps): void => {
  deps.sendDevelopmentBuild(
    { type: "BUILD_STRUCTURE", x: tile.x, y: tile.y, structureType },
    () => {
      if (!(tile.town && isTownSupportPlacementStructure(structureType))) {
        deps.applyOptimisticStructureBuild(tile.x, tile.y, structureType as OptimisticStructureKind);
      }
    },
    {
      x: tile.x,
      y: tile.y,
      label: `${deps.structureDisplayLabel(structureType)} at (${tile.x}, ${tile.y})`,
      optimisticKind: structureType as OptimisticStructureKind
    }
  );
};

// Fires a build for a structure type, opening the placement overlay for
// FOUNDRY/WATERWORKS/RELAY_BEACON (user confirms the exact tile) and
// dispatching the build directly for every other type. Relay Beacons build
// instantly, so committing on the first click made siting trial-and-error
// (playtest: beacons cancelled and re-placed, or dropped inside existing
// reach) -- placement shows the new reach and the recommended spots first.
export const triggerBuildForStructureType = (
  structureType: BuildableStructureType,
  tile: Tile,
  state: ClientState,
  deps: BuildDispatchDeps & { renderPlacementOverlay: () => void; renderHud: () => void }
): void => {
  if (structureType === "FOUNDRY" || structureType === "WATERWORKS" || structureType === "RELAY_BEACON") {
    state.buildingPlacement = { active: true, structureType, x: tile.x, y: tile.y };
    deps.renderPlacementOverlay();
    deps.renderHud();
    return;
  }
  dispatchGenericBuild(structureType, tile, deps);
};
