// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import type { Tile } from "../client-types.js";
import { relayBeaconStartTile, startRelayBeaconPlacement } from "./client-hud-v2-beacon-start.js";
import type { HudV2Deps } from "./client-hud-v2-context.js";

const tile = (x: number, y: number, extra: Record<string, unknown> = {}): Tile =>
  ({ x, y, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", ...extra }) as unknown as Tile;
const tiles = (...list: Tile[]) => new Map(list.map((t) => [`${t.x},${t.y}`, t]));

// UX review of #2845: the "Build a Relay Beacon" next step looked tappable but did nothing.
describe("tracker Relay Beacon step", () => {
  it("starts on a tile the build path accepts, never a blocked one", () => {
    const state = { tiles: tiles(tile(5, 5, { ownershipState: "FRONTIER" }), tile(20, 20)), me: "me", serverReach: undefined, serverReachRevision: 0 };
    expect(relayBeaconStartTile(state as never)).toEqual({ x: 20, y: 20 });
    expect(relayBeaconStartTile({ ...state, tiles: tiles(tile(5, 5, { ownershipState: "FRONTIER" })) } as never)).toBeUndefined();
  });

  it("arms Relay Beacon placement, centres on it and shows the placement bar", () => {
    const state = { tiles: tiles(tile(20, 20)), me: "me", serverReach: undefined, serverReachRevision: 0, buildingPlacement: { active: false, structureType: "", x: 0, y: 0 }, camX: 0, camY: 0, camSubX: 0, camSubY: 0 };
    const renderPlacementOverlay = vi.fn();
    const deps = { state, renderHud: vi.fn(), requestViewRefresh: vi.fn(), wrapX: (x: number) => x, wrapY: (y: number) => y, actionFlow: { renderPlacementOverlay } } as unknown as HudV2Deps;
    expect(startRelayBeaconPlacement(deps)).toBe(true);
    expect(state.buildingPlacement).toEqual({ active: true, structureType: "RELAY_BEACON", x: 20, y: 20 });
    expect(renderPlacementOverlay).toHaveBeenCalled();
  });
});
