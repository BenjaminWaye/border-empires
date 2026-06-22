import { describe, expect, it } from "vitest";
import type { SimulationEvent } from "@border-empires/sim-protocol";

import { RuntimeReplayCache } from "./runtime-replay-cache.js";
import {
  isReplayTrackedCommandId,
  SERVER_GENERATED_COMMAND_ID_PREFIXES
} from "./command-event-lifecycle.js";

const deltaEvent = (commandId: string): SimulationEvent => ({
  eventType: "TILE_DELTA_BATCH",
  commandId,
  playerId: "player-1",
  tileDeltas: []
});

describe("isReplayTrackedCommandId", () => {
  it("tracks client/durable commands (UUIDs and social-prefixed)", () => {
    expect(isReplayTrackedCommandId("00278e11-369b-4760-8f54-f1887b3467c0")).toBe(true);
    expect(isReplayTrackedCommandId("social:ally:p1:p2:00278e11-369b-4760-8f54-f1887b3467c0")).toBe(true);
  });

  it("excludes every known server-generated prefix", () => {
    const samples = {
      "ai-runtime": "ai-runtime-ai-5-5932-1781516873610",
      "system-runtime": "system-runtime-sys-1-2-3",
      "territory-auto:": "territory-auto:frontier-decay:ai-1:batch:123:4",
      "population-growth-tick:": "population-growth-tick:player-1:123",
      "accrual:": "accrual:upkeep:player-1:123",
      "fort-attrition:": "fort-attrition:player-1:123",
      "income-tick:": "income-tick:player-1:123",
      "muster-spend:": "muster-spend:player-1:123",
      "ops-seed-barbs:": "ops-seed-barbs:1",
      "recovered-build:": "recovered-build:player-1:123",
      "recovered-settle:": "recovered-settle:player-1:123",
      "startup-gross-income-settlement:": "startup-gross-income-settlement:player-1:123",
      "tile-owner-change:": "tile-owner-change:1,2:123",
      "breach:": "breach:10,10:123"
    } as const;
    // every prefix in the constant must have a sample, and all must be excluded
    for (const prefix of SERVER_GENERATED_COMMAND_ID_PREFIXES) {
      expect(samples[prefix], `missing sample for ${prefix}`).toBeDefined();
    }
    for (const id of Object.values(samples)) {
      expect(isReplayTrackedCommandId(id), `${id} should be excluded`).toBe(false);
    }
  });
});

describe("RuntimeReplayCache.recordEvent gating", () => {
  it("records client command events but skips server-generated ones", () => {
    const cache = new RuntimeReplayCache(4096, 16384);
    cache.recordEvent(deltaEvent("00278e11-369b-4760-8f54-f1887b3467c0"));
    cache.recordEvent(deltaEvent("ai-runtime-ai-5-5932-1"));
    cache.recordEvent(deltaEvent("territory-auto:frontier-decay:ai-1:batch:1:1"));

    expect(cache.recordedEventsByCommandId.has("00278e11-369b-4760-8f54-f1887b3467c0")).toBe(true);
    expect(cache.recordedEventsByCommandId.has("ai-runtime-ai-5-5932-1")).toBe(false);
    expect(cache.recordedEventsByCommandId.size).toBe(1);
    expect(cache.serverEventsSkipped).toBe(2);
  });

  it("still marks cancelled client commands terminal-only even when the COMBAT_CANCELLED commandId is server-generated", () => {
    const cache = new RuntimeReplayCache(4096, 16384);
    const clientCancelled = "11111111-2222-3333-4444-555555555555";
    cache.recordEvent({
      eventType: "COMBAT_CANCELLED",
      commandId: "ai-runtime-ai-1-1-1",
      playerId: "player-1",
      count: 1,
      cancelledCommandIds: [clientCancelled]
    });
    expect(cache.isTerminalOnlyReplayCommand(clientCancelled)).toBe(true);
    // the server-generated COMBAT_CANCELLED itself was not stored
    expect(cache.recordedEventsByCommandId.has("ai-runtime-ai-1-1-1")).toBe(false);
  });

  it("hard-caps the recorded-events map and counts evictions", () => {
    const cache = new RuntimeReplayCache(4096, 16384, 3);
    for (let i = 0; i < 10; i += 1) {
      cache.recordEvent(deltaEvent(`client-uuid-${i}-aaaaaaaa-bbbb-cccc`));
    }
    expect(cache.recordedEventsByCommandId.size).toBe(3);
    expect(cache.recordedHistoryEvicted).toBe(7);
    // oldest evicted, newest retained
    expect(cache.recordedEventsByCommandId.has("client-uuid-0-aaaaaaaa-bbbb-cccc")).toBe(false);
    expect(cache.recordedEventsByCommandId.has("client-uuid-9-aaaaaaaa-bbbb-cccc")).toBe(true);
  });
});
