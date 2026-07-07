import { describe, expect, it } from "vitest";
import { loadSync } from "@grpc/proto-loader";
import { fileURLToPath } from "node:url";

import { normalizeProtoTile } from "../sim-client/sim-client.js";

// ---------------------------------------------------------------------------
// Tile-delta wire-parity safety net.
//
// Background: a `TileDelta` field (frontier_decay_kind) was added to the
// simulation emit code and to the gateway/client normalizers, but NOT to the
// proto schema. Protobuf silently drops any object key that isn't declared in
// the schema, so the field vanished on the wire on every path and the decay
// warning never reached the client.
//
// This test is the loud safety net for that entire class of mistake. There is
// ONE place to register a tile field: TILE_FIELD_SPECS below. When you add a
// field to the tile overview, add it here too. The test then proves:
//   1. (schema parity) the proto's TileDelta declares exactly the registered
//      fields — no field is in the emit contract but missing from the wire
//      schema (the original bug), and no proto field is left unregistered.
//   2. (wire round-trip) a fully-populated tile survives proto
//      serialize/deserialize on all three tile-bearing messages
//      (SubscribePlayerAck, FetchTileDetailAck, SimulationEvent) — the three
//      sim emit paths.
//   3. (client normalize) every field survives the gateway's
//      normalizeProtoTile into its camelCase client shape.
// ---------------------------------------------------------------------------

const packageDefinition = loadSync(
  fileURLToPath(new URL("../../../../packages/sim-protocol/src/simulation.proto", import.meta.url)),
  { keepCase: true, longs: Number, defaults: true, enums: String, oneofs: false }
);

type MessageCodec = {
  serialize: (value: Record<string, unknown>) => Buffer;
  deserialize: (bytes: Buffer) => Record<string, unknown>;
  type?: { field?: Array<{ name: string }> };
};

const codecFor = (name: string): MessageCodec => {
  const entry = packageDefinition[`border_empires.simulation.${name}`] as unknown as MessageCodec | undefined;
  if (!entry?.serialize || !entry?.deserialize) {
    throw new Error(`Missing proto codec for ${name}`);
  }
  return entry;
};

const tileDeltaCodec = codecFor("TileDelta");

const roundTripTileDelta = (tile: Record<string, unknown>): Record<string, unknown> =>
  tileDeltaCodec.deserialize(tileDeltaCodec.serialize(tile));

// The single source of truth for every TileDelta field on the wire.
// protoField: snake_case name declared in simulation.proto.
// wireValue:  the value the simulation emits over the wire (snake_case shape).
// camelField: the key normalizeProtoTile produces for the client.
// normalized: the expected client-side value after normalizeProtoTile.
type TileFieldSpec = {
  protoField: string;
  wireValue: string | number | boolean;
  camelField: string;
  normalized: unknown;
  // True for proto3 `optional string` fields carrying clear-vs-unchanged
  // semantics (fort/observatory/siege/economic/sabotage/shard/muster/town
  // JSON blobs). These must round-trip "field omitted" as genuinely absent
  // (sparse delta = "unchanged") while still preserving an explicit "" as a
  // real clear signal -- see presenceSensitiveFields tests below.
  presenceSensitive?: boolean;
};

