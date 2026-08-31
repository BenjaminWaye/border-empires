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

// Regression: same allowlist-gap class as the durable-queues regression above
// (init-payload.durable-queues-regression.test.ts) -- the INIT payload's
// `player` object is built as an explicit field-by-field allowlist, and these
// four fields were never on it even though the client reads them off
// msg.player unconditionally. imperialWardCharges and wonderLastFreeRushBuyAt
// are assigned with no `??` fallback client-side, so a missing value here
// actively wiped them on every reconnect.
describe("buildGatewayInitPayload reconnect fields", () => {
  it("carries eventLog through to the INIT payload's player object", () => {
    const eventLog = [{ id: "evt-1", type: "RAID", text: "Raided", occurredAt: 1000 }];

    const init = buildGatewayInitPayload({ playerId: "player-1", playerName: "Nauticus" }, baseInitialState({ eventLog }), "default");

    expect(init.player.eventLog).toEqual(eventLog);
  });

  it("carries logisticsThroughputPerMinute through to the INIT payload's player object", () => {
    const init = buildGatewayInitPayload(
      { playerId: "player-1", playerName: "Nauticus" },
      baseInitialState({ logisticsThroughputPerMinute: 42 }),
      "default"
    );

    expect(init.player.logisticsThroughputPerMinute).toBe(42);
  });

  it("carries imperialWardCharges through to the INIT payload's player object", () => {
    const init = buildGatewayInitPayload(
      { playerId: "player-1", playerName: "Nauticus" },
      baseInitialState({ imperialWardCharges: 3 }),
      "default"
    );

    expect(init.player.imperialWardCharges).toBe(3);
  });

  it("carries wonderLastFreeRushBuyAt through to the INIT payload's player object", () => {
    const init = buildGatewayInitPayload(
      { playerId: "player-1", playerName: "Nauticus" },
      baseInitialState({ wonderLastFreeRushBuyAt: 5000 }),
      "default"
    );

    expect(init.player.wonderLastFreeRushBuyAt).toBe(5000);
  });

  it("omits all four fields when the snapshot has no values for them", () => {
    const init = buildGatewayInitPayload({ playerId: "player-1", playerName: "Nauticus" }, baseInitialState(), "default");

    expect(init.player.eventLog).toBeUndefined();
    expect(init.player.logisticsThroughputPerMinute).toBeUndefined();
    expect(init.player.imperialWardCharges).toBeUndefined();
    expect(init.player.wonderLastFreeRushBuyAt).toBeUndefined();
  });

  // Regression: confirmed missing from this builder entirely (not just
  // omitted without a fallback, but never referenced at all) until the
  // Phase 3 player-wire refactor -- the season-winner galactic-wonder bonus
  // silently vanished from the client on every reconnect. See
  // docs/player-wire-refactor-plan-phase3.md.
  it("carries the galactic-wonder bonus fields through to the INIT payload's player object", () => {
    const init = buildGatewayInitPayload(
      { playerId: "player-1", playerName: "Nauticus" },
      baseInitialState({ galacticWonderManpowerRegenBonusPerMinute: 5, galacticWonderVisionRadiusBonus: 2 }),
      "default"
    );

    expect(init.player.galacticWonderManpowerRegenBonusPerMinute).toBe(5);
    expect(init.player.galacticWonderVisionRadiusBonus).toBe(2);
  });
});
