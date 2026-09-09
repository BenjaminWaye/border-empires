import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.MUSTER_SYSTEM_ENABLED = "true";
});

import type { SimulationEvent } from "@border-empires/sim-protocol";
import { SimulationRuntime } from "../runtime/runtime.js";

const makePlayer = (id: string) => ({
  id,
  isAi: false,
  points: 10_000,
  manpower: 150,
  techIds: new Set<string>(),
  domainIds: new Set<string>(),
  mods: { attack: 1, defense: 1, income: 1, vision: 1 },
  techRootId: "rewrite-local",
  allies: new Set<string>()
});

const acceptedAttackTargets = (events: SimulationEvent[]): string[] =>
  events
    .filter(
      (event): event is Extract<SimulationEvent, { eventType: "COMMAND_ACCEPTED" }> =>
        event.eventType === "COMMAND_ACCEPTED" && event.commandId.includes(":muster-march:")
    )
    .map((event) => event.commandId.split(":muster-march:")[1]!.split(":")[1]!);

const acceptedMusterMarchCommands = (events: SimulationEvent[]) =>
  events.filter(
    (event): event is Extract<SimulationEvent, { eventType: "COMMAND_ACCEPTED" }> =>
      event.eventType === "COMMAND_ACCEPTED" && event.commandId.includes(":muster-march:")
  );

