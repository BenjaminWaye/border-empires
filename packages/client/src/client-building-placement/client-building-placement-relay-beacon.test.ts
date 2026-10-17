// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { tileKey } from "@border-empires/shared";
import { createInitialState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";
import { triggerBuildForStructureType } from "../client-structure-build-trigger/client-structure-build-trigger.js";
import { createBuildingPlacementFlow } from "./client-building-placement.js";

const settled = (x: number, y: number, extra: Partial<Tile> = {}): Tile => ({ x, y, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", ...extra });

const setup = (tiles: Tile[]) => {
  const state = createInitialState();
  state.me = "me";
  for (const tile of tiles) state.tiles.set(tileKey(tile.x, tile.y), tile);
  const sendDevelopmentBuild = vi.fn(() => true);
  const applyOptimisticStructureBuild = vi.fn();
  const pushFeed = vi.fn();
  const flow = createBuildingPlacementFlow(state, {
    keyFor: tileKey,
    pushFeed,
    renderHud: vi.fn(),
    placementOverlayEl: document.createElement("div"),
    placementLabelEl: document.createElement("div"),
    sendDevelopmentBuild,
    applyOptimisticStructureBuild,
    sendGameMessage: vi.fn(() => true)
  });
  return { state, flow, sendDevelopmentBuild, applyOptimisticStructureBuild, pushFeed };
};

describe("Relay Beacon placement", () => {
  it("opens placement mode instead of building on the clicked tile straight away", () => {
    // Playtest regression: beacons build instantly, so the first click used
    // to commit -- players cancelled and re-placed them, or dropped them
    // inside reach they already had, burning manpower each time.
    const { state } = setup([settled(4, 4)]);
    const sendDevelopmentBuild = vi.fn(() => true);
    triggerBuildForStructureType("RELAY_BEACON", state.tiles.get("4,4")!, state, {
      sendDevelopmentBuild,
      applyOptimisticStructureBuild: vi.fn(),
      structureDisplayLabel: () => "Relay Beacon",
      renderPlacementOverlay: vi.fn(),
      renderHud: vi.fn()
    });
    expect(sendDevelopmentBuild).not.toHaveBeenCalled();
    expect(state.buildingPlacement).toEqual({ active: true, structureType: "RELAY_BEACON", x: 4, y: 4 });
  });

  it("builds on the confirmed tile once the player has moved the placement there", () => {
    const { state, flow, sendDevelopmentBuild } = setup([settled(4, 4), settled(6, 4)]);
    state.buildingPlacement = { active: true, structureType: "RELAY_BEACON", x: 6, y: 4 };
    flow.confirmBuildingPlacement();
    expect(sendDevelopmentBuild).toHaveBeenCalledWith(
      { type: "BUILD_STRUCTURE", x: 6, y: 4, structureType: "RELAY_BEACON" },
      expect.any(Function),
      expect.objectContaining({ x: 6, y: 4, optimisticKind: "RELAY_BEACON" })
    );
    expect(state.buildingPlacement.active).toBe(false);
  });

  it("refuses a tile a beacon can't go on (structure already there, not yours, or not settled)", () => {
    const { state, flow, sendDevelopmentBuild, pushFeed } = setup([
      settled(4, 4, { observatory: { ownerId: "me", status: "active" } }),
      settled(5, 4, { ownerId: "rival" }),
      settled(6, 4, { ownershipState: "FRONTIER" })
    ]);
    for (const x of [4, 5, 6]) expect(flow.isPlacementValidForTile(state.tiles.get(`${x},4`))).toBe(false);
    state.buildingPlacement = { active: true, structureType: "RELAY_BEACON", x: 4, y: 4 };
    flow.confirmBuildingPlacement();
    expect(sendDevelopmentBuild).not.toHaveBeenCalled();
    expect(pushFeed).toHaveBeenCalledWith("Cannot build here. The tile is no longer valid.", "combat", "warn");
  });
});
