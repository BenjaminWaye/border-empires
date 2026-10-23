import { describe, expect, it } from "vitest";

import { exportActivityLogs, restoreActivityLogs } from "./activity-log-persistence.js";
import { createRuntimeActivityLogs } from "./runtime-activity-logs.js";
import { createCombatManpowerLog } from "../combat-manpower-log/combat-manpower-log.js";
import { computeManpowerLostTotal24h } from "../combat-manpower-log/combat-manpower-log-aggregations.js";
import { createPersonalImpactLog } from "../personal-impact-log/personal-impact-log.js";
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

const impact = (at: number, id = `impact:${at}`) => ({
  id,
  kind: "BUILDING_COMPLETED" as const,
  playerId: "player-1",
  occurredAt: at,
  x: 1,
  y: 2,
  structureType: "INCUBATION_ENGINE"
});

describe("activity log persistence", () => {
  it("round-trips all rolling logs across a restart", () => {
    const flipLog = createTerritoryFlipLog({ now: () => NOW });
    const combatLog = createCombatManpowerLog({ now: () => NOW });
    const personalImpactLog = createPersonalImpactLog({ now: () => NOW });
    flipLog.record(flip(NOW - HOUR_MS));
    combatLog.record(loss(NOW - HOUR_MS, 40));
    combatLog.record(loss(NOW - 2 * HOUR_MS, 15));
    personalImpactLog.record(impact(NOW - HOUR_MS));

    const persisted = exportActivityLogs(flipLog, combatLog, personalImpactLog);

    // A restart: brand-new runtime, so brand-new empty logs.
    const restoredFlips = createTerritoryFlipLog({ now: () => NOW });
    const restoredCombat = createCombatManpowerLog({ now: () => NOW });
    const restoredImpacts = createPersonalImpactLog({ now: () => NOW });
    restoreActivityLogs(restoredFlips, restoredCombat, restoredImpacts, persisted, NOW);

    expect(restoredFlips.entries()).toHaveLength(1);
    expect(computeManpowerLostTotal24h(restoredCombat.entries())).toBe(55);
    expect(restoredImpacts.entries()).toEqual([impact(NOW - HOUR_MS)]);
  });

  it("drops entries already outside the 24h window on restore", () => {
    const flipLog = createTerritoryFlipLog({ now: () => NOW });
    const combatLog = createCombatManpowerLog({ now: () => NOW });
    const personalImpactLog = createPersonalImpactLog({ now: () => NOW });

    // Persisted while fresh, restored a long time later — e.g. the process was
    // down overnight. Stale entries must not come back as "today".
    restoreActivityLogs(
      flipLog,
      combatLog,
      personalImpactLog,
      { flips: [flip(NOW - 30 * HOUR_MS)], combat: [loss(NOW - 30 * HOUR_MS, 999)], personalImpacts: [impact(NOW - 30 * HOUR_MS)] },
      NOW
    );

    expect(flipLog.entries()).toEqual([]);
    expect(computeManpowerLostTotal24h(combatLog.entries())).toBe(0);
  });

  it("keeps in-window entries and drops out-of-window ones in the same restore", () => {
    const combatLog = createCombatManpowerLog({ now: () => NOW });
    const personalImpactLog = createPersonalImpactLog({ now: () => NOW });

    restoreActivityLogs(createTerritoryFlipLog({ now: () => NOW }), combatLog, personalImpactLog, {
      flips: [],
      combat: [loss(NOW - 30 * HOUR_MS, 999), loss(NOW - HOUR_MS, 20)],
      personalImpacts: []
    }, NOW);

    expect(computeManpowerLostTotal24h(combatLog.entries())).toBe(20);
  });

  it("keeps recording normally after a restore", () => {
    const combatLog = createCombatManpowerLog({ now: () => NOW });
    const personalImpactLog = createPersonalImpactLog({ now: () => NOW });
    restoreActivityLogs(createTerritoryFlipLog({ now: () => NOW }), combatLog, personalImpactLog, {
      flips: [],
      combat: [loss(NOW - HOUR_MS, 30)],
      personalImpacts: []
    }, NOW);

    combatLog.record(loss(NOW, 12));

    expect(computeManpowerLostTotal24h(combatLog.entries())).toBe(42);
  });

  it("restore replaces rather than merges, so a repeat cannot double-count", () => {
    const combatLog = createCombatManpowerLog({ now: () => NOW });
    const personalImpactLog = createPersonalImpactLog({ now: () => NOW });
    const logs = { flips: [], combat: [loss(NOW - HOUR_MS, 30)], personalImpacts: [] };

    restoreActivityLogs(createTerritoryFlipLog({ now: () => NOW }), combatLog, personalImpactLog, logs, NOW);
    restoreActivityLogs(createTerritoryFlipLog({ now: () => NOW }), combatLog, personalImpactLog, logs, NOW);

    expect(computeManpowerLostTotal24h(combatLog.entries())).toBe(30);
  });

  it("keeps a player's early-day timeline across a restart after a busy day", () => {
    // Regression: persisting only the newest 5,000 entries world-wide meant
    // other empires' flips pushed this player's morning out of the blob, so
    // every restart cut their "Yours" timeline short.
    let now = NOW - 20 * HOUR_MS;
    const before = createRuntimeActivityLogs(() => now);
    before.recordTileFlip({ ...flip(now, "5,5"), fromOwner: undefined, toOwner: "player-1" });
    for (let i = 0; i < 12_000; i += 1) {
      now = NOW - 19 * HOUR_MS + i * 5_000;
      before.recordTileFlip({ ...flip(now, `${i % 400},${Math.floor(i / 400)}`), fromOwner: "ai-1", toOwner: "ai-2" });
    }
    now = NOW;

    const after = createRuntimeActivityLogs(() => now);
    after.restore(before.export());

    const timeline = after.personalTimeline("player-1", NOW - 24 * HOUR_MS, NOW);
    expect(timeline.summary.tilesClaimed).toBe(1);
    expect(timeline.cards.map((card) => card.occurredAt)).toContain(NOW - 20 * HOUR_MS);
  });

  it("treats missing or malformed persisted logs as no history", () => {
    const flipLog = createTerritoryFlipLog({ now: () => NOW });
    const combatLog = createCombatManpowerLog({ now: () => NOW });
    const personalImpactLog = createPersonalImpactLog({ now: () => NOW });

    restoreActivityLogs(flipLog, combatLog, personalImpactLog, undefined, NOW);
    restoreActivityLogs(flipLog, combatLog, personalImpactLog, {} as never, NOW);

    expect(flipLog.entries()).toEqual([]);
    expect(combatLog.entries()).toEqual([]);
  });
});
