import { describe, expect, it } from "vitest";

import { buildGatewayInitPayload } from "./init-payload.js";

type InitialState = NonNullable<Parameters<typeof buildGatewayInitPayload>[1]>;

const baseInitialState = (playerOverrides: Record<string, unknown> = {}): InitialState =>
  ({
    playerId: "player-1",
    player: {
      id: "player-1",
      name: "Nauticus",
      gold: 100,
      manpower: 150,
      manpowerCap: 150,
      incomePerMinute: 0,
      strategicResources: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0, SHARD: 0 },
      strategicProductionPerMinute: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0, SHARD: 0 },
      upkeepPerMinute: { food: 0, titanium: 0, umbrite: 0, crystal: 0, gold: 0 },
      techIds: [],
      domainIds: [],
      ...playerOverrides
    },
    tiles: [{ x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" }]
  }) as InitialState;

// Regression: the INIT payload's `player` object is built here as an explicit
// field-by-field allowlist, and devQueue/waypointQueue were never on it. Every
// layer underneath (the runtime summary, its wire projection, the sim's
// snapshot cache, the gateway's own cache) correctly carried both fields, and
// this builder silently discarded them -- so the client's restore path saw
// `serverWaypointQueue: null` on EVERY reconnect, unconditionally, and a
// waypoint or build/settle queue always looked like it had never existed.
describe("buildGatewayInitPayload durable queues", () => {
  it("carries waypointQueue through to the INIT payload's player object", () => {
    const waypointQueue = [
      {
        x: 6,
        y: 64,
        queuedAt: 1000,
        planId: "plan-1",
        plannedAt: 1000,
        cursor: 1,
        steps: [
          { origin: { x: 6, y: 59 }, target: { x: 6, y: 60 }, action: "EXPAND" as const },
          { origin: { x: 6, y: 60 }, target: { x: 6, y: 61 }, action: "EXPAND" as const }
        ]
      }
    ];

    const init = buildGatewayInitPayload(
      { playerId: "player-1", playerName: "Nauticus" },
      baseInitialState({ waypointQueue }),
      "default"
    );

    expect(init.player.waypointQueue).toEqual(waypointQueue);
  });

  it("carries devQueue through to the INIT payload's player object", () => {
    const devQueue = [{ tileKey: "1,1", x: 1, y: 1, kind: "BUILD" as const, structureType: "FORT", queuedAt: 1000 }];

    const init = buildGatewayInitPayload(
      { playerId: "player-1", playerName: "Nauticus" },
      baseInitialState({ devQueue }),
      "default"
    );

    expect(init.player.devQueue).toEqual(devQueue);
  });

  it("omits both fields entirely when the snapshot has no queued entries", () => {
    const init = buildGatewayInitPayload(
      { playerId: "player-1", playerName: "Nauticus" },
      baseInitialState(),
      "default"
    );

    expect(init.player.waypointQueue).toBeUndefined();
    expect(init.player.devQueue).toBeUndefined();
  });
});
