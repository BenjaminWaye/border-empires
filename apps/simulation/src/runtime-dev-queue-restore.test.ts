import { describe, expect, it } from "vitest";
import { buildRuntimeSnapshotSectionsAsync, type SnapshotExportInput } from "./runtime-snapshot-sections.js";
import { restoreDevQueuesFromInitialState } from "./runtime-dev-queue-restore.js";
import { createEmptyPlayerRuntimeSummary, type PlayerRuntimeSummary } from "./player-runtime-summary.js";
import type { DomainPlayer } from "@border-empires/game-domain";

const PLAYER_ID = "player-1";

function makePlayer(): DomainPlayer {
  return { id: PLAYER_ID, isAi: false, points: 0, manpower: 700, techIds: new Set(), allies: new Set() } as DomainPlayer;
}

function summaryWithQueue(): PlayerRuntimeSummary {
  const summary = createEmptyPlayerRuntimeSummary();
  summary.devQueue = [
    {
      tileKey: "1,1",
      x: 1,
      y: 1,
      kind: "BUILD",
      structureType: "FORT",
      queuedAt: 1000,
      reservedManpower: 300,
      reservedSlotRequirements: [{ resource: "TITANIUM", count: 1 }]
    },
    { tileKey: "2,2", x: 2, y: 2, kind: "SETTLE", queuedAt: 2000 }
  ];
  return summary;
}

describe("restoreDevQueuesFromInitialState", () => {
  it("restores queued entries with their reservation intact, and does NOT re-deduct manpower", () => {
    const summary = createEmptyPlayerRuntimeSummary();
    const player = makePlayer();
    restoreDevQueuesFromInitialState(
      {
        players: [
          {
            id: PLAYER_ID,
            devQueue: [
              { tileKey: "1,1", x: 1, y: 1, kind: "BUILD", structureType: "FORT", queuedAt: 1000, reservedManpower: 300, reservedSlotRequirements: [{ resource: "TITANIUM", count: 1 }] }
            ]
          }
        ]
      },
      () => summary
    );
    expect(summary.devQueue).toEqual([
      { tileKey: "1,1", x: 1, y: 1, kind: "BUILD", structureType: "FORT", queuedAt: 1000, reservedManpower: 300, reservedSlotRequirements: [{ resource: "TITANIUM", count: 1 }] }
    ]);
    // The reserve was already taken before the snapshot -- restoring must not charge it again.
    expect(player.manpower).toBe(700);
  });

  it("leaves the queue untouched for players with no persisted queue", () => {
    const summary = createEmptyPlayerRuntimeSummary();
    restoreDevQueuesFromInitialState({ players: [{ id: PLAYER_ID }] }, () => summary);
    expect(summary.devQueue).toEqual([]);
  });

  it("tolerates a missing initialState", () => {
    const summary = createEmptyPlayerRuntimeSummary();
    expect(() => restoreDevQueuesFromInitialState(undefined, () => summary)).not.toThrow();
    expect(summary.devQueue).toEqual([]);
  });
});

describe("dev-queue reservation survives a snapshot round-trip", () => {
  // The bug this guards: player.manpower is persisted with the reserve
  // already deducted, but the snapshot used to omit devQueue entirely -- so
  // every restart destroyed the entry that owed the refund and burned the
  // reserved manpower permanently.
  it("persists reservedManpower/reservedSlotRequirements into the snapshot and restores them", async () => {
    const summary = summaryWithQueue();
    const input: SnapshotExportInput = {
      tiles: new Map(),
      locksByCommandId: new Map(),
      players: new Map([[PLAYER_ID, makePlayer()]]),
      pendingSettlementsByTile: new Map(),
      tileYieldCollectedAtByTile: new Map(),
      playerYieldCollectionEpochByPlayer: new Map(),
      docks: [],
      recordedEventsByCommandId: new Map(),
      incomePerMinuteForPlayer: () => 0,
      summaryForPlayer: () => summary
    } as unknown as SnapshotExportInput;

    const sections = await buildRuntimeSnapshotSectionsAsync(input, async () => {});
    const persistedPlayer = sections.initialState.players?.find((p) => p.id === PLAYER_ID);
    expect(persistedPlayer?.devQueue).toEqual([
      { tileKey: "1,1", x: 1, y: 1, kind: "BUILD", structureType: "FORT", queuedAt: 1000, reservedManpower: 300, reservedSlotRequirements: [{ resource: "TITANIUM", count: 1 }] },
      { tileKey: "2,2", x: 2, y: 2, kind: "SETTLE", queuedAt: 2000 }
    ]);

    // ...and the restore side puts it back byte-for-byte.
    const restored = createEmptyPlayerRuntimeSummary();
    restoreDevQueuesFromInitialState(sections.initialState, () => restored);
    expect(restored.devQueue).toEqual(summary.devQueue);
  });
});
