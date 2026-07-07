import { describe, expect, it, vi } from "vitest";
import { SimulationRuntime } from "./runtime.js";
import { BARBARIAN_CAPTURE_PLUNDER_GOLD } from "../runtime-combat-support.js";

describe("barbarian capture plunder cap", () => {
  it("caps plunder from barbarian captures at BARBARIAN_CAPTURE_PLUNDER_GOLD to prevent inflation", async () => {
    vi.useFakeTimers();
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      const runtime = new SimulationRuntime({
        now: () => 1_000,
        initialPlayers: new Map([
          [
            "player-1",
            {
              id: "player-1",
              isAi: false,
              points: 1_000,
              manpower: 10_000,
              techIds: new Set<string>(),
              domainIds: new Set<string>(),
              mods: { attack: 1, defense: 1, income: 1, vision: 1 },
              techRootId: "rewrite-local",
              allies: new Set<string>()
            }
          ],
          [
            "barbarian-1",
            {
              id: "barbarian-1",
              isAi: true,
              points: Number.MAX_SAFE_INTEGER,
              manpower: Number.MAX_SAFE_INTEGER,
              techIds: new Set<string>(),
              domainIds: new Set<string>(),
              mods: { attack: 1, defense: 1, income: 1, vision: 1 },
              techRootId: "rewrite-local",
              allies: new Set<string>()
            }
          ]
        ]),
        initialState: {
          tiles: [
            { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" },
            {
              x: 10,
              y: 11,
              terrain: "LAND",
              ownerId: "barbarian-1",
              ownershipState: "SETTLED",
              town: { name: "BarbTown", type: "FARMING", populationTier: "SETTLEMENT" }
            },
            { x: 9, y: 11, terrain: "LAND", ownerId: "barbarian-1", ownershipState: "SETTLED" },
            { x: 11, y: 11, terrain: "LAND", ownerId: "barbarian-1", ownershipState: "SETTLED" }
          ],
          activeLocks: []
        }
      });
      const seen: Array<Record<string, unknown>> = [];
      runtime.onEvent((event) => {
        if (event.eventType === "COMBAT_RESOLVED") seen.push(event as unknown as Record<string, unknown>);
      });

      runtime.submitCommand({
        commandId: "cmd-barb-plunder",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 1_000,
        type: "ATTACK",
        payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 10, toY: 11 })
      });

      await Promise.resolve();
      vi.advanceTimersByTime(3_100);

      const plunderEvent = seen.find((event) => event.commandId === "cmd-barb-plunder");
      expect((plunderEvent?.pillagedGold as number) ?? 0).toBe(BARBARIAN_CAPTURE_PLUNDER_GOLD);
    } finally {
      randomSpy.mockRestore();
      vi.useRealTimers();
    }
  });
});
