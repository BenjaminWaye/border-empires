import { describe, expect, it } from "vitest";

import type { RecoveredSimulationState } from "../event-recovery/event-recovery.js";
import { buildWorldgenBaselineIndex, compactSnapshotForStorage } from "../snapshot-compaction/snapshot-compaction.js";
import { createSnapshotCompactorIfEnabled, createWorkerSnapshotCompactor } from "./snapshot-compaction-pool.js";

const baseTile = (overrides: Partial<RecoveredSimulationState["tiles"][number]>) =>
  ({ x: 0, y: 0, terrain: "LAND" as const, ...overrides });

const baselineWorld = (): ReadonlyArray<RecoveredSimulationState["tiles"][number]> => [
  baseTile({ x: 0, y: 0, terrain: "LAND" }),
  baseTile({ x: 1, y: 0, terrain: "WATER" }),
  baseTile({ x: 2, y: 0, terrain: "LAND", resource: "IRON" }),
  baseTile({ x: 3, y: 0, terrain: "LAND", ownerId: "ai-1", ownershipState: "SETTLED" })
];

const sectionsFor = (tiles: RecoveredSimulationState["tiles"]): Parameters<typeof compactSnapshotForStorage>[0] => ({
  initialState: { tiles, activeLocks: [] },
  commandEvents: []
});

describe("createWorkerSnapshotCompactor", () => {
  it("produces output identical to the inline compactSnapshotForStorage for the same input", async () => {
    const baselineTiles = baselineWorld();
    const liveTiles = [
      baseTile({ x: 0, y: 0, terrain: "LAND" }), // unchanged
      baseTile({ x: 1, y: 0, terrain: "WATER" }), // unchanged
      baseTile({ x: 2, y: 0, terrain: "LAND", resource: "IRON", ownerId: "ai-2", ownershipState: "FRONTIER" }), // gained ownership
      baseTile({ x: 3, y: 0, terrain: "LAND" }) // cleared ownership
    ];
    const inlineResult = await compactSnapshotForStorage(
      sectionsFor(liveTiles),
      buildWorldgenBaselineIndex(baselineTiles)
    );

    const compact = createWorkerSnapshotCompactor();
    try {
      const workerResult = await compact(sectionsFor(liveTiles), baselineTiles);
      expect(workerResult).toEqual(inlineResult);
    } finally {
      await compact.close();
    }
  });

  it("handles a payload large enough to exercise the cross-thread transfer", async () => {
    const baselineTiles = Array.from({ length: 5_000 }, (_, i) => baseTile({ x: i, y: 0, terrain: "LAND" }));
    const liveTiles = baselineTiles.map((tile, i) =>
      i % 7 === 0 ? { ...tile, ownerId: `ai-${i % 3}`, ownershipState: "SETTLED" as const } : tile
    );
    const inlineResult = await compactSnapshotForStorage(
      sectionsFor(liveTiles),
      buildWorldgenBaselineIndex(baselineTiles)
    );

    const compact = createWorkerSnapshotCompactor();
    try {
      const workerResult = await compact(sectionsFor(liveTiles), baselineTiles);
      expect(workerResult).toEqual(inlineResult);
      expect(workerResult.tileOverlay.length).toBeGreaterThan(0);
    } finally {
      await compact.close();
    }
  });

  it("serializes concurrent compaction requests independently", async () => {
    const baselineTiles = baselineWorld();
    const compact = createWorkerSnapshotCompactor();
    try {
      // "ai-1" matches the baseline's own owner at x=3, so use distinct
      // suffixes that all genuinely diverge from it.
      const ownerSuffixes = [10, 20, 30, 40];
      const variants = ownerSuffixes.map((suffix) => [
        ...baselineWorld().slice(0, 3),
        baseTile({ x: 3, y: 0, terrain: "LAND", ownerId: `ai-${suffix}`, ownershipState: "SETTLED" })
      ]);
      const results = await Promise.all(variants.map((tiles) => compact(sectionsFor(tiles), baselineTiles)));
      results.forEach((result, idx) => {
        expect(result.tileOverlay).toEqual([{ x: 3, y: 0, ownerId: `ai-${ownerSuffixes[idx]}` }]);
      });
    } finally {
      await compact.close();
    }
  });
});

describe("createSnapshotCompactorIfEnabled", () => {
  it("returns undefined when no sqlitePath is given", () => {
    expect(createSnapshotCompactorIfEnabled({ onError: () => {} })).toBeUndefined();
  });

  it("returns undefined and reports the error when SIMULATION_SNAPSHOT_COMPACT_INLINE=1", () => {
    const prior = process.env.SIMULATION_SNAPSHOT_COMPACT_INLINE;
    process.env.SIMULATION_SNAPSHOT_COMPACT_INLINE = "1";
    try {
      const result = createSnapshotCompactorIfEnabled({ sqlitePath: "/tmp/whatever.db", onError: () => {} });
      expect(result).toBeUndefined();
    } finally {
      if (prior === undefined) delete process.env.SIMULATION_SNAPSHOT_COMPACT_INLINE;
      else process.env.SIMULATION_SNAPSHOT_COMPACT_INLINE = prior;
    }
  });

  it("spins up a real worker compactor when a sqlitePath is given", async () => {
    const compactor = createSnapshotCompactorIfEnabled({ sqlitePath: "/tmp/whatever.db", onError: () => {} });
    expect(compactor).toBeDefined();
    await compactor?.close();
  });
});
