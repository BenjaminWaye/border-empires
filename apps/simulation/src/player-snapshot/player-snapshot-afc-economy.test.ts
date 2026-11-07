import { expect, it } from "vitest";
import { TOWN_MANPOWER_BY_TIER } from "@border-empires/game-domain";
import { buildPlayerSubscriptionSnapshot } from "./player-snapshot.js";
import { SimulationRuntime } from "../runtime/runtime.js";

it("includes live town manpower regen and breakdown in subscription snapshots", () => {
    const runtime = new SimulationRuntime({
      now: () => 60_000,
      initialPlayers: new Map([
        [
          "player-1",
          {
            id: "player-1",
            isAi: false,
            points: 100,
            manpower: 0,
            manpowerUpdatedAt: 0,
            manpowerCapSnapshot: 150,
            techIds: new Set<string>(),
            domainIds: new Set<string>(),
            mods: { attack: 1, defense: 1, income: 1, vision: 1 },
            techRootId: "rewrite-local",
            allies: new Set<string>()
          }
        ]
      ]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          {
            x: 10,
            y: 10,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            town: { name: "Alpha", type: "MARKET", populationTier: "SETTLEMENT", goldPerMinute: 1 }
          },
          {
            x: 11,
            y: 10,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            town: { name: "Beta", type: "MARKET", populationTier: "SETTLEMENT", goldPerMinute: 1 }
          }
        ],
        activeLocks: []
      }
    });

    const snapshot = buildPlayerSubscriptionSnapshot("player-1", runtime.exportState());

    const settlementCap = TOWN_MANPOWER_BY_TIER.SETTLEMENT.cap;
    const settlementRegen = TOWN_MANPOWER_BY_TIER.SETTLEMENT.regenPerMinute;
    expect(snapshot.player).toEqual(
      expect.objectContaining({
        // Starting capital (§4.3) is additive on top of every owned town's cap/regen.
        manpowerCap: settlementCap * 2, manpowerRegenPerMinute: settlementRegen * 2,
        manpowerBreakdown: {
          cap: [{ label: "2 Settlements", amount: settlementCap * 2 }],
          regen: [{ label: "2 Settlements", amount: settlementRegen * 2 }]
        }
      })
    );
  });
