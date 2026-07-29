import { describe, expect, it, vi } from "vitest";
import { SimulationRuntime } from "./runtime.js";

// §20 of the manpower-economy-rewrite plan: the durable per-player event log's
// "town lost" launch event type. Deliberately keyed on ownership changing
// hands on a town tile (not the narrower `townLost` structural-loss flag —
// see the comment at the call site in runtime.ts for why), so this covers a
// real TOWN-tier capture, not just the rare SETTLEMENT-tier razing case.
const player = (id: string) => ({
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

describe("§20 event log — town lost", () => {
  it("appends a TOWN_LOST entry to the loser's event log when a rival captures their TOWN-tier town", async () => {
    vi.useFakeTimers();
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      const runtime = new SimulationRuntime({
        now: () => 1_000,
        initialPlayers: new Map([
          ["player-1", player("player-1")],
          ["player-2", player("player-2")]
        ]),
        initialState: {
          tiles: [
            { x: 20, y: 20, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" },
            {
              x: 20,
              y: 21,
              terrain: "LAND",
              ownerId: "player-2",
              ownershipState: "SETTLED",
              town: { name: "Rival Capital", type: "FARMING", populationTier: "TOWN" }
            },
            { x: 19, y: 21, terrain: "LAND" }
          ],
          activeLocks: []
        }
      });

      runtime.submitCommand({
        commandId: "cmd-town-capture",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 1_000,
        type: "ATTACK",
        payloadJson: JSON.stringify({ fromX: 20, fromY: 20, toX: 20, toY: 21 })
      });
      await Promise.resolve();
      vi.advanceTimersByTime(3_100);

      const state = runtime.exportState();
      const loser = state.players.find((p) => p.id === "player-2");
      expect(loser?.eventLog).toHaveLength(1);
      expect(loser?.eventLog?.[0]).toMatchObject({ type: "TOWN_LOST", text: "Rival Capital was captured by player-1." });
      const winner = state.players.find((p) => p.id === "player-1");
      expect(winner?.eventLog ?? []).toHaveLength(0);
    } finally {
      randomSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it("does not append an entry when a town's owner is unchanged (e.g. a non-ownership tile mutation)", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([["player-1", player("player-1")]]),
      initialState: {
        tiles: [
          {
            x: 0,
            y: 0,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            town: { name: "Home", type: "FARMING", populationTier: "SETTLEMENT" }
          }
        ],
        activeLocks: []
      }
    });

    runtime.submitCommand({
      commandId: "cmd-upgrade",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "UPGRADE_TOWN_TIER",
      payloadJson: JSON.stringify({ x: 0, y: 0 })
    });
    await Promise.resolve();

    const state = runtime.exportState();
    expect(state.players.find((p) => p.id === "player-1")?.eventLog ?? []).toHaveLength(0);
  });
});
