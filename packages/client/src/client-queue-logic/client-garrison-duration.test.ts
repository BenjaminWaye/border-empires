import { describe, expect, it, vi } from "vitest";
import { frontierClaimDurationMsAt } from "@border-empires/shared";
import { settleDurationMsForTile } from "../client-constants.js";
import { applyPlayerUpdateManpowerFields } from "../client-player-update-manpower/client-player-update-manpower.js";
import { createInitialState } from "../client-state/client-state.js";
import { requestSettlement, settleDurationMsForState } from "./client-queue-logic.js";

const noEffects = { techIds: [], techCatalog: [], domainIds: [], domainCatalog: [] };

describe("client garrison duration", () => {
  it("predicts the frontier claim time, matching the server", () => {
    for (const [x, y] of [[0, 0], [3, 7], [12, 40]] as const) {
      expect(settleDurationMsForTile(x, y)).toBe(frontierClaimDurationMsAt(x, y));
      expect(settleDurationMsForState({ ...noEffects, instantGarrisonsRemaining: 0 }, { x, y })).toBe(frontierClaimDurationMsAt(x, y));
    }
  });

  it("predicts 0 ms while the player has instant garrisons left, still behind a capture hold", () => {
    expect(settleDurationMsForState({ ...noEffects, instantGarrisonsRemaining: 3 }, { x: 0, y: 0 })).toBe(0);
    const held = { x: 0, y: 0, ownershipState: "FRONTIER", captureHoldUntil: 1_000 + 20_000 };
    expect(settleDurationMsForState({ ...noEffects, instantGarrisonsRemaining: 3 }, held, 1_000)).toBe(20_000);
  });

  it("reads instantGarrisonsRemaining from PLAYER_UPDATE and keeps it when omitted", () => {
    const state = createInitialState();
    expect(state.instantGarrisonsRemaining).toBe(0);
    applyPlayerUpdateManpowerFields(state, { instantGarrisonsRemaining: 10 });
    expect(state.instantGarrisonsRemaining).toBe(10);
    applyPlayerUpdateManpowerFields(state, { manpower: 5 });
    expect(state.instantGarrisonsRemaining).toBe(10);
  });

  it("spends a free garrison locally on send, so a second quick tap predicts the timer", () => {
    const state = createInitialState();
    state.me = "me";
    state.gold = 999;
    state.manpower = 999;
    state.instantGarrisonsRemaining = 1;
    for (const x of [2, 3]) state.tiles.set(`${x},2`, { x, y: 2, terrain: "LAND", ownerId: "me", ownershipState: "FRONTIER" });
    const deps = {
      keyFor: (x: number, y: number) => `${x},${y}`,
      developmentSlotSummary: () => ({ busy: 0, limit: 4, available: 4 }),
      developmentSlotReason: () => "busy",
      queueDevelopmentAction: vi.fn(() => false),
      pushFeed: vi.fn(),
      renderHud: vi.fn(),
      sendGameMessage: vi.fn(() => true),
      syncOptimisticSettlementTile: vi.fn(),
      opts: {}
    };
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(10_000);
    try {
      expect(requestSettlement(state, 2, 2, deps)).toBe(true);
      expect(requestSettlement(state, 3, 2, deps)).toBe(true);
    } finally {
      nowSpy.mockRestore();
    }
    expect(state.settleProgressByTile.get("2,2")?.resolvesAt).toBe(10_000);
    expect(state.settleProgressByTile.get("3,2")?.resolvesAt).toBe(10_000 + frontierClaimDurationMsAt(3, 2));
    expect(state.instantGarrisonsRemaining).toBe(0);
  });
});
