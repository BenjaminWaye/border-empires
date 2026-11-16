import type { DomainTileState } from "@border-empires/game-domain";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import { COMBAT_LOCK_MS } from "@border-empires/shared";
import { describe, expect, it, vi } from "vitest";

import { SimulationRuntime } from "../runtime/runtime.js";
import { applyEncirclement, type RuntimeEncirclementApplicationContext } from "../runtime-encirclement-application.js";
import type { SimulationTileWireDelta } from "../runtime-types.js";

const frontier = (x: number, y: number, ownerId: string, extra: Partial<DomainTileState> = {}): DomainTileState =>
  ({ x, y, terrain: "LAND", ownerId, ownershipState: "FRONTIER", ...extra }) as DomainTileState;
const settled = (x: number, y: number, ownerId: string, extra: Partial<DomainTileState> = {}): DomainTileState =>
  ({ x, y, terrain: "LAND", ownerId, ownershipState: "SETTLED", ...extra }) as DomainTileState;

const harness = (list: DomainTileState[]) => {
  const tiles = new Map(list.map((tile) => [`${tile.x},${tile.y}`, tile]));
  const healed: string[] = [];
  const context: RuntimeEncirclementApplicationContext = {
    tiles,
    now: () => 1_000,
    activeAetherBridgesForPlayer: () => [],
    seaLaneNeighborKeysByTileKey: new Map(),
    replaceTileState: (key, tile) => void tiles.set(key, tile),
    tileDeltaFromState: (tile) => ({ x: tile.x, y: tile.y }) as SimulationTileWireDelta,
    emitEvent: () => {},
    runtimeLogInfo: () => {},
    registerFrontierAutoHeal: (key) => void healed.push(key)
  };
  return { tiles, context, healed };
};

// player-2's frontier tendril 12..15,10 hangs off its settled 16,10;
// player-1 has just captured 14,10 from its settled 14,11.
const severedTendril = (extra: Partial<DomainTileState> = {}) => [
  settled(16, 10, "player-2"),
  frontier(15, 10, "player-2"),
  frontier(14, 10, "player-1"),
  frontier(13, 10, "player-2", extra),
  frontier(12, 10, "player-2"),
  settled(14, 11, "player-1")
];

describe("encirclement pocket capture", () => {
  it("hands frontier cut off by a capture to the captor instead of neutral", () => {
    const { tiles, context, healed } = harness(severedTendril({ muster: { ownerId: "player-2", amount: 5, mode: "HOLD", updatedAt: 0 } } as Partial<DomainTileState>));

    applyEncirclement(context, ["14,10"], "player-2", "cmd", { claimantId: "player-1" });

    for (const key of ["13,10", "12,10"]) {
      expect(tiles.get(key)).toMatchObject({ ownerId: "player-1", ownershipState: "FRONTIER" });
    }
    expect(tiles.get("13,10")?.muster).toBeUndefined();
    expect(tiles.get("15,10")?.ownerId).toBe("player-2"); // still supplied by 16,10
    expect(healed).toEqual([]);
  });

  it("transfers buildings on the pocket by the ordinary capture rules", () => {
    const { tiles, context } = harness(severedTendril({ fort: { ownerId: "player-2", status: "active", activatedAt: 500 } } as Partial<DomainTileState>));

    applyEncirclement(context, ["14,10"], "player-2", "cmd", { claimantId: "player-1" });

    expect(tiles.get("13,10")?.fort?.ownerId).toBe("player-1");
  });

  it("still releases a cut-off town tile to neutral", () => {
    const { tiles, context, healed } = harness(severedTendril({ town: { populationTier: "TOWN" } } as Partial<DomainTileState>));

    applyEncirclement(context, ["14,10"], "player-2", "cmd", { claimantId: "player-1" });

    expect(tiles.get("13,10")?.ownerId).toBeUndefined();
    expect(healed).toEqual(["13,10"]);
    expect(tiles.get("12,10")?.ownerId).toBe("player-1");
  });

  it("releases to neutral without a claimant, for barbarians, or when the claimant lost the changed tile", () => {
    for (const [claimantId, holder] of [[undefined, "player-1"], ["barbarian-1", "barbarian-1"], ["player-1", "player-3"]] as const) {
      const list = severedTendril().map((tile) => (tile.x === 14 && tile.y === 10 ? { ...tile, ownerId: holder } : tile));
      const { tiles, context } = harness(list);

      applyEncirclement(context, ["14,10"], "player-2", "cmd", claimantId ? { claimantId } : undefined);

      expect(tiles.get("13,10")?.ownerId).toBeUndefined();
      expect(tiles.get("12,10")?.ownerId).toBeUndefined();
    }
  });

  it("an ATTACK that severs an enemy frontier tendril takes the cut-off tiles", async () => {
    vi.useFakeTimers();
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      const player = (id: string) => ({
        id, isAi: false, points: 10_000, manpower: 10_000,
        techIds: new Set<string>(), domainIds: new Set<string>(),
        mods: { attack: 1, defense: 1, income: 1, vision: 1 },
        techRootId: "rewrite-local", allies: new Set<string>()
      });
      const runtime = new SimulationRuntime({
        now: () => Date.now(),
        initialPlayers: new Map([["player-1", player("player-1")], ["player-2", player("player-2")]]),
        seedTiles: new Map(),
        initialState: {
          tiles: [
            settled(16, 10, "player-2"),
            frontier(15, 10, "player-2"),
            frontier(14, 10, "player-2"),
            frontier(13, 10, "player-2"),
            frontier(12, 10, "player-2"),
            settled(14, 11, "player-1", { muster: { ownerId: "player-1", amount: 999, mode: "HOLD", updatedAt: 0 } } as Partial<DomainTileState>)
          ],
          activeLocks: []
        }
      });
      const events: SimulationEvent[] = [];
      runtime.onEvent((event) => events.push(event));

      runtime.submitCommand({
        commandId: "sever", sessionId: "s1", playerId: "player-1", clientSeq: 1, issuedAt: Date.now(),
        type: "ATTACK", payloadJson: JSON.stringify({ fromX: 14, fromY: 11, toX: 14, toY: 10 })
      });
      await Promise.resolve();
      expect(events.find((event) => event.eventType === "COMMAND_REJECTED")).toBeUndefined();
      vi.advanceTimersByTime(COMBAT_LOCK_MS + 100);

      const tiles = new Map(runtime.exportState().tiles.map((tile) => [`${tile.x},${tile.y}`, tile]));
      expect(tiles.get("14,10")?.ownerId).toBe("player-1");
      expect(tiles.get("13,10")).toMatchObject({ ownerId: "player-1", ownershipState: "FRONTIER" });
      expect(tiles.get("12,10")).toMatchObject({ ownerId: "player-1", ownershipState: "FRONTIER" });
      expect(tiles.get("15,10")?.ownerId).toBe("player-2");
    } finally {
      randomSpy.mockRestore();
      vi.useRealTimers();
    }
  });
});
