// AFC capture coverage extracted out of capture-structures.test.ts (500-line
// source budget, see AGENTS.md) to make room for further test growth there.
import { describe, expect, it, vi } from "vitest";
import { COMBAT_LOCK_MS } from "@border-empires/shared";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import { SimulationRuntime } from "../runtime/runtime.js";
import { AI_AFC_REPLACEMENT_DELAY_MS } from "../runtime-respawn-helpers.js";

const makePlayer = (id: string) => ({
  id,
  isAi: false,
  points: 10_000,
  manpower: 10_000,
  techIds: new Set<string>(),
  domainIds: new Set<string>(),
  mods: { attack: 1, defense: 1, income: 1, vision: 1 },
  techRootId: "rewrite-local",
  allies: new Set<string>()
});

describe("capture structure survival — AFC", () => {
  it("transfers a captured Automated Fabrication Complex to the winner (Phase 6, docs/manifest-tree-mapping-plan.md)", async () => {
    vi.useFakeTimers();
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      const runtime = new SimulationRuntime({
        now: () => 1_000,
        initialPlayers: new Map([
          ["player-1", makePlayer("player-1")],
          ["player-2", makePlayer("player-2")]
        ]),
        initialState: {
          tiles: [
            { x: 10, y: 9, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { type: "MARKET", populationTier: "SETTLEMENT" } }, // attacker settlement: supply-connects the attack origin (stranded origins decay) and anchors its own reach
            { x: 9, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
            {
              x: 10,
              y: 10,
              terrain: "LAND",
              ownerId: "player-1",
              ownershipState: "FRONTIER",
              muster: { ownerId: "player-1", amount: 999, mode: "HOLD", updatedAt: 0 }
            },
            {
              x: 10,
              y: 11,
              terrain: "LAND",
              ownerId: "player-2",
              ownershipState: "SETTLED",
              // A module still in transit is lost with the AFC, and the lander's
              // guaranteed-footprint marker never transfers (both absent from the expected afcJson below).
              afc: { ownerId: "player-2", status: "active", activatedAt: 0, landedAt: 0, incomingModules: [{ techId: "masonry", arrivesAt: 999_999 }] }
            }
          ],
          activeLocks: []
        }
      });

      runtime.submitCommand({
        commandId: "capture-afc-1",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 1_000,
        type: "ATTACK",
        payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 10, toY: 11 })
      });

      await Promise.resolve();
      vi.advanceTimersByTime(COMBAT_LOCK_MS + 100);

      const capturedTile = runtime.exportState().tiles.find((tile) => tile.x === 10 && tile.y === 11);
      expect(capturedTile).toEqual(
        expect.objectContaining({
          ownerId: "player-1",
          ownershipState: "FRONTIER",
          afcJson: JSON.stringify({ ownerId: "player-1", status: "active", activatedAt: 1_000 })
        })
      );
    } finally {
      randomSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it("keeps a captured AFC's docked modules intact and reassigns them to the winner (docs/manifest-full-plan.md §4)", async () => {
    // §4: "If an AFC is captured, its modules become dormant or inaccessible
    // to the original owner; they remain visible and strategically
    // valuable. Do not erase a whole branch or cancel existing buildings."
    // Already satisfied by capturedAfc's plain object spread -- this test
    // pins that down so a future refactor can't silently drop modules.
    vi.useFakeTimers();
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      const runtime = new SimulationRuntime({
        now: () => 1_000,
        initialPlayers: new Map([
          ["player-1", makePlayer("player-1")],
          ["player-2", makePlayer("player-2")]
        ]),
        initialState: {
          tiles: [
            { x: 10, y: 9, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { type: "MARKET", populationTier: "SETTLEMENT" } }, // attacker settlement: supply-connects the attack origin (stranded origins decay) and anchors its own reach
            { x: 9, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
            {
              x: 10,
              y: 10,
              terrain: "LAND",
              ownerId: "player-1",
              ownershipState: "FRONTIER",
              muster: { ownerId: "player-1", amount: 999, mode: "HOLD", updatedAt: 0 }
            },
            {
              x: 10,
              y: 11,
              terrain: "LAND",
              ownerId: "player-2",
              ownershipState: "SETTLED",
              afc: { ownerId: "player-2", status: "active", activatedAt: 0, modules: ["crystal-lattices", "masonry"] }
            }
          ],
          activeLocks: []
        }
      });

      runtime.submitCommand({
        commandId: "capture-afc-modules-1",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 1_000,
        type: "ATTACK",
        payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 10, toY: 11 })
      });

      await Promise.resolve();
      vi.advanceTimersByTime(COMBAT_LOCK_MS + 100);

      const capturedTile = runtime.exportState().tiles.find((tile) => tile.x === 10 && tile.y === 11);
      const capturedAfc = capturedTile?.afcJson ? JSON.parse(capturedTile.afcJson) : undefined;
      // Reassigned to the winner (inaccessible to player-2, the original owner).
      expect(capturedTile?.ownerId).toBe("player-1");
      expect(capturedAfc?.ownerId).toBe("player-1");
      // Modules are neither erased nor cancelled -- they transfer intact.
      expect(capturedAfc?.modules).toEqual(["crystal-lattices", "masonry"]);
    } finally {
      randomSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  // Losing the last AFC while still holding ground: a human rebuilds it
  // themselves for free; an AI gets one placed automatically ten minutes later.
  const captureLastAfc = async (defenderIsAi: boolean) => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([
        ["player-1", makePlayer("player-1")],
        ["player-2", { ...makePlayer("player-2"), isAi: defenderIsAi }]
      ]),
      initialState: {
        tiles: [
          { x: 10, y: 9, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { type: "MARKET", populationTier: "SETTLEMENT" } },
          { x: 9, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
          { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER", muster: { ownerId: "player-1", amount: 999, mode: "HOLD", updatedAt: 0 } },
          { x: 10, y: 11, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED", afc: { ownerId: "player-2", status: "active", activatedAt: 0 } },
          { x: 14, y: 14, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED", town: { type: "MARKET", populationTier: "TOWN" } },
          { x: 15, y: 14, terrain: "LAND", ownerId: "player-2", ownershipState: "FRONTIER" }
        ],
        activeLocks: []
      }
    });
    const events: SimulationEvent[] = [];
    runtime.onEvent((event) => { events.push(event); });
    runtime.submitCommand({
      commandId: "capture-last-afc-1", sessionId: "session-1", playerId: "player-1", clientSeq: 1, issuedAt: 1_000,
      type: "ATTACK", payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 10, toY: 11 })
    });
    await Promise.resolve();
    vi.advanceTimersByTime(COMBAT_LOCK_MS + 100);
    const player2Afcs = () => runtime.exportState().tiles.filter((tile) => tile.ownerId === "player-2" && tile.afcJson).map((tile) => `${tile.x},${tile.y}`);
    return { runtime, events, player2Afcs };
  };

  it("lets a human who lost their last AFC build a new one for free, with no automatic replacement", async () => {
    vi.useFakeTimers();
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      const { runtime, events, player2Afcs } = await captureLastAfc(false);
      expect(runtime.exportState().tiles.find((tile) => tile.x === 10 && tile.y === 11)?.ownerId).toBe("player-1");
      // AFC capture plunder: 33% of the defender's remaining 10,000 Coin on top of the normal pillage.
      const resolved = events.flatMap((event) => (event.eventType === "COMBAT_RESOLVED" && event.commandId === "capture-last-afc-1" ? [event] : []));
      expect(resolved[0]?.pillagedGold ?? 0).toBeGreaterThanOrEqual(3_000);
      vi.advanceTimersByTime(AI_AFC_REPLACEMENT_DELAY_MS + 1_000);
      expect(player2Afcs()).toEqual([]);

      // Free rebuild, on an owned FRONTIER tile (settled on landing).
      runtime.submitCommand({
        commandId: "rebuild-afc", sessionId: "session-2", playerId: "player-2", clientSeq: 1, issuedAt: 1_000,
        type: "BUILD_AFC", payloadJson: JSON.stringify({ x: 15, y: 14 })
      });
      await Promise.resolve();
      expect(events.some((event) => event.eventType === "COMMAND_REJECTED" && event.commandId === "rebuild-afc")).toBe(false);
      expect(player2Afcs()).toEqual(["15,14"]);
      expect(runtime.exportState().tiles.find((tile) => tile.x === 15 && tile.y === 14)?.ownershipState).toBe("SETTLED");
    } finally {
      randomSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it("places an AI's replacement AFC ten minutes after it lost its last one", async () => {
    vi.useFakeTimers();
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      const { player2Afcs } = await captureLastAfc(true);
      expect(player2Afcs()).toEqual([]);
      vi.advanceTimersByTime(AI_AFC_REPLACEMENT_DELAY_MS - 60_000);
      expect(player2Afcs()).toEqual([]);
      vi.advanceTimersByTime(60_000);
      expect(player2Afcs()).toEqual(["15,14"]);
    } finally {
      randomSpy.mockRestore();
      vi.useRealTimers();
    }
  });
});
