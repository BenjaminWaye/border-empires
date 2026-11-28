import { describe, expect, it, vi } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";
import { requestSettlement } from "./client-development-dispatch.js";

const deps = () => ({
  keyFor: (x: number, y: number) => `${x},${y}`,
  renderHud: vi.fn(),
  queueDevelopmentAction: vi.fn(() => true),
  developmentSlotSummary: () => ({ busy: 0, limit: 3, available: 3 }),
  developmentSlotReason: () => "full",
  sendGameMessage: vi.fn(() => true),
  syncOptimisticSettlementTile: vi.fn(),
  pushFeed: vi.fn(),
  showCaptureAlert: vi.fn()
});

// First-15 playtest r1: a Garrison tap on a tile the auto-garrison had just settled warned
// "tile is not one of your frontier tiles". Already garrisoned by you is done, not blocked.
describe("Garrison on a tile you already garrisoned", () => {
  it("sends nothing and warns nothing", () => {
    const state = createInitialState();
    state.me = "p1";
    state.tiles.set("4,5", { x: 4, y: 5, terrain: "LAND", ownerId: "p1", ownershipState: "SETTLED" } as Tile);
    const d = deps();
    expect(requestSettlement(state, 4, 5, d)).toBe(false);
    expect(d.sendGameMessage).not.toHaveBeenCalled();
    expect(d.showCaptureAlert).not.toHaveBeenCalled();
    expect(d.pushFeed).not.toHaveBeenCalled();
  });

  it("still warns for a tile that isn't yours", () => {
    const state = createInitialState();
    state.me = "p1";
    state.tiles.set("4,5", { x: 4, y: 5, terrain: "LAND", ownerId: "p2", ownershipState: "SETTLED" } as Tile);
    const d = deps();
    requestSettlement(state, 4, 5, d);
    expect(d.showCaptureAlert).toHaveBeenCalledWith("Garrison blocked", expect.any(String), "warn");
  });
});
