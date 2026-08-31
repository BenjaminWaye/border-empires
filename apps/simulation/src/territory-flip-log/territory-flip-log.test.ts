import { describe, expect, it } from "vitest";

import { createTerritoryFlipLog, TERRITORY_FLIP_LOG_MAX_ENTRIES, TERRITORY_FLIP_WINDOW_MS } from "./territory-flip-log.js";

const flip = (at: number, overrides: Partial<{ tileId: string; x: number; y: number; fromOwner: string; toOwner: string }> = {}) => ({
  tileId: overrides.tileId ?? "t-1",
  x: overrides.x ?? 1,
  y: overrides.y ?? 1,
  fromOwner: overrides.fromOwner,
  toOwner: overrides.toOwner ?? "p1",
  at
});

describe("createTerritoryFlipLog", () => {
  it("captures a recorded flip", () => {
    let now = 1_000;
    const log = createTerritoryFlipLog({ now: () => now });
    log.record(flip(now, { toOwner: "p1", fromOwner: undefined }));
    expect(log.entries()).toHaveLength(1);
    expect(log.entries()[0]!.toOwner).toBe("p1");
  });

  it("prunes entries older than the 24h window", () => {
    let now = 0;
    const log = createTerritoryFlipLog({ now: () => now });
    log.record(flip(now, { toOwner: "p1" }));
    now += TERRITORY_FLIP_WINDOW_MS + 1;
    log.record(flip(now, { toOwner: "p2" }));
    log.prune(now);
    const entries = log.entries();
    expect(entries).toHaveLength(1);
    expect(entries[0]!.toOwner).toBe("p2");
  });

  it("does not prune entries within the window", () => {
    let now = 0;
    const log = createTerritoryFlipLog({ now: () => now });
    log.record(flip(now));
    now += TERRITORY_FLIP_WINDOW_MS - 1;
    log.prune(now);
    expect(log.entries()).toHaveLength(1);
  });

  it("enforces the hard entry-count cap, dropping oldest first", () => {
    let now = 0;
    const log = createTerritoryFlipLog({ now: () => now });
    for (let i = 0; i < TERRITORY_FLIP_LOG_MAX_ENTRIES + 5; i++) {
      now += 1;
      log.record(flip(now, { tileId: `t-${i}`, toOwner: "p1" }));
    }
    const entries = log.entries();
    expect(entries.length).toBe(TERRITORY_FLIP_LOG_MAX_ENTRIES);
    // the first 5 recorded entries should have been evicted
    expect(entries[0]!.tileId).toBe("t-5");
    expect(log.gauge().capHits).toBeGreaterThan(0);
  });

  it("gauge reports entry count and time bounds", () => {
    let now = 100;
    const log = createTerritoryFlipLog({ now: () => now });
    log.record(flip(now, { toOwner: "p1" }));
    now = 200;
    log.record(flip(now, { toOwner: "p2" }));
    const gauge = log.gauge();
    expect(gauge.entryCount).toBe(2);
    expect(gauge.oldestAt).toBe(100);
    expect(gauge.newestAt).toBe(200);
    expect(gauge.capHits).toBe(0);
  });
});
