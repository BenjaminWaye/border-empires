import { describe, expect, it } from "vitest";
import { SimulationRuntime } from "./runtime.js";

// Regression: a player-issued lock A can have its originKey slot silently
// overwritten in `locksByTile` by a later command B (validation explicitly
// allows EXPAND from a recently-locked own origin). Before this fix,
// `resolveLock` early-returned on the commandId mismatch and lockA's
// surviving *targetKey* entry was orphaned forever — keeping the player
// in the planner's active-lock set every tick. In prod this stranded
// ai-3 for 18h with 289k "active_lock" noops.
//
// We exercise the leak shape via hydration: two recovered locks where
// lock B's originKey collides with lock A's originKey. `createLocksFromInitialState`
// performs the same `Map.set()` overwrite that the live command path
// produces, then `scheduleLockResolution` fires for each unique
// commandId. With the fix, lockA's resolve cleans its surviving
// targetKey instead of bailing — and the planner unblocks.

const seedPlayer = (id: string) => ({
  id,
  isAi: id.startsWith("ai-"),
  points: 1_000,
  manpower: 500,
  techIds: new Set<string>(),
  domainIds: new Set<string>(),
  mods: { attack: 1, defense: 1, income: 1, vision: 1 },
  techRootId: "rewrite-local",
  allies: new Set<string>(),
  strategicResources: { FOOD: 0, IRON: 0, CRYSTAL: 0, SUPPLY: 0, SHARD: 0 }
});

describe("orphaned frontier lock cleanup", () => {
  it("cleans the surviving targetKey when a later command overwrote the originKey", () => {
    let nowMs = 60_000;
    const scheduled: Array<{ delayMs: number; task: () => void }> = [];
    const runtime = new SimulationRuntime({
      now: () => nowMs,
      scheduleAfter: (delayMs, task) => {
        scheduled.push({ delayMs, task });
      },
      initialPlayers: new Map([["ai-3", seedPlayer("ai-3")]]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          { x: 10, y: 10, terrain: "LAND", ownerId: "ai-3", ownershipState: "SETTLED" },
          { x: 11, y: 10, terrain: "LAND", ownershipState: undefined },
          { x: 12, y: 10, terrain: "LAND", ownershipState: undefined }
        ],
        // Both locks share originKey "10,10" — the second `set()` during
        // hydration overwrites map["10,10"] with lockB, leaving lockA
        // visible only at "11,10".
        activeLocks: [
          {
            commandId: "lockA-expand-from-10-10",
            playerId: "ai-3",
            actionType: "EXPAND",
            originX: 10,
            originY: 10,
            targetX: 11,
            targetY: 10,
            originKey: "10,10",
            targetKey: "11,10",
            resolvesAt: 65_000,
            source: "player"
          },
          {
            commandId: "lockB-expand-from-10-10",
            playerId: "ai-3",
            actionType: "EXPAND",
            originX: 10,
            originY: 10,
            targetX: 12,
            targetY: 10,
            originKey: "10,10",
            targetKey: "12,10",
            resolvesAt: 65_000,
            source: "player"
          }
        ]
      }
    });

    const initialView = runtime.exportPlannerPlayerViews(["ai-3"])[0];
    expect(initialView?.hasActiveLock).toBe(true);

    // Advance virtual time past both resolvesAt values, then drain the
    // captured setTimeout tasks. Order matches the constructor's
    // `uniqueLocksByCommandId` walk — the precise order doesn't matter
    // for the property we're asserting.
    nowMs = 70_000;
    while (scheduled.length > 0) {
      const next = scheduled.shift();
      next?.task();
    }

    // The fix: lockA's surviving targetKey ("11,10") must be cleaned even
    // though its originKey was overwritten by lockB. Symptom of the bug
    // is that the planner stays gated.
    const afterView = runtime.exportPlannerPlayerViews(["ai-3"])[0];
    expect(afterView?.hasActiveLock).toBe(false);

    // Regression for the locksByCommandId index (PR #442): exportState's
    // activeLocks is derived from locksByCommandId, not locksByTile. On a
    // partial-mismatch resolve the retired lock must be dropped from the
    // commandId index too, or it leaks into every subsequent export.
    const exportedCommandIds = runtime.exportState().activeLocks.map((l) => l.commandId);
    expect(exportedCommandIds).not.toContain("lockA-expand-from-10-10");
    expect(exportedCommandIds).not.toContain("lockB-expand-from-10-10");
  });

  it("tickOrphanedLockSweep drops locks whose resolvesAt is well in the past", () => {
    let nowMs = 60_000;
    const runtime = new SimulationRuntime({
      now: () => nowMs,
      // Swallow scheduleAfter so the hydration timer can't preempt the sweep.
      scheduleAfter: () => {},
      initialPlayers: new Map([["ai-3", seedPlayer("ai-3")]]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          { x: 10, y: 10, terrain: "LAND", ownerId: "ai-3", ownershipState: "SETTLED" },
          { x: 11, y: 10, terrain: "LAND", ownershipState: undefined }
        ],
        activeLocks: [
          {
            commandId: "stale-lock-from-past",
            playerId: "ai-3",
            actionType: "EXPAND",
            originX: 10,
            originY: 10,
            targetX: 11,
            targetY: 10,
            originKey: "10,10",
            targetKey: "11,10",
            resolvesAt: 60_000,
            source: "player"
          }
        ]
      }
    });

    // Resolution time has not been reached + grace period yet.
    expect(runtime.tickOrphanedLockSweep(60_500)).toBe(0);
    expect(runtime.exportPlannerPlayerViews(["ai-3"])[0]?.hasActiveLock).toBe(true);

    // Now far past resolvesAt + ORPHAN_LOCK_GRACE_MS (60s).
    nowMs = 200_000;
    expect(runtime.tickOrphanedLockSweep(nowMs)).toBeGreaterThan(0);
    expect(runtime.exportPlannerPlayerViews(["ai-3"])[0]?.hasActiveLock).toBe(false);

    // Regression for the locksByCommandId index (PR #442): the sweep must
    // also evict the lock from locksByCommandId, or it persists in
    // exportState().activeLocks even though locksByTile no longer holds it.
    const exportedCommandIds = runtime.exportState().activeLocks.map((l) => l.commandId);
    expect(exportedCommandIds).not.toContain("stale-lock-from-past");
  });
});
