import { describe, expect, it } from "vitest";

import type { StoredSimulationCommand } from "../command-store/command-store.js";
import type { RecoveredSimulationState } from "../event-recovery/event-recovery.js";
import { backfillEmptiedSalvageFields } from "./salvage-field-backfill.js";

type Tile = RecoveredSimulationState["tiles"][number];

const shipment = (x: number, y: number, n: number): StoredSimulationCommand => ({
  commandId: `ship-${x}-${y}-${n}`, sessionId: "s", playerId: "player-1", clientSeq: n,
  type: "SHIP_SALVAGE_TO_COURT", payloadJson: JSON.stringify({ x, y }), queuedAt: 1_000 + n, status: "RESOLVED", resolvedAt: 1_000 + n
});
const field = (extra: Partial<Tile> = {}): Tile => ({
  x: 5, y: 287, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "PRECURSOR_SALVAGE", ...extra
});
const works = (salvageLoadsShipped: number): Tile["economicStructure"] => ({
  ownerId: "player-1", type: "RECLAMATION_WORKS", status: "active", salvageLoadsShipped
});

// Regression: fields emptied before the persisted clear (#2723) came back
// from worldgen on every restart, with no Works, ready to be stripped again.
describe("backfillEmptiedSalvageFields", () => {
  it("clears a field the log shows was shipped from but has no Works any more", () => {
    const tiles = [field()];
    const result = backfillEmptiedSalvageFields(tiles, [shipment(5, 287, 1), shipment(5, 287, 2), shipment(5, 287, 3)]);
    expect(tiles[0]).not.toHaveProperty("resource");
    expect(tiles[0]?.ownerId).toBe("player-1");
    expect(result).toEqual({ cleared: 1, worksRemoved: 0 });
  });

  it("clears the field and removes a Works rebuilt on the resurrected field", () => {
    const tiles = [field({ economicStructure: works(1) })];
    const result = backfillEmptiedSalvageFields(tiles, [1, 2, 3, 4].map((n) => shipment(5, 287, n)));
    expect(tiles[0]).not.toHaveProperty("resource");
    expect(tiles[0]).not.toHaveProperty("economicStructure");
    expect(result).toEqual({ cleared: 1, worksRemoved: 1 });
  });

  it("leaves a field being stripped normally (shipments match the Works' count)", () => {
    const tiles = [field({ economicStructure: works(2) })];
    expect(backfillEmptiedSalvageFields(tiles, [shipment(5, 287, 1), shipment(5, 287, 2)])).toEqual({ cleared: 0, worksRemoved: 0 });
    expect(tiles[0]?.resource).toBe("PRECURSOR_SALVAGE");
    expect(tiles[0]?.economicStructure?.salvageLoadsShipped).toBe(2);
  });

  it("leaves a field when retention pruned some shipments (fewer than the Works recorded)", () => {
    const tiles = [field({ economicStructure: works(2) })];
    backfillEmptiedSalvageFields(tiles, [shipment(5, 287, 2)]);
    expect(tiles[0]?.resource).toBe("PRECURSOR_SALVAGE");
  });

  it("ignores untouched fields, other resources and unparseable payloads", () => {
    const tiles = [field({ x: 9, y: 9 }), field({ resource: "IRON" })];
    const result = backfillEmptiedSalvageFields(tiles, [shipment(5, 287, 1), { ...shipment(1, 1, 1), payloadJson: "not json" }]);
    expect(tiles.map((tile) => tile.resource)).toEqual(["PRECURSOR_SALVAGE", "IRON"]);
    expect(result.cleared).toBe(0);
  });
});