describe("muster MARCH auto-fire", () => {
  it("attacks the enemy tile closest to the march target, not the one closest to the flag", () => {
    // Flag at (10,10). Two attackable enemy tiles: (11,10) is nearest the
    // flag itself, (10,14) is farther from the flag but much closer to the
    // march target at (10,20). MARCH should steer toward the target and fire
    // on (10,14), not the nearer-to-origin (11,10).
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
            muster: { ownerId: "player-1", amount: 60, mode: "MARCH", targetX: 10, targetY: 20, updatedAt: 1_000 }
          },
          { x: 11, y: 10, terrain: "LAND", ownerId: "player-2", ownershipState: "FRONTIER" },
          // Owned corridor south toward the target.
          { x: 10, y: 11, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
          { x: 10, y: 12, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
          { x: 10, y: 13, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
          { x: 10, y: 14, terrain: "LAND", ownerId: "player-2", ownershipState: "FRONTIER" }
        ],
        activeLocks: []
      }
    });
    const seen: SimulationEvent[] = [];
    runtime.onEvent((event) => seen.push(event));

    runtime.tickMuster(1_000);

    const targets = acceptedAttackTargets(seen);
    expect(targets).toEqual(["10,14"]);
  });

  it("never routes an attack through a neutral tile even when that would be the shorter path", () => {
    // The only way to reach an enemy tile near the target is by crossing a
    // neutral (unowned) tile at (10,12) — MARCH must not treat that as
    // traversable, so no attack should be fired even though the enemy tile
    // is otherwise attackable.
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
            muster: { ownerId: "player-1", amount: 60, mode: "MARCH", targetX: 10, targetY: 20, updatedAt: 1_000 }
          },
          { x: 10, y: 11, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
          // Neutral gap: no ownerId at all.
          { x: 10, y: 12, terrain: "LAND", ownershipState: "FRONTIER" },
          { x: 10, y: 13, terrain: "LAND", ownerId: "player-2", ownershipState: "FRONTIER" }
        ],
        activeLocks: []
      }
    });
    const seen: SimulationEvent[] = [];
    runtime.onEvent((event) => seen.push(event));

    runtime.tickMuster(1_000);

    expect(acceptedAttackTargets(seen)).toEqual([]);
    const neutralTile = runtime.exportState().tiles.find((t) => t.x === 10 && t.y === 12);
    expect(neutralTile?.ownerId).toBeFalsy();
  });

  it("falls back to HOLD once the flag has fought its way onto the march target", () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([["player-1", makePlayer("player-1")]]),
      initialState: {
        tiles: [
          {
            x: 10,
            y: 10,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            muster: { ownerId: "player-1", amount: 60, mode: "MARCH", targetX: 11, targetY: 10, updatedAt: 1_000 }
          },
          { x: 11, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" }
        ],
        activeLocks: []
      }
    });

    runtime.tickMuster(1_000);

    const flagTile = runtime.exportState().tiles.find((t) => t.x === 10 && t.y === 10);
    const muster = flagTile?.musterJson ? JSON.parse(flagTile.musterJson) : undefined;
    expect(muster?.mode).toBe("HOLD");
    expect(muster?.targetX).toBeUndefined();
  });

  // Feature: MARCH claims neutral ground blocking its route to the target
  // instead of idling, when no attackable enemy tile is reachable at all.
  it("expands onto a neutral tile blocking the route when no enemy tile is reachable", () => {
    vi.useFakeTimers();
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      const runtime = new SimulationRuntime({
        now: () => 1_000,
        initialPlayers: new Map([["player-1", makePlayer("player-1")]]),
        initialState: {
          tiles: [
            {
              x: 10,
              y: 10,
              terrain: "LAND",
              ownerId: "player-1",
              ownershipState: "SETTLED",
              town: { name: "Home", type: "FARMING", populationTier: "SETTLEMENT" },
              muster: { ownerId: "player-1", amount: 60, mode: "MARCH", targetX: 10, targetY: 13, updatedAt: 1_000 }
            },
            { x: 10, y: 11, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
            // Neutral gap blocking the route to the target — no attackable
            // enemy anywhere on this map, so MARCH must expand here instead
            // of idling.
            { x: 10, y: 12, terrain: "LAND", ownershipState: "FRONTIER" }
          ],
          activeLocks: []
        }
      });
      const seen: SimulationEvent[] = [];
      runtime.onEvent((event) => seen.push(event));

      runtime.tickMuster(1_000);

      const expandCommand = acceptedMusterMarchCommands(seen).find((e) => e.actionType === "EXPAND");
      expect(expandCommand).toBeDefined();
      expect(expandCommand?.targetX).toBe(10);
      expect(expandCommand?.targetY).toBe(12);
      // Attributed to the flag itself for travel-time purposes, same as an
      // ATTACK would be — flag is directly adjacent to the claim here, so
      // the 1-tile floor applies.
      expect(expandCommand?.musterOriginX).toBe(10);
      expect(expandCommand?.musterOriginY).toBe(10);
      expect(expandCommand?.transitEndsAt).toBeDefined();

      // Still neutral immediately after accept -- EXPAND has a claim timer,
      // and this one is further pushed back by the transit delay on top.
      expect(runtime.exportState().tiles.find((t) => t.x === 10 && t.y === 12)?.ownerId).toBeFalsy();
    } finally {
      randomSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it("prefers attacking when the attack is the shorter road to the target", () => {
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
            town: { name: "Home", type: "FARMING", populationTier: "SETTLEMENT" },
            muster: { ownerId: "player-1", amount: 60, mode: "MARCH", targetX: 12, targetY: 10, updatedAt: 1_000 }
          },
          // Attack: 1 tile from the flag, then 1 more to the target — total
          // road 2. Expand: 1 tile from the flag, but 2 more to the target
          // (off the direct line) — total road 3. Attack is genuinely shorter.
          { x: 11, y: 10, terrain: "LAND", ownerId: "player-2", ownershipState: "FRONTIER" },
          { x: 10, y: 11, terrain: "LAND", ownershipState: "FRONTIER" }
        ],
        activeLocks: []
      }
    });
    const seen: SimulationEvent[] = [];
    runtime.onEvent((event) => seen.push(event));

    runtime.tickMuster(1_000);

    const commands = acceptedMusterMarchCommands(seen);
    expect(commands).toHaveLength(1);
    expect(commands[0]?.actionType).toBe("ATTACK");
    expect(commands[0]?.targetX).toBe(11);
    expect(commands[0]?.targetY).toBe(10);
  });

  it("expands instead of attacking when expansion is the shorter road to the target", () => {
    // Regression for a MARCH bug where an attackable enemy tile always won
    // over expanding, even when it was a long detour from both the flag and
    // the target — this let a march hijack itself into attacking a
    // disconnected enemy tile far from where it was actually headed.
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
            town: { name: "Home", type: "FARMING", populationTier: "SETTLEMENT" },
            muster: { ownerId: "player-1", amount: 60, mode: "MARCH", targetX: 10, targetY: 20, updatedAt: 1_000 }
          },
          // Expand: 1 tile from the flag, then 9 more to the target — total
          // road 10, directly on the route.
          { x: 10, y: 11, terrain: "LAND", ownershipState: "FRONTIER" },
          // Attack: reachable via a long owned corridor stretching far to
          // the side, well off the route and away from the target — a much
          // longer total road even though it's technically "attackable".
          ...Array.from({ length: 10 }, (_, i) => ({
            x: 11 + i,
            y: 10,
            terrain: "LAND" as const,
            ownerId: "player-1",
            ownershipState: "SETTLED" as const
          })),
          { x: 20, y: 11, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
          { x: 20, y: 12, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
          { x: 21, y: 12, terrain: "LAND", ownerId: "player-2", ownershipState: "FRONTIER" }
        ],
        activeLocks: []
      }
    });
    const seen: SimulationEvent[] = [];
    runtime.onEvent((event) => seen.push(event));

    runtime.tickMuster(1_000);

    const commands = acceptedMusterMarchCommands(seen);
    expect(commands).toHaveLength(1);
    expect(commands[0]?.actionType).toBe("EXPAND");
    expect(commands[0]?.targetX).toBe(10);
    expect(commands[0]?.targetY).toBe(11);
  });
});
