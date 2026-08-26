import { describe, expect, it } from "vitest";

import { buildRuntimeSnapshotSections, buildRuntimeSnapshotSectionsAsync, mapTile, type SnapshotExportInput, type SnapshotTile } from "./runtime-snapshot-sections.js";
import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import { applySimulationEventsToRecoveredState } from "./event-recovery/event-recovery.js";
import { createEmptyPlayerRuntimeSummary, createPlayerRuntimeSummaryFromRecovered, type PlayerRuntimeSummary } from "./player-runtime-summary.js";

const baseInput = (overrides: Partial<SnapshotExportInput> = {}): SnapshotExportInput => ({
  tiles: new Map(),
  locksByCommandId: new Map(),
  players: new Map(),
  pendingSettlementsByTile: new Map(),
  tileYieldCollectedAtByTile: new Map(),
  playerYieldCollectionEpochByPlayer: new Map(),
  docks: [],
  recordedEventsByCommandId: new Map(),
  incomePerMinuteForPlayer: () => 0,
  summaryForPlayer: () => ({ ownedTownTierByTile: new Map(), settledTileCount: 0, territoryTileKeys: new Set() }) as never,
  ...overrides
});

const tile = (x: number, y: number): DomainTileState => ({ x, y, terrain: "plains" }) as DomainTileState;

describe("buildRuntimeSnapshotSectionsAsync — prebuiltTiles path", () => {
  // Regression: on a full-size world (202,500 tiles) this path used to copy
  // `[...prebuiltTiles.values()]` in one synchronous call, which the 2026-08-24
  // nightly load harness measured as a 209ms event-loop block (gate limit
  // 150ms) — invisible to event_loop_blocked's mainThreadTasks because nothing
  // here was tracked or yielded. Assert the copy actually yields on a
  // large tile set instead of running as one unbroken synchronous pass.
  it("yields to the event loop while copying a large prebuilt tile cache", async () => {
    const prebuiltTiles = new Map<string, SnapshotTile>();
    for (let i = 0; i < 40_001; i++) {
      prebuiltTiles.set(`${i},0`, mapTile(tile(i, 0)));
    }
    let yieldCount = 0;
    const yieldToEventLoop = async () => {
      yieldCount += 1;
    };

    await buildRuntimeSnapshotSectionsAsync(baseInput({ prebuiltTiles }), yieldToEventLoop);

    // 40,001 tiles at a 20,000-tile chunk size yields twice (after tile
    // 20,000 and after tile 40,000).
    expect(yieldCount).toBe(2);
  });

  it("does not yield for a tile count under the chunk size", async () => {
    const prebuiltTiles = new Map<string, SnapshotTile>([["0,0", mapTile(tile(0, 0))]]);
    let yieldCount = 0;
    await buildRuntimeSnapshotSectionsAsync(baseInput({ prebuiltTiles }), async () => {
      yieldCount += 1;
    });
    expect(yieldCount).toBe(0);
  });

  it("still returns tiles sorted by (x, y) regardless of input map order", async () => {
    const prebuiltTiles = new Map<string, SnapshotTile>([
      ["2,0", mapTile(tile(2, 0))],
      ["0,0", mapTile(tile(0, 0))],
      ["1,0", mapTile(tile(1, 0))]
    ]);
    const sections = await buildRuntimeSnapshotSectionsAsync(baseInput({ prebuiltTiles }), async () => {});
    expect(sections.initialState.tiles.map((t) => t.x)).toEqual([0, 1, 2]);
  });
});

// Regression: waypointQueue/devQueue used to live only in the live
// PlayerRuntimeSummary and were never written into initialState.players[],
// so a cold process restart silently reset both to [].
describe("waypointQueue/devQueue restart persistence", () => {
  const player: DomainPlayer = {
    id: "player-1",
    isAi: false,
    points: 100,
    manpower: 10,
    techIds: new Set(),
    allies: new Set()
  };

  const summaryWithQueues = (): PlayerRuntimeSummary => ({
    ...createEmptyPlayerRuntimeSummary(),
    waypointQueue: [{ target: { x: 5, y: 6 }, trackBarbarian: true, queuedAt: 42 }],
    devQueue: [{ tileKey: "7,8", x: 7, y: 8, kind: "SETTLE", queuedAt: 43 }]
  });

  it("writes the live queue contents into initialState.players[] (write side)", () => {
    const sections = buildRuntimeSnapshotSections(
      baseInput({ players: new Map([["player-1", player]]), summaryForPlayer: () => summaryWithQueues() })
    );
    const [recoveredPlayer] = sections.initialState.players ?? [];
    expect(recoveredPlayer?.waypointQueue).toEqual([{ target: { x: 5, y: 6 }, trackBarbarian: true, queuedAt: 42 }]);
    expect(recoveredPlayer?.devQueue).toEqual([{ tileKey: "7,8", x: 7, y: 8, kind: "SETTLE", queuedAt: 43 }]);
  });

  it("survives a snapshot -> recovery -> boot round trip with no events replayed (cold restart)", () => {
    const sections = buildRuntimeSnapshotSections(
      baseInput({ players: new Map([["player-1", player]]), summaryForPlayer: () => summaryWithQueues() })
    );
    // No events since the checkpoint -- exactly what a cold restart replays
    // when the process died right after the last snapshot.
    const recoveredState = applySimulationEventsToRecoveredState(sections.initialState, []);
    const recoveredPlayer = recoveredState.players?.find((p) => p.id === "player-1");
    const bootedSummary = createPlayerRuntimeSummaryFromRecovered(recoveredPlayer);
    expect(bootedSummary.waypointQueue).toEqual([{ target: { x: 5, y: 6 }, trackBarbarian: true, queuedAt: 42 }]);
    expect(bootedSummary.devQueue).toEqual([{ tileKey: "7,8", x: 7, y: 8, kind: "SETTLE", queuedAt: 43 }]);
  });
});
