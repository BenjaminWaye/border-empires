/**
 * Regression test for the client auto-settlement manpower-budget fix.
 *
 * Bug: applyAutoSettlementQueueFromServer bulk-filled the development queue
 * with SETTLE entries against a gold budget only — no manpower budget was
 * tracked at all. Once SETTLE started costing SETTLE_MANPOWER_COST manpower
 * (§4.2 of docs/manpower-economy-rewrite-plan.md), this meant the client
 * over-queued settlements a manpower-poor player couldn't actually afford,
 * each of which then got rejected server-side one at a time.
 *
 * Fix: a manpowerBudget mirrors the existing settlementBudget (gold) check,
 * so the loop stops as soon as either resource runs out.
 */
import { describe, expect, it, vi } from "vitest";
import { SETTLE_MANPOWER_COST } from "@border-empires/shared";

import { createInitialState } from "../client-state/client-state.js";
import { applyAutoSettlementQueueFromServer } from "./client-development-queue.js";

const installSessionStorageMock = () => {
  let values = new Map<string, string>();
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
    clear: () => {
      values = new Map<string, string>();
    }
  });
};

describe("applyAutoSettlementQueueFromServer manpower budget", () => {
  it("stops auto-queueing settlements once manpower budget runs out, even with plenty of gold", () => {
    installSessionStorageMock();
    globalThis.sessionStorage.clear();
    const state = createInitialState();
    state.me = "me";
    state.gold = 1_000;
    state.manpower = SETTLE_MANPOWER_COST; // exactly one settle's worth
    state.tiles.set("9,10", { x: 9, y: 10, terrain: "LAND", ownerId: "me", ownershipState: "FRONTIER" } as never);
    state.tiles.set("30,30", { x: 30, y: 30, terrain: "LAND", ownerId: "me", ownershipState: "FRONTIER" } as never);

    const added = applyAutoSettlementQueueFromServer(
      state,
      [
        { x: 9, y: 10 },
        { x: 30, y: 30 }
      ],
      { keyFor: (x, y) => `${x},${y}` }
    );

    expect(added).toBe(1);
    expect(state.developmentQueue).toEqual([{ kind: "SETTLE", x: 9, y: 10, tileKey: "9,10", label: "Settlement at (9, 10)" }]);
  });

  it("queues both settlements when manpower and gold both cover them", () => {
    installSessionStorageMock();
    globalThis.sessionStorage.clear();
    const state = createInitialState();
    state.me = "me";
    state.gold = 1_000;
    state.manpower = SETTLE_MANPOWER_COST * 2;
    state.tiles.set("9,10", { x: 9, y: 10, terrain: "LAND", ownerId: "me", ownershipState: "FRONTIER" } as never);
    state.tiles.set("30,30", { x: 30, y: 30, terrain: "LAND", ownerId: "me", ownershipState: "FRONTIER" } as never);

    const added = applyAutoSettlementQueueFromServer(
      state,
      [
        { x: 9, y: 10 },
        { x: 30, y: 30 }
      ],
      { keyFor: (x, y) => `${x},${y}` }
    );

    expect(added).toBe(2);
  });
});
