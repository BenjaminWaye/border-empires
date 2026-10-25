import { describe, expect, it } from "vitest";
import { normalizeGatewayTileUpdate } from "../client-gateway-sync/client-gateway-sync.js";
import { buildDistrictNetwork } from "./district-network.js";
import { districtFixture } from "./district-fixtures.js";

describe("district JSON compatibility at the real client wire boundary", () => {
  it.each(["economicStructure", "observatory"] as const)("preserves and clears %s anchors across updates and older-server payloads", field => {
    const { tiles, building } = districtFixture(field === "observatory" ? "OBSERVATORY" : "MANUFACTORY");
    const record = building[field]!;
    const wireField = field === "observatory" ? "observatoryJson" : "economicStructureJson";
    const parse = (value: object) => normalizeGatewayTileUpdate({ x: building.x, y: building.y, [wireField]: JSON.stringify(value) }, { existing: building, tiles, keyFor: (x, y) => `${x},${y}`, foodCoverage: 1 });
    const first = parse(record);
    expect(first[field]?.supportAnchor).toEqual({ x: 100, y: 100 });
    Object.assign(building, first);
    const network = () => buildDistrictNetwork({ tiles, visibilityAt: () => "visible" }, [building]);
    expect(network().length > 0).toBe(field === "economicStructure");
    Object.assign(building, parse({ ...record, supportAnchor: null }));
    expect(network()).toEqual([]);
    const { supportAnchor: _anchor, ...olderRecord } = record;
    Object.assign(building, parse(olderRecord));
    expect(building[field]).not.toHaveProperty("supportAnchor");
    expect(network()).toEqual([]);
    Object.assign(building, parse(record));
    expect(network().length > 0).toBe(field === "economicStructure");
  });
});
