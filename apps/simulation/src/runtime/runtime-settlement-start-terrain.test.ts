import { describe, expect, it } from "vitest";
import type { DomainPlayer } from "@border-empires/game-domain";
import { DEFAULT_AUTO_SETTLE_PREFS, FRONTIER_CLAIM_MS, INSTANT_GARRISON_COUNT, isForestTileAt, isHillsTileAt, setWorldSeed } from "@border-empires/shared";
import { startSettlementProcess } from "./runtime-settlement-start.js";

// Own file because it sets the world seed (module state) to find real terrain.
describe("startSettlementProcess on forest and hills", () => {
  it("takes the claim time there (1.5x), no longer the old 2x garrison penalty", () => {
    setWorldSeed(1);
    let forest: { x: number; y: number } | undefined;
    let hills: { x: number; y: number } | undefined;
    for (let x = 0; x < 200 && (!forest || !hills); x += 1) {
      for (let y = 0; y < 200 && (!forest || !hills); y += 1) {
        if (!forest && isForestTileAt(x, y)) forest = { x, y };
        else if (!hills && isHillsTileAt(x, y)) hills = { x, y };
      }
    }
    expect(forest && hills).toBeTruthy();
    for (const tile of [forest!, hills!]) {
      const player: DomainPlayer = {
        id: "p1", isAi: false, points: 1_000, manpower: 1_000, techIds: new Set(), domainIds: new Set(), allies: new Set(),
        autoSettle: { ...DEFAULT_AUTO_SETTLE_PREFS }, lifetimeGarrisons: INSTANT_GARRISON_COUNT
      };
      const pending: { resolvesAt: number }[] = [];
      startSettlementProcess(
        {
          players: new Map([["p1", player]]),
          addPendingSettlement: (record) => pending.push(record),
          scheduleAfter: () => undefined,
          resolvePendingSettlement: () => undefined,
          emitEvent: () => undefined,
          emitPlayerStateUpdate: () => undefined
        },
        { commandId: "c1", playerId: "p1", targetKey: `${tile.x},${tile.y}`, target: { ...tile, terrain: "LAND", ownerId: "p1", ownershipState: "FRONTIER" }, startedAt: 1_000 }
      );
      expect(pending[0]?.resolvesAt).toBe(1_000 + FRONTIER_CLAIM_MS * 1.5);
    }
  });
});
