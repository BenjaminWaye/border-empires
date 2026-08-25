import { describe, expect, it } from "vitest";
import { buildRuntimeSnapshotSectionsAsync, type SnapshotExportInput } from "./runtime-snapshot-sections.js";
import { createEmptyPlayerRuntimeSummary, createPlayerRuntimeSummaryFromRecovered, type PlayerRuntimeSummary } from "./player-runtime-summary.js";
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

describe("createPlayerRuntimeSummaryFromRecovered -- dev-queue reservation fields", () => {
  it("restores queued entries with their reservation intact", () => {
    const restored = createPlayerRuntimeSummaryFromRecovered({
      devQueue: [
        { tileKey: "1,1", x: 1, y: 1, kind: "BUILD", structureType: "FORT", queuedAt: 1000, reservedManpower: 300, reservedSlotRequirements: [{ resource: "TITANIUM", count: 1 }] }
      ]
    });
    expect(restored.devQueue).toEqual([
      { tileKey: "1,1", x: 1, y: 1, kind: "BUILD", structureType: "FORT", queuedAt: 1000, reservedManpower: 300, reservedSlotRequirements: [{ resource: "TITANIUM", count: 1 }] }
    ]);
  });

  it("leaves the queue empty for a player with no persisted queue", () => {
    expect(createPlayerRuntimeSummaryFromRecovered({ waypointQueue: [] }).devQueue).toEqual([]);
  });

  it("tolerates a missing recovered record", () => {
    expect(() => createPlayerRuntimeSummaryFromRecovered(undefined)).not.toThrow();
    expect(createPlayerRuntimeSummaryFromRecovered(undefined).devQueue).toEqual([]);
  });
});

describe("dev-queue reservation survives a snapshot round-trip", () => {
  // The bug this guards: player.manpower is persisted with the reserve
  // already deducted, so the entry that owes the matching refund has to
  // round-trip through the snapshot -- including reservedManpower/
  // reservedSlotRequirements -- or a restart burns that manpower for good.
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
    const restored = createPlayerRuntimeSummaryFromRecovered(persistedPlayer);
    expect(restored.devQueue).toEqual(summary.devQueue);
  });
});
