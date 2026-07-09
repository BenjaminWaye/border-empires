import { describe, expect, it } from "vitest";

import type { SimulationEvent } from "@border-empires/sim-protocol";

import { SimulationRuntime } from "./runtime.js";
import { buildPlayerSubscriptionSnapshot } from "../player-snapshot/player-snapshot.js";

type SimulationRuntimeEventShape = SimulationEvent;

// Regression coverage for Frontier Doctrine's developmentProcessCapacityAdd effect: researching it
// (or any other tech/domain that sets the same effect key, e.g. Iron Bastions / Supply Raiding) must
// actually raise a player's development slot limit above the base of 3, both in the subscription
// snapshot sent to the client and in server-side SETTLE enforcement.
describe("development slot capacity bonuses (developmentProcessCapacityAdd)", () => {
  it("raises developmentProcessLimit above the base 3 in the subscription snapshot when the player owns Frontier Doctrine", () => {
    const runtime = new SimulationRuntime({
      now: () => 0,
      initialPlayers: new Map([
        [
          "player-1",
          {
            id: "player-1",
            isAi: false,
            points: 0,
            manpower: 0,
            manpowerUpdatedAt: 0,
            techIds: new Set<string>(),
            domainIds: new Set<string>(["frontier-doctrine"]),
            mods: { attack: 1, defense: 1, income: 1, vision: 1 },
            techRootId: "rewrite-local",
            allies: new Set<string>()
          }
        ]
      ]),
      seedTiles: new Map(),
      initialState: { tiles: [], activeLocks: [] }
    });

    const snapshot = buildPlayerSubscriptionSnapshot("player-1", runtime.exportState());

    expect(snapshot.player?.developmentProcessLimit).toBe(4);
  });

  it("allows a 4th concurrent settlement instead of rejecting it when the player owns Frontier Doctrine", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      scheduleAfter: () => {},
      initialState: {
        tiles: [
          { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" },
          { x: 11, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" },
          { x: 12, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" },
          { x: 13, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" }
        ],
        activeLocks: []
      },
      initialPlayers: new Map([
        [
          "player-1",
          {
            id: "player-1",
            isAi: false,
            name: "Nauticus",
            points: 100,
            manpower: 150,
            techIds: new Set<string>(),
            domainIds: new Set<string>(["frontier-doctrine"]),
            mods: { attack: 1, defense: 1, income: 1, vision: 1 },
            techRootId: "rewrite-local",
            allies: new Set<string>(),
            strategicResources: { FOOD: 0, IRON: 0, CRYSTAL: 0, SUPPLY: 0, SHARD: 0 }
          }
        ]
      ])
    });
    const seen: SimulationRuntimeEventShape[] = [];
    runtime.onEvent((event) => {
      seen.push(event as SimulationRuntimeEventShape);
    });

    for (const [index, x] of [10, 11, 12, 13].entries()) {
      runtime.submitCommand({
        commandId: `settle-${index + 1}`,
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: index + 1,
        issuedAt: 1_000,
        type: "SETTLE",
        payloadJson: JSON.stringify({ x, y: 10 })
      });
      await Promise.resolve();
    }

    expect(seen).not.toContainEqual(
      expect.objectContaining({ eventType: "COMMAND_REJECTED", code: "SETTLE_INVALID", message: "development slots are busy" })
    );

    const playerUpdateEvents = seen.filter(
      (event) => event.eventType === "PLAYER_MESSAGE" && event.messageType === "PLAYER_UPDATE"
    ) as Array<SimulationRuntimeEventShape & { payloadJson: string }>;
    expect(JSON.parse(playerUpdateEvents.at(-1)!.payloadJson)).toEqual(
      expect.objectContaining({ developmentProcessLimit: 4, activeDevelopmentProcessCount: 4 })
    );
  });
});
