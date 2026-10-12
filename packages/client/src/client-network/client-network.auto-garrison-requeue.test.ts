import { describe, expect, it } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import { applyPendingSettlementsFromServer } from "../client-queue-logic/client-queue-logic.js";
import { DEFAULT_AUTO_SETTLE_PREFS } from "@border-empires/shared";
import { FakeWebSocket, createState, bindWithDeps } from "./client-network.error-regression.test-helpers.js";

describe("auto-garrison PLAYER_UPDATE reconciliation", () => {
  it("removes an already queued tile once the server reports its garrison in progress", () => {
    const state = Object.assign(createInitialState(), createState());
    state.tiles.set("9,10", { x: 9, y: 10, terrain: "LAND", ownerId: state.me, ownershipState: "FRONTIER" });
    state.developmentQueue = [{ kind: "SETTLE", x: 9, y: 10, tileKey: "9,10", label: "Garrison" }];
    const ws = new FakeWebSocket();
    bindWithDeps(state, ws, {
      applyPendingSettlementsFromServer: (entries: Array<{ x: number; y: number; startedAt: number; resolvesAt: number }> | undefined) =>
        applyPendingSettlementsFromServer(state, entries, {
          keyFor: (x, y) => `${x},${y}`,
          syncOptimisticSettlementTile: () => {},
          clearOptimisticTileState: () => {},
          requestViewRefresh: () => {}
        })
    });
    ws.emit("message", { data: JSON.stringify({
      type: "PLAYER_UPDATE",
      autoSettle: DEFAULT_AUTO_SETTLE_PREFS,
      autoSettlementQueue: [],
      pendingSettlements: [{ x: 9, y: 10, startedAt: Date.now(), resolvesAt: Date.now() + 60_000 }]
    }) });
    expect(state.settleProgressByTile.has("9,10")).toBe(true);
    expect(state.developmentQueue).toEqual([]);
  });
});
