import { describe, expect, it } from "vitest";

import { persistSeasonActivityState, restoreSeasonActivityState } from "./season-activity-persistence.js";
import type { PersistedActivityLogs } from "../activity-dashboard/activity-log-persistence.js";
import { InMemorySeasonSummaryStore } from "../season-summary-store.js";
import { findMostDeadlyTile } from "../season-stats/season-stats.js";

const NOW = 1_800_000_000_000;

const sampleLogs = (): PersistedActivityLogs => ({
  flips: [{ tileId: "1,2", x: 1, y: 2, fromOwner: "p2", toOwner: "p1", at: NOW }],
  combat: [{ attackerId: "p1", defenderId: "p2", attackerWon: true, manpowerLoss: 40, x: 1, y: 2, at: NOW }]
});

/** Stands in for SimulationRuntime's persistence surface (taken structurally). */
const fakeRuntime = (options: { damage?: Map<string, number>; logs?: PersistedActivityLogs } = {}) => {
  let restored: PersistedActivityLogs | undefined;
  return {
    manpowerLossByTileKey: options.damage ?? new Map<string, number>(),
    exportActivityLogs: () => options.logs ?? { flips: [], combat: [] },
    restoreActivityLogs: (logs: PersistedActivityLogs | undefined) => {
      restored = logs;
    },
    restoredLogs: () => restored
  };
};

describe("season activity persistence", () => {
  it("persists and restores both the tile damage and the activity logs together", async () => {
    const store = new InMemorySeasonSummaryStore();
    const source = fakeRuntime({ damage: new Map([["30,40", 900]]), logs: sampleLogs() });
    await persistSeasonActivityState(store, "season-1", source);

    const afterRestart = fakeRuntime();
    await restoreSeasonActivityState(store, "season-1", afterRestart);

    expect(findMostDeadlyTile(afterRestart.manpowerLossByTileKey)).toEqual({ x: 30, y: 40, manpowerLost: 900 });
    expect(afterRestart.restoredLogs()).toEqual(sampleLogs());
  });

  it("does not let empty feeds overwrite stored history", async () => {
    const store = new InMemorySeasonSummaryStore();
    await persistSeasonActivityState(store, "season-1", fakeRuntime({ logs: sampleLogs() }));

    // e.g. a restart that persisted before restoring.
    await persistSeasonActivityState(store, "season-1", fakeRuntime({ logs: { flips: [], combat: [] } }));

    await expect(store.loadActivityLogs("season-1")).resolves.toEqual(sampleLogs());
  });

  it("is season-scoped so a rollover starts with no history", async () => {
    const store = new InMemorySeasonSummaryStore();
    await persistSeasonActivityState(store, "season-1", fakeRuntime({ damage: new Map([["30,40", 900]]), logs: sampleLogs() }));

    const nextSeason = fakeRuntime();
    await restoreSeasonActivityState(store, "season-2", nextSeason);

    expect(nextSeason.manpowerLossByTileKey.size).toBe(0);
    expect(nextSeason.restoredLogs()).toBeUndefined();
  });
});
