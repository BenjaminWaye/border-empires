import { describe, expect, it } from "vitest";

import {
  ACTIVITY_LOG_PERSIST_LIMIT,
  exportActivityLogs,
  restoreActivityLogs
} from "./activity-log-persistence.js";
import { createCombatManpowerLog } from "../combat-manpower-log/combat-manpower-log.js";
import { computeManpowerLostTotal24h } from "../combat-manpower-log/combat-manpower-log-aggregations.js";
import { createTerritoryFlipLog } from "../territory-flip-log/territory-flip-log.js";

const NOW = 1_800_000_000_000;
const HOUR_MS = 60 * 60_000;

const loss = (at: number, manpowerLoss = 10) => ({
  attackerId: "player-1",
  defenderId: "player-2",
  attackerWon: true,
  manpowerLoss,
  x: 1,
  y: 2,
  at
});

const flip = (at: number, tileId = "1,2") => ({
  tileId,
  x: 1,
  y: 2,
  fromOwner: "player-2",
  toOwner: "player-1",
  at
});

describe("activity log persistence", () => {
  it("round-trips both logs across a restart", () => {
    const flipLog = createTerritoryFlipLog({ now: () => NOW });
    const combatLog = createCombatManpowerLog({ now: () => NOW });
    flipLog.record(flip(NOW - HOUR_MS));
    combatLog.record(loss(NOW - HOUR_MS, 40));
    combatLog.record(loss(NOW - 2 * HOUR_MS, 15));

    const persisted = exportActivityLogs(flipLog, combatLog);

    // A restart: brand-new runtime, so brand-new empty logs.
    const restoredFlips = createTerritoryFlipLog({ now: () => NOW });
    const restoredCombat = createCombatManpowerLog({ now: () => NOW });
    restoreActivityLogs(restoredFlips, restoredCombat, persisted, NOW);

    expect(restoredFlips.entries()).toHaveLength(1);
    expect(computeManpowerLostTotal24h(restoredCombat.entries())).toBe(55);
  });

  it("drops entries already outside the 24h window on restore", () => {
    const flipLog = createTerritoryFlipLog({ now: () => NOW });
    const combatLog = createCombatManpowerLog({ now: () => NOW });

    // Persisted while fresh, restored a long time later — e.g. the process was
    // down overnight. Stale entries must not come back as "today".
    restoreActivityLogs(
      flipLog,
      combatLog,
      { flips: [flip(NOW - 30 * HOUR_MS)], combat: [loss(NOW - 30 * HOUR_MS, 999)] },
      NOW
    );

    expect(flipLog.entries()).toEqual([]);
    expect(computeManpowerLostTotal24h(combatLog.entries())).toBe(0);
  });

  it("keeps in-window entries and drops out-of-window ones in the same restore", () => {
    const combatLog = createCombatManpowerLog({ now: () => NOW });

    restoreActivityLogs(createTerritoryFlipLog({ now: () => NOW }), combatLog, {
      flips: [],
      combat: [loss(NOW - 30 * HOUR_MS, 999), loss(NOW - HOUR_MS, 20)]
    }, NOW);

    expect(computeManpowerLostTotal24h(combatLog.entries())).toBe(20);
  });

  it("keeps recording normally after a restore", () => {
    const combatLog = createCombatManpowerLog({ now: () => NOW });
    restoreActivityLogs(createTerritoryFlipLog({ now: () => NOW }), combatLog, {
      flips: [],
      combat: [loss(NOW - HOUR_MS, 30)]
    }, NOW);

    combatLog.record(loss(NOW, 12));

    expect(computeManpowerLostTotal24h(combatLog.entries())).toBe(42);
  });

  it("restore replaces rather than merges, so a repeat cannot double-count", () => {
    const combatLog = createCombatManpowerLog({ now: () => NOW });
    const logs = { flips: [], combat: [loss(NOW - HOUR_MS, 30)] };

    restoreActivityLogs(createTerritoryFlipLog({ now: () => NOW }), combatLog, logs, NOW);
    restoreActivityLogs(createTerritoryFlipLog({ now: () => NOW }), combatLog, logs, NOW);

    expect(computeManpowerLostTotal24h(combatLog.entries())).toBe(30);
  });

  it("persists only the newest entries once past the cap", () => {
    const flipLog = createTerritoryFlipLog({ now: () => NOW });
    const combatLog = createCombatManpowerLog({ now: () => NOW });
    for (let i = 0; i < ACTIVITY_LOG_PERSIST_LIMIT + 50; i += 1) {
      flipLog.record(flip(NOW - HOUR_MS + i, `${i},0`));
    }

    const persisted = exportActivityLogs(flipLog, combatLog);

    expect(persisted.flips).toHaveLength(ACTIVITY_LOG_PERSIST_LIMIT);
    // The newest window is what the aggregations report, so the tail is kept.
    expect(persisted.flips[persisted.flips.length - 1]?.tileId).toBe(`${ACTIVITY_LOG_PERSIST_LIMIT + 49},0`);
  });

  it("treats missing or malformed persisted logs as no history", () => {
    const flipLog = createTerritoryFlipLog({ now: () => NOW });
    const combatLog = createCombatManpowerLog({ now: () => NOW });

    restoreActivityLogs(flipLog, combatLog, undefined, NOW);
    restoreActivityLogs(flipLog, combatLog, {} as never, NOW);

    expect(flipLog.entries()).toEqual([]);
    expect(combatLog.entries()).toEqual([]);
  });
});