const TILE_FIELD_SPECS: TileFieldSpec[] = [
  { protoField: "x", wireValue: 403, camelField: "x", normalized: 403 },
  { protoField: "y", wireValue: 163, camelField: "y", normalized: 163 },
  { protoField: "owner_id", wireValue: "player-sentinel", camelField: "ownerId", normalized: "player-sentinel" },
  { protoField: "ownership_state", wireValue: "FRONTIER", camelField: "ownershipState", normalized: "FRONTIER" },
  { protoField: "terrain", wireValue: "LAND", camelField: "terrain", normalized: "LAND" },
  { protoField: "resource", wireValue: "IRON", camelField: "resource", normalized: "IRON" },
  { protoField: "town_type", wireValue: "MARKET", camelField: "townType", normalized: "MARKET" },
  { protoField: "town_name", wireValue: "Sentinel City", camelField: "townName", normalized: "Sentinel City" },
  { protoField: "town_population_tier", wireValue: "CITY", camelField: "townPopulationTier", normalized: "CITY" },
  { protoField: "dock_id", wireValue: "dock-sentinel", camelField: "dockId", normalized: "dock-sentinel" },
  { protoField: "town_json", wireValue: "{\"town\":1}", camelField: "townJson", normalized: "{\"town\":1}", presenceSensitive: true },
  { protoField: "fort_json", wireValue: "{\"fort\":1}", camelField: "fortJson", normalized: "{\"fort\":1}", presenceSensitive: true },
  { protoField: "observatory_json", wireValue: "{\"obs\":1}", camelField: "observatoryJson", normalized: "{\"obs\":1}", presenceSensitive: true },
  { protoField: "siege_outpost_json", wireValue: "{\"siege\":1}", camelField: "siegeOutpostJson", normalized: "{\"siege\":1}", presenceSensitive: true },
  { protoField: "economic_structure_json", wireValue: "{\"econ\":1}", camelField: "economicStructureJson", normalized: "{\"econ\":1}", presenceSensitive: true },
  { protoField: "sabotage_json", wireValue: "{\"sab\":1}", camelField: "sabotageJson", normalized: "{\"sab\":1}", presenceSensitive: true },
  { protoField: "shard_site_json", wireValue: "{\"shard\":1}", camelField: "shardSiteJson", normalized: "{\"shard\":1}", presenceSensitive: true },
  { protoField: "muster_json", wireValue: "{\"ownerId\":\"p1\",\"amount\":5,\"mode\":\"HOLD\",\"updatedAt\":1000}", camelField: "musterJson", normalized: "{\"ownerId\":\"p1\",\"amount\":5,\"mode\":\"HOLD\",\"updatedAt\":1000}", presenceSensitive: true },
  { protoField: "yield_json", wireValue: "{\"gold\":5}", camelField: "yield", normalized: { gold: 5 } },
  { protoField: "yield_rate_json", wireValue: "{\"goldPerMinute\":2}", camelField: "yieldRate", normalized: { goldPerMinute: 2 } },
  { protoField: "yield_cap_json", wireValue: "{\"gold\":100,\"strategicEach\":50}", camelField: "yieldCap", normalized: { gold: 100, strategicEach: 50 } },
  { protoField: "frontier_decay_at", wireValue: 1_893_456_000_000, camelField: "frontierDecayAt", normalized: 1_893_456_000_000 },
  { protoField: "frontier_decay_kind", wireValue: "NATURAL", camelField: "frontierDecayKind", normalized: "NATURAL" },
  { protoField: "ownership_clear_only", wireValue: true, camelField: "ownershipClearOnly", normalized: true }
];

const fullyPopulatedTile = (): Record<string, unknown> =>
  Object.fromEntries(TILE_FIELD_SPECS.map((spec) => [spec.protoField, spec.wireValue]));

