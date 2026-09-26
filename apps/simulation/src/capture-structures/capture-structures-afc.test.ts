// AFC capture coverage extracted out of capture-structures.test.ts (500-line
// source budget, see AGENTS.md) to make room for further test growth there.
import { describe, expect, it, vi } from "vitest";
import { COMBAT_LOCK_MS } from "@border-empires/shared";
import { SimulationRuntime } from "../runtime/runtime.js";

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
              afc: { ownerId: "player-2", status: "active", activatedAt: 0 }
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
});
