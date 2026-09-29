import { describe, expect, it } from "vitest";

import { migrateLegacyPalisades, migrateLegacyStructureKinds } from "./legacy-structure-kind-migration.js";
import type { RecoveredSimulationState } from "./event-recovery/event-recovery.js";

type Tile = RecoveredSimulationState["tiles"][number];

const tile = (overrides: Partial<Tile> = {}): Tile => ({
  x: 0,
  y: 0,
  terrain: "LAND",
  ...overrides
});

describe("migrateLegacyStructureKinds", () => {
  it("rewrites tile.economicStructure.type LIGHT_OUTPOST to RELAY_BEACON", () => {
    const tiles = [
      tile({
        economicStructure: { ownerId: "player-1", type: "LIGHT_OUTPOST" as never, status: "active" }
      })
    ];

    const migrated = migrateLegacyStructureKinds(tiles);

    expect(migrated).toBe(1);
    expect(tiles[0]!.economicStructure).toEqual({ ownerId: "player-1", type: "RELAY_BEACON", status: "active" });
  });

  it("rewrites tile.economicStructure.type MARKET to MINTWORKS", () => {
    const tiles = [
      tile({
        economicStructure: { ownerId: "player-1", type: "MARKET" as never, status: "active" }
      })
    ];

    const migrated = migrateLegacyStructureKinds(tiles);

    expect(migrated).toBe(1);
    expect(tiles[0]!.economicStructure).toEqual({ ownerId: "player-1", type: "MINTWORKS", status: "active" });
  });

  it("rewrites tile.economicStructure.type SEED_GRANARY to GRANARY", () => {
    const tiles = [
      tile({
        economicStructure: { ownerId: "player-1", type: "SEED_GRANARY" as never, status: "active" }
      })
    ];

    const migrated = migrateLegacyStructureKinds(tiles);

    expect(migrated).toBe(1);
    expect(tiles[0]!.economicStructure).toEqual({ ownerId: "player-1", type: "GRANARY", status: "active" });
  });

  it("preserves the rest of the economicStructure fields", () => {
    const tiles = [
      tile({
        economicStructure: {
          ownerId: "player-2",
          type: "LIGHT_OUTPOST" as never,
          status: "under_construction",
          completesAt: 12_345,
          activatedAt: 1_000
        }
      })
    ];

    migrateLegacyStructureKinds(tiles);

    expect(tiles[0]!.economicStructure).toEqual({
      ownerId: "player-2",
      type: "RELAY_BEACON",
      status: "under_construction",
      completesAt: 12_345,
      activatedAt: 1_000
    });
  });

  it("leaves already-migrated and unaffected tiles untouched", () => {
    const relayTile = tile({ economicStructure: { ownerId: "player-1", type: "RELAY_BEACON", status: "active" } });
    const mintworksTile = tile({ economicStructure: { ownerId: "player-1", type: "MINTWORKS", status: "active" } });
    const emptyTile = tile();
    const tiles = [relayTile, mintworksTile, emptyTile];

    const migrated = migrateLegacyStructureKinds(tiles);

    expect(migrated).toBe(0);
    expect(tiles).toEqual([relayTile, mintworksTile, emptyTile]);
  });

  it("is idempotent — a second pass over already-migrated tiles is a no-op", () => {
    const tiles = [tile({ economicStructure: { ownerId: "player-1", type: "LIGHT_OUTPOST" as never, status: "active" } })];

    migrateLegacyStructureKinds(tiles);
    const secondPass = migrateLegacyStructureKinds(tiles);

    expect(secondPass).toBe(0);
  });

  it("migrates only the affected tiles across a mixed batch", () => {
    const tiles = [
      tile({ x: 1, economicStructure: { ownerId: "player-1", type: "LIGHT_OUTPOST" as never, status: "active" } }),
      tile({ x: 2, economicStructure: { ownerId: "player-1", type: "RELAY_BEACON", status: "active" } }),
      tile({ x: 3, economicStructure: { ownerId: "player-1", type: "LIGHT_OUTPOST" as never, status: "inactive" } }),
      tile({ x: 4 })
    ];

    const migrated = migrateLegacyStructureKinds(tiles);

    expect(migrated).toBe(2);
    expect(tiles[0]!.economicStructure!.type).toBe("RELAY_BEACON");
    expect(tiles[2]!.economicStructure!.type).toBe("RELAY_BEACON");
  });
});