describe("TileDelta wire parity", () => {
  it("proto schema declares exactly the registered tile fields", () => {
    const protoFields = new Set((tileDeltaCodec.type?.field ?? []).map((field) => field.name));
    const registeredFields = new Set(TILE_FIELD_SPECS.map((spec) => spec.protoField));

    const missingFromProto = [...registeredFields].filter((name) => !protoFields.has(name));
    const unregistered = [...protoFields].filter((name) => !registeredFields.has(name));

    // missingFromProto would have caught the original frontier_decay_kind bug:
    // the field was registered/emitted but absent from the proto schema.
    expect(
      missingFromProto,
      `Tile fields registered in TILE_FIELD_SPECS but missing from simulation.proto TileDelta: ${missingFromProto.join(", ")}`
    ).toEqual([]);
    expect(
      unregistered,
      `Proto TileDelta fields not registered in TILE_FIELD_SPECS (add them so the wire-parity net covers them): ${unregistered.join(", ")}`
    ).toEqual([]);
  });

  it("every field survives a bare TileDelta proto round-trip", () => {
    const decoded = roundTripTileDelta(fullyPopulatedTile());
    for (const spec of TILE_FIELD_SPECS) {
      expect(decoded[spec.protoField], `proto dropped field ${spec.protoField} on the wire`).toEqual(spec.wireValue);
    }
  });

  it.each([
    ["SubscribePlayerAck", "tiles"],
    ["FetchTileDetailAck", "tiles"],
    ["SimulationEvent", "tile_deltas"]
  ] as const)("every field survives inside %s.%s", (messageName, tileField) => {
    const codec = codecFor(messageName);
    const decoded = codec.deserialize(codec.serialize({ [tileField]: [fullyPopulatedTile()] }));
    const tiles = decoded[tileField] as Array<Record<string, unknown>>;
    expect(tiles).toHaveLength(1);
    for (const spec of TILE_FIELD_SPECS) {
      expect(tiles[0][spec.protoField], `${messageName}.${tileField} dropped field ${spec.protoField}`).toEqual(spec.wireValue);
    }
  });

  it("every field survives the gateway client normalize", () => {
    const decoded = roundTripTileDelta(fullyPopulatedTile());
    const normalized = normalizeProtoTile(decoded as never) as Record<string, unknown>;
    for (const spec of TILE_FIELD_SPECS) {
      expect(normalized[spec.camelField], `normalizeProtoTile dropped field ${spec.camelField}`).toEqual(spec.normalized);
    }
  });

  // Regression net for the bug fixed alongside marking these fields
  // `optional` in the proto: without field presence, a sim delta that never
  // touched e.g. fort_json/muster_json decoded as present-empty (proto3
  // fills unset scalars with "" on the wire), which normalizeProtoTile and
  // the client both read as "the sim explicitly cleared this" -- wiping
  // real forts/musters/towns off tiles that showed up in an unrelated delta.
  // `optional` gives real wire presence, so these two tests must both hold:
  // omission stays invisible to the client, and an explicit "" still clears.
  const presenceSensitiveFields = TILE_FIELD_SPECS.filter((spec) => spec.presenceSensitive);

  it.each(presenceSensitiveFields)(
    "omitting $protoField from the sim delta leaves it absent on the wire and in normalize (sparse = unchanged)",
    (spec) => {
      const tile = { x: 1, y: 1 };
      const decoded = roundTripTileDelta(tile);
      expect(decoded[spec.protoField], `${spec.protoField} should be absent, not defaulted to ""`).toBeUndefined();
      expect(spec.protoField in decoded, `${spec.protoField} key should not appear in the decoded object at all`).toBe(false);

      const normalized = normalizeProtoTile(decoded as never) as Record<string, unknown>;
      expect(
        spec.camelField in normalized,
        `normalizeProtoTile should not set ${spec.camelField} when the sim never touched it`
      ).toBe(false);
    }
  );

  it.each(presenceSensitiveFields)(
    "explicitly clearing $protoField to \"\" still survives as a real clear signal",
    (spec) => {
      const tile = { x: 1, y: 1, [spec.protoField]: "" };
      const decoded = roundTripTileDelta(tile);
      expect(decoded[spec.protoField], `${spec.protoField} should survive as an explicit empty string`).toBe("");

      const normalized = normalizeProtoTile(decoded as never) as Record<string, unknown>;
      expect(spec.camelField in normalized, `normalizeProtoTile should still report ${spec.camelField} as present`).toBe(true);
      expect(normalized[spec.camelField], `normalizeProtoTile should normalize an explicit clear to undefined`).toBeUndefined();
    }
  );
});
