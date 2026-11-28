// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { tileKey } from "@border-empires/shared";
import { createInitialState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";
import { triggerBuildForStructureType } from "../client-structure-build-trigger/client-structure-build-trigger.js";
import { beaconExpansionElapsedMs, resetBeaconExpansionClockForTests } from "../client-beacon-reach-expansion/client-beacon-reach-expansion.js";
import { createBuildingPlacementFlow } from "./client-building-placement.js";

const settled = (x: number, y: number, extra: Partial<Tile> = {}): Tile => ({ x, y, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", ...extra });

const setup = (tiles: Tile[]) => {
  const state = createInitialState();
  state.me = "me";
  for (const tile of tiles) state.tiles.set(tileKey(tile.x, tile.y), tile);
  const sendDevelopmentBuild = vi.fn(() => true);
  const applyOptimisticStructureBuild = vi.fn();
  const pushFeed = vi.fn();
  const startRelayBeaconChain = vi.fn();
  const flow = createBuildingPlacementFlow(state, {
    keyFor: tileKey,
    pushFeed,
    renderHud: vi.fn(),
    placementOverlayEl: document.createElement("div"),
    placementLabelEl: document.createElement("div"),
    sendDevelopmentBuild,
    applyOptimisticStructureBuild,
    sendGameMessage: vi.fn(() => true),
    startRelayBeaconChain
  });
  return { state, flow, sendDevelopmentBuild, applyOptimisticStructureBuild, pushFeed, startRelayBeaconChain };
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

  it("refuses to place a beacon inside an AFC or relic footprint", () => {
    const { state, flow, sendDevelopmentBuild } = setup([
      settled(4, 4, { afc: { ownerId: "me", status: "active" } }),
      settled(5, 5),
      settled(6, 5),
      settled(7, 5),
      settled(8, 6, { naturalWonder: { type: "WARPRESS" } })
    ]);
    state.buildingPlacement = { active: true, structureType: "RELAY_BEACON", x: 5, y: 5 };
    expect(flow.isPlacementValidForTile(state.tiles.get("5,5"))).toBe(false);
    expect(flow.isPlacementValidForTile(state.tiles.get("6,5"))).toBe(true);
    expect(flow.isPlacementValidForTile(state.tiles.get("7,5"))).toBe(false);
    flow.confirmBuildingPlacement();
    expect(sendDevelopmentBuild).not.toHaveBeenCalled();
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

  // Playtest 2026-11-17: Build Relay Beacon on neutral or FRONTIER land spent
  // the expand/garrison straight from the menu with no reach preview.
  it("previews and confirms a beacon on neutral or FRONTIER land in reach, spending only on Confirm", () => {
    const { state, flow, sendDevelopmentBuild, startRelayBeaconChain } = setup([
      settled(4, 4),
      { x: 5, y: 4, terrain: "LAND" },
      settled(6, 4, { ownershipState: "FRONTIER" }),
      { x: 9, y: 9, terrain: "LAND" }
    ]);
    state.serverReach = new Set(["4,4", "5,4", "6,4"]);
    state.serverReachRevision += 1;
    state.buildingPlacement = { active: true, structureType: "RELAY_BEACON", x: 5, y: 4 };
    expect(flow.isPlacementValidForTile(state.tiles.get("5,4"))).toBe(true);
    expect(flow.isPlacementValidForTile(state.tiles.get("6,4"))).toBe(true);
    expect(flow.isPlacementValidForTile(state.tiles.get("9,9"))).toBe(false); // outside reach
    expect(startRelayBeaconChain).not.toHaveBeenCalled();
    flow.confirmBuildingPlacement();
    expect(startRelayBeaconChain).toHaveBeenCalledWith(state.tiles.get("5,4"));
    expect(sendDevelopmentBuild).not.toHaveBeenCalled();
    expect(state.buildingPlacement.active).toBe(false);
  });

  it("shows the cost on the placement bar and a big confirm prompt at the tile", () => {
    const state = createInitialState();
    state.me = "me";
    state.tiles.set("5,4", { x: 5, y: 4, terrain: "LAND" });
    state.serverReach = new Set(["5,4"]);
    state.serverReachRevision += 1;
    const placementLabelEl = document.createElement("div");
    const confirmPrompt = { offer: vi.fn(), hide: vi.fn() };
    const flow = createBuildingPlacementFlow(state, {
      keyFor: tileKey, pushFeed: vi.fn(), renderHud: vi.fn(), placementOverlayEl: document.createElement("div"), placementLabelEl,
      sendDevelopmentBuild: vi.fn(() => true), applyOptimisticStructureBuild: vi.fn(), sendGameMessage: vi.fn(() => true), startRelayBeaconChain: vi.fn(), confirmPrompt
    });
    state.buildingPlacement = { active: true, structureType: "RELAY_BEACON", x: 5, y: 4 };
    flow.renderPlacementOverlay();
    expect(placementLabelEl.textContent).toMatch(/^Placing Relay Beacon \(\d+ m\.p\./);
    // Owner, First-15 round 1: the bar says how much ground the beacon brings into reach (only 5,4 is in reach now).
    expect(placementLabelEl.textContent).toContain(" · +120 tiles into reach");
    expect(confirmPrompt.offer).toHaveBeenCalledWith({ label: "Build Relay Beacon", cost: expect.stringContaining("+120 tiles into reach") }, flow.confirmBuildingPlacement);
    // The big confirm prompt at the tapped tile, with the cost, confirms the placement.
    expect(confirmPrompt.offer).toHaveBeenCalledWith({ label: "Build Relay Beacon", cost: expect.stringMatching(/m\.p\./) }, flow.confirmBuildingPlacement);
    flow.cancelBuildingPlacement();
    expect(confirmPrompt.hide).toHaveBeenCalled();
  });

  it("replays the reach growth from the beacon out when placement reopens on the same tile", () => {
    // Review of #3087: the growth clock was never reset, so cancelling and placing again on the same tile
    // ten seconds later landed mid-cycle instead of growing from the beacon out.
    const { state, flow } = setup([settled(4, 4)]);
    resetBeaconExpansionClockForTests();
    state.buildingPlacement = { active: true, structureType: "RELAY_BEACON", x: 4, y: 4 };
    beaconExpansionElapsedMs(4, 4, 0);
    flow.cancelBuildingPlacement();
    state.buildingPlacement = { active: true, structureType: "RELAY_BEACON", x: 4, y: 4 };
    expect(beaconExpansionElapsedMs(4, 4, 10_000)).toBe(0);
  });
});