describe("migrateLegacyPalisades", () => {
  it("moves a Palisade out of economicStructure into the fort slot", () => {
    const tiles = [
      tile({ economicStructure: { ownerId: "player-1", type: "WOODEN_FORT", status: "active", activatedAt: 500, disabledUntil: 900 } })
    ];

    const result = migrateLegacyPalisades(tiles);

    expect(result).toEqual({ moved: 1, mergedIntoUpgrade: 0, droppedUnderFort: 0, reactivated: 0 });
    expect(tiles[0]!.economicStructure).toBeUndefined();
    expect(tiles[0]!.fort).toEqual({ ownerId: "player-1", variant: "WOODEN_FORT", status: "active", activatedAt: 500, disabledUntil: 900 });
  });

  it("carries construction and removal timers over", () => {
    const tiles = [
      tile({ x: 1, economicStructure: { ownerId: "player-1", type: "WOODEN_FORT", status: "under_construction", completesAt: 7_000 } }),
      tile({ x: 2, economicStructure: { ownerId: "player-1", type: "WOODEN_FORT", status: "removing", previousStatus: "inactive", completesAt: 8_000 } })
    ];

    migrateLegacyPalisades(tiles);

    expect(tiles[0]!.fort).toEqual({ ownerId: "player-1", variant: "WOODEN_FORT", status: "under_construction", completesAt: 7_000 });
    expect(tiles[1]!.fort).toEqual({ ownerId: "player-1", variant: "WOODEN_FORT", status: "removing", previousStatus: "active", completesAt: 8_000 });
  });

  it("reactivates a manually-deactivated Palisade (forts have no inactive state)", () => {
    const tiles = [tile({ economicStructure: { ownerId: "player-1", type: "WOODEN_FORT", status: "inactive", inactiveReason: "manual" } })];

    const result = migrateLegacyPalisades(tiles);

    expect(result.reactivated).toBe(1);
    expect(tiles[0]!.fort).toEqual({ ownerId: "player-1", variant: "WOODEN_FORT", status: "active" });
  });

  it("folds a Palisade under an in-flight Fort upgrade into upgradingFrom so it keeps defending", () => {
    const tiles = [
      tile({
        fort: { ownerId: "player-1", status: "under_construction", variant: "FORT", completesAt: 9_000 },
        economicStructure: { ownerId: "player-1", type: "WOODEN_FORT", status: "active" }
      })
    ];

    const result = migrateLegacyPalisades(tiles);

    expect(result).toEqual({ moved: 0, mergedIntoUpgrade: 1, droppedUnderFort: 0, reactivated: 0 });
    expect(tiles[0]!.economicStructure).toBeUndefined();
    expect(tiles[0]!.fort).toEqual({ ownerId: "player-1", status: "under_construction", variant: "FORT", completesAt: 9_000, upgradingFrom: "WOODEN_FORT" });
  });

  it("drops a Palisade that sits under a standing fort", () => {
    const tiles = [
      tile({
        fort: { ownerId: "player-1", status: "active", variant: "FORT" },
        economicStructure: { ownerId: "player-1", type: "WOODEN_FORT", status: "active" }
      })
    ];

    const result = migrateLegacyPalisades(tiles);

    expect(result.droppedUnderFort).toBe(1);
    expect(tiles[0]!.economicStructure).toBeUndefined();
    expect(tiles[0]!.fort).toEqual({ ownerId: "player-1", status: "active", variant: "FORT" });
  });

  it("leaves Relay Beacons and other economic structures alone, and is idempotent", () => {
    const beacon = tile({ x: 1, economicStructure: { ownerId: "player-1", type: "RELAY_BEACON", status: "active" } });
    const palisade = tile({ x: 2, economicStructure: { ownerId: "player-1", type: "WOODEN_FORT", status: "active" } });
    const tiles = [beacon, palisade];

    migrateLegacyPalisades(tiles);
    const secondPass = migrateLegacyPalisades(tiles);

    expect(tiles[0]!.economicStructure).toEqual({ ownerId: "player-1", type: "RELAY_BEACON", status: "active" });
    expect(secondPass).toEqual({ moved: 0, mergedIntoUpgrade: 0, droppedUnderFort: 0, reactivated: 0 });
  });
});
