import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import { SimulationRuntime } from "../runtime/runtime.js";
import { buildPlayer, collectEvents } from "../runtime/runtime.test-helpers.js";

// Owner decision 2026-11-27: a human House redeploys only onto a viable
// landing site. Withdrawal releases all its land before landing again, so on
// a map with no viable site it must be refused up front, or the House would
// be left with nothing.
const flush = async (): Promise<void> => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

// Every tile sits inside the rival towns' reach; "p" holds a strip with no AFC.
const crowdedWorld = (): DomainTileState[] => {
  const tiles: DomainTileState[] = [];
  for (let y = 7; y <= 13; y += 1) {
    for (let x = 8; x <= 16; x += 1) {
      const isTown = y === 10 && (x === 10 || x === 14);
      if (isTown) tiles.push({ x, y, terrain: "LAND", ownerId: "rival", ownershipState: "SETTLED", town: { name: `Rival ${x}`, type: "FARMING", populationTier: "TOWN" } });
      else if (y === 7) tiles.push({ x, y, terrain: "LAND", ownerId: "p", ownershipState: "SETTLED" });
      else tiles.push({ x, y, terrain: "LAND" });
    }
  }
  return tiles;
};

describe("withdraw and redeploy with no viable landing site", () => {
  it("is refused and the House keeps its land", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      scheduleAfter: (_delay, callback) => callback(),
      initialPlayers: new Map([["rival", buildPlayer("rival")], ["p", buildPlayer("p")]]),
      seedTiles: new Map(),
      initialState: { tiles: crowdedWorld(), activeLocks: [] }
    });
    const ownedBefore = runtime.exportState().tiles.filter((tile) => tile.ownerId === "p").length;
    expect(ownedBefore).toBeGreaterThan(0);
    const events = collectEvents(runtime);

    runtime.submitCommand({ type: "WITHDRAW_AND_REDEPLOY", commandId: "withdraw-1", playerId: "p", sessionId: "test", clientSeq: 1, issuedAt: 1_000, payloadJson: "{}" });
    await flush();

    expect(events.some((event) => event.commandId === "withdraw-1" && event.eventType === "COMMAND_REJECTED")).toBe(true);
    expect(runtime.exportState().tiles.filter((tile) => tile.ownerId === "p").length).toBe(ownedBefore);
  });
});
