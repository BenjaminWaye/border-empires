import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.MUSTER_SYSTEM_ENABLED = "true";
});

import type { SimulationEvent } from "@border-empires/sim-protocol";
import { SimulationRuntime } from "../runtime/runtime.js";
import { DEFAULT_AUTO_SETTLE_PREFS } from "@border-empires/shared";
import { makePlayer as makeBasePlayer } from "./muster-march-test-support.js";

const makePlayer = (id: string) => ({ ...makeBasePlayer(id), autoSettle: { ...DEFAULT_AUTO_SETTLE_PREFS } });

const musterCommands = (events: SimulationEvent[]): string[] =>
  events
    .filter(
      (event): event is Extract<SimulationEvent, { eventType: "COMMAND_ACCEPTED" }> =>
        event.eventType === "COMMAND_ACCEPTED" && event.commandId.includes(":muster-")
    )
    .map((event) => `${event.actionType}:${event.targetX},${event.targetY}`);

const buildDockRuntime = (enemyState: "FRONTIER" | "SETTLED") =>
  new SimulationRuntime({
    now: () => 1_000,
    initialPlayers: new Map([
      ["player-1", makePlayer("player-1")],
      ["player-2", makePlayer("player-2")]
    ]),
    seedTiles: new Map(),
    seedDocks: [
      { dockId: "dock-a", tileKey: "10,10", pairedDockId: "dock-b", connectedDockIds: ["dock-b"] },
      { dockId: "dock-b", tileKey: "80,80", pairedDockId: "dock-a", connectedDockIds: ["dock-a"] }
    ],
    initialState: {
      tiles: [
        {
          x: 10,
          y: 10,
          terrain: "LAND",
          ownerId: "player-1",
          ownershipState: "SETTLED",
          dockId: "dock-a",
          muster: { ownerId: "player-1", amount: 100, mode: "ADVANCE", updatedAt: 1_000 }
        },
        // The rest of the flag's island: neutral land the flag could wander onto.
        { x: 11, y: 10, terrain: "LAND" },
        { x: 10, y: 11, terrain: "LAND" },
        { x: 11, y: 11, terrain: "LAND" },
        { x: 80, y: 80, terrain: "LAND", ownerId: "player-2", ownershipState: enemyState, dockId: "dock-b" },
        { x: 81, y: 80, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED" }
      ],
      activeLocks: []
    }
  });

// REGRESSION: an ADVANCE flag on a dock whose linked dock is enemy-held kept
// its first attack on the enemy dock, but on the next tick that dock was
// locked by its own fight, so the attack scan found nothing and the flag fell
// back to "closing the distance" -- nearestHostileWithinSteps doesn't skip
// locked tiles, so it still saw the enemy dock one step away and expanded
// toward it over land, wandering around its own island instead of keeping its
// manpower on the dock fight.
describe("ADVANCE flag on a dock facing an enemy-held linked dock", () => {
  it.each(["FRONTIER", "SETTLED"] as const)("keeps focus on the %s enemy dock instead of expanding around its island", (enemyState) => {
    const runtime = buildDockRuntime(enemyState);
    const seen: SimulationEvent[] = [];
    runtime.onEvent((event) => seen.push(event));

    runtime.tickMuster(1_000);
    expect(musterCommands(seen)).toEqual(["ATTACK:80,80"]);

    // The dock fight is still in flight on the following ticks.
    runtime.tickMuster(2_000);
    runtime.tickMuster(3_000);
    expect(musterCommands(seen)).toEqual(["ATTACK:80,80"]);
  });
});
