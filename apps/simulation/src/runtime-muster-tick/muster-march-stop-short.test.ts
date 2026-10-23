import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.MUSTER_SYSTEM_ENABLED = "true";
});

import type { DomainTileState } from "@border-empires/game-domain";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import { SimulationRuntime } from "../runtime/runtime.js";
import { acceptedMusterMarchCommands, makePlayer } from "./muster-march-test-support.js";

// A player can order a march into unexplored ground that turns out to be a
// mountain, sea or a cut-off isle. The march should get as close as it can and
// then quietly fall back to HOLD -- no rejection, no endless "no target in
// range" retry.

const flagTile = (targetX: number, targetY: number): DomainTileState => ({
  x: 10,
  y: 10,
  terrain: "LAND",
  ownerId: "player-1",
  ownershipState: "SETTLED",
  muster: { ownerId: "player-1", amount: 60, mode: "MARCH", targetX, targetY, updatedAt: 1_000 }
});

const buildRuntime = (tiles: DomainTileState[], allies: string[] = []) => {
  const runtime = new SimulationRuntime({
    now: () => 1_000,
    initialPlayers: new Map([
      ["player-1", { ...makePlayer("player-1"), allies: new Set(allies) }],
      ["player-2", makePlayer("player-2")]
    ]),
    initialState: { tiles, activeLocks: [] }
  });
  const seen: SimulationEvent[] = [];
  runtime.onEvent((event) => seen.push(event));
  return { runtime, seen };
};

const flagMuster = (runtime: SimulationRuntime) => {
  const tile = runtime.exportState().tiles.find((t) => t.x === 10 && t.y === 10);
  return tile?.musterJson ? JSON.parse(tile.musterJson) : undefined;
};

describe("muster MARCH into terrain it can't reach", () => {
  it("accepts SET_MUSTER MARCH onto a mountain tile", async () => {
    const { runtime, seen } = buildRuntime([
      { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
      { x: 13, y: 10, terrain: "MOUNTAIN" }
    ]);
    runtime.submitCommand({
      commandId: "march-mountain",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "SET_MUSTER",
      payloadJson: JSON.stringify({ x: 10, y: 10, mode: "MARCH", targetX: 13, targetY: 10 })
    });
    await Promise.resolve();
    expect(seen.some((event) => event.eventType === "COMMAND_REJECTED")).toBe(false);
    expect(seen.some((event) => event.eventType === "COMMAND_RESOLVED")).toBe(true);
  });

  it("keeps marching toward a mountain while land still gets closer", () => {
    const { runtime, seen } = buildRuntime([
      flagTile(12, 10),
      { x: 11, y: 10, terrain: "LAND" },
      { x: 12, y: 10, terrain: "MOUNTAIN" }
    ]);
    runtime.tickMuster(1_000);
    expect(acceptedMusterMarchCommands(seen)).toHaveLength(1);
    expect(flagMuster(runtime)?.mode).toBe("MARCH");
  });

  it("stops short in HOLD once only the mountain itself is left", () => {
    const { runtime, seen } = buildRuntime([
      flagTile(11, 10),
      { x: 11, y: 10, terrain: "MOUNTAIN" },
      // Neutral land that only leads away from the target must not count.
      { x: 9, y: 10, terrain: "LAND" }
    ]);
    runtime.tickMuster(1_000);
    expect(acceptedMusterMarchCommands(seen)).toHaveLength(0);
    expect(seen.some((event) => event.eventType === "COMMAND_REJECTED")).toBe(false);
    const muster = flagMuster(runtime);
    expect(muster?.mode).toBe("HOLD");
    expect(muster?.targetX).toBeUndefined();
  });

  it("stops short on the shore when the target is an isle across open sea", () => {
    const { runtime } = buildRuntime([
      flagTile(13, 10),
      ...[9, 10, 11].map((y) => ({ x: 11, y, terrain: "SEA" as const })),
      { x: 12, y: 10, terrain: "LAND" },
      { x: 13, y: 10, terrain: "LAND" }
    ]);
    runtime.tickMuster(1_000);
    expect(flagMuster(runtime)?.mode).toBe("HOLD");
  });

  it("keeps the march when the way is blocked by an ally rather than the terrain", () => {
    const { runtime } = buildRuntime(
      [flagTile(12, 10), { x: 11, y: 10, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED" }, { x: 12, y: 10, terrain: "MOUNTAIN" }],
      ["player-2"]
    );
    runtime.tickMuster(1_000);
    const muster = flagMuster(runtime);
    expect(muster?.mode).toBe("MARCH");
    expect(muster?.noTargetInRange).toBe(true);
  });
});
