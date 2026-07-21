import { describe, expect, it } from "vitest";

import type { RecoveredSimulationState } from "../event-recovery/event-recovery.js";
import {
  SNAPSHOT_FORMAT_VERSION,
  buildWorldgenBaselineIndex,
  compactSnapshotForStorage,
  expandSnapshotFromStorage,
  isV1SnapshotPayload
} from "./snapshot-compaction.js";

const baseTile = (overrides: Partial<RecoveredSimulationState["tiles"][number]>) =>
  ({ x: 0, y: 0, terrain: "LAND" as const, ...overrides });

const baselineWorld = (): ReadonlyArray<RecoveredSimulationState["tiles"][number]> => [
  baseTile({ x: 0, y: 0, terrain: "LAND" }),
  baseTile({ x: 1, y: 0, terrain: "WATER" }),
  baseTile({ x: 2, y: 0, terrain: "LAND", resource: "IRON" }),
  // Seed-assigned ownership — a "starting tile" that AI begins with.
  baseTile({ x: 3, y: 0, terrain: "LAND", ownerId: "ai-1", ownershipState: "SETTLED" })
];

const sections = (tiles: RecoveredSimulationState["tiles"]): Parameters<typeof compactSnapshotForStorage>[0] => ({
  initialState: { tiles, activeLocks: [] },
  commandEvents: []
});

describe("compactSnapshotForStorage", () => {
  it("omits tiles that match the worldgen baseline", async () => {
    const baselineTiles = baselineWorld();
    const baseline = buildWorldgenBaselineIndex(baselineTiles);
    const compact = await compactSnapshotForStorage(sections([...baselineTiles]), baseline);
    expect(compact.formatVersion).toBe(SNAPSHOT_FORMAT_VERSION);
    expect(compact.tileOverlay).toEqual([]);
  });

  it("includes only tiles that diverge from the baseline", async () => {
    const baselineTiles = baselineWorld();
    const baseline = buildWorldgenBaselineIndex(baselineTiles);
    const compact = await compactSnapshotForStorage(
      sections([
        baseTile({ x: 0, y: 0, terrain: "LAND" }), // unchanged
        baseTile({ x: 1, y: 0, terrain: "WATER" }), // unchanged
        baseTile({ x: 2, y: 0, terrain: "LAND", resource: "IRON", ownerId: "ai-2", ownershipState: "FRONTIER" }), // gained ownership
        baseTile({ x: 3, y: 0, terrain: "LAND" }) // cleared ownership (was ai-1 in baseline)
      ]),
      baseline
    );
    expect(compact.tileOverlay).toHaveLength(2);
    const byKey = new Map(compact.tileOverlay.map((tile) => [`${tile.x},${tile.y}`, tile]));
    expect(byKey.get("2,0")).toMatchObject({ x: 2, y: 0, ownerId: "ai-2", ownershipState: "FRONTIER" });
    // Explicit null markers for fields the baseline set but the runtime cleared.
    expect(byKey.get("3,0")).toMatchObject({ x: 3, y: 0, ownerId: null, ownershipState: null });
  });

  it("strips static fields (terrain, resource) from the overlay rows", async () => {
    const baselineTiles = baselineWorld();
    const baseline = buildWorldgenBaselineIndex(baselineTiles);
    const compact = await compactSnapshotForStorage(
      sections([baseTile({ x: 2, y: 0, terrain: "LAND", resource: "IRON", ownerId: "ai-7", ownershipState: "SETTLED" })]),
      baseline
    );
    const overlay = compact.tileOverlay.find((tile) => tile.x === 2 && tile.y === 0);
    expect(overlay).toBeDefined();
    expect(overlay).not.toHaveProperty("terrain");
    expect(overlay).not.toHaveProperty("resource");
    expect(overlay).toMatchObject({ ownerId: "ai-7", ownershipState: "SETTLED" });
  });

  it("emits clear markers for baseline tiles absent from the runtime (reverse-scan fallback)", async () => {
    // Guards the steady-state fast path: compaction skips the reverse baseline
    // scan whenever the runtime covers every baseline tile. When a baseline
    // tile IS missing (x=3 dropped here), the fallback must still emit its
    // clear markers so recovery deletes the worldgen-assigned ownership.
    const baselineTiles = baselineWorld();
    const baseline = buildWorldgenBaselineIndex(baselineTiles);
    const compact = await compactSnapshotForStorage(
      sections([
        baseTile({ x: 0, y: 0, terrain: "LAND" }),
        baseTile({ x: 1, y: 0, terrain: "WATER" }),
        baseTile({ x: 2, y: 0, terrain: "LAND", resource: "IRON" })
        // x=3 (ai-1/SETTLED in baseline) omitted entirely from the runtime.
      ]),
      baseline
    );
    const cleared = compact.tileOverlay.find((tile) => tile.x === 3 && tile.y === 0);
    expect(cleared).toMatchObject({ x: 3, y: 0, ownerId: null, ownershipState: null });
  });
});

