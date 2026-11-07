import { describe, expect, it, vi } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import { buildPlayer } from "../runtime/runtime.test-helpers.js";
import { createEmptyPlayerRuntimeSummary } from "../player-runtime-summary.js";
import { recordAfcLoss, createAfcTileObserver } from "./afc-loss.js";

const afc = (ownerId: string): DomainTileState => ({ x: 10, y: 10, terrain: "LAND", ownerId, ownershipState: "SETTLED", afc: { ownerId, status: "active" } });
describe("global AFC losses", () => {
  it("counts transfers, recaptures and destruction, but ignores ordinary tile and module updates", () => {
    const state = { afcGlobalLosses: 0, players: new Map([["p", buildPlayer("p")], ["e", buildPlayer("e")]]) };
    const summary = createEmptyPlayerRuntimeSummary();
    const context = { summaryForPlayer: () => summary, now: () => 1000, playerManpowerCap: () => 0, emitEvent: vi.fn(), emitPlayerStateUpdate: vi.fn() };
    recordAfcLoss(state, context, afc("p"), afc("e"), "capture");
    expect(state.afcGlobalLosses).toBe(1);
    expect(context.emitPlayerStateUpdate).toHaveBeenCalledTimes(1);
    recordAfcLoss(state, context, afc("e"), afc("p"), "recapture");
    expect(state.afcGlobalLosses).toBe(2);
    recordAfcLoss(state, context, afc("p"), { x: 10, y: 10, terrain: "LAND" }, "destroy");
    expect(state.afcGlobalLosses).toBe(3);
    recordAfcLoss(state, context, afc("p"), { ...afc("p"), afc: { ownerId: "p", status: "active", modules: ["masonry"] } }, "module");
    recordAfcLoss(state, context, undefined, afc("p"), "landing");
    expect(state.afcGlobalLosses).toBe(3);
  });

  it("updates the shared quote without changing an already reserved delivery", () => {
    const p = buildPlayer("p", { afcRecovery: { globalLosses: 1, requiredSince: 0, pending: { x: 15, y: 15, cost: 20, arrivesAt: 60000, commandId: "order" } } });
    const e = buildPlayer("e");
    const state = { afcGlobalLosses: 1, players: new Map([["p", p], ["e", e]]) };
    recordAfcLoss(state, { summaryForPlayer: () => createEmptyPlayerRuntimeSummary(), now: () => 1000, playerManpowerCap: () => 0, emitEvent: vi.fn(), emitPlayerStateUpdate: vi.fn() }, afc("e"), afc("q"), "capture");
    expect(p.afcRecovery?.globalLosses).toBe(2);
    expect(p.afcRecovery?.pending?.cost).toBe(20);
  });
});

it("does not construct command dependencies for ordinary tile changes", () => {
  const state = { afcGlobalLosses: 0, players: new Map([["p", buildPlayer("p")]]) };
  const contextFor = vi.fn(() => ({ now: () => 1000, summaryForPlayer: () => createEmptyPlayerRuntimeSummary(), playerManpowerCap: () => 0, emitEvent: vi.fn(), emitPlayerStateUpdate: vi.fn() }));
  const observe = createAfcTileObserver(() => state, contextFor);
  for (let x = 0; x < 1000; x++) observe(undefined, { x, y: 10, terrain: "LAND", ownerId: "p", ownershipState: "FRONTIER" }, "claim");
  expect(contextFor).not.toHaveBeenCalled();
  observe(afc("p"), { x: 10, y: 10, terrain: "LAND" }, "destroy");
  expect(contextFor).toHaveBeenCalledTimes(1);
  expect(state.afcGlobalLosses).toBe(1);
});
