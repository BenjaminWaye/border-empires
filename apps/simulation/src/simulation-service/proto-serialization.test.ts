import { describe, expect, it } from "vitest";

import type { SimulationEvent } from "@border-empires/sim-protocol";
import { toFullSnapshotProtoTile, toProtoEvent } from "./proto-serialization.js";

describe("toProtoEvent — ownershipClearOnly marker", () => {
  it("emits ownership_clear_only in BOTH the snake_case proto array and the camelCase array when set", () => {
    // Regression: the field type existed on ProtoSimulationEvent but the
    // toProtoEvent mapping never wrote it, so the sim silently stripped the
    // flag and the client never learned a delta was a broadcast-only clear.
    const event = {
      eventType: "TILE_DELTA_BATCH",
      commandId: "cmd-1",
      playerId: "player-1",
      tileDeltas: [{ x: 49, y: 288, ownerId: undefined, ownershipState: undefined, ownershipClearOnly: true }]
    } as unknown as SimulationEvent;

    const proto = toProtoEvent(event);

    expect(proto.tile_deltas?.[0]?.ownership_clear_only).toBe(true);
    expect(proto.tileDeltas?.[0]?.ownershipClearOnly).toBe(true);
  });

  it("omits ownership_clear_only for a normal delta so proto3 default (false) applies", () => {
    const event = {
      eventType: "TILE_DELTA_BATCH",
      commandId: "cmd-2",
      playerId: "player-1",
      tileDeltas: [{ x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" }]
    } as unknown as SimulationEvent;

    const proto = toProtoEvent(event);

    expect(proto.tile_deltas?.[0]).not.toHaveProperty("ownership_clear_only");
    expect(proto.tileDeltas?.[0]).not.toHaveProperty("ownershipClearOnly");
  });
});

describe("toProtoEvent — reachOwnerId", () => {
  it("forwards reachOwnerId in both snake_case and camelCase arrays when present", () => {
    const event = {
      eventType: "TILE_DELTA_BATCH",
      commandId: "cmd-1",
      playerId: "player-1",
      tileDeltas: [{ x: 5, y: 5, reachOwnerId: "player-2" }]
    } as unknown as SimulationEvent;

    const proto = toProtoEvent(event);

    expect(proto.tile_deltas?.[0]?.reach_owner_id).toBe("player-2");
    expect(proto.tileDeltas?.[0]?.reachOwnerId).toBe("player-2");
  });

  it("emits an explicit clear (empty string / null) when reachOwnerId key is present but undefined, distinct from omitting the key entirely", () => {
    const cleared = {
      eventType: "TILE_DELTA_BATCH",
      commandId: "cmd-2",
      playerId: "player-1",
      tileDeltas: [{ x: 5, y: 5, reachOwnerId: undefined }]
    } as unknown as SimulationEvent;
    const untouched = {
      eventType: "TILE_DELTA_BATCH",
      commandId: "cmd-3",
      playerId: "player-1",
      tileDeltas: [{ x: 5, y: 5 }]
    } as unknown as SimulationEvent;

    const clearedProto = toProtoEvent(cleared);
    const untouchedProto = toProtoEvent(untouched);

    expect(clearedProto.tile_deltas?.[0]?.reach_owner_id).toBe("");
    expect(clearedProto.tileDeltas?.[0]?.reachOwnerId).toBeNull();
    expect(untouchedProto.tile_deltas?.[0]).not.toHaveProperty("reach_owner_id");
    expect(untouchedProto.tileDeltas?.[0]).not.toHaveProperty("reachOwnerId");
  });

  it("toFullSnapshotProtoTile forwards reachOwnerId with the truthy-guard (full-snapshot) convention", () => {
    const withReach = toFullSnapshotProtoTile({ x: 1, y: 1, reachOwnerId: "player-1" });
    const withoutReach = toFullSnapshotProtoTile({ x: 1, y: 1 });

    expect(withReach.reach_owner_id).toBe("player-1");
    expect(withoutReach).not.toHaveProperty("reach_owner_id");
  });
});

describe("toProtoEvent — town clear (razed settlement) propagation", () => {
  it("emits town_json/townJson as present-but-empty when townJson key is present but undefined", () => {
    // Regression: razing a captured SETTLEMENT sets tile.town = undefined,
    // which serialized as townJson: undefined. The old truthy check
    // (`tile.townJson ? ... : {}`) dropped the field entirely instead of
    // signaling a clear, so the client never removed the razed town.
    // Sibling structure fields (fortJson, observatoryJson, etc.) all use
    // "key in tile" presence checks for this reason — townJson now matches.
    const event = {
      eventType: "TILE_DELTA_BATCH",
      commandId: "cmd-3",
      playerId: "player-1",
      tileDeltas: [{ x: 5, y: 5, townJson: undefined }]
    } as unknown as SimulationEvent;

    const proto = toProtoEvent(event);

    expect(proto.tile_deltas?.[0]).toHaveProperty("town_json", "");
    expect(proto.tileDeltas?.[0]).toHaveProperty("townJson", undefined);
    expect(Object.prototype.hasOwnProperty.call(proto.tileDeltas?.[0] ?? {}, "townJson")).toBe(true);
  });

  it("omits town_json/townJson entirely when the townJson key is absent (unrelated tile delta)", () => {
    const event = {
      eventType: "TILE_DELTA_BATCH",
      commandId: "cmd-4",
      playerId: "player-1",
      tileDeltas: [{ x: 6, y: 6, terrain: "LAND" }]
    } as unknown as SimulationEvent;

    const proto = toProtoEvent(event);

    expect(proto.tile_deltas?.[0]).not.toHaveProperty("town_json");
    expect(proto.tileDeltas?.[0]).not.toHaveProperty("townJson");
  });
});

describe("toProtoEvent — natural wonder propagation", () => {
  it("emits natural_wonder_json/naturalWonderJson on both proto arrays", () => {
    // Regression (#1157/#1160): the .proto schema and gateway-side
    // normalizeTile already supported natural_wonder_json/naturalWonderJson,
    // but toProtoEvent's tile_deltas/tileDeltas mappings never read
    // tile.naturalWonderJson, so it never crossed the sim -> gateway gRPC
    // boundary even after the wire-delta builder was fixed to include it.
    const event = {
      eventType: "TILE_DELTA_BATCH",
      commandId: "cmd-5",
      playerId: "player-1",
      tileDeltas: [{ x: 7, y: 7, naturalWonderJson: '{"type":"DEEPWATER_ENGINE"}' }]
    } as unknown as SimulationEvent;

    const proto = toProtoEvent(event);

    expect(proto.tile_deltas?.[0]?.natural_wonder_json).toBe('{"type":"DEEPWATER_ENGINE"}');
    expect(proto.tileDeltas?.[0]?.naturalWonderJson).toBe('{"type":"DEEPWATER_ENGINE"}');
  });

  it("omits natural_wonder_json/naturalWonderJson when the key is absent", () => {
    const event = {
      eventType: "TILE_DELTA_BATCH",
      commandId: "cmd-6",
      playerId: "player-1",
      tileDeltas: [{ x: 8, y: 8, terrain: "LAND" }]
    } as unknown as SimulationEvent;

    const proto = toProtoEvent(event);

    expect(proto.tile_deltas?.[0]).not.toHaveProperty("natural_wonder_json");
    expect(proto.tileDeltas?.[0]).not.toHaveProperty("naturalWonderJson");
  });

  it("toFullSnapshotProtoTile includes natural_wonder_json for the full-snapshot path", () => {
    const proto = toFullSnapshotProtoTile({
      x: 9,
      y: 9,
      naturalWonderJson: '{"type":"FOUNDRY_HEART"}'
    });

    expect(proto.natural_wonder_json).toBe('{"type":"FOUNDRY_HEART"}');
  });
});