describe("expandSnapshotFromStorage", () => {
  it("returns v0 payloads unchanged", () => {
    const baselineTiles = baselineWorld();
    const v0 = {
      initialState: { tiles: [...baselineTiles], activeLocks: [] },
      commandEvents: []
    };
    expect(expandSnapshotFromStorage(v0, baselineTiles)).toEqual(v0);
  });

  it("rehydrates static fields from the worldgen baseline", async () => {
    const baselineTiles = baselineWorld();
    const baseline = buildWorldgenBaselineIndex(baselineTiles);
    const compact = await compactSnapshotForStorage(
      sections([baseTile({ x: 2, y: 0, terrain: "LAND", resource: "IRON", ownerId: "ai-7", ownershipState: "SETTLED" })]),
      baseline
    );
    const expanded = expandSnapshotFromStorage(compact, baselineTiles);
    const tile = expanded.initialState.tiles.find((t) => t.x === 2 && t.y === 0);
    expect(tile).toBeDefined();
    expect(tile).toMatchObject({
      x: 2,
      y: 0,
      terrain: "LAND",
      resource: "IRON",
      ownerId: "ai-7",
      ownershipState: "SETTLED"
    });
  });

  it("clears fields when the overlay marks them null", async () => {
    const baselineTiles = baselineWorld();
    const baseline = buildWorldgenBaselineIndex(baselineTiles);
    const compact = await compactSnapshotForStorage(
      sections([baseTile({ x: 3, y: 0, terrain: "LAND" })]), // ai-1's tile cleared
      baseline
    );
    const expanded = expandSnapshotFromStorage(compact, baselineTiles);
    const tile = expanded.initialState.tiles.find((t) => t.x === 3 && t.y === 0);
    expect(tile).toBeDefined();
    expect(tile?.ownerId).toBeUndefined();
    expect(tile?.ownershipState).toBeUndefined();
    expect(tile?.terrain).toBe("LAND");
  });

  it("round-trips structures (town, fort, observatory, etc.) via the overlay", async () => {
    const baselineTiles = baselineWorld();
    const baseline = buildWorldgenBaselineIndex(baselineTiles);
    const town = { type: "MARKET" as const, name: "Aldenstad", populationTier: "TOWN" as const, supportMax: 100, supportCurrent: 80 };
    const fort = { ownerId: "ai-7", status: "ACTIVE", type: "WOODEN" };
    const compact = await compactSnapshotForStorage(
      sections([
        baseTile({
          x: 2,
          y: 0,
          terrain: "LAND",
          resource: "IRON",
          ownerId: "ai-7",
          ownershipState: "SETTLED",
          town,
          fort
        })
      ]),
      baseline
    );
    const expanded = expandSnapshotFromStorage(compact, baselineTiles);
    const tile = expanded.initialState.tiles.find((t) => t.x === 2 && t.y === 0);
    expect(tile?.town).toEqual(town);
    expect(tile?.fort).toEqual(fort);
  });

  it("Phase 3 dormant — round-trips future unified structure field via the overlay", async () => {
    // Simulates a Phase-4 snapshot being compacted and expanded by Phase-3 code
    // (rollback scenario). The structure field must survive the round-trip intact
    // because MUTABLE_TILE_FIELDS now includes "structure".
    const baselineTiles = baselineWorld();
    const baseline = buildWorldgenBaselineIndex(baselineTiles);
    const structure = { type: "FORT", kind: "FORT", variant: "FORT", ownerId: "ai-7", status: "active" };
    const compact = await compactSnapshotForStorage(
      sections([
        baseTile({
          x: 0,
          y: 0,
          terrain: "LAND",
          ownerId: "ai-7",
          ownershipState: "SETTLED",
          structure
        })
      ]),
      baseline
    );
    expect(compact.tileOverlay.find((t) => t.x === 0 && t.y === 0)).toMatchObject({ structure });
    const expanded = expandSnapshotFromStorage(compact, baselineTiles);
    const tile = expanded.initialState.tiles.find((t) => t.x === 0 && t.y === 0);
    expect(tile?.structure).toEqual(structure);
  });
});

describe("isV1SnapshotPayload", () => {
  it("returns true only when formatVersion matches the constant", () => {
    expect(isV1SnapshotPayload({ formatVersion: SNAPSHOT_FORMAT_VERSION, tileOverlay: [], activeLocks: [], commandEvents: [] })).toBe(true);
    expect(isV1SnapshotPayload({ formatVersion: 0 })).toBe(false);
    expect(isV1SnapshotPayload(undefined)).toBe(false);
    expect(isV1SnapshotPayload({ initialState: { tiles: [], activeLocks: [] }, commandEvents: [] })).toBe(false);
  });
});
