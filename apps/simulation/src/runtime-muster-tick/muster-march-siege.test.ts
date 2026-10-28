import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.MUSTER_SYSTEM_ENABLED = "true";
});

import type { DomainTileState } from "@border-empires/game-domain";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import { SimulationRuntime } from "../runtime/runtime.js";
import { acceptedMusterMarchCommands, makePlayer } from "./muster-march-test-support.js";

// A march ordered at an enemy Relay Beacon spread over everything between the
// flag and the beacon instead of heading for it, and never attacked it: the
// route around a mountain range was longer than the 10 hops the march walked
// through owned land, and once its front stalled it took any tile a step
// closer than the flag. Marches now walk their real route, stay in a narrow
// band around one traced path, and against a town/structure set up attack
// vectors next to it and then attack it.

const owned = (x: number, y: number, extra: Partial<DomainTileState> = {}): DomainTileState => ({
  x,
  y,
  terrain: "LAND",
  ownerId: "player-1",
  ownershipState: "SETTLED",
  ...extra
});
const neutral = (x: number, y: number): DomainTileState => ({ x, y, terrain: "LAND" });
const mountain = (x: number, y: number): DomainTileState => ({ x, y, terrain: "MOUNTAIN" });
const relayBeacon = (x: number, y: number): DomainTileState => ({
  x,
  y,
  terrain: "LAND",
  ownerId: "player-2",
  ownershipState: "SETTLED",
  economicStructure: { type: "RELAY_BEACON", ownerId: "player-2", status: "active", activatedAt: 500 }
});

const flag = (targetX: number, targetY: number, amount = 60): DomainTileState =>
  owned(0, 0, {
    // A town keeps the front supplied (an unsupplied origin can't launch).
    town: { type: "MARKET", populationTier: "SETTLEMENT" },
    muster: { ownerId: "player-1", amount, mode: "MARCH", targetX, targetY, updatedAt: 1_000 }
  });

const buildRuntime = (tiles: DomainTileState[]) => {
  const runtime = new SimulationRuntime({
    now: () => 1_000,
    initialPlayers: new Map([
      ["player-1", makePlayer("player-1")],
      ["player-2", makePlayer("player-2")]
    ]),
    initialState: { tiles, activeLocks: [] }
  });
  const seen: SimulationEvent[] = [];
  runtime.onEvent((event) => seen.push(event));
  return { runtime, seen };
};

const firedAt = (seen: SimulationEvent[]): string[] =>
  acceptedMusterMarchCommands(seen).map((event) => event.commandId.split(":muster-march:")[1]!.split(":")[1]!);

const flagMuster = (runtime: SimulationRuntime) => {
  const tile = runtime.exportState().tiles.find((t) => t.x === 0 && t.y === 0);
  return tile?.musterJson ? JSON.parse(tile.musterJson) : undefined;
};

describe("muster MARCH route", () => {
  it("walks its own land past 10 hops to keep advancing on a 19-step route", () => {
    const tiles = [flag(19, 0)];
    for (let x = 1; x <= 17; x += 1) tiles.push(owned(x, 0));
    tiles.push(neutral(18, 0), neutral(19, 0));
    const { runtime, seen } = buildRuntime(tiles);
    runtime.tickMuster(1_000);
    expect(firedAt(seen)).toEqual(["18,0"]);
  });

  it("waits for its fight on the path instead of spreading off it", () => {
    const { runtime, seen } = buildRuntime([
      flag(4, 0),
      owned(0, 1),
      owned(0, 2),
      neutral(1, 0),
      mountain(1, 1),
      mountain(1, -1),
      // Closer to the target than the flag, but two rows off the path.
      neutral(1, 2),
      neutral(1, 3)
    ]);
    runtime.tickMuster(1_000);
    expect(firedAt(seen)).toEqual(["1,0"]);
    runtime.tickMuster(1_500);
    expect(firedAt(seen)).toEqual(["1,0"]);
  });
});

describe("muster MARCH on an enemy town or structure", () => {
  it("takes a second tile touching the target before attacking it", () => {
    const { runtime, seen } = buildRuntime([
      flag(3, 0),
      owned(1, 0),
      owned(2, 0),
      relayBeacon(3, 0),
      neutral(2, 1),
      neutral(3, 1)
    ]);
    runtime.tickMuster(1_000);
    const fired = firedAt(seen);
    expect(fired).toHaveLength(1);
    expect(["2,1", "3,1"]).toContain(fired[0]);
  });

  it("attacks the target once two of its neighbours are ours", () => {
    const { runtime, seen } = buildRuntime([
      flag(3, 0),
      owned(1, 0),
      owned(2, 0),
      owned(2, 1),
      relayBeacon(3, 0),
      neutral(3, 1),
      neutral(2, -1)
    ]);
    runtime.tickMuster(1_000);
    expect(firedAt(seen)).toEqual(["3,0"]);
  });

  it("saves up for the target instead of expanding around it", () => {
    const { runtime, seen } = buildRuntime([
      flag(3, 0, 1),
      owned(1, 0),
      owned(2, 0),
      owned(2, 1),
      relayBeacon(3, 0),
      neutral(3, 1),
      neutral(2, -1)
    ]);
    runtime.tickMuster(1_000);
    expect(firedAt(seen)).toEqual([]);
    expect(flagMuster(runtime)?.insufficientManpower).toBe(true);
  });
});
