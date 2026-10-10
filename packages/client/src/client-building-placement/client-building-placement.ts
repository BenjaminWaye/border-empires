import { canBuildPlacementStructure } from "../client-structure-effects/client-structure-effects.js";
import type { ClientState } from "../client-state/client-state.js";
import type { OptimisticStructureKind, Tile } from "../client-types.js";
import { isValidAfcLandingTile, ownedAfcCount } from "../client-afc-actions.js";

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
  sendGameMessage: (payload: { type: "BUILD_AFC"; x: number; y: number }) => boolean;
};

export const createBuildingPlacementFlow = (state: ClientState, deps: BuildingPlacementFlowDeps) => {
  // Whether this AFC placement is a free rebuild (no AFC owned), computed once
  // per placement session: both map renderers ask about every visible tile.
  let afcFreeRebuild: boolean | undefined;
  const isPlacementValidForTile = (tile: Tile | undefined): boolean => {
    if (!state.buildingPlacement.active) afcFreeRebuild = undefined;
    if (!tile || !state.buildingPlacement.active) return false;
    const st = state.buildingPlacement.structureType;
    if (st === "AFC") {
      afcFreeRebuild ??= ownedAfcCount(state) === 0;
      return isValidAfcLandingTile(state, tile, afcFreeRebuild);
    }
    if (st !== "WATERWORKS" && st !== "FOUNDRY") return false;
    return canBuildPlacementStructure(st, tile, state.me, state.gold, state.techIds, state.resourceSlots).available;
  };

  const removePlacementOverlay = (): void => {
    deps.placementOverlayEl.style.display = "none";
  };

  const cancelBuildingPlacement = (): void => {
    afcFreeRebuild = undefined;
    state.buildingPlacement.active = false;
    state.buildingPlacement.structureType = "";
    removePlacementOverlay();
    deps.renderHud();
  };

  const confirmBuildingPlacement = (): void => {
    if (!state.buildingPlacement.active) return;
    const { structureType, x, y } = state.buildingPlacement;
    if (structureType === "AFC") {
      const tile = state.tiles.get(deps.keyFor(x, y));
      if (!isPlacementValidForTile(tile)) {
        deps.pushFeed(afcFreeRebuild ? "Your new AFC needs empty land you control." : "AFCs need empty garrisoned land you control.", "combat", "warn");
        cancelBuildingPlacement();
        return;
      }
      deps.sendGameMessage({ type: "BUILD_AFC", x, y });
      cancelBuildingPlacement();
      return;
    }
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
    const name = state.buildingPlacement.structureType === "AFC" ? "Automated Fabrication Complex" : state.buildingPlacement.structureType === "WATERWORKS" ? "Waterworks" : "Ore Refinery";
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
