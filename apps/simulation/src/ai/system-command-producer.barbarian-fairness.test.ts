import { describe, expect, it, vi } from "vitest";
import { DEFAULT_AUTO_SETTLE_PREFS } from "@border-empires/shared";
import { SimulationRuntime } from "../runtime/runtime.js";
import { createSystemCommandProducer } from "./system-command-producer.js";

const makePlayer = (id: string, big = false) => [
  id,
  {
    id,
    isAi: false,
    points: big ? Number.MAX_SAFE_INTEGER : 1_000,
    manpower: big ? Number.MAX_SAFE_INTEGER : 10_000,
    techIds: new Set<string>(),
    domainIds: new Set<string>(),
    mods: { attack: 1, defense: 1, income: 1, vision: 1 },
    techRootId: "rewrite-local",
    allies: new Set<string>(),
    autoSettle: { ...DEFAULT_AUTO_SETTLE_PREFS }
  }
] as const;

// End to end through a real runtime on a fake clock: a barbarian fighting one
// player must not starve a barbarian that can only walk next to another.
describe("system command producer — barbarian fairness (real runtime)", () => {
  it("a barbarian one tile off a border moves even while another barbarian keeps attacking elsewhere", async () => {
    vi.useFakeTimers({ now: 1_000_000 });
    try {
      const runtime = new SimulationRuntime({
        now: () => Date.now(),
        initialPlayers: new Map([makePlayer("you"), makePlayer("other"), makePlayer("barbarian-1", true)]),
        seedTiles: new Map(),
        initialState: {
          tiles: [
            // You: a settled town tile; the barbarian at (12,10) is two tiles away,
            // visible through the town ring, with neutral land (11,10) between.
            { x: 10, y: 10, terrain: "LAND", ownerId: "you", ownershipState: "SETTLED", town: { name: "Home", type: "FARMING", populationTier: "TOWN" } },
            { x: 11, y: 10, terrain: "LAND" },
            { x: 11, y: 9, terrain: "LAND" },
            { x: 11, y: 11, terrain: "LAND" },
            { x: 12, y: 10, terrain: "LAND", ownerId: "barbarian-1", ownershipState: "SETTLED" },
            // Another player with a barbarian touching it: this one can ATTACK.
            { x: 100, y: 100, terrain: "LAND", ownerId: "other", ownershipState: "SETTLED", town: { name: "Far", type: "FARMING", populationTier: "TOWN" } },
            { x: 101, y: 100, terrain: "LAND", ownerId: "other", ownershipState: "SETTLED" },
            { x: 102, y: 100, terrain: "LAND", ownerId: "barbarian-1", ownershipState: "SETTLED" }
          ],
          activeLocks: []
        }
      } as never);

      const issued: Array<{ type: string; from: string }> = [];
      const producer = createSystemCommandProducer({
        runtime,
        systemPlayerIds: ["barbarian-1"],
        submitCommand: async (command) => {
          const p = JSON.parse(command.payloadJson) as { fromX: number; fromY: number };
          issued.push({ type: command.type, from: `${p.fromX},${p.fromY}` });
          runtime.submitCommand(command);
        },
        tickIntervalMs: 500
      });

      // Two simulated minutes of 500ms producer ticks.
      for (let step = 0; step < 240; step += 1) {
        await producer.tick();
        await vi.advanceTimersByTimeAsync(500);
      }
      producer.close();

      const bySource = (from: string) => issued.filter((c) => c.from === from);
      // The far barbarian fights; the near one walks. Before the fix the near one
      // never acted while the far one held the faction's single slot.
      expect(bySource("102,100").length).toBeGreaterThan(0);
      expect(bySource("12,10").length).toBeGreaterThan(0);
      expect(bySource("12,10")[0]!.type).toBe("EXPAND");
    } finally {
      vi.useRealTimers();
    }
  }, 60_000);
});
