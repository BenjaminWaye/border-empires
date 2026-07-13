import { canBuildPlacementStructure } from "../client-structure-effects/client-structure-effects.js";
import type { ClientState } from "../client-state/client-state.js";
import type { OptimisticStructureKind, Tile } from "../client-types.js";

export type BuildingPlacementFlowDeps = {
  keyFor: (x: number, y: number) => string;
  pushFeed: (msg: string, type?: string, severity?: string) => void;
  renderHud: () => void;
  placementOverlayEl: HTMLDivElement;
  placementLabelEl: HTMLDivElement;
  sendDevelopmentBuild: (
    payload: { type: "BUILD_STRUCTURE"; x: number; y: number; structureType: "WATERWORKS" | "FOUNDRY" },
    optimistic: () => void,
    opts: { x: number; y: number; label: string; optimisticKind: OptimisticStructureKind }
  ) => boolean;
  applyOptimisticStructureBuild: (x: number, y: number, kind: OptimisticStructureKind) => void;
};

export const createBuildingPlacementFlow = (state: ClientState, deps: BuildingPlacementFlowDeps) => {
  const isPlacementValidForTile = (tile: Tile | undefined): boolean => {
    if (!tile || !state.buildingPlacement.active) return false;
    const st = state.buildingPlacement.structureType;
    if (st !== "WATERWORKS" && st !== "FOUNDRY") return false;
    return canBuildPlacementStructure(st, tile, state.me, state.gold, state.techIds, state.strategicResources).available;
  };

  const removePlacementOverlay = (): void => {
    deps.placementOverlayEl.style.display = "none";
  };

  const cancelBuildingPlacement = (): void => {
    state.buildingPlacement.active = false;
    state.buildingPlacement.structureType = "";
    removePlacementOverlay();
    deps.renderHud();
  };

  const confirmBuildingPlacement = (): void => {
    if (!state.buildingPlacement.active) return;
    const { structureType, x, y } = state.buildingPlacement;
    if (structureType !== "WATERWORKS" && structureType !== "FOUNDRY") {
      cancelBuildingPlacement();
      return;
    }
    const tile = state.tiles.get(deps.keyFor(x, y));
    if (!isPlacementValidForTile(tile)) {
      deps.pushFeed("Cannot build here. The tile is no longer valid.", "combat", "warn");
      cancelBuildingPlacement();
      return;
    }
    deps.sendDevelopmentBuild(
      { type: "BUILD_STRUCTURE", x, y, structureType },
      () => deps.applyOptimisticStructureBuild(x, y, structureType),
      { x, y, label: `${structureType} at (${x}, ${y})`, optimisticKind: structureType }
    );
    cancelBuildingPlacement();
  };

  const renderPlacementOverlay = (): void => {
    if (!state.buildingPlacement.active) {
      deps.placementOverlayEl.style.display = "none";
      return;
    }
    const name = state.buildingPlacement.structureType === "WATERWORKS" ? "Waterworks" : "Foundry";
    deps.placementLabelEl.textContent = `Placing ${name} — click a tile to move, then confirm`;
    deps.placementOverlayEl.style.display = "flex";
  };

  return {
    isPlacementValidForTile,
    cancelBuildingPlacement,
    confirmBuildingPlacement,
    renderPlacementOverlay,
    removePlacementOverlay
  };
};
