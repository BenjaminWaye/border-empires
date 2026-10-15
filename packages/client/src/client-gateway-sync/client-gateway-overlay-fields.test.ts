import { describe, expect, it } from "vitest";
import { TILE_OVERLAY_WIRE_FIELDS } from "@border-empires/sim-protocol";

import { GATEWAY_OVERLAY_JSON_FIELDS, hasGatewayOverlayField, normalizeGatewayTileUpdate } from "./client-gateway-sync.js";

const normalize = (update: Record<string, unknown>) =>
  normalizeGatewayTileUpdate({ x: 1, y: 2, ...update }, {
    existing: undefined,
    tiles: new Map(),
    keyFor: (x, y) => `${x},${y}`,
    foodCoverage: undefined
  }) as Record<string, unknown>;

// The client keeps its own overlay parser table (it does not import
// sim-protocol at build time), so this is what ties it to the server's
// TILE_OVERLAY_WIRE_FIELDS: a new overlay row fails here until the client
// knows how to parse it -- otherwise the server sends it and nothing renders.
describe("gateway overlay fields", () => {
  it("parses exactly the overlays the server sends", () => {
    expect([...GATEWAY_OVERLAY_JSON_FIELDS].sort()).toEqual(TILE_OVERLAY_WIRE_FIELDS.map((field) => field.camel).sort());
  });

  it.each(TILE_OVERLAY_WIRE_FIELDS)("routes and parses $camel into $key", ({ key, camel }) => {
    const value = { ownerId: "p1", status: "active" };
    expect(hasGatewayOverlayField({ x: 1, y: 2, [camel]: JSON.stringify(value) })).toBe(true);
    expect(normalize({ [camel]: JSON.stringify(value) })[key]).toEqual(value);
  });

  it.each(TILE_OVERLAY_WIRE_FIELDS)("treats an empty $camel as an explicit clear of $key", ({ key, camel }) => {
    const normalized = normalize({ [camel]: "" });
    expect(key in normalized).toBe(true);
    expect(normalized[key]).toBeUndefined();
  });

  it("leaves untouched overlays out", () => {
    expect(hasGatewayOverlayField({ x: 1, y: 2, ownerId: "p1" })).toBe(false);
    const normalized = normalize({ ownerId: "p1" });
    for (const { key } of TILE_OVERLAY_WIRE_FIELDS) expect(key in normalized).toBe(false);
  });
});
