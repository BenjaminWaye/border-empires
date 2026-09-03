import { describe, expect, it } from "vitest";

import { createCombatManpowerLog, COMBAT_MANPOWER_LOG_MAX_ENTRIES, COMBAT_MANPOWER_WINDOW_MS } from "./combat-manpower-log.js";

const loss = (at: number, overrides: Partial<{ attackerId: string; defenderId: string | undefined; attackerWon: boolean; manpowerLoss: number; x: number; y: number }> = {}) => ({
  attackerId: overrides.attackerId ?? "p1",
  defenderId: overrides.defenderId ?? "p2",
  attackerWon: overrides.attackerWon ?? true,
  manpowerLoss: overrides.manpowerLoss ?? 10,
  x: overrides.x ?? 1,
  y: overrides.y ?? 1,
  at
});

describe("createCombatManpowerLog", () => {
  it("captures a recorded loss", () => {
    const now = 1_000;
    const log = createCombatManpowerLog({ now: () => now });
    log.record(loss(now, { manpowerLoss: 42 }));
    expect(log.entries()).toHaveLength(1);
    expect(log.entries()[0]!.manpowerLoss).toBe(42);
  });

  it("prunes entries older than the 24h window", () => {
    let now = 0;
    const log = createCombatManpowerLog({ now: () => now });
    log.record(loss(now, { manpowerLoss: 1 }));
    now += COMBAT_MANPOWER_WINDOW_MS + 1;
    log.record(loss(now, { manpowerLoss: 2 }));
    log.prune(now);
    const entries = log.entries();
    expect(entries).toHaveLength(1);
    expect(entries[0]!.manpowerLoss).toBe(2);
  });

  it("does not prune entries within the window", () => {
    let now = 0;
    const log = createCombatManpowerLog({ now: () => now });
    log.record(loss(now));
    now += COMBAT_MANPOWER_WINDOW_MS - 1;
    log.prune(now);
    expect(log.entries()).toHaveLength(1);
  });

  it("enforces the hard entry-count cap, dropping oldest first", () => {
    let now = 0;
    const log = createCombatManpowerLog({ now: () => now });
    for (let i = 0; i < COMBAT_MANPOWER_LOG_MAX_ENTRIES + 5; i++) {
      now += 1;
      log.record(loss(now, { manpowerLoss: i }));
    }
    const entries = log.entries();
    expect(entries.length).toBe(COMBAT_MANPOWER_LOG_MAX_ENTRIES);
    expect(entries[0]!.manpowerLoss).toBe(5);
    expect(log.gauge().capHits).toBeGreaterThan(0);
  });

  it("gauge reports entry count and time bounds", () => {
    let now = 100;
    const log = createCombatManpowerLog({ now: () => now });
    log.record(loss(now));
    now = 200;
    log.record(loss(now));
    const gauge = log.gauge();
    expect(gauge.entryCount).toBe(2);
    expect(gauge.oldestAt).toBe(100);
    expect(gauge.newestAt).toBe(200);
    expect(gauge.capHits).toBe(0);
  });
});
