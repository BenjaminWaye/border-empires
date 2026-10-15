import { describe, expect, it } from "vitest";
import { TILE_OVERLAY_WIRE_FIELDS } from "@border-empires/sim-protocol";

import { jsonSafeTileDeltaBatch } from "../gateway-bootstrap-helpers/gateway-bootstrap-helpers.js";
import { normalizeProtoTile, type ProtoTileDelta } from "./sim-client-tile-normalize.js";

// Every overlay in the shared wire table must survive the gRPC decode and the
// JSON clear-signaling, with no per-field code in the gateway: adding a row to
// TILE_OVERLAY_WIRE_FIELDS is enough.
describe("overlay fields across the gateway", () => {
  it.each(TILE_OVERLAY_WIRE_FIELDS)("normalizes proto $snake into $camel", ({ snake, camel }) => {
    const value = JSON.stringify({ ownerId: "p1" });
    expect(normalizeProtoTile({ x: 1, y: 2, [snake]: value } as ProtoTileDelta)[camel]).toBe(value);
    expect(normalizeProtoTile({ x: 1, y: 2, [camel]: value } as ProtoTileDelta)[camel]).toBe(value);
  });

  it.each(TILE_OVERLAY_WIRE_FIELDS)("keeps a proto-cleared $snake as a present-but-undefined $camel", ({ snake, camel }) => {
    const normalized = normalizeProtoTile({ x: 1, y: 2, [snake]: "" } as ProtoTileDelta);
    expect(camel in normalized).toBe(true);
    expect(normalized[camel]).toBeUndefined();
  });

  it("leaves untouched overlays absent", () => {
    const normalized = normalizeProtoTile({ x: 1, y: 2 });
    for (const { camel } of TILE_OVERLAY_WIRE_FIELDS) expect(camel in normalized).toBe(false);
  });

  it.each(TILE_OVERLAY_WIRE_FIELDS)("sends a cleared $camel to clients as an empty string", ({ camel }) => {
    const [json] = jsonSafeTileDeltaBatch([{ x: 1, y: 2, [camel]: undefined }]);
    expect(json?.[camel]).toBe("");
  });
});
