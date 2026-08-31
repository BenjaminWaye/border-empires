import { describe, expect, it } from "vitest";

import type { PlayerStateSnapshot } from "../subscription-snapshot-merge/subscription-snapshot-merge.js";
import { reconnectPassthroughFields } from "./reconnect-passthrough-fields.js";

const basePlayer = (overrides: Partial<PlayerStateSnapshot> = {}): PlayerStateSnapshot => ({
  id: "player-1",
  gold: 100,
  manpower: 10,
  manpowerCap: 100,
  incomePerMinute: 1,
  strategicResources: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0, SHARD: 0 },
  strategicProductionPerMinute: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0, SHARD: 0 },
  developmentProcessLimit: 2,
  activeDevelopmentProcessCount: 0,
  pendingSettlements: [],
  techIds: [],
  domainIds: [],
  ...overrides
});

describe("reconnectPassthroughFields", () => {
  it("returns nothing when there is no live snapshot player", () => {
    expect(reconnectPassthroughFields(undefined)).toEqual({});
  });

  // Regression: PR #1640 -- devQueue/waypointQueue were on the live snapshot
  // the whole time but never copied into the reconnect/init payload, so a
  // reconnecting client always saw an empty queue regardless of server state.
  it("carries devQueue and waypointQueue through", () => {
    const result = reconnectPassthroughFields(
      basePlayer({
        devQueue: [{ tileKey: "1,1", x: 1, y: 1, kind: "BUILD", queuedAt: 0 }],
        waypointQueue: [{ x: 2, y: 2, queuedAt: 0 }]
      })
    );
    expect(result.devQueue).toHaveLength(1);
    expect(result.waypointQueue).toHaveLength(1);
  });

  // Regression: eventLog/logisticsThroughputPerMinute were the same gap,
  // found while grounding docs/player-wire-refactor-plan-phase3.md.
  it("carries eventLog and logisticsThroughputPerMinute through", () => {
    const result = reconnectPassthroughFields(
      basePlayer({
        eventLog: [{ id: "evt-1", message: "Test", createdAt: 0 } as never],
        logisticsThroughputPerMinute: 42
      })
    );
    expect(result.eventLog).toHaveLength(1);
    expect(result.logisticsThroughputPerMinute).toBe(42);
  });

  // Confirmed missing entirely from init-payload.ts until this fix (see the
  // Phase 3 plan doc): the season-winner galactic-wonder bonus silently
  // vanished from the client on any reconnect.
  it("carries the galactic-wonder bonus fields through", () => {
    const result = reconnectPassthroughFields(
      basePlayer({
        galacticWonderManpowerRegenBonusPerMinute: 5,
        galacticWonderVisionRadiusBonus: 2
      })
    );
    expect(result.galacticWonderManpowerRegenBonusPerMinute).toBe(5);
    expect(result.galacticWonderVisionRadiusBonus).toBe(2);
  });

  it("carries imperialWardCharges and wonderLastFreeRushBuyAt through", () => {
    const result = reconnectPassthroughFields(
      basePlayer({ imperialWardCharges: 1, wonderLastFreeRushBuyAt: 123 })
    );
    expect(result.imperialWardCharges).toBe(1);
    expect(result.wonderLastFreeRushBuyAt).toBe(123);
  });

  it("omits a passthrough field entirely when the live snapshot doesn't have it", () => {
    const result = reconnectPassthroughFields(basePlayer());
    expect(result.devQueue).toBeUndefined();
    expect(result.eventLog).toBeUndefined();
    expect(result.galacticWonderManpowerRegenBonusPerMinute).toBeUndefined();
  });

  it("treats a developmentProcessLimit of 0 as present, not absent", () => {
    // developmentProcessLimit is a required number field; init-payload.ts's
    // old inline truthy check (`liveSnapshotPlayer?.developmentProcessLimit
    // ? ... : {}`) silently dropped a real 0 value. This table uses the same
    // typeof-number rule as PLAYER_MERGE_RULES for this field instead.
    const result = reconnectPassthroughFields(basePlayer({ developmentProcessLimit: 0 }));
    expect(result.developmentProcessLimit).toBe(0);
  });

  it("does not merge fields with real legacy/bootstrap fallback logic (handledInline)", () => {
    const result = reconnectPassthroughFields(basePlayer({ gold: 999 }));
    expect(result.gold).toBeUndefined();
  });
});
