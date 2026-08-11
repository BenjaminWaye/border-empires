import { describe, expect, it } from "vitest";

import { migrateLegacyStructureKinds } from "./legacy-structure-kind-migration.js";
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
    const marketTile = tile({ economicStructure: { ownerId: "player-1", type: "MARKET", status: "active" } });
    const emptyTile = tile();
    const tiles = [relayTile, marketTile, emptyTile];

    const migrated = migrateLegacyStructureKinds(tiles);

    expect(migrated).toBe(0);
    expect(tiles).toEqual([relayTile, marketTile, emptyTile]);
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
