import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import { createResourceSlotSourceCollector } from "@border-empires/shared";
import { resourceSlotSupplyForPlayer } from "../resource-slot-view/resource-slot-view.js";
import { refinerySlotBonusesForPlayer } from "./refinery-slot-supply.js";
import { fieldAt, keyAt, P1, P2, place, refineryTestMap } from "./refinery-test-map.js";

// Town at (0,1); its ring (radius 1) is columns 0-1, rows 0-2.
// Titanium field: (3,1) and (4,1) garrisoned, (5,1) frontier.
const baseRows = [
  "......",
  "T..ttr",
  "......"
];

const titaniumSupply = (tiles: Map<string, DomainTileState>, ownerId = P1) => {
  const settled = [...tiles.values()].filter((tile) => tile.ownerId === ownerId && tile.ownershipState === "SETTLED");
  const { sink, rows } = createResourceSlotSourceCollector();
  const totals = resourceSlotSupplyForPlayer(settled, new Set(), refinerySlotBonusesForPlayer(tiles, settled), undefined, 0, sink);
  return { titanium: totals.TITANIUM, rows: rows().TITANIUM };
};

describe("town refinery slot supply", () => {
  it("adds +2 per garrisoned field tile, nothing for the frontier tile, and labels the source", () => {
    const tiles = refineryTestMap(baseRows);
    expect(titaniumSupply(tiles).titanium).toBe(2);
    place(tiles, 1, 2, { type: "TITANIUM_REFINERY", status: "active", refineryField: fieldAt(3, 1) });
    const { titanium, rows } = titaniumSupply(tiles);
    expect(titanium).toBe(2 + 2 * 2);
    expect(rows).toEqual(expect.arrayContaining([{ kind: "STRUCTURE_BOOST", id: "TITANIUM_REFINERY", slots: 4, count: 2 }]));
  });

  it("gives +3 per tile while the town has an active Titanium Smelter", () => {
    const tiles = refineryTestMap(baseRows);
    place(tiles, 1, 2, { type: "TITANIUM_REFINERY", status: "active", refineryField: fieldAt(3, 1) });
    place(tiles, 1, 0, { type: "TITANIUM_SMELTER", status: "active" });
    const { titanium, rows } = titaniumSupply(tiles);
    expect(titanium).toBe(2 + 2 * 3);
    expect(rows).toEqual(expect.arrayContaining([{ kind: "STRUCTURE_BOOST", id: "TITANIUM_SMELTER", slots: 2, count: 2 }]));
  });

  it("gives base slots only while the field is unlinked", () => {
    const tiles = refineryTestMap([
      "..~...",
      "T.~ttr",
      "..~..."
    ]);
    place(tiles, 1, 2, { type: "TITANIUM_REFINERY", status: "active", refineryField: fieldAt(3, 1) });
    expect(titaniumSupply(tiles).titanium).toBe(2);
  });

  it("gives nothing while inactive or unfinished", () => {
    for (const status of ["inactive", "under_construction"] as const) {
      const tiles = refineryTestMap(baseRows);
      place(tiles, 1, 2, { type: "TITANIUM_REFINERY", status, refineryField: fieldAt(3, 1) });
      expect(titaniumSupply(tiles).titanium).toBe(2);
    }
  });

  it("gives nothing to either player once another player holds the refinery tile", () => {
    const tiles = refineryTestMap(baseRows);
    const refinery = place(tiles, 1, 2, { type: "TITANIUM_REFINERY", status: "active", refineryField: fieldAt(3, 1) });
    // Tile captured but the structure record not yet handed over.
    tiles.set(keyAt(1, 2), { ...refinery, ownerId: P2 });
    expect(titaniumSupply(tiles).titanium).toBe(2);
    // Captured with the record: the new owner has no town there.
    tiles.set(keyAt(1, 2), { ...refinery, ownerId: P2, economicStructure: { ...refinery.economicStructure!, ownerId: P2 } });
    expect(titaniumSupply(tiles).titanium).toBe(2);
    expect(titaniumSupply(tiles, P2).titanium).toBe(0);
  });

  it("stops when the town is lost", () => {
    const tiles = refineryTestMap(baseRows);
    place(tiles, 1, 2, { type: "TITANIUM_REFINERY", status: "active", refineryField: fieldAt(3, 1) });
    const town = tiles.get(keyAt(0, 1))!;
    tiles.set(keyAt(0, 1), { ...town, ownerId: P2 });
    expect(titaniumSupply(tiles).titanium).toBe(2);
  });

  it("lets the older of two refineries on one field work; the field is counted once", () => {
    const tiles = refineryTestMap(baseRows);
    place(tiles, 1, 2, { type: "TITANIUM_REFINERY", status: "active", refineryField: fieldAt(4, 1, 50) });
    place(tiles, 1, 0, { type: "TITANIUM_REFINERY", status: "active", refineryField: fieldAt(3, 1, 10) });
    expect(titaniumSupply(tiles).titanium).toBe(2 + 2 * 2);
  });
});
