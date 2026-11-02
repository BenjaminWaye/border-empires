import { describe, expect, it } from "vitest";
import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import { CAPTURE_HOLD_MS } from "@border-empires/shared";
import { buildPlayerUpdateEconomySnapshot } from "./player-update-economy.js";
import { createEmptyPlayerRuntimeSummary, applyTileToPlayerSummary } from "../player-runtime-summary.js";
import { startSettlementProcess } from "../runtime/runtime-settlement-start.js";

// A dock taken in battle burns while the capturing troops hold it and pays
// its new owner no gold until the hold is over and it is garrisoned.
const player: DomainPlayer = { id: "p2", isAi: false, points: 1_000, manpower: 1_000, techIds: new Set(), domainIds: new Set(["afc-dominion-4"]), allies: new Set(), mods: { attack: 1, defense: 1, income: 1, vision: 1 } };
const NOW = 1_000_000;
const heldDock: DomainTileState = { x: 10, y: 10, terrain: "LAND", ownerId: "p2", ownershipState: "FRONTIER", dockId: "dock-a", captureHoldUntil: NOW + CAPTURE_HOLD_MS };

const dockGold = (tile: DomainTileState): number => {
  const tiles = new Map([["10,10", tile]]);
  const summary = createEmptyPlayerRuntimeSummary();
  applyTileToPlayerSummary(summary, "10,10", tile);
  const economy = buildPlayerUpdateEconomySnapshot(player, summary, tiles);
  return economy.economyBreakdown.GOLD.sources.find((bucket) => bucket.label === "Docks")?.amountPerMinute ?? 0;
};

describe("captured dock during the capture hold", () => {
  it("pays no dock gold while held, and pays once garrisoned", () => {
    expect(dockGold(heldDock)).toBe(0);
    expect(dockGold({ ...heldDock, ownershipState: "SETTLED", captureHoldUntil: undefined })).toBeGreaterThan(0);
  });

  it("can't be garrisoned before the hold ends, even with faster garrisoning", () => {
    const pending: { resolvesAt: number }[] = [];
    startSettlementProcess({
      players: new Map([["p2", player]]),
      addPendingSettlement: (record) => pending.push(record),
      scheduleAfter: () => undefined,
      resolvePendingSettlement: () => undefined,
      emitEvent: () => undefined,
      emitPlayerStateUpdate: () => undefined
    }, { commandId: "c", playerId: "p2", targetKey: "10,10", target: heldDock, startedAt: NOW });
    expect(pending[0]?.resolvesAt).toBe(NOW + CAPTURE_HOLD_MS);
  });
});
