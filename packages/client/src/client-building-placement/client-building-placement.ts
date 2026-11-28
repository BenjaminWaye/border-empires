import { landmarkConstructionBlocker, structureDisplayName } from "@border-empires/shared";
import { canBuildPlacementStructure } from "../client-structure-effects/client-structure-effects.js";
import type { ClientState } from "../client-state/client-state.js";
import type { OptimisticStructureKind, Tile } from "../client-types.js";
import { isValidAfcLandingTile, ownedAfcCount } from "../client-afc-actions.js";
import type { TapConfirmButton } from "../client-tap-confirm-button/client-tap-confirm-button.js";
import { isRelayBeaconPlacementTarget, relayBeaconPlacementCostLabel } from "../client-relay-beacon-placement/client-relay-beacon-placement.js";
import { beaconNewReachLabel, beaconReachExpansion } from "../client-beacon-reach-expansion/client-beacon-reach-expansion.js";

type PlacedStructureType = "HYDROWORKS" | "RELAY_BEACON";

export type BuildingPlacementFlowDeps = {
  keyFor: (x: number, y: number) => string;
  pushFeed: (msg: string, type?: string, severity?: string) => void;
  renderHud: () => void;
  placementOverlayEl: HTMLDivElement;
  placementLabelEl: HTMLDivElement;
  sendDevelopmentBuild: (
    payload: { type: "BUILD_STRUCTURE"; x: number; y: number; structureType: PlacedStructureType },
    optimistic: () => void,
    opts: { x: number; y: number; label: string; optimisticKind: OptimisticStructureKind }
  ) => boolean;
  applyOptimisticStructureBuild: (x: number, y: number, kind: OptimisticStructureKind) => void;
  sendGameMessage: (payload: { type: "BUILD_AFC"; x: number; y: number }) => boolean;
  /** Confirmed Relay Beacon on a tile not settled yet: garrison (and expand) first, then build. See client-relay-beacon-placement.ts. */
  startRelayBeaconChain: (tile: Tile) => void;
  /** The big confirm prompt at the tapped tile (client-tap-confirm-button.ts); shown for Relay Beacon placement. */
  confirmPrompt?: Pick<TapConfirmButton, "offer" | "hide"> & Partial<Pick<TapConfirmButton, "notePoint">>;
};

export const createBuildingPlacementFlow = (state: ClientState, deps: BuildingPlacementFlowDeps) => {
  // Whether this AFC placement replaces the last lost complex (no AFC owned), computed once
  // per placement session: both map renderers ask about every visible tile.
  let afcReplacement: boolean | undefined;
  const isPlacementValidForTile = (tile: Tile | undefined): boolean => {
    if (!state.buildingPlacement.active) afcReplacement = undefined;
    if (!tile || !state.buildingPlacement.active) return false;
    const st = state.buildingPlacement.structureType;
    if (st === "AFC") {
      afcReplacement ??= ownedAfcCount(state) === 0;
      return isValidAfcLandingTile(state, tile, afcReplacement);
    }
    if (landmarkConstructionBlocker(state.tiles, tile.x, tile.y)) return false;
    if (st === "RELAY_BEACON") return isRelayBeaconPlacementTarget(state, tile);
    if (st !== "HYDROWORKS") return false;
    return canBuildPlacementStructure(st, tile, state.me, state.gold, state.techIds, state.resourceSlots).available;
  };

  const removePlacementOverlay = (): void => {
    deps.confirmPrompt?.hide();
    deps.placementOverlayEl.style.display = "none";
  };

  const cancelBuildingPlacement = (): void => {
    afcReplacement = undefined;
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
        deps.pushFeed(afcReplacement ? "Your new AFC needs empty land you control." : "AFCs need empty garrisoned land you control.", "combat", "warn");
        cancelBuildingPlacement();
        return;
      }
      deps.sendGameMessage({ type: "BUILD_AFC", x, y });
      cancelBuildingPlacement();
      return;
    }
    if (structureType !== "HYDROWORKS" && structureType !== "RELAY_BEACON") {
      cancelBuildingPlacement();
      return;
    }
    const tile = state.tiles.get(deps.keyFor(x, y));
    if (!isPlacementValidForTile(tile)) {
      deps.pushFeed("Cannot build here. The tile is no longer valid.", "combat", "warn");
      cancelBuildingPlacement();
      return;
    }
    if (structureType === "RELAY_BEACON" && tile && tile.ownershipState !== "SETTLED") {
      deps.startRelayBeaconChain(tile);
      cancelBuildingPlacement();
      return;
    }
    deps.sendDevelopmentBuild(
      { type: "BUILD_STRUCTURE", x, y, structureType },
      () => deps.applyOptimisticStructureBuild(x, y, structureType),
      { x, y, label: `${structureDisplayName(structureType)} at (${x}, ${y})`, optimisticKind: structureType }
    );
    cancelBuildingPlacement();
  };

  /**
   * `anchor` (client px) places the confirm prompt when placement starts without a map tap, e.g. from the
   * HUD tracker; otherwise the prompt stays at the last tap, which is the placement tile.
   */
  const renderPlacementOverlay = (anchor?: { x: number; y: number }): void => {
    if (!state.buildingPlacement.active) {
      removePlacementOverlay();
      return;
    }
    const st = state.buildingPlacement.structureType;
    const name = st === "AFC" ? "Automated Fabrication Complex" : structureDisplayName(st);
    const placementTile = state.tiles.get(deps.keyFor(state.buildingPlacement.x, state.buildingPlacement.y));
    const cost = st === "RELAY_BEACON" ? relayBeaconPlacementCostLabel(state, placementTile) : "";
    const valid = st === "RELAY_BEACON" && isPlacementValidForTile(placementTile);
    // How much ground the beacon adds here, as the map shows it growing (owner, First-15 round 1).
    const reach = valid ? beaconNewReachLabel(beaconReachExpansion(state, state.buildingPlacement.x, state.buildingPlacement.y).tiles.length) : "";
    deps.placementLabelEl.textContent = `Placing ${name}${cost ? ` (${cost})` : ""}${reach ? ` · ${reach}` : ""} — click a tile to move, then confirm`;
    deps.placementOverlayEl.style.display = "flex";
    if (st !== "RELAY_BEACON") return;
    if (anchor) deps.confirmPrompt?.notePoint?.(anchor.x, anchor.y);
    deps.confirmPrompt?.offer(valid ? { label: "Build Relay Beacon", cost: `${cost} · ${reach}` } : { label: "Pick a highlighted tile", disabled: true }, confirmBuildingPlacement);
  };

  return {
    isPlacementValidForTile,
    cancelBuildingPlacement,
    confirmBuildingPlacement,
    renderPlacementOverlay,
    removePlacementOverlay
  };
};
