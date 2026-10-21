import { describe, expect, it, vi } from "vitest";
import { applyOddsScale } from "@border-empires/shared";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import { SimulationRuntime } from "../runtime/runtime.js";
import { acceptedMusterMarchCommands, makePlayer } from "./muster-march-test-support.js";

// A FRONTIER tile still holding captured ground (capture-hold.ts) rolls real
// combat, so a MARCH flag's effort must count there -- but a flag's
// commitManpower is chosen against MUSTER_ATTACK_COST (60), while the held
// tile's floor is FRONTIER_ATTACK_MUSTER_COST (15). flagCommitForTarget keeps
// the effort ratio: a Double flag (120) sends 30, i.e. 2x odds, not 8x.
describe("muster march against a tile holding captured ground", () => {
  const marchInto = (commitManpower: number) => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([
        ["player-1", makePlayer("player-1")],
        ["player-2", makePlayer("player-2")]
      ]),
      initialState: {
        tiles: [
          {
            x: 10,
            y: 10,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            muster: { ownerId: "player-1", amount: 150, mode: "MARCH", targetX: 10, targetY: 11, updatedAt: 1_000, commitManpower }
          },
          { x: 10, y: 11, terrain: "LAND", ownerId: "player-2", ownershipState: "FRONTIER", captureHoldUntil: 61_000 }
        ],
        activeLocks: []
      }
    });
    const seen: SimulationEvent[] = [];
    runtime.onEvent((event) => seen.push(event));
    runtime.tickMuster(1_000);
    return acceptedMusterMarchCommands(seen);
  };

  it("scales a Double flag's commitment to the held tile's floor: 2x odds, and it loses exactly that commitment", () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      const commands = marchInto(120);
      expect(commands).toHaveLength(1);
      expect(commands[0]?.combatResult?.winChance).toBeCloseTo(applyOddsScale(0.5, 2), 6);
      expect(commands[0]?.combatResult?.manpowerDelta).toBeCloseTo(-30, 6);
    } finally {
      randomSpy.mockRestore();
    }
  });

  it("leaves a Normal flag (commitment = MUSTER_ATTACK_COST) at the base 50%", () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      const commands = marchInto(60);
      expect(commands[0]?.combatResult?.winChance).toBeCloseTo(0.5, 6);
      expect(commands[0]?.combatResult?.manpowerDelta).toBeCloseTo(-15, 6);
    } finally {
      randomSpy.mockRestore();
    }
  });
});
