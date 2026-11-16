import { describe, expect, it } from "vitest";
import { districtOverlayProjection } from "../town-district/town-district-projection.js";
import { fieldAt, keyAt, place, refineryTestMap } from "./refinery-test-map.js";

const rows = [
  "......",
  "T..ttr",
  "......"
];
const projected = (viewerId: string | undefined, withField = true) => {
  const tiles = refineryTestMap(rows);
  const refinery = place(tiles, 1, 2, { type: "TITANIUM_REFINERY", status: "active", ...(withField ? { refineryField: fieldAt(3, 1, 7) } : {}) });
  const json = districtOverlayProjection(tiles, refinery, () => true, viewerId).economicStructureJson!;
  return JSON.parse(json) as Record<string, unknown>;
};

describe("refinery wire status", () => {
  it("gives the owner the field, link and processed-tile count, plus the stored assignment", () => {
    const record = projected("p1");
    expect(record.refinery).toEqual({ fieldX: 23, fieldY: 21, linked: true, processedTiles: 2 });
    expect(record.refineryField).toEqual({ x: 23, y: 21, assignedAt: 7 });
    expect(record.supportAnchor).toEqual({ x: 20, y: 21 });
  });

  it("gives other viewers only whether it is linked", () => {
    for (const viewer of ["p2", undefined]) {
      const record = projected(viewer);
      expect(record.refinery).toEqual({ linked: true });
      expect(record.refineryField).toBeUndefined();
    }
  });

  it("marks a refinery with no field as unassigned for its owner", () => {
    expect(projected("p1", false).refinery).toEqual({ unassigned: true });
    expect(projected("p2", false).refinery).toEqual({ linked: false });
  });

  it("adds nothing to other structures", () => {
    const tiles = refineryTestMap(rows);
    const manufactory = place(tiles, 1, 2, { type: "MANUFACTORY", status: "active" });
    expect(JSON.parse(districtOverlayProjection(tiles, manufactory, () => true, "p1").economicStructureJson!)).toEqual({
      ownerId: "p1", type: "MANUFACTORY", status: "active", supportAnchor: { x: 20, y: 21 }
    });
    expect(keyAt(1, 2)).toBe("21,22");
  });
});
